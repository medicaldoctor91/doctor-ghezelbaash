#!/usr/bin/env python3
import json,requests,time
from urllib.parse import quote

UA='GhezelbaashCitationEvidenceAudit/1.0 (https://github.com/medicaldoctor91/doctor-ghezelbaash)'
s=requests.Session();s.headers.update({'User-Agent':UA})
TARGETS={
'10.4103/2008-7802.182734':[
'10.1093/advances/nmac083','10.1080/1028415x.2022.2077031','10.1016/j.ajp.2022.103394','10.3390/nu18060939','10.26444/ms/187881','10.1080/15622975.2021.2013041','10.3390/nu12082333','10.1016/j.jad.2019.10.038','10.1111/bdi.13037','10.1039/d3fo00265a','10.3390/medicina57060545','10.1080/19390211.2017.1326432','10.21608/mkas.2022.170964.1188','10.46932/sfjdv6n11-002','10.1016/b978-0-323-43044-9.00142-4'],
'10.3390/healthcare9091169':[
'10.3389/fpsyt.2026.1866005','10.30574/wjarr.2024.22.1.1061','10.1016/j.childyouth.2024.107863','10.1007/s10615-026-01032-0','10.31083/ap38786']}

def crossref(doi):
    r=s.get('https://api.crossref.org/works/'+quote(doi,safe=''),timeout=45)
    if not r.ok:return {'status':r.status_code,'refs':[]}
    m=r.json().get('message',{});refs=[]
    for x in m.get('reference') or []:
        d=x.get('DOI') or x.get('doi')
        if d:refs.append(d.lower())
    return {'status':r.status_code,'title':(m.get('title') or [''])[0],'type':m.get('type'),'ref_count':len(m.get('reference') or []),'doi_refs':refs}

def main():
    out=[]
    for target,citers in TARGETS.items():
        for doi in citers:
            m=crossref(doi);out.append({'target':target,'citing':doi,'crossref_status':m['status'],'title':m.get('title'),'type':m.get('type'),'ref_count':m.get('ref_count',0),'exact_target_doi_in_crossref_refs':target.lower() in m.get('doi_refs',[])})
            time.sleep(.15)
    print(json.dumps(out,ensure_ascii=False,separators=(',',':')))
if __name__=='__main__':main()
