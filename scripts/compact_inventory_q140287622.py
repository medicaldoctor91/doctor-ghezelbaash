#!/usr/bin/env python3
import requests,json,re,datetime
WD='https://www.wikidata.org/w/api.php'; Q='Q140287622'
s=requests.Session();s.headers.update({'User-Agent':'Q140287622-CompactInventory/1.0','Cache-Control':'no-cache'})
def get(**p):
 p.update(format='json',formatversion=2,maxage=0,smaxage=0);r=s.get(WD,params=p,timeout=60);r.raise_for_status();d=r.json();
 if 'error'in d:raise RuntimeError(d['error'])
 return d
def val(sn):
 if not sn or sn.get('snaktype')!='value':return None
 v=sn.get('datavalue',{}).get('value')
 if isinstance(v,dict):
  for k in ('id','text','time','amount'):
   if k in v:return v[k]
 return v
e=get(action='wbgetentities',ids=Q,props='info|claims|sitelinks')['entities'][Q]
ids=set(e.get('claims',{}))
for cs in e.get('claims',{}).values():
 for c in cs:
  x=val(c.get('mainsnak'))
  if isinstance(x,str) and re.fullmatch(r'Q\d+',x):ids.add(x)
labels={};sl=sorted(ids)
for i in range(0,len(sl),50):
 d=get(action='wbgetentities',ids='|'.join(sl[i:i+50]),props='labels')
 for k,x in d.get('entities',{}).items():
  labs=x.get('labels',{});labels[k]=(labs.get('en')or labs.get('fa')or next(iter(labs.values()),{})).get('value',k)
rows=[]
for p,cs in sorted(e.get('claims',{}).items(), key=lambda kv: labels.get(kv[0],kv[0]).lower()):
 vals=[]
 for c in cs:
  x=val(c.get('mainsnak')); xv=labels.get(x,x) if isinstance(x,str)and x.startswith('Q') else x
  vals.append({'value':x,'display':xv,'refs':len(c.get('references',[])or[]),'rank':c.get('rank'),'qualifiers':{qp:[val(z)for z in qs]for qp,qs in c.get('qualifiers',{}).items()}})
 rows.append({'property':p,'label':labels.get(p,p),'count':len(cs),'values':vals})
out={'audit_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'lastrevid':e.get('lastrevid'),'modified':e.get('modified'),'sitelinks':{k:v.get('title')for k,v in e.get('sitelinks',{}).items()},'rows':rows}
print(json.dumps(out,ensure_ascii=False,separators=(',',':')))
