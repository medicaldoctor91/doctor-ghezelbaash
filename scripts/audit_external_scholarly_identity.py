#!/usr/bin/env python3
import json,requests

ORCID='0009-0001-9346-8475'
s=requests.Session(); s.headers.update({'User-Agent':'GhezelbaashEuropePmcOrcidAudit/1.0 (https://github.com/medicaldoctor91/doctor-ghezelbaash)'})

def search(query):
    r=s.get('https://www.ebi.ac.uk/europepmc/webservices/rest/search',params={'query':query,'format':'json','resultType':'core','pageSize':20},timeout=45)
    r.raise_for_status(); j=r.json()
    return {
      'hitCount':j.get('hitCount'),
      'results':[{
        'pmid':x.get('pmid'),'pmcid':x.get('pmcid'),'doi':x.get('doi'),'title':x.get('title'),
        'authorString':x.get('authorString'),'authorIdList':x.get('authorIdList')
      } for x in j.get('resultList',{}).get('result',[])]
    }

report={
  'authorid':search(f'AUTHORID:"{ORCID}"'),
  'omega':search('DOI:"10.4103/2008-7802.182734"'),
  'mdd':search('DOI:"10.3390/healthcare9091169"')
}
print(json.dumps(report,ensure_ascii=False,separators=(',',':')))
