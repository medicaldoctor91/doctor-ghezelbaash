#!/usr/bin/env python3
import json,re,requests,datetime, pathlib
from urllib.parse import urlparse
Q='Q140287622'; WD='https://www.wikidata.org/w/api.php'
s=requests.Session();s.headers.update({'User-Agent':'Q140287622-CanonicalMeshDiff/1.0 (https://www.ghezelbaash.ir/)','Cache-Control':'no-cache'})
def get(**p):
 p.update(format='json',formatversion=2,maxage=0,smaxage=0);r=s.get(WD,params=p,timeout=60);r.raise_for_status();d=r.json()
 if 'error' in d:raise RuntimeError(d['error'])
 return d
def claimvals(e,p):
 out=[]
 for c in e.get('claims',{}).get(p,[]):
  try:
   v=c['mainsnak']['datavalue']['value'];
   if isinstance(v,dict) and 'id' in v:v=v['id']
   out.append(v)
  except:pass
 return out
rel=json.loads(pathlib.Path('src/data/release.json').read_text())
urls=rel['primaryEntity']['verifiedWebIdentityMesh']
e=get(action='wbgetentities',ids=Q,props='info|claims')['entities'][Q]
# Canonical mapping based on documented formatter semantics.
canon={
 'P496':rel['primaryEntity']['orcid'],
 'P10283':rel['primaryEntity']['openAlex'],
 'P4012':rel['primaryEntity']['semanticScholar'],
 'P1960':rel['primaryEntity']['googleScholar'],
}
for u in urls:
 p=urlparse(u);host=p.netloc.lower().removeprefix('www.');path=p.path.strip('/')
 if host=='github.com':canon['P2037']=path.split('/')[0]
 elif host=='huggingface.co' and not path.startswith('datasets/'):canon['P12201']=path.split('/')[0].lower()
 elif host=='instagram.com':canon['P2003']=path.split('/')[0]
 elif host=='facebook.com':canon['P2013']=path.split('/')[0]
 elif host=='linkedin.com' and path.startswith('in/'):canon['P6634']=path.split('/',1)[1]
 elif host=='x.com':canon['P2002']=path.split('/')[0]
 elif host=='pinterest.com':canon['P3836']=path.split('/')[0]
 elif host=='linktr.ee':canon['P11079']=path.split('/')[0]
 elif host in ('threads.net','threads.com'):
  canon['P11892']=path.split('/')[0].lstrip('@')
 elif host=='youtube.com' and path.startswith('@'):canon['P11245']=path[1:]
 elif host=='about.me':canon['about_me_slug']=path.split('/')[0]
rows=[]
for p,cv in sorted(canon.items()):
 if p.startswith('P'):
  wv=claimvals(e,p);norm=lambda x: str(x).lower() if p in ('P12201',) else str(x)
  match=any(norm(x)==norm(cv) for x in wv)
  rows.append({'property':p,'canonical':cv,'wikidata_values':wv,'exact_or_semantic_match':match})
 else:rows.append({'property':p,'canonical':cv,'wikidata_values':None,'exact_or_semantic_match':None})
print(json.dumps({'audit_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'lastrevid':e.get('lastrevid'),'canonical_source':'src/data/release.json','comparisons':rows,'mismatches':[x for x in rows if x['exact_or_semantic_match'] is False]},ensure_ascii=False,indent=2,sort_keys=True))