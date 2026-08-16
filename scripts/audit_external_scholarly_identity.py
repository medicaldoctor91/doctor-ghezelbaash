#!/usr/bin/env python3
import json, re, requests
from urllib.parse import quote

UA='GhezelbaashExternalScholarlyIdentityAudit/2.0 (https://github.com/medicaldoctor91/doctor-ghezelbaash)'
s=requests.Session(); s.headers.update({'User-Agent':UA})
OWN={'omega3':'10.4103/2008-7802.182734','mdd':'10.3390/healthcare9091169'}
QIDS=['Q36942316','Q140298431','Q93179398','Q141104222','Q141104223','Q117439006','Q141104236','Q141104242','Q141104244','Q141104245','Q141104262']
NEW=['Q141104222','Q141104223','Q141104236','Q141104242','Q141104244','Q141104245','Q141104262']
CHECK=['P31','P1476','P577','P1433','P407','P356','P698','P932','P2860','P921','P50','P2093']

def wd_entities():
    r=s.get('https://www.wikidata.org/w/api.php',params={'action':'wbgetentities','ids':'|'.join(QIDS),'props':'labels|claims','languages':'en','format':'json','formatversion':2},timeout=60); r.raise_for_status(); return r.json()['entities']

def sval(st):
    try:
        v=st['mainsnak']['datavalue']['value']
        if isinstance(v,str): return v
        if isinstance(v,dict): return v.get('id') or v.get('text') or v.get('time')
    except Exception: pass
    return None

def openalex(doi):
    r=s.get(f'https://api.openalex.org/works/https://doi.org/{doi}',timeout=45)
    if not r.ok: return {'status':r.status_code}
    j=r.json(); matches=[]
    for a in j.get('authorships',[]):
        au=a.get('author',{}); name=au.get('display_name') or ''
        if 'ghezel' in name.lower():
            matches.append({'author_id':au.get('id'),'name':name,'orcid':au.get('orcid'),'institutions':[i.get('display_name') for i in a.get('institutions',[])]})
    return {'status':r.status_code,'work_id':j.get('id'),'cited_by_count':j.get('cited_by_count'),'ghezelbash_authors':matches}

def semantic(doi):
    fields='title,year,citationCount,authors,externalIds,url'
    r=s.get(f'https://api.semanticscholar.org/graph/v1/paper/DOI:{quote(doi,safe="")}',params={'fields':fields},timeout=45)
    if not r.ok: return {'status':r.status_code}
    j=r.json(); matches=[]
    for a in j.get('authors') or []:
        name=a.get('name') or ''
        if 'ghezel' in name.lower(): matches.append({'authorId':a.get('authorId'),'name':name})
    return {'status':r.status_code,'paperId':j.get('paperId'),'citationCount':j.get('citationCount'),'ghezelbash_authors':matches,'externalIds':j.get('externalIds')}

def europe(doi):
    r=s.get('https://www.ebi.ac.uk/europepmc/webservices/rest/search',params={'query':f'DOI:"{doi}"','format':'json','resultType':'core','pageSize':2},timeout=45); r.raise_for_status()
    rows=r.json().get('resultList',{}).get('result',[])
    return [{'pmid':x.get('pmid'),'pmcid':x.get('pmcid'),'journal':x.get('journalTitle'),'year':x.get('pubYear'),'citedByCount':x.get('citedByCount')} for x in rows]

def orcid_summary():
    headers={'Accept':'application/vnd.orcid+json'}
    works=s.get('https://pub.orcid.org/v3.0/0009-0001-9346-8475/works',headers=headers,timeout=45)
    person=s.get('https://pub.orcid.org/v3.0/0009-0001-9346-8475/person',headers=headers,timeout=45)
    out={'works_status':works.status_code,'person_status':person.status_code,'doi_values':[],'work_group_count':None,'external_identifiers':[]}
    if works.ok:
        j=works.json(); out['work_group_count']=len(j.get('group') or [])
        for g in j.get('group') or []:
            for w in g.get('work-summary') or []:
                for eid in (w.get('external-ids') or {}).get('external-id') or []:
                    if (eid.get('external-id-type') or '').lower()=='doi': out['doi_values'].append((eid.get('external-id-value') or '').lower())
    if person.ok:
        j=person.json(); ex=(j.get('external-identifiers') or {}).get('external-identifier') or []
        out['external_identifiers']=[{'type':x.get('external-id-type'),'value':x.get('external-id-value'),'url':(x.get('external-id-url') or {}).get('value')} for x in ex]
    out['doi_values']=sorted(set(out['doi_values']))
    return out

def main():
    ents=wd_entities(); report={'wikidata_targets':{},'new_item_gaps':{},'works':{},'orcid':orcid_summary()}
    for q in ['Q36942316','Q140298431']:
        e=ents[q]; props=e.get('claims',{})
        report['wikidata_targets'][q]={
            'P50':[sval(x) for x in props.get('P50',[])],
            'P921':[sval(x) for x in props.get('P921',[])],
            'incoming_P2860_count':sum(1 for e2 in ents.values() for st in e2.get('claims',{}).get('P2860',[]) if sval(st)==q)
        }
    for q in NEW:
        e=ents[q]; props=e.get('claims',{}); missing=[p for p in CHECK if p not in props]
        report['new_item_gaps'][q]={'label':e.get('labels',{}).get('en',{}).get('value'),'doi':[sval(x) for x in props.get('P356',[])],'missing':missing,'present':sorted(props.keys())}
    for name,doi in OWN.items(): report['works'][name]={'doi':doi,'openalex':openalex(doi),'semantic_scholar':semantic(doi),'europepmc':europe(doi)}
    print(json.dumps(report,ensure_ascii=False,separators=(',',':')))
if __name__=='__main__': main()
