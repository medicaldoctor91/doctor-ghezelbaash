"""Read-only evidence audit: homepage Entity Home, Wikidata identity, dual-authority risks."""
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit
import requests
from bs4 import BeautifulSoup

BASE = "https://www.ghezelbaash.ir/"
PERSON = BASE + "#saeed-ghezelbash"
OFFICE = BASE + "dr-saeed-ghezelbash-aesthetic-clinic-kermanshah"
HOME_PAGE = BASE + "webpage"
Q_PERSON = "Q140287622"
Q_CLINIC_OLD = "Q140288589"
EXPECTED_GRAPH = "25440dbc062dc69131341744562da86e30037f00af681d8e8fc55ad078cb2f50"
OUT = Path("/tmp/wikidata-entity-home-live-audit.json")

def get(url, ua=None):
    h={"Cache-Control":"no-cache, no-store","Pragma":"no-cache",
       "Accept-Encoding":"identity",
       "User-Agent":ua or "Mozilla/5.0 (compatible; EntityHomeLiveAudit/1.0)"}
    response=requests.get(url,headers=h,timeout=100)
    response.raise_for_status()
    return response

def ids(x):
    x=[] if x is None else x if isinstance(x,list) else [x]
    return [i if isinstance(i,str) else i.get("@id") for i in x if isinstance(i,(dict,str))]
def typed(x,name):
    t=x.get("@type",[])
    return name in (t if isinstance(t,list) else [t])
def value(snak):
    return snak.get("datavalue",{}).get("value")
def prop(c,p):
    return [value(q.get("mainsnak",{})) for q in c.get("claims",{}).get(p,[]) if q.get("mainsnak",{}).get("snaktype")=="value"]
def qis(c,p):
    return [{ "snaktype":q["mainsnak"]["snaktype"],
              "value":value(q["mainsnak"]),
              "qualifiers":{k:[value(x) for x in a] for k,a in q.get("qualifiers",{}).items()},
              "references":len(q.get("references",[])) }
            for q in c.get("claims",{}).get(p,[])]

