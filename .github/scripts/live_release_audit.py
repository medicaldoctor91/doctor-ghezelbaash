"""Read-only release audit. Never publishes, modifies platforms, or mints a DOI."""
import os,sys,pathlib,json,hashlib,datetime,concurrent.futures,urllib.parse,zipfile,tarfile,io,csv,re,collections,traceback
import requests
P=pathlib.Path('/tmp/live-release-audit');P.mkdir(exist_ok=True);F=P/'frozen';L=P/'live';LOG=[];RESULTS={};ISSUES=[]
HF='doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data';KG='saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data';REV='5d9cdf066a6cb63b59fc27c4d2ef70a44bceed06';DOI='10.5281/zenodo.23474664';CONCEPT='10.5281/zenodo.18765168';AUDIT=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');CONTROL={'_headers','_redirects','_routes.json','_worker.js'}
def dump(n,v):
 p=P/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def sha(b):return hashlib.sha256(b).hexdigest()
def out(k,v):RESULTS[k]=v;dump('report.json',RESULTS);print(k,json.dumps(v,ensure_ascii=False)[:1200],flush=True)
def check(k,fn):
 try:out(k,{'status':'PASS','result':fn()})
 except Exception as e:out(k,{'status':'FAIL','error':repr(e),'traceback':traceback.format_exc()[-4500:]})
def public(key,url,unique=False):
 if unique:url+=('&' if '?' in url else '?')+urllib.parse.urlencode({'_release_audit':AUDIT+'-'+sha(key.encode())[:8]})
 t=datetime.datetime.now(datetime.timezone.utc).isoformat();p=L/key
 try:
  r=requests.get(url,headers={'User-Agent':'ReadOnlyReleaseAudit/1.0','Cache-Control':'no-cache, max-age=0','Pragma':'no-cache','Accept-Encoding':'identity'},timeout=(20,75));b=r.content
  LOG.append({'key':key,'url':url,'finalURL':r.url,'utc':t,'status':r.status_code,'bytes':len(b),'sha256':sha(b),'headers':{h:r.headers.get(h) for h in ['Date','Age','ETag','Last-Modified','CF-Cache-Status','Cache-Control','Content-Encoding','Content-Type','Vary','X-Robots-Tag','Location']}})
  p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b);return b if r.ok else None
 except Exception as e:LOG.append({'key':key,'url':url,'utc':t,'error':repr(e)});return None

def batch(items):
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:list(ex.map(lambda a:public(*a),items))
 dump('fetch-log.json',LOG)
