#!/usr/bin/env python3
import json,re,requests,time

UA='GhezelbaashCitationCoverageAudit/1.0 (https://github.com/medicaldoctor91/doctor-ghezelbaash)'
s=requests.Session(); s.headers.update({'User-Agent':UA})
TARGETS={
 'omega3':{'qid':'Q36942316','openalex':'W2395000074','doi':'10.4103/2008-7802.182734'},
 'mdd':{'qid':'Q140298431','openalex':'W3196510111','doi':'10.3390/healthcare9091169'},
}

def openalex_citers(work_id):
    url='https://api.openalex.org/works'
    params={'filter':f'cites:{work_id}','per-page':100,'select':'id,doi,title,publication_year,type,cited_by_count,primary_location,authorships'}
    r=s.get(url,params=params,timeout=60); r.raise_for_status(); j=r.json()
    out=[]
    for w in j.get('results',[]):
        doi=(w.get('doi') or '').replace('https://doi.org/','') or None
        src=((w.get('primary_location') or {}).get('source') or {})
        authors=[]
        for a in w.get('authorships') or []:
            au=a.get('author') or {}; name=au.get('display_name')
            if name: authors.append(name)
        out.append({'openalex':w.get('id','').split('/')[-1],'doi':doi,'title':w.get('title'),'year':w.get('publication_year'),'type':w.get('type'),'cited_by_count':w.get('cited_by_count'),'source':src.get('display_name'),'authors':authors[:6]})
    return out,j.get('meta',{}).get('count')

def wd_search_doi(doi):
    if not doi:return []
    q=doi.upper(); r=s.get('https://www.wikidata.org/w/api.php',params={'action':'query','list':'search','srsearch':f'haswbstatement:P356={q}','srnamespace':0,'srlimit':10,'format':'json','formatversion':2},timeout=45); r.raise_for_status()
    hits=[]
    for x in r.json().get('query',{}).get('search',[]):
        t=x.get('title','')
        if re.fullmatch(r'Q\d+',t):hits.append(t)
    exact=[]
    if hits:
        rr=s.get('https://www.wikidata.org/w/api.php',params={'action':'wbgetentities','ids':'|'.join(hits),'props':'claims','format':'json','formatversion':2},timeout=45); rr.raise_for_status()
        for qid,e in rr.json().get('entities',{}).items():
            for st in e.get('claims',{}).get('P356',[]):
                try:v=st['mainsnak']['datavalue']['value']
                except Exception:continue
                if str(v).lower()==doi.lower():exact.append(qid);break
    return exact

def wd_has_edge(qids,target):
    if not qids:return False
    r=s.get('https://www.wikidata.org/w/api.php',params={'action':'wbgetentities','ids':'|'.join(qids),'props':'claims','format':'json','formatversion':2},timeout=45);r.raise_for_status()
    for qid,e in r.json().get('entities',{}).items():
        for st in e.get('claims',{}).get('P2860',[]):
            try:
                v=st['mainsnak']['datavalue']['value']; got=v.get('id') or f"Q{v['numeric-id']}"
            except Exception:continue
            if got==target:return True
    return False

def score(w):
    t=(w.get('title') or '').lower(); typ=(w.get('type') or '').lower(); s=0
    if 'systematic review' in t:s+=100
    if 'meta-analysis' in t or 'meta analysis' in t:s+=90
    if 'review' in t:s+=70
    if typ=='review':s+=50
    s+=min(int(w.get('cited_by_count') or 0),50)
    if w.get('doi'):s+=20
    return s

def main():
    report={}
    for name,cfg in TARGETS.items():
        works,count=openalex_citers(cfg['openalex']); rows=[]
        for w in works:
            qids=wd_search_doi(w['doi']); edge=wd_has_edge(qids,cfg['qid']) if qids else False
            w.update({'wikidata_qids':qids,'p2860_to_target':edge,'priority':score(w)})
            rows.append(w);time.sleep(.15)
        rows=sorted(rows,key=lambda x:(not x['p2860_to_target'],-x['priority'],-(x.get('year') or 0)))
        report[name]={'openalex_count':count,'audited_count':len(rows),'covered':sum(1 for x in rows if x['p2860_to_target']),'missing_with_doi':[x for x in rows if x['doi'] and not x['p2860_to_target']],'missing_without_doi':[x for x in rows if not x['doi'] and not x['p2860_to_target']]}
    print(json.dumps(report,ensure_ascii=False,separators=(',',':')))
if __name__=='__main__':main()