report={"status":"PENDING","readOnly":True,"providerWrites":0,"issues":[]}
try:
    wikidata=get("https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q140287622%7CQ140288589&format=json").json().get("entities",{})
    person_wd=wikidata.get(Q_PERSON,{})
    clinic_wd=wikidata.get(Q_CLINIC_OLD,{})
    assert person_wd.get("type")=="item","Physician Wikidata Q-item absent"
    report["wikidata"]={
      "physician":{"q":Q_PERSON,"exists":True,"modified":person_wd.get("modified"),
                   "labelEnglish":person_wd.get("labels",{}).get("en",{}).get("value"),
                   "labelPersian":person_wd.get("labels",{}).get("fa",{}).get("value"),
                   "officialWebsite":prop(person_wd,"P856"),
                   "orcid":prop(person_wd,"P496"),
                   "knowledgeGraphId":prop(person_wd,"P2671"),
                   "ownerOf":qis(person_wd,"P1830"),
                   "itemOperated":qis(person_wd,"P121"),
                   "workLocation":qis(person_wd,"P937")},
      "clinic":{"q":Q_CLINIC_OLD,"exists":clinic_wd.get("type")=="item",
                "missing": "missing" in clinic_wd, "redirect":clinic_wd.get("redirect")}}
    if clinic_wd.get("type")!="item":
        report["issues"].append({"priority":"medium",
          "finding":"Clinic Wikidata Q140288589 is not a current item; treat references as stale, no independent Wikidata clinic item verified"})
    assert BASE in prop(person_wd,"P856"),"Physician Wikidata P856 is not canonical homepage"

    graph_bytes=get(BASE+"graph.jsonld").content
    graph=json.loads(graph_bytes)
    nodes=graph["@graph"]
    lookup={n["@id"]:n for n in nodes if isinstance(n,dict) and isinstance(n.get("@id"),str)}
    person=lookup[PERSON]
    clinic=lookup[OFFICE]
    home=lookup[HOME_PAGE]
    websites=[n for n in nodes if typed(n,"WebSite")]
    services=[n for n in nodes if typed(n,"Service")]
    works=[n for n in nodes if any(PERSON in ids(n.get(k)) for k in ("author","creator"))]
    office_providers=[n["@id"] for n in services if OFFICE in ids(n.get("provider"))]
    wrong_providers=[{"id":n.get("@id"),"provider":ids(n.get("provider"))} for n in services
                     if ids(n.get("provider"))!=[PERSON]]
    other_clinical_nodes=[{"id":n["@id"],"type":n.get("@type"),"name":n.get("name")}
                          for n in nodes
                          if n.get("@id") not in (PERSON,OFFICE) and
                          any(typed(n,t) for t in ("PhysiciansOffice","MedicalClinic","MedicalOrganization","Physician"))]
    clinic_as_author=[{"id":n["@id"],"role":k} for n in nodes for k in
                      ("author","creator","provider","healthcareProvider")
                      if OFFICE in ids(n.get(k))]
    wd_clinic_tokens=[]
    for node in [person,clinic,home,*websites]:
        payload=json.dumps(node,ensure_ascii=False)
        if Q_CLINIC_OLD in payload:
            wd_clinic_tokens.append(node["@id"])
    clinic_forbidden=[k for k in ("medicalSpecialty","availableService","hasOfferCatalog") if k in clinic]
    report["liveGraph"]={
        "sha256":hashlib.sha256(graph_bytes).hexdigest(),"nodes":len(nodes),
        "person":{"id":PERSON,"types":person.get("@type"),"name":person.get("name"),
                  "url":person.get("url"),"sameAs":person.get("sameAs"),
                  "identifiers":person.get("identifier"),"mainEntityOfPage":person.get("mainEntityOfPage"),
                  "practicesAt":person.get("practicesAt"),"owns":person.get("owns"),
                  "medicalSpecialty":person.get("medicalSpecialty"),
                  "hasOfferCatalog":person.get("hasOfferCatalog"),
                  "availableServiceCount":len(ids(person.get("availableService")))},
        "clinic":{"id":OFFICE,"types":clinic.get("@type"),"name":clinic.get("name"),
                  "url":clinic.get("url"),"sameAs":clinic.get("sameAs"),"identifier":clinic.get("identifier"),
                  "founder":clinic.get("founder"),"owner":clinic.get("owner"),"employee":clinic.get("employee"),
                  "parentOrganization":clinic.get("parentOrganization"),
                  "mainEntityOfPage":clinic.get("mainEntityOfPage"),"address":clinic.get("address"),
                  "geo":clinic.get("geo"),"hasMap":clinic.get("hasMap"),
                  "forbiddenClinicalKeys":clinic_forbidden},
        "homepageGraphNode":{"id":HOME_PAGE,"type":home.get("@type"),"mainEntity":home.get("mainEntity"),
                            "about":home.get("about"),"publisher":home.get("publisher"),
                            "author":home.get("author"),"isPartOf":home.get("isPartOf"),
                            "url":home.get("url"),"name":home.get("name")},
        "websites":[{"id":n.get("@id"),"mainEntity":n.get("mainEntity"),
                     "about":n.get("about"),"publisher":n.get("publisher"),
                     "creator":n.get("creator"),"name":n.get("name")} for n in websites],
        "services":len(services),"servicesWithSinglePersonProvider":len(services)-len(wrong_providers),
        "wrongProviderExamples":wrong_providers[:8],"clinicAsServiceProvider":office_providers[:12],
        "clinicAsAuthorCreatorProvider":clinic_as_author[:15],
        "otherIndependentPhysicianClinicNodes":other_clinical_nodes[:20],
        "personAttributedWorks":len(works),
        "nodesReferencingMissingClinicQ":wd_clinic_tokens}
    assert hashlib.sha256(graph_bytes).hexdigest()==EXPECTED_GRAPH,"Canonical graph hash drift"
    assert ids(home.get("mainEntity"))==[PERSON],"Homepage mainEntity is not physician"
    assert typed(home,"ProfilePage") and typed(home,"MedicalWebPage"),"Homepage must be ProfilePage and MedicalWebPage"
    assert len(services)==124 and not wrong_providers,"Clinical services provider ambiguity"
    assert not clinic_forbidden,"Clinic has forbidden clinical-authority properties"
    if clinic_as_author:
        report["issues"].append({"priority":"medium","finding":"Some nodes attribute provider/author/creator to office; inspect role carefully", "count":len(clinic_as_author)})
    if other_clinical_nodes:
        report["issues"].append({"priority":"review","finding":"Additional clinic/physician-typed graph nodes exist", "count":len(other_clinical_nodes)})
    if wd_clinic_tokens:
        report["issues"].append({"priority":"high","finding":"Primary entities link to missing Wikidata Q140288589","entities":wd_clinic_tokens})

    googlebot=("Mozilla/5.0 (compatible; Googlebot/2.1; "
               "+http://www.google.com/bot.html)")
    versions={}
    for ua_key,agent in (("normal",None),("googlebot",googlebot)):
        res=get(BASE,agent)
        data=res.content
        soup=BeautifulSoup(data,"html.parser")
        scripts=soup.find_all("script",{"type":"application/ld+json"})
        jsonlds=[]
        for s in scripts:
            jsonlds.append(json.loads(s.string or s.get_text()))
        inline_nodes=[n for j in jsonlds for n in j.get("@graph",[]) if isinstance(n,dict)]
        inline_byid={n["@id"]:n for n in inline_nodes if "@id" in n}
        cap=2000000
        def pos(pattern):
            match=re.search(pattern,data,flags=re.I)
            return match.start() if match else None
        def limit_segment(p):
            return p is not None and p < cap
        main=soup.find("main")
        h1=soup.find("h1")
        meta_can=soup.find("link",rel="canonical")
        desc=soup.find("meta",attrs={"name":"description"})
        heading=str(h1.get_text(" ",strip=True))[:180] if h1 else None
        structured_match=re.search(rb"<script\b[^>]*id=[\"']canonical-entity-graph[\"'][^>]*>[\s\S]*?</script>",data,flags=re.I)
        end=structured_match.end() if structured_match else None
        bodypos=pos(rb"<body\b")
        h1pos=pos(rb"<h1\b")
        mainpos=pos(rb"<main\b")
        title=soup.title.get_text(" ",strip=True) if soup.title else None
        versions[ua_key]={
            "status":res.status_code,"totalHTMLBytes":len(data),
            "contentType":res.headers.get("content-type"),
            "contentEncoding":res.headers.get("content-encoding"),
            "cacheStatus":res.headers.get("cf-cache-status"),
            "title":title,"canonicalLink":meta_can.get("href") if meta_can else None,
            "description":desc.get("content","")[:250] if desc else None,
            "h1":heading,"h1Count":len(soup.find_all("h1")),
            "bodyStartByte":bodypos,"mainStartByte":mainpos,"firstH1StartByte":h1pos,
            "firstH1Within2MB":limit_segment(h1pos),
            "bodyWithin2MB":limit_segment(bodypos),
            "firstVisibleMainText":main.get_text(" ",strip=True)[:700] if main else None,
            "firstVisibleMainTextWithin2MB":limit_segment(mainpos),
            "inlineJSONLDScripts":len(jsonlds),
            "inlineGraphNodeCount":len(inline_nodes),
            "inlineHomeMainEntity":inline_byid.get(HOME_PAGE,{}).get("mainEntity"),
            "inlinePersonPresent":PERSON in inline_byid,
            "inlineOfficePresent":OFFICE in inline_byid,
            "inlineGraphSameAsCanonical":len(jsonlds)==1 and jsonlds[0]==graph,
            "inlineSchemaStartByte":structured_match.start() if structured_match else None,
            "inlineSchemaEndByte":end,
            "inlineSchemaCompleteWithin2MB":end is not None and end < cap,
            "bytesAfter2M":max(0,len(data)-cap),
            "estimatedBytesRemainingAfterJSONLDBeforeGooglebotLimit":cap-end if end else None,
            "contentAfter2M":len(data)>cap}
        if len(data)>cap and (mainpos is None or mainpos >= cap):
            report["issues"].append({"priority":"critical",
                      "finding":"Visible homepage main content starts after Google's 2MB Googlebot fetch limit",
                      "userAgent":ua_key,"mainByte":mainpos,"limit":cap})
        elif len(data)>cap:
            report["issues"].append({"priority":"high",
                      "finding":"Homepage HTML is >2MB, so Googlebot cannot fetch the entire document",
                      "userAgent":ua_key,"totalBytes":len(data),"firstMainByte":mainpos,
                      "scriptEndByte":end,"limit":cap})
        if h1pos is None or h1pos>=cap:
            report["issues"].append({"priority":"critical",
                      "finding":"Homepage H1 is outside the first 2MB fetched by Googlebot",
                      "userAgent":ua_key,"h1Byte":h1pos})
    report["homepageLive"]=versions
    if versions["normal"]["canonicalLink"] not in (BASE,BASE.rstrip("/")):
        report["issues"].append({"priority":"high","finding":"Homepage canonical link not self-referential"})
    if not versions["normal"]["inlineGraphSameAsCanonical"]:
        report["issues"].append({"priority":"high",
                                  "finding":"Homepage inline JSON-LD not equal to canonical graph"})

    report["status"]="PASS_WITH_ISSUES" if report["issues"] else "PASS"
