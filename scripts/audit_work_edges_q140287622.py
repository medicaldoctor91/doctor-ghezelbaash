#!/usr/bin/env python3
import requests,json,datetime,re
WD='https://www.wikidata.org/w/api.php'; PERSON='Q140287622'
s=requests.Session();s.headers.update({'User-Agent':'Q140287622-WorkEdgeAudit/1.1 (https://www.ghezelbaash.ir/)','Cache-Control':'no-cache'})
def get(**p):
 p.update(format='json',formatversion=2,maxage=0,smaxage=0);r=s.get(WD,params=p,timeout=60);r.raise_for_status();d=r.json()
 if 'error'in d:raise RuntimeError(d['error'])
 return d
def val(sn):
 if not sn or sn.get('snaktype')!='value':return None
 v=sn.get('datavalue',{}).get('value')
 if isinstance(v,dict):
  if'id'in v:return v['id']
  if'text'in v:return v['text']
  if'time'in v:return v['time']
 return v
pe=get(action='wbgetentities',ids=PERSON,props='info|claims')['entities'][PERSON]
edges=[];targets=set()
for prop in ('P3919','P800'):
 for c in pe.get('claims',{}).get(prop,[]):
  q=val(c.get('mainsnak'));targets.add(q)
  edges.append({'property':prop,'claim_id':c.get('id'),'target':q,'qualifiers':{p:[val(x)for x in ss]for p,ss in c.get('qualifiers',{}).items()},'references':len(c.get('references',[])or[]),'rank':c.get('rank')})
entities={}
if targets:
 d=get(action='wbgetentities',ids='|'.join(sorted(targets)),props='info|labels|claims|sitelinks')
 for q,e in d.get('entities',{}).items():
  labs=e.get('labels',{});label=(labs.get('en')or labs.get('fa')or next(iter(labs.values()),{})).get('value')
  def cvs(p,quals=False):
   out=[]
   for c in e.get('claims',{}).get(p,[]):
    row={'claim_id':c.get('id'),'value':val(c.get('mainsnak')),'refs':len(c.get('references',[])or[]),'rank':c.get('rank')}
    if quals: row['qualifiers']={qp:[val(z) for z in qs] for qp,qs in c.get('qualifiers',{}).items()}
    out.append(row)
   return out
  entities[q]={'label':label,'lastrevid':e.get('lastrevid'),'modified':e.get('modified'),'P31':cvs('P31'),'P50_author':cvs('P50',True),'P2093_author_name_string':cvs('P2093',True),'P356_DOI':cvs('P356'),'P698_PubMed':cvs('P698'),'P932_PMC':cvs('P932'),'P577_publication_date':cvs('P577'),'P1433_published_in':cvs('P1433'),'P1416_affiliation':cvs('P1416'),'sitelinks':{k:v.get('title')for k,v in e.get('sitelinks',{}).items()}}
for edge in edges:
 te=entities.get(edge['target'],{});edge['target_label']=te.get('label');edge['target_has_P50_to_person']=any(x.get('value')==PERSON for x in te.get('P50_author',[]));edge['target_P31']=[x.get('value')for x in te.get('P31',[])]
out={'audit_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'person_lastrevid':pe.get('lastrevid'),'edges':edges,'target_entities':entities}
print(json.dumps(out,ensure_ascii=False,indent=2,sort_keys=True))