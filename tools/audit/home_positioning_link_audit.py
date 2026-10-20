"""Fresh GET-only home/entity and positioning link audit. No production writes."""
import concurrent.futures,datetime,hashlib,html,json,pathlib,re,urllib.parse
from html.parser import HTMLParser
import requests
ROOT=pathlib.Path('/tmp/home-positioning-links');ROOT.mkdir(exist_ok=True)
SITE='https://www.ghezelbaash.ir/';HF='doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data';LOG=[]
HEADERS={'Cache-Control':'no-cache, max-age=0','Pragma':'no-cache','Accept-Encoding':'identity','User-Agent':'PublicPositioningLinkAudit/1.0'}
def dump(n,v):
 p=ROOT/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def read(key,url):
 r=requests.get(url,headers=HEADERS,timeout=(15,45));b=r.content
 LOG.append({'key':key,'url':url,'finalURL':r.url,'UTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'HTTP':r.status_code,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'headers':{h:r.headers.get(h) for h in ['Date','Age','ETag','X-Repo-Commit','Content-Type']}})
 return r
class Parse(HTMLParser):
 def __init__(self):super().__init__();self.ids=set();self.scripts=[];self.inld=False;self.text=''
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if a.get('id'):self.ids.add(a['id'])
  if a.get('name'):self.ids.add(a['name'])
  if tag=='script' and a.get('type')=='application/ld+json':self.inld=True;self.text=''
 def handle_data(self,data):
  if self.inld:self.text+=data
 def handle_endtag(self,tag):
  if tag=='script' and self.inld:self.scripts.append(json.loads(self.text));self.inld=False
def parse(r):
 p=Parse();p.feed(r.text);return p
home=read('site-home',SITE+'?_home_identity_audit='+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));home.raise_for_status();hp=parse(home)
g=read('site-graph',SITE+'graph.jsonld');g.raise_for_status();graph=g.json();nodes={n['@id']:n for n in graph['@graph'] if '@id' in n}
inline=next(x for x in hp.scripts if '@graph' in x);assert inline==graph,'Full homepage graph differs'
pages=[]
for n in graph['@graph']:
 ty=n.get('@type',[]);ty=[ty] if isinstance(ty,str) else ty
 if 'ProfilePage' in ty or n.get('url')==SITE or n.get('@id') in [SITE,SITE+'#webpage',SITE+'#profilepage']:
  pages.append(n)
dump('home-identity.json',{'UTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'HTMLSHA256':hashlib.sha256(home.content).hexdigest(),'graphSHA256':hashlib.sha256(g.content).hexdigest(),'fullInlineEqualsGraph':True,'graphEntities':len(nodes),'profileAndHomeNodes':pages,'physician':nodes.get(SITE+'#saeed-ghezelbash')})
names=['enrichment/instruction_examples_fa_market_positioning.jsonl','enrichment/positioning-strategy.json','enrichment/market-positioning-evidence.json']
texts={};baseline={};urls={}
for n in names:
 r=read('positioning/'+n,SITE+n);r.raise_for_status();texts[n]=r.text;baseline[n]=hashlib.sha256(r.content).hexdigest();p=ROOT/'actual-positioning'/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(r.content)
def add(url,origin):
 url=html.unescape(url).rstrip('.,;،؛،。')
 urls.setdefault(url,[]).append(origin)
def walk(value,path):
 if isinstance(value,dict):
  for k,v in value.items():walk(v,path+'/'+k)
 elif isinstance(value,list):
  for i,v in enumerate(value):walk(v,path+'/'+str(i))
 elif isinstance(value,str):
  if re.match(r'^https?://[^\s]+$',value):add(value,path)
  else:
   for m in re.finditer(r'https?://[^\s<>"\[\]{}]+',value):add(m.group(0),path)
for n,t in texts.items():
 rows=[json.loads(x) for x in t.splitlines() if x.strip()] if n.endswith('.jsonl') else json.loads(t)
 walk(rows,n)
def check(url):
 origins=urls[url];u=urllib.parse.urlsplit(url)
 if url in nodes and (u.path.startswith('/service-') or u.path.startswith('/procedure-') or '/graph.jsonld/' in u.path):
  return {'url':url,'status':'PASS_GRAPH_IRI','origins':origins,'nodeType':nodes[url].get('@type')}
 try:
  r=read('link/'+str(len(origins)),urllib.parse.urlunsplit((u.scheme,u.netloc,u.path,u.query,'')));entry={'url':url,'origins':origins,'HTTP':r.status_code,'finalURL':r.url,'status':'HTTP_OK' if r.status_code==200 else 'ACCESS_BLOCKED' if r.status_code in [401,403,429] else 'BROKEN' if r.status_code in [404,410] else 'HTTP_ERROR'}
  if u.fragment and r.status_code==200 and u.netloc in ['www.ghezelbaash.ir','ghezelbaash.ir']:
   pp=hp if u.path in ['','/'] else parse(r);entry['fragment']=urllib.parse.unquote(u.fragment);entry['fragmentExists']=entry['fragment'] in pp.ids
   if not entry['fragmentExists']:entry['status']='MISSING_HTML_FRAGMENT'
  if r.status_code==200 and any(s in r.url.lower() for s in ['accounts/login','login/?','challenge','captcha']):entry['status']='LOGIN_OR_CHALLENGE'
  return entry
 except Exception as e:return {'url':url,'origins':origins,'status':'TRANSPORT_UNKNOWN','error':repr(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(check,sorted(urls)))
dump('positioning-links.json',results);dump('protected-positioning-hashes.json',baseline)
dump('fetch-log.json',LOG);dump('summary.json',{'completedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'productionWrites':0,'links':len(results),'statuses':{s:sum(x['status']==s for x in results) for s in sorted({x['status'] for x in results})},'protectedPositioningFiles':baseline})
print(json.dumps({'homeNodes':[(n['@id'],n.get('@type'),n.get('mainEntity')) for n in pages],'links':len(results),'problems':[{k:x.get(k) for k in ['url','status','HTTP','fragment']} for x in results if x['status'] not in ['HTTP_OK','PASS_GRAPH_IRI']]},ensure_ascii=False),flush=True)