except Exception as error:
    report["status"]="ERROR"
    report["exception"]={"type":type(error).__name__,"message":str(error)}
finally:
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(report,indent=2,ensure_ascii=False,default=str)+"\n")
    summary={"status":report["status"],"issues":report["issues"],
             "wikidata":{"physicianExists":report.get("wikidata",{}).get("physician",{}).get("exists"),
                         "clinicExists":report.get("wikidata",{}).get("clinic",{}).get("exists"),
                         "clinicMissing":report.get("wikidata",{}).get("clinic",{}).get("missing")},
             "graph":{"nodes":report.get("liveGraph",{}).get("nodes"),
                      "services":report.get("liveGraph",{}).get("services"),
                      "correctProviders":report.get("liveGraph",{}).get("servicesWithSinglePersonProvider"),
                      "attributedWorks":report.get("liveGraph",{}).get("personAttributedWorks")},
             "homepage":report.get("homepageLive"),"exception":report.get("exception")}
    if summary["homepage"]:
        summary["homepage"]={key:{k:v for k,v in item.items() if k in
         ("totalHTMLBytes","title","canonicalLink","h1","bodyStartByte","mainStartByte",
          "firstH1StartByte","firstH1Within2MB","inlineSchemaEndByte",
          "inlineSchemaCompleteWithin2MB","inlineGraphSameAsCanonical","inlineHomeMainEntity",
          "inlinePersonPresent","inlineOfficePresent","inlineGraphNodeCount","bytesAfter2M")}
         for key,item in summary["homepage"].items()}
    print(json.dumps(summary,ensure_ascii=False,default=str))
if report["status"]=="ERROR":sys.exit(1)
