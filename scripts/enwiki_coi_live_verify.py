#!/usr/bin/env python3
import json
import requests
from datetime import datetime, timezone

API='https://en.wikipedia.org/w/api.php'
TALK='Talk:Treatment of bipolar disorder'
ARTICLE='Treatment of bipolar disorder'
USER='Medicaldoctor91'
NEEDLES=['COI edit request: update Omega-3 section with 2025 review','10.3390/md23020084','10.4103/2008-7802.182734','Ghezelbash','27280013']

s=requests.Session(); s.headers.update({'User-Agent':'GhezelbaashEnwikiLiveVerifier/1.0 (https://www.ghezelbaash.ir/)'})

def get(**params):
    params.update(format='json', formatversion=2, curtimestamp=1)
    r=s.get(API, params=params, timeout=60)
    r.raise_for_status()
    d=r.json()
    if 'error' in d: raise RuntimeError(d['error'])
    return d

def page(title, rvlimit=20):
    d=get(action='query', titles=title, prop='info|revisions', rvprop='ids|timestamp|user|comment|content', rvslots='main', rvlimit=rvlimit)
    p=d['query']['pages'][0]
    revs=p.get('revisions',[])
    current_content=(revs[0].get('slots',{}).get('main',{}).get('content','') if revs else '')
    return {
      'server_time': d.get('curtimestamp'), 'title': p.get('title'),'pageid':p.get('pageid'),'missing':'missing' in p,
      'latest_revid': revs[0].get('revid') if revs else None,
      'latest_parentid': revs[0].get('parentid') if revs else None,
      'latest_timestamp': revs[0].get('timestamp') if revs else None,
      'latest_user': revs[0].get('user') if revs else None,
      'latest_comment': revs[0].get('comment') if revs else None,
      'contains': {n: n.lower() in current_content.lower() for n in NEEDLES},
      'matching_revisions': [
         {'revid':r.get('revid'),'parentid':r.get('parentid'),'timestamp':r.get('timestamp'),'user':r.get('user'),'comment':r.get('comment')}
         for r in revs if any(n.lower() in r.get('slots',{}).get('main',{}).get('content','').lower() for n in NEEDLES)
      ]
    }

def contributions():
    d=get(action='query', list='usercontribs', ucuser=USER, ucnamespace=1, ucprop='ids|title|timestamp|comment|flags', uclimit=100)
    return {'server_time':d.get('curtimestamp'),'items':d.get('query',{}).get('usercontribs',[])}

out={'checked_at_utc':datetime.now(timezone.utc).isoformat(),'talk':page(TALK,50),'article':page(ARTICLE,10),'user_contributions_ns1':contributions()}
print(json.dumps(out,ensure_ascii=False,indent=2,sort_keys=True))
