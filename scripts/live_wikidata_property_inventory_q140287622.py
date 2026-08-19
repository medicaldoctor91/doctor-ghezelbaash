#!/usr/bin/env python3
import requests,json,re,datetime
WD='https://www.wikidata.org/w/api.php'; Q='Q140287622'
s=requests.Session();s.headers.update({'User-Agent':'Q140287622-PropertyInventory/1.0 (https://www.ghezelbaash.ir/)','Cache-Control':'no-cache'})
def get(**p):
 p.update(format='json',formatversion=2,maxage=0,smaxage=0);r=s.get(WD,params=p,timeout=60);r.raise_for_status();d=r.json();
 if 'error'in d:raise RuntimeError(d['error'])
 return d
def v(sn):
 if not sn or sn.get('snaktype')!='value':return None
 x=sn.get('datavalue',{}).get('value')
 if isinstance(x,dict):
  if'id'in x:return x['id']
  if'time'in x:return x['time']
  if'text'in x:return x['text']
  if'amount'in x:return x['amount']
 return x
e=get(action='wbgetentities',ids=Q,props='info|claims|sitelinks')['entities'][Q]
ids=set(e.get('claims',{}))
for cs in e.get('claims',{}).values():
 for c in cs:
  x=v(c.get('mainsnak'))
  if isinstance(x,str) and re.fullmatch(r'Q\d+',x):ids.add(x)
labels={};ids=sorted(ids)
for i in range(0,len(ids),50):
 d=get(action='wbgetentities',ids='|'.join(ids[i:i+50]),props='labels')
 for k,z in d.get('entities',{}).items():
  ls=z.get('labels',{});labels[k]=(ls.get('en')or ls.get('fa')or next(iter(ls.values()),{})).get('value',k)
props=[]
for p,cs in sorted(e.get('claims',{}).items()):
 vals=[]
 for c in cs:
  x=v(c.get('mainsnak'))
  vals.append({'value':x,'label':labels.get(x) if isinstance(x,str) and x.startswith('Q') else None,'rank':c.get('rank'),'refs':len(c.get('references',[])or[]),'qualifier_properties':sorted(c.get('qualifiers',{}))})
 props.append({'property':p,'label':labels.get(p,p),'count':len(cs),'values':vals})
out={'audit_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'lastrevid':e.get('lastrevid'),'modified':e.get('modified'),'property_count':len(props),'statement_count':sum(x['count'] for x in props),'sitelinks':{k:z.get('title')for k,z in e.get('sitelinks',{}).items()},'properties':props}
print(json.dumps(out,ensure_ascii=False,indent=2,sort_keys=True))