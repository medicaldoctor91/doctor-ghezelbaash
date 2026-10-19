"""Read-only diagnosis of the five actual Dataset Viewer configurations."""
import concurrent.futures,datetime,hashlib,io,json,pathlib,re,urllib.parse
import requests,pyarrow as pa,pyarrow.parquet as pq
ROOT=pathlib.Path('/tmp/viewer-diagnostic');ROOT.mkdir(exist_ok=True)
HF='doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data'
REV='47699e7fc8bad2df2c6d90dcfb9da72278aba28d'
BASE='https://datasets-server.huggingface.co/'
HEADERS={'Cache-Control':'no-cache, max-age=0','Pragma':'no-cache','Accept-Encoding':'identity','User-Agent':'ReadOnlyViewerDiagnostic/1.0'}
LOG=[]
def dump(name,value):
    (ROOT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def fetch(key,url):
    try:
        response=requests.get(url,headers=HEADERS,timeout=(20,90));body=response.content
        LOG.append({'key':key,'url':url,'finalURL':response.url,'UTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'HTTP':response.status_code,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest(),'headers':{h:response.headers.get(h) for h in ['Date','Age','ETag','Cache-Control','X-Revision','X-Repo-Commit','X-Error-Code','Content-Type']}})
        try:value=response.json()
        except ValueError:value=None
        if value is not None:dump(key+'.json',value)
        return response.status_code,body,value
    except Exception as error:
        LOG.append({'key':key,'url':url,'error':repr(error)})
        return None,None,{'transportError':repr(error)}
def endpoint(key,name,config=None,**extra):
    args={'dataset':HF}
    if config:args.update(config=config,split='train')
    args.update(extra)
    return fetch(key,BASE+name+'?'+urllib.parse.urlencode(args))
status,body,packaging=fetch('hub-packaging','https://huggingface.co/datasets/'+HF+'/resolve/'+REV+'/viewer/packaging.json')
assert status==200 and packaging.get('tables')
for name in ['parquet','size','splits','is-valid']:endpoint('global-'+name,name)
def config_check(item):
    config,spec=item;result={'expectedRows':spec['rows']}
    try:
        status,body,_=fetch(config+'-hub-parquet','https://huggingface.co/datasets/'+HF+'/resolve/'+REV+'/'+spec['file'])
        assert status==200 and hashlib.sha256(body).hexdigest()==spec['sha256'],'Pinned Hub Parquet bytes differ'
        expected=pq.read_table(io.BytesIO(body));expected_rows=expected.to_pylist()
        result['hubLogicalRows']=len(expected_rows)
        _,_,parquet=endpoint(config+'-parquet','parquet',config)
        converted=[f for f in (parquet or {}).get('parquet_files',[]) if f.get('config')==config and f.get('split')=='train']
        result['convertedFiles']=len(converted)
        result['parquetState']={k:parquet.get(k) for k in ['pending','failed','partial','error','cause_exception','cause_message'] if k in (parquet or {})}
        if converted:
            tables=[]
            for n,file in enumerate(converted):
                status,body,_=fetch(config+'-converted-'+str(n),file['url'])
                assert status==200,('Converted HTTP',status)
                tables.append(pq.read_table(io.BytesIO(body)))
            actual=pa.concat_tables(tables).select(expected.column_names)
            assert actual.to_pylist()==expected_rows,'Complete Viewer export differs from frozen logical rows'
            result['completeViewerExportMatchesFrozen']=True
        else:result['completeViewerExportMatchesFrozen']=False
        for name in ['first-rows','rows','statistics']:
            extra={'offset':0,'length':2} if name=='rows' else {}
            status,_,data=endpoint(config+'-'+name,name,config,**extra)
            result[name]={'HTTP':status,'error':(data or {}).get('error')}
            if name=='rows' and status==200:
                for row in data.get('rows',[]):
                    idx=row['row_idx']
                    for key,value in row['row'].items():
                        if key not in row.get('truncated_cells',[]):assert value==expected_rows[idx][key],('Viewer row drift',idx,key)
                result[name]['rowsAndFieldsMatchFrozen']=True
        first=expected_rows[0]
        field,value=next((k,v) for k,v in first.items() if isinstance(v,str) and 0<len(v)<200 and re.search(r'[a-zA-Z\u0600-\u06ff]',v))
        status,_,data=endpoint(config+'-search','search',config,query=value[:30])
        result['search']={'HTTP':status,'error':(data or {}).get('error'),'rowsPresent':'rows' in (data or {})}
        where='"'+field+'"=\''+value.replace("'","''")+'\''
        status,_,data=endpoint(config+'-filter','filter',config,where=where)
        result['filter']={'HTTP':status,'error':(data or {}).get('error'),'rows':len((data or {}).get('rows',[]))}
    except Exception as error:result['error']=repr(error)
    return config,result
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=dict(pool.map(config_check,packaging['tables'].items()))
dump('viewer-report.json',{'sourceRevision':REV,'productionWrites':0,'configs':results,'completedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat()})
dump('fetch-log.json',LOG)
print(json.dumps(results,ensure_ascii=False),flush=True)
