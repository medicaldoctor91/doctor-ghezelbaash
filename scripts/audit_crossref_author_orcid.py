#!/usr/bin/env python3
import json,requests
from urllib.parse import quote
s=requests.Session();s.headers.update({'User-Agent':'GhezelbaashCrossrefAuthorAudit/1.0 (mailto:medicaldoctor91@gmail.com)'})
DOIS=['10.4103/2008-7802.182734','10.3390/healthcare9091169']
out=[]
for doi in DOIS:
    r=s.get('https://api.crossref.org/works/'+quote(doi,safe=''),timeout=45);r.raise_for_status();m=r.json()['message']
    authors=[]
    for a in m.get('author') or []:
        name=(' '.join([a.get('given',''),a.get('family','')])).strip()
        authors.append({'name':name,'orcid':a.get('ORCID'),'authenticated_orcid':a.get('authenticated-orcid'),'affiliation':[x.get('name') for x in a.get('affiliation') or []]})
    out.append({'doi':doi,'publisher':m.get('publisher'),'member':m.get('member'),'prefix':m.get('prefix'),'container_title':m.get('container-title'),'authors':authors})
print(json.dumps(out,ensure_ascii=False,separators=(',',':')))
