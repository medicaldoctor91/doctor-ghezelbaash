#!/usr/bin/env python3
import json, re, requests, sys
from urllib.parse import quote

UA='GhezelbaashExternalScholarlyIdentityAudit/1.0 (https://github.com/medicaldoctor91/doctor-ghezelbaash)'
s=requests.Session(); s.headers.update({'User-Agent':UA})

OWN_WORKS={
 'omega3':'10.4103/2008-7802.182734',
 'mdd':'10.3390/healthcare9091169',
}
QIDS=['Q36942316','Q140298431','Q93179398','Q141104222','Q141104223','Q117439006','Q141104236','Q141104242','Q141104244','Q141104245','Q141104262']
CREATED=['Q141104222','Q141104223','Q141104236','Q141104242','Q141104244','Q141104245','Q141104262']


def get_json(url, **kwargs):
    r=s.get(url,timeout=40,**kwargs)
    return {'status':r.status_code,'json':(r.json() if 'json' in r.headers.get('content-type','').lower() else None),'text':r.text[:1000]}


def wd_entity(qids):
    r=s.get('https://www.wikidata.org/w/api.php',params={'action':'wbgetentities','ids':'|'.join(qids),'props':'labels|descriptions|claims','languages':'en','format':'json','formatversion':2},timeout=60)
    r.raise_for_status(); return r.json()['entities']


def wd_summary(ent):
    props=ent.get('claims',{})
    def vals(p):
        out=[]
        for st in props.get(p,[]):
            try:
                v=st['mainsnak']['datavalue']['value']
                if isinstance(v,dict):
                    out.append(v.get('id') or v.get('text') or v.get('time') or v)
                else: out.append(v)
            except Exception: pass
        return out
    return {
      'label':ent.get('labels',{}).get('en',{}).get('value'),
      'description':ent.get('descriptions',{}).get('en',{}).get('value'),
      'properties':sorted(props.keys()),
      'P31':vals('P31'),'P1476':vals('P1476'),'P577':vals('P577'),'P1433':vals('P1433'),
      'P407':vals('P407'),'P356':vals('P356'),'P698':vals('P698'),'P932':vals('P932'),
      'P2860':vals('P2860'),'P921':vals('P921'),'P50':vals('P50'),'P2093':vals('P2093')[:8]
    }


def europepmc(doi):
    r=s.get('https://www.ebi.ac.uk/europepmc/webservices/rest/search',params={'query':f'DOI:"{doi}"','format':'json','resultType':'core','pageSize':5},timeout=50)
    r.raise_for_status(); j=r.json(); rows=j.get('resultList',{}).get('result',[])
    return [{k:x.get(k) for k in ('id','pmid','pmcid','doi','title','journalTitle','pubYear','authorString','citedByCount')} for x in rows]


def openalex_by_doi(doi):
    urls=[f'https://api.openalex.org/works/https://doi.org/{doi}',f'https://api.openalex.org/works/doi:{doi}']
    last=None
    for u in urls:
        r=s.get(u,timeout=40)
        last={'status':r.status_code,'text':r.text[:500]}
        if r.ok:
            j=r.json()
            authors=[]
            for a in j.get('authorships',[]):
                au=a.get('author',{})
                authors.append({'id':au.get('id'),'display_name':au.get('display_name'),'orcid':au.get('orcid'),'institutions':[i.get('display_name') for i in a.get('institutions',[])]})
            return {'status':r.status_code,'work_id':j.get('id'),'doi':j.get('doi'),'title':j.get('title'),'cited_by_count':j.get('cited_by_count'),'authors':authors}
    return last


def semanticscholar_by_doi(doi):
    fields='title,year,citationCount,authors,authors.name,authors.url,authors.authorId,externalIds,url'
    u=f'https://api.semanticscholar.org/graph/v1/paper/DOI:{quote(doi,safe="")}'
    r=s.get(u,params={'fields':fields},timeout=40)
    if not r.ok: return {'status':r.status_code,'text':r.text[:500]}
    j=r.json(); return {'status':r.status_code,'paperId':j.get('paperId'),'title':j.get('title'),'year':j.get('year'),'citationCount':j.get('citationCount'),'externalIds':j.get('externalIds'),'url':j.get('url'),'authors':j.get('authors')}


def orcid_public(orcid):
    outs={}
    headers={'Accept':'application/vnd.orcid+json'}
    for endpoint in ('record','person','works'):
        u=f'https://pub.orcid.org/v3.0/{orcid}/{endpoint}'
        r=s.get(u,headers=headers,timeout=40)
        outs[endpoint]={'status':r.status_code,'content_type':r.headers.get('content-type'),'text':r.text[:2000]}
        if r.ok:
            try: outs[endpoint]['json']=r.json()
            except Exception: pass
    return outs


def main():
    report={'wikidata':{},'works':{},'orcid':None}
    ents=wd_entity(QIDS)
    for q in QIDS:
        if q in ents: report['wikidata'][q]=wd_summary(ents[q])
    for name,doi in OWN_WORKS.items():
        report['works'][name]={'doi':doi,'europepmc':europepmc(doi),'openalex':openalex_by_doi(doi),'semantic_scholar':semanticscholar_by_doi(doi)}
    report['orcid']=orcid_public('0009-0001-9346-8475')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__': main()
