#!/usr/bin/env python3
import requests,json,datetime,re,html
WD='https://www.wikidata.org/w/api.php'; Q='Q140287622'; ORCID='0009-0001-9346-8475'
s=requests.Session();s.headers.update({'User-Agent':'Q140287622-ScholarlyRegistryAudit/1.1 (mailto:medicaldoctor91@gmail.com)','Cache-Control':'no-cache'})
def wdget(**p):
 p.update(format='json',formatversion=2,maxage=0,smaxage=0);r=s.get(WD,params=p,timeout=60);r.raise_for_status();d=r.json()
 if 'error'in d:raise RuntimeError(d['error'])
 return d
def sv(c):
 try:return c['mainsnak']['datavalue']['value']
 except:return None
e=wdget(action='wbgetentities',ids=Q,props='info|claims')['entities'][Q];claims=e.get('claims',{})
def vals(p):return [sv(c) for c in claims.get(p,[]) if sv(c) is not None]
current={'ORCID_P496':vals('P496'),'OpenAlex_P10283':vals('P10283'),'SemanticScholar_P4012':vals('P4012'),'GoogleScholar_P1960':vals('P1960'),'SciProfiles_P8159':vals('P8159'),'Scopus_P1153':vals('P1153'),'ResearchGate_P2038':vals('P2038'),'WoSResearcherID_P1053':vals('P1053'),'Publons_P3829':vals('P3829')}
out={'audit_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'wikidata_lastrevid':e.get('lastrevid'),'current_wikidata_ids':current,'registries':{}}
if current['OpenAlex_P10283']:
 aid=current['OpenAlex_P10283'][0]
 try:
  r=s.get(f'https://api.openalex.org/authors/{aid}',params={'mailto':'medicaldoctor91@gmail.com'},timeout=45);r.raise_for_status();d=r.json()
  out['registries']['openalex']={'ok':True,'id':aid,'display_name':d.get('display_name'),'orcid':d.get('orcid'),'ids':d.get('ids'),'works_count':d.get('works_count'),'cited_by_count':d.get('cited_by_count'),'last_known_institutions':[{'id':x.get('id'),'display_name':x.get('display_name'),'country_code':x.get('country_code')} for x in (d.get('last_known_institutions')or[])[:5]]}
 except Exception as ex:out['registries']['openalex']={'ok':False,'error':repr(ex)}
if current['ORCID_P496']:
 oid=current['ORCID_P496'][0]
 try:
  r=s.get(f'https://pub.orcid.org/v3.0/{oid}/record',headers={'Accept':'application/json'},timeout=45);r.raise_for_status();d=r.json();person=d.get('person')or{}
  aliases=[x.get('content') for x in ((person.get('other-names')or{}).get('other-name')or[]) if x.get('content')]
  ext=[{'type':x.get('external-id-type'),'value':x.get('external-id-value'),'url':(x.get('external-id-url')or{}).get('value'),'relationship':x.get('external-id-relationship')} for x in ((person.get('external-identifiers')or{}).get('external-identifier')or[])]
  urls=[{'name':x.get('url-name'),'url':(x.get('url')or{}).get('value')} for x in ((person.get('researcher-urls')or{}).get('researcher-url')or[])]
  out['registries']['orcid']={'ok':True,'id':oid,'given_names':((person.get('name')or{}).get('given-names')or{}).get('value'),'family_name':((person.get('name')or{}).get('family-name')or{}).get('value'),'credit_name':((person.get('name')or{}).get('credit-name')or{}).get('value'),'aliases':aliases,'external_identifiers':ext,'researcher_urls':urls}
  # Public works summary, including DOI evidence.
  wr=s.get(f'https://pub.orcid.org/v3.0/{oid}/works',headers={'Accept':'application/json'},timeout=45);wr.raise_for_status();wd=wr.json();works=[]
  for g in wd.get('group',[]) or []:
   for w in g.get('work-summary',[]) or []:
    ids=[]
    for xi in ((w.get('external-ids')or{}).get('external-id')or[]): ids.append({'type':xi.get('external-id-type'),'value':xi.get('external-id-value'),'relationship':xi.get('external-id-relationship')})
    works.append({'title':(((w.get('title')or{}).get('title')or{}).get('value')),'put_code':w.get('put-code'),'external_ids':ids})
  out['registries']['orcid']['works']=works
 except Exception as ex:out['registries']['orcid']={'ok':False,'error':repr(ex)}
if current['SemanticScholar_P4012']:
 sid=str(current['SemanticScholar_P4012'][0])
 try:
  r=s.get(f'https://api.semanticscholar.org/graph/v1/author/{sid}',params={'fields':'name,aliases,url,paperCount,citationCount,hIndex'},timeout=45);r.raise_for_status();d=r.json()
  out['registries']['semantic_scholar']={'ok':True,'id':sid,'name':d.get('name'),'aliases':d.get('aliases'),'url':d.get('url'),'paperCount':d.get('paperCount'),'citationCount':d.get('citationCount'),'hIndex':d.get('hIndex')}
 except Exception as ex:out['registries']['semantic_scholar']={'ok':False,'error':repr(ex)}
if current['ORCID_P496']:
 oid=current['ORCID_P496'][0]
 try:
  r=s.get('https://api.crossref.org/works',params={'filter':f'orcid:{oid}','rows':20,'select':'DOI,title,author,published'},timeout=45);r.raise_for_status();d=r.json()['message']
  out['registries']['crossref_orcid_filter']={'ok':True,'total_results':d.get('total-results'),'works':[{'DOI':x.get('DOI'),'title':(x.get('title')or[None])[0]} for x in d.get('items',[])]}
 except Exception as ex:out['registries']['crossref_orcid_filter']={'ok':False,'error':repr(ex)}
# Exact Crossref DOI contributor metadata for both known publications.
for doi in ['10.3390/healthcare9091169','10.4103/2008-7802.182734']:
 key='crossref_doi_'+doi.replace('/','_')
 try:
  r=s.get('https://api.crossref.org/works/'+doi,timeout=45);r.raise_for_status();m=r.json()['message'];authors=[]
  for a in m.get('author',[]) or []:
   if 'ghezelbash' in ((a.get('given','')+' '+a.get('family','')).lower()): authors.append({'given':a.get('given'),'family':a.get('family'),'ORCID':a.get('ORCID'),'affiliation':a.get('affiliation')})
  out['registries'][key]={'ok':True,'title':(m.get('title')or[None])[0],'publisher':m.get('publisher'),'authors_matching_ghezelbash':authors}
 except Exception as ex:out['registries'][key]={'ok':False,'error':repr(ex)}
# MDPI/SciProfiles identity extraction from current article HTML.
try:
 r=s.get('https://www.mdpi.com/2227-9032/9/9/1169',headers={'User-Agent':'Mozilla/5.0 (compatible; Q140287622-ScholarlyRegistryAudit/1.1)'},timeout=60); txt=r.text
 idx=txt.lower().find('mohammad saeed ghezelbash'); window=txt[max(0,idx-6000):idx+6000] if idx>=0 else txt
 links=sorted(set(html.unescape(x) for x in re.findall(r'https?://(?:www\.)?sciprofiles\.com/(?:profile|user)/(?:publications/|network/)?[^"\'<> ]+',window,re.I)))
 numeric=[]
 for u in links:
  m=re.search(r'sciprofiles\.com/(?:profile|user/(?:publications|network))/([1-9]\d*)',u,re.I)
  if m:numeric.append(m.group(1))
 out['registries']['mdpi_sciprofiles']={'ok':r.status_code==200,'http_status':r.status_code,'name_found':idx>=0,'links_near_author':links,'numeric_ids':sorted(set(numeric)),'html_length':len(txt)}
except Exception as ex:out['registries']['mdpi_sciprofiles']={'ok':False,'error':repr(ex)}
print(json.dumps(out,ensure_ascii=False,indent=2,sort_keys=True))