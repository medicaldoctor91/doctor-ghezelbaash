"""GET-only supplemental live prose capture; never writes to external platforms."""
import collections,concurrent.futures,csv,datetime,hashlib,io,json,pathlib,re,urllib.parse,zipfile
import requests,pyarrow.parquet as pq
R=pathlib.Path('/tmp/owner-proof');F=pathlib.Path('/tmp/coordinated-release');LOG=[]
HF='doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data';KG='saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data'
NOW=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
def dump(n,v):
 p=R/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def get(scope,name,url):
 url+=('&' if '?' in url else '?')+urllib.parse.urlencode({'_live_prose_audit':NOW})
 r=requests.get(url,headers={'Cache-Control':'no-cache, max-age=0','Pragma':'no-cache','Accept-Encoding':'identity'},timeout=(20,90));b=r.content
 LOG.append({'scope':scope,'file':name,'url':url,'finalURL':r.url,'UTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'HTTP':r.status_code,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'headers':{h:r.headers.get(h) for h in ['Date','Age','ETag','X-Repo-Commit','X-Revision','Content-Type']}})
 r.raise_for_status();p=R/'live-prose'/scope/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b);return b
names=[]
for p in (F/'hf-stage').rglob('*'):
 if p.is_file() and (p.suffix in {'.md','.txt','.cff'} or any(s in str(p.relative_to(F/'hf-stage')) for s in ['positioning','doi-policy','release-matrix','release-attestation'])):
  names.append(str(p.relative_to(F/'hf-stage')))
tasks=[]
for n in names:
 tasks.append(('HF',n,'https://huggingface.co/datasets/'+HF+'/resolve/main/'+urllib.parse.quote(n,safe='/')))
 if (F/'website'/n).is_file():tasks.append(('site',n,'https://www.ghezelbaash.ir/'+urllib.parse.quote(n,safe='/')))
def fetch(t):return get(*t)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:list(ex.map(fetch,tasks))
kgzip=get('download','kaggle-default.zip','https://www.kaggle.com/api/v1/datasets/download/'+KG)
with zipfile.ZipFile(io.BytesIO(kgzip)) as z:
 for n in z.namelist():
  if pathlib.PurePosixPath(n).suffix in {'.md','.txt','.cff','.ipynb'} or any(s in n for s in ['positioning','doi-policy','release-matrix','release-attestation']):
   assert '..' not in pathlib.PurePosixPath(n).parts and not n.startswith('/');p=R/'live-prose'/'Kaggle'/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(z.read(n))
findings=[];patterns=[r'[^\n。]{0,150}(?:not |no |cannot |do not |does not |should not |without |only |صرفاً|صرفا|نیست|نباید|نمی‌توان|نمی.توان|نمی‌کند|نمی.کند|تضمین|بی.طرف|ادعا|برتر|بهترین)[^\n。]{0,240}']
for p in (R/'live-prose').rglob('*'):
 if not p.is_file() or p.suffix not in {'.md','.txt','.cff','.json','.jsonl','.csv','.ipynb'}:continue
 try:text=p.read_text()
 except UnicodeDecodeError:continue
 for pat in patterns:
  for m in re.finditer(pat,text,re.I):findings.append({'file':str(p.relative_to(R)),'line':text.count('\n',0,m.start())+1,'quote':m.group()})
comparisons={}
for scope in ['site','HF','Kaggle']:
 base=R/'live-prose'/scope
 jsonl=base/'enrichment/instruction_examples_fa_market_positioning.jsonl'
 if jsonl.exists():
  rows=[json.loads(l) for l in jsonl.read_text().splitlines() if l.strip()]
  dump('positioning-'+scope+'-all-rows.json',rows)
  comparisons[scope]={'rows':len(rows),'JSONLSHA256':hashlib.sha256(jsonl.read_bytes()).hexdigest()}
  for f in ['enrichment/positioning-strategy.json','enrichment/market-positioning-evidence.json','enrichment/instruction_examples_fa_market_positioning.csv','viewer/positioning-examples.parquet']:
   p=base/f
   if p.exists():comparisons[scope][f]=hashlib.sha256(p.read_bytes()).hexdigest()
  parquet=base/'viewer/positioning-examples.parquet'
  if parquet.exists():dump('positioning-'+scope+'-parquet-rows.json',pq.read_table(parquet).to_pylist())
dump('prose-fetch-log.json',LOG);dump('language-all-candidates.json',findings);dump('positioning-comparison.json',comparisons)
dump('prose-summary.json',{'UTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'GETs':len(LOG),'capturedFiles':sum(p.is_file() for p in (R/'live-prose').rglob('*')),'productionWrites':0})
print('SUPPLEMENTAL_LIVE_PROSE_CAPTURED',len(LOG),flush=True)