def js(p):return json.loads(pathlib.Path(p).read_text())
def valid_bytes(p):return p.exists() and not p.read_bytes().startswith((b'<!DOCTYPE html>',b'<html'))
# Only the built-in read-only GitHub token is used, solely for this repo's artifact.
api='https://api.github.com/repos/medicaldoctor91/doctor-ghezelbaash/actions/artifacts/'+os.environ['AUDIT_CANDIDATE_ARTIFACT']+'/zip'
r=requests.get(api,headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json'},timeout=(20,240));r.raise_for_status()
with zipfile.ZipFile(io.BytesIO(r.content)) as z:
 assert z.testzip() is None and z.namelist()==['candidate.tar.gz'];tarbytes=z.read('candidate.tar.gz')
with tarfile.open(fileobj=io.BytesIO(tarbytes),mode='r:gz') as t:
 members=[]
 policy=json.loads(t.extractfile('coordinated-release/archive/doi-policy.json').read())
 bundle_name=pathlib.PurePosixPath(urllib.parse.urlparse(policy['downloadBindings']['bundle']).path).name
 for m in t.getmembers():
  parts=pathlib.PurePosixPath(m.name).parts
  assert '..' not in parts and not m.name.startswith('/')
  if len(parts)>=2 and parts[0]=='coordinated-release' and (parts[1] in {'website','hf-stage','archive','kaggle','notebook','frozen-sha256.json','release-plan.json','preflight-report.json','intentional-platform-differences.json','local-notebook-execution.json','zenodo-metadata.json','payload.json',bundle_name} or m.name=='coordinated-release/hf-git/.gitattributes'):members.append(m)
 t.extractall(F,members=members,filter='data')
F=F/'coordinated-release';PLAN=js(F/'release-plan.json');frozen=js(F/'frozen-sha256.json');out('frozenPlan',PLAN);REV=PLAN['hfRevision'];assert PLAN.get('candidateSchema')==3
# These metadata endpoints describe public state, not owner settings.
batch([('api/hf.json','https://huggingface.co/api/datasets/'+HF,False),('api/kaggle.json','https://www.kaggle.com/api/v1/datasets/view/'+KG,False),('api/notebook.json','https://www.kaggle.com/api/v1/kernels/pull/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter',False),('api/wikidata.json','https://www.wikidata.org/wiki/Special:EntityData/Q140287622.json',True),('api/zenodo-target.json','https://zenodo.org/api/records/23474664',False)])
hf=js(L/'api/hf.json');kg=js(L/'api/kaggle.json');out('publicVersions',{'HF':hf.get('sha'),'Kaggle':kg.get('currentVersionNumber'),'targetZenodoHTTP':next(x['status'] for x in LOG if x['key']=='api/zenodo-target.json'),'sourceCommitExpected':PLAN['sourceCommit']})
# Fetch every public candidate file twice from the site. Control files are not public routes.
sitefiles=[n for n in frozen['website'] if n not in CONTROL]
items=[('site/'+n,'https://www.ghezelbaash.ir/'+urllib.parse.quote(n,safe='/'),False) for n in sitefiles]
items += [('site-query/'+n,'https://www.ghezelbaash.ir/'+urllib.parse.quote(n,safe='/'),True) for n in sitefiles]
items += [('hf/'+n,'https://huggingface.co/datasets/'+HF+'/resolve/'+REV+'/'+urllib.parse.quote(n,safe='/'),False) for n in frozen['hf-stage']]
batch(items)
def compare(prefix,expected,base):
 ok=[];bad=[];absent=[]
 for n,h in expected.items():
  p=L/prefix/n
  if not p.exists():absent.append(n);continue
  body=p.read_bytes()
  if sha(body)==h:ok.append(n)
  else:
   want=(F/base/n).read_bytes();bad.append({'file':n,'expectedSHA256':h,'actualSHA256':sha(body),'expectedBytes':len(want),'actualBytes':len(body),'equalAfterLFNormalization':body.replace(b'\r\n',b'\n')==want.replace(b'\r\n',b'\n')})
 return {'expected':len(expected),'matched':len(ok),'bad':bad,'absent':absent}
sexpect={n:h for n,h in frozen['website'].items() if n not in CONTROL};out('siteBytes',compare('site',sexpect,'website'));out('siteQueryBytes',compare('site-query',sexpect,'website'));out('HFBytes',compare('hf',frozen['hf-stage'],'hf-stage'))
out('excludedCloudflareControls',{'files':sorted(CONTROL&set(frozen['website'])),'reason':'Consumed by deployment; HTTP 404 does not imply missing public data. Frozen artifact bytes are retained.'})
# Actual public Kaggle version and default download must be compared as extracted files.
v=PLAN['kaggleVersion'];batch([('kaggle-version.zip','https://www.kaggle.com/api/v1/datasets/download/'+KG+'?datasetVersionNumber='+str(v),False),('kaggle-default.zip','https://www.kaggle.com/api/v1/datasets/download/'+KG,False)])
for name in ['kaggle-version','kaggle-default']:
 with zipfile.ZipFile(L/(name+'.zip')) as z:
  assert z.testzip() is None
  for n in z.namelist():assert '..' not in pathlib.PurePosixPath(n).parts and not n.startswith('/')
  z.extractall(L/name)
kroot=L/'kaggle-version'
out('KaggleFrozenBytes',compare('kaggle-version',{n:h for n,h in frozen['kaggle'].items() if n not in {'dataset-metadata.json','kernel-metadata.json'}},'kaggle'))
def kgchecks():
 a={str(p.relative_to(kroot)):sha(p.read_bytes()) for p in kroot.rglob('*') if p.is_file()};b={str(p.relative_to(L/'kaggle-default')):sha(p.read_bytes()) for p in (L/'kaggle-default').rglob('*') if p.is_file()};assert a==b,'Public default ZIP does not match explicit public version'
 for line in (kroot/'checksums.sha256').read_text().splitlines():
  h,n=line.split(maxsplit=1);assert sha((kroot/n.lstrip('* ')).read_bytes())==h,n
 m=js(kroot/'kaggle-manifest.json');return {'files':len(a),'checksums':len((kroot/'checksums.sha256').read_text().splitlines()),'defaultEqualsVersion':True,'manifest':m}
check('publicKaggleInternal',kgchecks)
# Public metadata RPC is a read-only POST and is logged without credentials.
try:
 owner,slug=KG.split('/');r=requests.post('https://api.kaggle.com/v1/datasets.DatasetApiService/GetDatasetMetadata',json={'ownerSlug':owner,'datasetSlug':slug},timeout=60);r.raise_for_status();dump('public-kaggle-metadata.json',r.json())
 metadata=r.json().get('info') or r.json();control=js(F/'kaggle/dataset-metadata.json')
 for field in ['title','subtitle','description','userSpecifiedSources']:assert metadata[field].strip()==control[field].strip(),('Public Kaggle metadata',field)
 out('KaggleMetadataMatchesFrozen',{'status':'PASS','fields':['title','subtitle','description','userSpecifiedSources']})
except AssertionError as e:out('KaggleMetadataMatchesFrozen',{'status':'FAIL','error':repr(e)})
except Exception as e:out('KaggleMetadataMatchesFrozen',{'status':'UNKNOWN','error':repr(e)})
import rdflib
from rdflib.compare import isomorphic
from pyshacl import validate
import pyarrow.parquet as pq
from lxml import html
def viewer_exports():
 body=public('api/viewer-parquet.json','https://datasets-server.huggingface.co/parquet?'+urllib.parse.urlencode({'dataset':HF}))
 assert body is not None,'Viewer Parquet endpoint unavailable'
 state=json.loads(body);packaging=js(F/'hf-stage/viewer/packaging.json');results={}
 for config,spec in packaging['tables'].items():
  shards=[item for item in state.get('parquet_files',[]) if item.get('config')==config and item.get('split')=='train']
  if not shards:
   results[config]={'status':'FAIL','reason':'No complete Viewer export','failed':[item for item in state.get('failed',[]) if item.get('config')==config],'pending':[item for item in state.get('pending',[]) if item.get('config')==config]};continue
  tables=[]
  for n,item in enumerate(shards):
   data=public('viewer/'+config+'/'+str(n)+'.parquet',item['url']);assert data is not None,(config,'Viewer shard unavailable');tables.append(pq.read_table(io.BytesIO(data)))
  import pyarrow as pa
  expected=pq.read_table(F/'hf-stage'/spec['file']);actual=pa.concat_tables(tables).select(expected.column_names)
  assert actual.to_pylist()==expected.to_pylist(),('Viewer logical data differs from frozen',config)
  results[config]={'status':'PASS','rows':actual.num_rows,'completeLogicalRowsMatchFrozen':True}
 return {'configs':results,'failed':state.get('failed',[]),'pending':state.get('pending',[]),'allFiveComplete':len(results)==5 and all(item['status']=='PASS' for item in results.values())}
check('DatasetViewerCompleteExports',viewer_exports)
if RESULTS['DatasetViewerCompleteExports'].get('result',{}).get('allFiveComplete') is not True: RESULTS['DatasetViewerCompleteExports']['status']='FAIL'
dump('report.json',RESULTS)
G={}
def rdfcheck(label,root):
 g=rdflib.Graph().parse(root/'graph.jsonld',format='json-ld');ttl=rdflib.Graph().parse(root/'graph.ttl',format='turtle');assert isomorphic(g,ttl)
 cg=rdflib.Graph()
 def iri(v):return rdflib.BNode(v[2:]) if v.startswith('_:') else rdflib.URIRef(v)
 for row in csv.DictReader((root/'entity-facts.csv').open()):
  o=rdflib.Literal(row['object'],lang=row['language'] or None,datatype=rdflib.URIRef(row['datatype']) if row['datatype'] and not row['language'] else None) if row['object_kind']=='literal' else iri(row['object']);cg.add((iri(row['subject']),rdflib.URIRef(row['predicate']),o))
 assert isomorphic(g,cg)
 u=rdflib.Graph()
 for n,fmt in [('graph.jsonld','json-ld'),('provenance.jsonld','json-ld'),('dcat.ttl','turtle'),('void.ttl','turtle'),('croissant.json','json-ld')]:u.parse(data=(root/n).read_text(),format=fmt,publicID='https://www.ghezelbaash.ir/'+n)
 ok,rep,txt=validate(u,shacl_graph=rdflib.Graph().parse(root/'shapes.ttl',format='turtle'),advanced=True);(P/(label+'-SHACL.txt')).write_text(txt);assert ok,txt
 G[label]=g;return {'triples':len(g),'unionTriples':len(u),'CSVandTurtleIsomorphic':True,'SHACLFiveDocumentUnion':True}
for label,root in [('site',L/'site'),('hf',L/'hf'),('kaggle',kroot)]:check(label+'RDF',lambda label=label,root=root:rdfcheck(label,root))
def graphs_same():
 assert (L/'site/graph.jsonld').read_bytes()==(L/'hf/graph.jsonld').read_bytes()
 assert isomorphic(G['site'],G['hf'])
 return {'sameBytes':True,'sameRDF':True}
check('siteHFGraphSame',graphs_same)
def rowscheck(root):
 pk=js(root/'viewer/packaging.json');counts={}
 for n,s in pk['tables'].items():
  p=root/s['source'];orig=js(p)['records'] if p.suffix=='.json' else list(csv.DictReader(p.open())) if p.suffix=='.csv' else [json.loads(x) for x in p.read_text().splitlines() if x.strip()];rebuilt=[]
  for row in pq.read_table(root/s['file']).to_pylist():
   omit=json.loads(row.pop('_source_omitted_fields','[]') or '[]')
   for k in omit:row.pop(k,None)
   for k in s.get('jsonEncodedFields',[]):
    if row.get(k) is not None:row[k]=json.loads(row[k])
   rebuilt.append(row)
  assert rebuilt==orig and len(orig)==s['rows'],n;assert sha(p.read_bytes())==s['sourceSha256'] and sha((root/s['file']).read_bytes())==s['sha256'];counts[n]=len(orig)
 return counts
for label,root in [('hf',L/'hf'),('kaggle',kroot)]:check(label+'FiveTables',lambda root=root:rowscheck(root))
def corpuscheck():
 root=L/'site';facts=js(root/'fact-map.json')['records'];graph=js(root/'graph.jsonld');nodes={n['@id']:n for n in graph['@graph']};tree=html.fromstring((root/'index.html').read_text());ids={n.get('id'):n for n in tree.xpath('//*[@id]')}
 for f in facts:
  assert nodes[f['answerId']]['text']==f['answer'];assert ' '.join(f['answer'].split()) in ' '.join(ids['answer-'+f['htmlId']].text_content().split())
 pas=[json.loads(x) for x in (root/'clinical-passages.jsonl').read_text().splitlines() if x.strip()]
 for x in pas:assert sha(x['text'].encode())==x['textHashSha256'],x['passageId']
 defined=set()
 def walk(x):
  if isinstance(x,dict):
   if '@id' in x and len(x)>1:defined.add(x['@id'])
   for v in x.values():walk(v)
  elif isinstance(x,list):
   for v in x:walk(v)
 for n in ['graph.jsonld','provenance.jsonld']:walk(js(root/n))
 pids={x['passageId'] for x in pas};queries=[json.loads(x) for x in (L/'hf/query-matrix.jsonl').read_text().splitlines() if x.strip()]
 for q in queries:
  for k in ['canonical_subject_iri','answer_id','service_ids','stable_evidence_refs','dataset_iri','passage_id']:
   vals=q.get(k,[]);vals=vals if isinstance(vals,list) else [vals]
   for v in vals:
    if v:assert v in defined or v in pids,(k,v)
 return {'FAQGraphHTML':len(facts),'passageHashes':len(pas),'queriesResolved':len(queries)}
check('corpusBindings',corpuscheck)
def inline_graph_check(root):
 tree=html.fromstring((root/'index.html').read_bytes());blocks=tree.xpath('//script[@type="application/ld+json"]/text()')
 assert len(blocks)==1,'Expected one complete inline JSON-LD document'
 inline=json.loads(blocks[0]);canonical=js(root/'graph.jsonld')
 assert inline==canonical,'Homepage inline graph lost canonical entities, relations or literal values'
 graph=rdflib.Graph().parse(data=json.dumps(inline),format='json-ld')
 return {'completeCanonicalGraph':True,'entities':len(inline['@graph']),'rdfTriples':len(graph),'HTMLBytes':(root/'index.html').stat().st_size}
for label,root in [('site',L/'site'),('site-query',L/'site-query'),('HF',L/'hf')]:check(label+'CompleteInlineGraph',lambda root=root:inline_graph_check(root))

# Every retrieved text resource is syntax-checked; natural-language truth remains a separately reported scope.
syntax=[];typ=collections.Counter()
for root in [L/'site',L/'hf',kroot]:
 for p in root.rglob('*'):
  if not p.is_file():continue
  try:
   if p.suffix in {'.json','.jsonld','.ipynb'}:json.loads(p.read_text());typ['JSON']+=1
   elif p.suffix=='.jsonl':[json.loads(x) for x in p.read_text().splitlines() if x.strip()];typ['JSONL']+=1
   elif p.suffix=='.json-seq':[json.loads(x) for x in p.read_text().split('\x1e') if x.strip()];typ['JSONseq']+=1
   elif p.suffix=='.xml':__import__('xml.etree.ElementTree',fromlist=['fromstring']).fromstring(p.read_bytes());typ['XML']+=1
  except Exception as e:syntax.append({'file':str(p.relative_to(L)),'error':repr(e)})
out('syntax',{'checked':dict(typ),'errors':syntax})
# Collect concrete language/DOI/version occurrences from FINAL fetched and frozen documents.
patterns=[('possible_no_new_DOI',r'[^\n.]{0,100}without minting[^\n.]{0,150}'),('possible_archive_not_updated',r'[^\n.]{0,100}(?:not updated|به‌روزرسانی نشده|ثابت مانده)[^\n.]{0,160}'),('dataset_boundary',r'[^\n.]{0,100}(?:not a curated|clinical benchmarking|physician-authored|third-party rights)[^\n.]{0,180}'),('possible_placeholder',r'\{\{[^}]{1,90}\}\}'),('version_count',r'[^\n]{0,40}(?:packaging revision|other downloadable files|RDF statements|authored passages)[^\n]{0,100}')]
findings=[]
for scope,root in [('live-HF',L/'hf'),('live-Kaggle',kroot),('frozen-HF',F/'hf-stage'),('frozen-Kaggle',F/'kaggle'),('frozen-Archive',F/'archive')]:
 for name in ['README.md','CITATION.cff','starter.ipynb','current-release-matrix.json','release-attestation.json']:
  p=root/name
  if not p.exists():continue
  text=p.read_text()
  if p.suffix=='.ipynb':text='\n'.join(''.join(c['source']) for c in json.loads(text)['cells'] if c['cell_type']=='markdown')
  for cat,pat in patterns:
   for m in re.finditer(pat,text,re.I):findings.append({'scope':scope,'file':name,'category':cat,'quote':m.group(),'line':text.count('\n',0,m.start())+1,'offset':m.start(),'fileSHA256':sha(p.read_bytes())})
  if name=='README.md':
   dest=P/'documents'/scope/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(text)
dump('language-findings.json',findings)
# Actual public notebook source and version; do not call an old COMPLETE proof current.
def normalized_cells(document):
 cells=[]
 for original in document['cells']:
  cell=dict(original);source=cell.get('source');assert isinstance(source,(str,list))
  if isinstance(source,list):assert all(isinstance(line,str) for line in source);source=''.join(source)
  cell['source']=source;cells.append(cell)
 return cells

def notebookcheck():
 public('api/notebook.json','https://www.kaggle.com/api/v1/kernels/pull/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter')
 nb=js(L/'api/notebook.json');source=json.loads(nb['blob'].get('source') or nb['blob'].get('sourceNullable'));dump('public-notebook-source.json',source)
 assert nb['metadata']['currentVersionNumber']==PLAN['notebookVersion'], 'Public notebook version differs from frozen plan'
 assert normalized_cells(source)==normalized_cells(js(F/'notebook/starter.ipynb')), 'Public notebook source differs from frozen cells'
 return {'version':nb['metadata']['currentVersionNumber'],'plannedVersion':PLAN['notebookVersion'],'sourceMatchesFrozen':source['cells']==js(F/'notebook/starter.ipynb')['cells'],'executionStatus':'UNKNOWN in this read-only public-source check'}
check('publicNotebook',notebookcheck)
# Identity and large-HTML checks are measured, not inferred from syntax validation.
raw=(L/'site/index.html').read_bytes();tree=html.fromstring(raw.decode());out('homepage',{'bytesUncompressed':len(raw),'headEnd':raw.find(b'</head>'),'JSONLDend':raw.find(b'</script>',raw.find(b'application/ld+json')),'canonical':tree.xpath('//link[@rel="canonical"]/@href'),'robots':tree.xpath('//meta[@name="robots"]/@content'),'exceeds2MiB':len(raw)>2*1024*1024})
try:
 wd=js(L/'api/wikidata.json')['entities']['Q140287622'];out('WikidataReadOnly',{'lastrevid':wd['lastrevid'],'modified':wd['modified'],'ORCID':[(c['rank'],c['mainsnak'].get('datavalue',{}).get('value')) for c in wd['claims'].get('P496',[])],'OpenAlex':[(c['rank'],c['mainsnak'].get('datavalue',{}).get('value')) for c in wd['claims'].get('P10283',[])],'DOIIdentifiersOnPerson':[(c['rank'],c['mainsnak'].get('datavalue',{}).get('value')) for c in wd['claims'].get('P356',[])],'instanceOf':[(c['rank'],c['mainsnak'].get('datavalue',{}).get('value')) for c in wd['claims'].get('P31',[])]})
except Exception as e:out('WikidataReadOnly',{'status':'UNKNOWN','error':repr(e)})
out('scopeAndLimits',{'productionWrites':0,'ZenodoPublicationPerformedByThisAudit':False,'cacheProof':'No-cache/Pragma and distinct query requests recorded; equality to frozen cryptographic hashes and immutable HF revision establishes which release bytes were seen, not a claim that all CDN caches were bypassed.','clinicalClaimExternalTruth':'Not exhaustively independently verified; this audit tests corpus attribution, relations, consistency and technical delivery.','languageReview':'Exact excerpts are candidates for editorial judgment, not automatically false or weakening.','completedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat()})
dump('fetch-log.json',LOG)
print('CORE_READ_ONLY_AUDIT_FINISHED',flush=True)

def advertised(root):
 results={}
 p=root/'checksums.sha256'
 if p.exists():
  rows=[]
  for line in p.read_text().splitlines():
   if not line.strip():continue
   h,n=line.split(maxsplit=1);n=n.lstrip('* ');q=root/n
   rows.append({'file':n,'advertised':h,'actual':sha(q.read_bytes()) if q.exists() else None})
  results['checksumLines']=len(rows);results['badChecksums']=[r for r in rows if r['advertised']!=r['actual']]
 p=root/'dist-sha256.json'
 if p.exists():
  manifest=js(p);rows=[]
  for n,meta in manifest['files'].items():
   q=root/n.lstrip('/');actual=sha(q.read_bytes()) if q.exists() else None
   rows.append({'file':n,'expected':meta['sha256'],'actual':actual,'expectedBytes':meta['bytes'],'actualBytes':q.stat().st_size if q.exists() else None})
  results['distFiles']=len(rows);results['badDistFiles']=[r for r in rows if r['expected']!=r['actual'] or r['expectedBytes']!=r['actualBytes']]
 return results
for label,root in [('site',L/'site'),('HF',L/'hf'),('Kaggle',kroot)]:
 result=advertised(root);out(label+'AdvertisedIntegrity',{'status':'FAIL' if result.get('badChecksums') or result.get('badDistFiles') else 'PASS','result':result})
import yaml
def documents(root):
 result={}
 for p in root.rglob('*.cff'):
  d=yaml.safe_load(p.read_text());assert isinstance(d,dict) and d.get('cff-version')=='1.2.0' and d.get('title') and d.get('authors')
  result[str(p.relative_to(root))]={'doi':d.get('doi'),'version':d.get('version'),'identifiers':d.get('identifiers')}
 for p in root.rglob('*.vcf'):
  b=p.read_bytes();assert b'BEGIN:VCARD' in b and b'END:VCARD' in b
  result[str(p.relative_to(root))]={'bytes':len(b),'linesOver75Octets':sum(len(x)>75 for x in b.splitlines()),'CRLF':b'\r\n' in b}
 return result
for label,root in [('site',L/'site'),('HF',L/'hf'),('Kaggle',kroot)]:check(label+'Documents',lambda root=root:documents(root))
# Public viewer endpoints, pinned dataset files already compared separately.
viewerbase='https://datasets-server.huggingface.co/'
batch([('viewer/splits.json',viewerbase+'splits?'+urllib.parse.urlencode({'dataset':HF}),False),('viewer/parquet.json',viewerbase+'parquet?'+urllib.parse.urlencode({'dataset':HF}),False)])
try:
 splits=js(L/'viewer/splits.json');out('HFViewerSplits',splits)
 batch([('viewer/'+x['config']+'-firstrows.json',viewerbase+'first-rows?'+urllib.parse.urlencode({'dataset':HF,'config':x['config'],'split':x['split']}),False) for x in splits.get('splits',[])])
 out('HFViewerRows',[{'key':x['key'],'status':x.get('status'),'sha256':x.get('sha256')} for x in LOG if x['key'].startswith('viewer/')])
except Exception as e:out('HFViewer',{'status':'UNKNOWN','error':repr(e)})
# Preserve every DOI occurrence with local context for human semantic review.
dois=[]
for scope,root in [('live-site',L/'site'),('live-HF',L/'hf'),('live-Kaggle',kroot),('frozen-HF',F/'hf-stage'),('frozen-Kaggle',F/'kaggle'),('frozen-Archive',F/'archive')]:
 for p in root.rglob('*'):
  if p.suffix not in {'.md','.cff','.json','.jsonld','.ttl','.txt','.ipynb'}:continue
  try:t=p.read_text()
  except Exception:continue
  hits=collections.Counter(re.findall(r'10\.5281/zenodo\.\d+',t))
  if hits:dois.append({'scope':scope,'file':str(p.relative_to(root)),'fileSHA256':sha(p.read_bytes()),'DOIs':dict(hits)})
dump('doi-inventory.json',dois);dump('fetch-log.json',LOG)
out('finalReadOnlyAuditUTC',datetime.datetime.now(datetime.timezone.utc).isoformat())



# Preserve the exact user-approved positioning words and their CSV/Parquet forms.
def protected_positioning():
 hashes={
  'enrichment/instruction_examples_fa_market_positioning.jsonl':'f7974f01ed0fef290a334598c020abcb0e5af382d831d40f7253c3e25bb205f4',
  'enrichment/positioning-strategy.json':'e2e06843c1653012a93209c3d77629759e31a5143411a22d9b1fb0b3bb18b7b9',
  'enrichment/market-positioning-evidence.json':'8e3bd2f5d5ceecc222022b2cec5ba972a1f1726d4d4166ca338e68715b2ee27c',
  'enrichment/instruction_examples_fa_market_positioning.csv':'2791d935640702021dbeff4664890c674204200fb84954828193659b3f01ac8c',
  'viewer/positioning-examples.parquet':'1c4458b2ae1645eeab6a940b0529f8a00ebabc7d6cb8bf67afba5c0b1ff1f408'}
 checked=[]
 for label,root in [('site',L/'site'),('HF',L/'hf'),('Kaggle',kroot)]:
  for name,digest in hashes.items():
   if label=='site' and name.endswith(('.csv','.parquet')):continue
   assert sha((root/name).read_bytes())==digest,('Protected positioning changed',label,name)
   checked.append(label+'/'+name)
 return {'protectedFiles':checked,'allWordsUnchanged':True}
check('protectedPositioningWords',protected_positioning)
def home_identity():
 graph=js(L/'site/graph.jsonld');node=next(n for n in graph['@graph'] if n['@id']=='https://www.ghezelbaash.ir/webpage')
 assert set(node['@type'])=={'ProfilePage','MedicalWebPage'}
 assert node['mainEntity']=={'@id':'https://www.ghezelbaash.ir/#saeed-ghezelbash'}
 return {'types':node['@type'],'mainEntity':node['mainEntity'],'fullGraphEntities':len(graph['@graph'])}
check('homeProfileArchitecture',home_identity)

print('ALL_READ_ONLY_AUDIT_FINISHED',flush=True)

# Re-fetch final public record state after the full platform audit.
public('api/zenodo-target.json','https://zenodo.org/api/records/23474664')
dump('fetch-log.json',LOG)
# Independently download every newly published Zenodo file against the immutable candidate.
def zenodo_published():
 record=js(L/'api/zenodo-target.json');assert int(record['id'])==23474664
 assert record['doi']==DOI and record['conceptdoi']==CONCEPT
 assert record['metadata']['version']==policy['currentArchive']['packagingVersion']
 payload=js(F/'payload.json');expected=payload['files'];entries={x['key']:x for x in record['files']}
 assert set(entries)==set(expected), 'Published Zenodo file list differs from frozen candidate'
 batch([('zenodo-files/'+n,x['links']['self'],False) for n,x in entries.items()])
 files=[]
 for n,spec in expected.items():
  b=(L/'zenodo-files'/n).read_bytes();assert sha(b)==spec['sha256'],('Zenodo SHA256',n)
  assert hashlib.md5(b).hexdigest()==spec['md5']==entries[n]['checksum'].removeprefix('md5:'),('Zenodo MD5',n)
  assert len(b)==spec['bytes'],('Zenodo size',n)
  files.append({'file':n,'sha256':sha(b),'bytes':len(b)})
 with zipfile.ZipFile(L/'zenodo-files'/bundle_name) as z:
  assert z.testzip() is None
  actual={n:sha(z.read(n)) for n in z.namelist() if not n.endswith('/')}
 assert actual==frozen['archive'], 'Zenodo ZIP files differ from frozen archive'
 r=js(F/'zenodo-metadata.json')
 for field in ['description','version','title']:assert record['metadata'][field]==r[field],('Zenodo metadata',field)
 return {'status':'PASS','record':record['id'],'doi':DOI,'version':record['metadata']['version'],'files':files,'ZIPEntries':len(actual),'metadataMatchesFrozen':True}
zenodo_http=next(item.get('status') for item in reversed(LOG) if item['key']=='api/zenodo-target.json')
if zenodo_http==404:
 out('ZenodoPublishedIntegrity',{'status':'PENDING','record':23474664,'doi':DOI,'reason':'Reserved target is not published in this snapshot; publication is gated on complete platform verification.'})
else:check('ZenodoPublishedIntegrity',zenodo_published)
dump('fetch-log.json',LOG)

# Resolve exact and collection DOI entry points separately from record APIs.
batch([('doi/exact.html','https://doi.org/'+DOI,False),('doi/collection.html','https://doi.org/'+CONCEPT,False)])
for key in ['doi/exact.html','doi/collection.html']:
 item=next(x for x in LOG if x['key']==key)
 out(key,{'status':'PASS' if item.get('status')==200 and '/records/23474664' in item.get('finalURL','') else 'UNKNOWN','http':item.get('status'),'finalURL':item.get('finalURL'),'sha256':item.get('sha256')})
for n in ['hf.json','kaggle.json','notebook.json','wikidata.json','zenodo-target.json']:
 source=L/'api'/n
 if source.exists():
  target=P/'documents'/'api'/n;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source.read_bytes())
dump('fetch-log.json',LOG)
out('auditCompletedUTC',datetime.datetime.now(datetime.timezone.utc).isoformat())
print('FINAL_INDEPENDENT_POST_PUBLICATION_AUDIT_FINISHED',flush=True)
