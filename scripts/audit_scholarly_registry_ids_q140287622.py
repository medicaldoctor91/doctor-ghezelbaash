#!/usr/bin/env python3
import requests,json,datetime,re
WD='https://www.wikidata.org/w/api.php'; Q='Q140287622'
s=requests.Session();s.headers.update({'User-Agent':'Q140287622-ScholarlyRegistryAudit/1.0 (mailto:medicaldoctor91@gmail.com)','Cache-Control':'no-cache'})
def wdget(**p):
 p.update(format='json',formatversion=2,maxage=0,smaxage=0);r=s.get(WD,params=p,timeout=60);r.raise_for_status();d=r.json()
 if 'error'in d:raise RuntimeError(d['error'])
 return d
def sv(c):
 try:return c['mainsnak']['datavalue']['value']
 except:return None
e=wdget(action='wbgetentities',ids=Q,props='info|claims')['entities'][Q]
claims=e.get('claims',{})
def vals(p):return [sv(c) for c in claims.get(p,[]) if sv(c) is not None]
current={
 'ORCID_P496':vals('P496'),'OpenAlex_P10283':vals('P10283'),'SemanticScholar_P4012':vals('P4012'),'GoogleScholar_P1960':vals('P1960'),
 'Scopus_P1153':vals('P1153'),'ResearchGate_P2038':vals('P2038'),'WoSResearcherID_P1053':vals('P1053'),'Publons_P3829':vals('P3829')
}
out={'audit_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'wikidata_lastrevid':e.get('lastrevid'),'current_wikidata_ids':current,'registries':{}}
# OpenAlex
if current['OpenAlex_P10283']:
 aid=current['OpenAlex_P10283'][0]
 try:
  r=s.get(f'https://api.openalex.org/authors/{aid}',params={'mailto':'medicaldoctor91@gmail.com'},timeout=45);r.raise_for_status();d=r.json()
  out['registries']['openalex']={'ok':True,'id':aid,'display_name':d.get('display_name'),'orcid':d.get('orcid'),'ids':d.get('ids'),'works_count':d.get('works_count'),'cited_by_count':d.get('cited_by_count'),'last_known_institutions':[{'id':x.get('id'),'display_name':x.get('display_name'),'country_code':x.get('country_code')} for x in (d.get('last_known_institutions')or[])[:5]]}
 except Exception as ex:out['registries']['openalex']={'ok':False,'error':repr(ex)}
# ORCID public API
if current['ORCID_P496']:
 oid=current['ORCID_P496'][0]
 try:
  r=s.get(f'https://pub.orcid.org/v3.0/{oid}/record',headers={'Accept':'application/json','User-Agent':s.headers['User-Agent']},timeout=45);r.raise_for_status();d=r.json();person=d.get('person')or{}
  aliases=[]
  for x in ((person.get('other-names')or{}).get('other-name')or[]):
   if x.get('content'):aliases.append(x.get('content'))
  ext=[]
  for x in ((person.get('external-identifiers')or{}).get('external-identifier')or[]):
   ext.append({'type':x.get('external-id-type'),'value':x.get('external-id-value'),'url':(x.get('external-id-url')or{}).get('value'),'relationship':x.get('external-id-relationship')})
  urls=[]
  for x in ((person.get('researcher-urls')or{}).get('researcher-url')or[]):urls.append({'name':x.get('url-name'),'url':(x.get('url')or{}).get('value')})
  out['registries']['orcid']={'ok':True,'id':oid,'given_names':((person.get('name')or{}).get('given-names')or{}).get('value'),'family_name':((person.get('name')or{}).get('family-name')or{}).get('value'),'credit_name':((person.get('name')or{}).get('credit-name')or{}).get('value'),'aliases':aliases,'external_identifiers':ext,'researcher_urls':urls}
 except Exception as ex:out['registries']['orcid']={'ok':False,'error':repr(ex)}
# Semantic Scholar
if current['SemanticScholar_P4012']:
 sid=str(current['SemanticScholar_P4012'][0])
 try:
  fields='name,aliases,url,paperCount,citationCount,hIndex,papers.title,papers.year,papers.externalIds'
  r=s.get(f'https://api.semanticscholar.org/graph/v1/author/{sid}',params={'fields':fields},timeout=45);r.raise_for_status();d=r.json()
  out['registries']['semantic_scholar']={'ok':True,'id':sid,'name':d.get('name'),'aliases':d.get('aliases'),'url':d.get('url'),'paperCount':d.get('paperCount'),'citationCount':d.get('citationCount'),'hIndex':d.get('hIndex'),'papers':[{'title':p.get('title'),'year':p.get('year'),'externalIds':p.get('externalIds')} for p in (d.get('papers')or[])[:10]]}
 except Exception as ex:out['registries']['semantic_scholar']={'ok':False,'error':repr(ex)}
# Crossref ORCID linkage (does not create an author ID; checks scholarly graph reconciliation)
if current['ORCID_P496']:
 oid=current['ORCID_P496'][0]
 try:
  r=s.get('https://api.crossref.org/works',params={'filter':f'orcid:{oid}','rows':20,'select':'DOI,title,author,published'},timeout=45);r.raise_for_status();d=r.json()['message']
  out['registries']['crossref_orcid_filter']={'ok':True,'total_results':d.get('total-results'),'works':[{'DOI':x.get('DOI'),'title':(x.get('title')or[None])[0]} for x in d.get('items',[])]}
 except Exception as ex:out['registries']['crossref_orcid_filter']={'ok':False,'error':repr(ex)}
print(json.dumps(out,ensure_ascii=False,indent=2,sort_keys=True))