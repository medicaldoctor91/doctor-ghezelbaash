#!/usr/bin/env python3
"""Read-only deterministic production/site structure audit. Never writes to the target."""
import collections, concurrent.futures, copy, datetime, hashlib, json, os, re, statistics, subprocess, sys, time, urllib.parse, xml.etree.ElementTree as ET
from pathlib import Path
import requests
from bs4 import BeautifulSoup

ORIGIN="https://www.ghezelbaash.ir"
SITE=ORIGIN+"/"
DEPLOYMENT="https://9730f5cb.doctor-ghezelbaash.pages.dev"
LIMIT=2_000_000
MED_DOMAINS=("pubmed.ncbi.nlm.nih.gov","ncbi.nlm.nih.gov","fda.gov","aad.org","nice.org.uk","who.int","nih.gov","nccih.nih.gov","nhs.uk","cochranelibrary.com","dermnetnz.org","jamanetwork.com","bmj.com","nejm.org","aafp.org","clinicaltrials.gov","mayoclinic.org")
PERSON=ORIGIN+"/#saeed-ghezelbash"
HOME_ID=ORIGIN+"/webpage"
UA={"User-Agent":"TechnicalReadOnlyAudit/20261123 (public structure audit; contact via website)","Accept-Encoding":"identity","Cache-Control":"no-cache"}
OUT=Path("audit-output")
OUT.mkdir(exist_ok=True)
FINDINGS=[]
def issue(severity,code,path,detail,notes=None):
    FINDINGS.append(dict(severity=severity,code=code,path=path,detail=str(detail)[:300],notes=notes))
def req(url,timeout=55):
    for attempt in range(2):
        try:return requests.get(url,headers=UA,timeout=(14,timeout),allow_redirects=True)
        except requests.RequestException:
            if attempt:raise
def geturl(path):return ORIGIN+path
def digest(s):return hashlib.sha256(s).hexdigest()
def types(n):
    if not isinstance(n,dict):return []
    x=n.get("@type",[])
    return [x] if isinstance(x,str) else x if isinstance(x,list) else []
def ids(v):
    if isinstance(v,str):return [v]
    if isinstance(v,dict):return [v["@id"]] if "@id" in v else []
    if isinstance(v,list):return [x for y in v for x in ids(y)]
    return []
def flatten(ds):
    result=[]
    for d in ds:
        if isinstance(d,list):result+=d
        elif isinstance(d,dict) and isinstance(d.get("@graph"),list):result+=d["@graph"]
        elif isinstance(d,dict):result.append(d)
    return result
def valid_ref(v):
    return any(isinstance(x,str) and x.startswith("http") for x in ids(v))
def link_path(u):
    try:
        p=urllib.parse.urlsplit(urllib.parse.urljoin(SITE,u))
        if p.scheme not in ("http","https") or p.hostname not in ("www.ghezelbaash.ir","ghezelbaash.ir"):return None
        if p.path.startswith("/assets/") or p.path.startswith("/media/") or p.path.startswith("/fonts/"):return None
        if re.search(r"\.(?:png|jpg|jpeg|gif|webp|svg|css|js|ico|pdf|mp4|webm|woff2?|jsonld|ttl|json|csv|xml|gz|zip|txt)$",p.path,re.I):return None
        path=urllib.parse.unquote(p.path) or "/"
        return path.rstrip("/") or "/"
    except Exception:return None
def meta(s,kind,key):
    x=s.find("meta",attrs={kind:key})
    return x.get("content","").strip() if x else ""
def domtext(s):
    for node in s(["script","style","noscript","template","svg"]):node.decompose()
    return s.get_text(" ",strip=True)
def external_domain(href):
    try:return urllib.parse.urlsplit(urllib.parse.urljoin(SITE,href)).hostname or ""
    except Exception:return ""
def parse_markup(content,path):
    soup=BeautifulSoup(content,"lxml")
    nodes=[];errors=[];scripts=[]
    for sc in soup.select('script[type="application/ld+json"]'):
        raw=sc.string or sc.get_text() or ""
        try:
            obj=json.loads(raw)
            nodes.extend(flatten([obj]))
            success=True
        except Exception as e:
            success=False;errors.append(str(e)[:160])
        scripts.append(dict(id=sc.get("id"),valid=success,bytes=len(raw.encode("utf-8"))))
    byte_positions=[(m.start(1),m.end(1)) for m in re.finditer(rb'<script\b(?=[^>]*\btype\s*=\s*["\x27]application/ld\+json["\x27])[^>]*>(.*?)</script\s*>',content,re.I|re.S)]
    for i,p in enumerate(byte_positions):
        if i<len(scripts):scripts[i].update(startByte=p[0],endByte=p[1],fullyWithin2MB=p[1]<=LIMIT)
    cpath=path.rstrip("/") or "/"
    canonical=[x.get("href","") for x in soup.find_all("link",rel=lambda x: x and "canonical" in x)]
    h1=[x.get_text(" ",strip=True)[:180] for x in soup.select("h1")]
    head_title=soup.title.get_text(" ",strip=True) if soup.title else ""
    main=soup.select_one("main")
    alltexts=main.get_text(" ",strip=True) if main else ""
    firsttext=BeautifulSoup(content[:LIMIT].decode("utf-8","ignore"),"lxml")
    earlymain=firsttext.select_one("main")
    earlytext=domtext(earlymain) if earlymain else ""
    page_id=HOME_ID if cpath=="/" else ORIGIN+cpath+"#webpage"
    primary=[n for n in nodes if isinstance(n,dict) and n.get("@id")==page_id]
    person=[n for n in nodes if isinstance(n,dict) and n.get("@id")==PERSON]
    imgs=soup.find_all("img")
    links=soup.select("a[href]")
    internal=set(filter(None,(link_path(a.get("href","")) for a in links)))
    external=set(d for a in links if (d:=external_domain(a.get("href",""))) and d not in ("www.ghezelbaash.ir","ghezelbaash.ir"))
    evidence_domains=sorted(d for d in external if any(d==x or d.endswith("."+x) for x in MED_DOMAINS))
    actual_ids=[x.get("id") for x in soup.select("[id]") if x.get("id")]
    duplicates={k:v for k,v in collections.Counter(actual_ids).items() if v>1}
    main_entity=[x.get("mainEntity") for x in primary]
    article_nodes=[n for n in nodes if isinstance(n,dict) and any(t in types(n) for t in ["Article","MedicalScholarlyArticle","ScholarlyArticle","BlogPosting"])]
    this_article=[x for x in article_nodes if x.get("mainEntityOfPage") and (page_id in ids(x.get("mainEntityOfPage")) or ORIGIN+cpath in ids(x.get("mainEntityOfPage")))]
    html=soup.find("html")
    header={x.lower():y for x,y in req_headers[path].items()}
    wordcount=len(alltexts.split())
    candidate={
        "path":cpath,"http":res_status[path],"bytes":len(content),"title":head_title,"titleChars":len(head_title),
        "description":meta(soup,"name","description"),"descriptionChars":len(meta(soup,"name","description")),
        "canonical":canonical,"indexRobots":meta(soup,"name","robots"),"htmlLang":html.get("lang") if html else None,
        "h1":h1,"h2count":len(soup.find_all("h2")),"mainCount":len(soup.find_all("main")),
        "mainTextChars":len(alltexts),"mainWordCount":wordcount,"mainTextCharsWithin2MB":len(earlytext),
        "mainTextShareWithin2MB":round(len(earlytext)/len(alltexts),5) if alltexts else None,
        "mainByteStart":content.find(b"<main"),"bodyByteStart":content.find(b"<body"),
        "scripts":scripts,"jsonldNodes":len(nodes),"jsonldErrors":errors,
        "typeFrequencies":dict(collections.Counter(t for n in nodes for t in types(n)).most_common(15)),
        "primaryPage":{k:primary[0].get(k) for k in ["@id","@type","mainEntity","author","about"] if k in primary[0]} if len(primary)==1 else None,
        "primaryCount":len(primary),
        "personCount":len(person),"personMainEntityOfPage":ids(person[0].get("mainEntityOfPage")) if person else [],
        "articleCount":len(article_nodes),"articleCitationCount":sum(bool(n.get("citation")) for n in article_nodes),
        "pageArticleCitationCount":sum(bool(n.get("citation")) for n in this_article),
        "images":len(imgs),"imagesMissingAlt":sum(not x.has_attr("alt") for x in imgs),
        "imagesEmptyAlt":sum(x.has_attr("alt") and not x.get("alt","").strip() for x in imgs),
        "imagesNoDimensions":sum(not(x.get("width") and x.get("height")) for x in imgs),
        "links":len(links),"internalPaths":sorted(internal),"externalDomains":sorted(external),
        "externalEvidenceDomains":evidence_domains,
        "duplicateDomIds":dict(list(duplicates.items())[:12]),
        "htmlSizeOutside2MB":max(0,len(content)-LIMIT),
        "first2MbMainH1":len(firsttext.select("main h1")),
        "ogTitle":meta(soup,"property","og:title"),
        "ogUrl":meta(soup,"property","og:url"),
        "twitterCard":meta(soup,"name","twitter:card"),
        "viewport":meta(soup,"name","viewport"),
        "headers":{k:header.get(k) for k in ["content-type","cache-control","cf-cache-status","strict-transport-security","content-security-policy","x-content-type-options","referrer-policy","permissions-policy","content-encoding","vary","link","x-robots-tag"]},
        "parseIssues":[]
    }
    if res_status[path]!=200:issue("CRITICAL","non_200_route",cpath,res_status[path])
    if not head_title:issue("HIGH","missing_title",cpath,"No title")
    if not candidate["description"]:issue("MEDIUM","missing_description",cpath,"No meta description")
    if len(h1)!=1:issue("MEDIUM","h1_count",cpath,len(h1))
    if len(primary)!=1:issue("HIGH","primary_page_count",cpath,len(primary))
    if len(canonical)!=1 or canonical[0].rstrip("/")!=(ORIGIN+cpath).rstrip("/"):issue("HIGH","canonical_incorrect",cpath,canonical)
    if errors:issue("CRITICAL","invalid_jsonld",cpath,errors[:2])
    if any(v>1 for v in duplicates.values()):issue("MEDIUM","duplicate_html_ids",cpath,list(duplicates.items())[:4])
    if not html or not html.get("lang"):issue("MEDIUM","html_lang_missing",cpath,"Missing html lang")
    if not candidate["viewport"]:issue("MEDIUM","no_viewport",cpath,"Missing responsive viewport meta")
    if candidate["mainCount"]!=1:issue("HIGH","main_landmark_count",cpath,candidate["mainCount"])
    if len(primary)==1:
        n=primary[0]
        if not valid_ref(n.get("mainEntity")):issue("HIGH","missing_mainentity",cpath,types(n))
        if not valid_ref(n.get("author")):issue("MEDIUM","missing_page_author",cpath,types(n))
        if cpath=="/" and PERSON not in ids(n.get("mainEntity")):issue("CRITICAL","home_entity_wrong",cpath,ids(n.get("mainEntity")))
    if len(content)>LIMIT and cpath=="/":
        issue("HIGH","homepage_html_crawler_cutoff",cpath,f"{len(earlytext)}/{len(alltexts)} main text characters occur within the first 2,000,000 HTML bytes")
    return candidate

sitemap_resp=req(geturl("/sitemap.xml"))
sitemap_resp.raise_for_status()
root=ET.fromstring(sitemap_resp.content)
locs=[x.text.strip() for x in root.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}loc") if x.text] or [x.text.strip() for x in root.findall("./loc") if x.text]
urls=[]
for loc in locs:
    if urllib.parse.urlsplit(loc).hostname=="www.ghezelbaash.ir":
        path=urllib.parse.urlsplit(loc).path
        urls.append(path.rstrip("/") or "/")
urls=list(dict.fromkeys(urls))
print("AUDIT_STAGE sitemap",len(urls),flush=True)
if not urls:raise SystemExit("No URLs found in sitemap")
for u in locs:
    if urllib.parse.urlsplit(u).hostname!="www.ghezelbaash.ir":issue("HIGH","foreign_sitemap_host","/sitemap.xml",u)
res_status,req_headers={},{}
contents={}
errors=[]
def fetch_page(path):
    try:
        r=req(geturl(path),timeout=80)
        return path,r.status_code,dict(r.headers),r.content,r.url,None
    except Exception as e:
        return path,0,{},b"","",str(e)[:200]
with concurrent.futures.ThreadPoolExecutor(max_workers=7) as executor:
    for path,status,headers,raw,url,error in executor.map(fetch_page,urls):
        res_status[path]=status;req_headers[path]=headers
        if error or not raw:errors.append((path,error or "empty"));issue("CRITICAL","fetch_error",path,error or "empty")
        else:contents[path]=raw
print("AUDIT_STAGE fetched",len(contents),"errors",len(errors),flush=True)
rows=[]
for path,raw in contents.items():
    try:rows.append(parse_markup(raw,path))
    except Exception as e:
        errors.append((path,str(e)[:250]))
        issue("CRITICAL","parser_error",path,str(e)[:250])
rowmap={r["path"]:r for r in rows}
normalized_sitemap=set(urls)
internal_paths=collections.Counter(p for row in rows for p in row["internalPaths"])
missing_routes=sorted(normalized_sitemap-set(rowmap))
unreachable=[]
if "/" in rowmap:
    reached={"/"}
    while True:
        expanded=reached|set(p for v in reached for p in rowmap[v]["internalPaths"] if p in rowmap)
        if expanded==reached:break
        reached=expanded
    unreachable=sorted(normalized_sitemap-reached)
    if unreachable:issue("MEDIUM","nontraversable_from_home","/",f"{len(unreachable)} URLs not reachable by crawled HTML anchors",unreachable[:20])
unlisted=sorted(p for p in internal_paths if p not in normalized_sitemap)
extra_checks=[]
def verify_unlisted(path):
    try:
        r=req(geturl(path),timeout=20)
        return {"path":path,"status":r.status_code,"finalUrl":r.url}
    except Exception as e:return {"path":path,"error":str(e)[:100]}
if unlisted:
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        extra_checks=list(pool.map(verify_unlisted,unlisted[:75]))
    for x in extra_checks:
        if "status" in x and x["status"]>=400:issue("HIGH","broken_internal_html_link",x["path"],x["status"])
results={}
for path in ["/robots.txt","/graph.jsonld","/entity-facts.csv","/croissant.json","/release-provenance.json","/llms.txt"]:
    try:
        r=req(geturl(path),timeout=90)
        results[path]={"status":r.status_code,"bytes":len(r.content),"sha256":digest(r.content),"headers":{k.lower():v for k,v in r.headers.items() if k.lower() in ("content-type","cache-control","cf-cache-status","cloudflare-cdn-cache-control","age","x-robots-tag")}}
        if path=="/robots.txt":results[path]["sample"]=r.text[:5000]
        if path=="/release-provenance.json":
            try:results[path]["document"]=r.json()
            except Exception:pass
        if path=="/graph.jsonld":
            try:
                graph=r.json()
                graph_nodes=flatten([graph])
                results[path]["nodes"]=len(graph_nodes)
                ref_counts=collections.Counter(n.get("@id") for n in graph_nodes if isinstance(n,dict))
                duplicates=[n for n,c in ref_counts.items() if c>1]
                results[path]["duplicateEntityIds"]=duplicates[:40]
                results[path]["uniqueIds"]=len(ref_counts)
                results[path]["topTypes"]=collections.Counter(t for n in graph_nodes for t in types(n)).most_common(35)
                results[path]["nodesWithoutType"]=sum(not types(n) for n in graph_nodes)
                results[path]["nodesWithoutId"]=sum(not n.get("@id") for n in graph_nodes if isinstance(n,dict))
                results[path]["primaryProfiles"]=[{"id":n.get("@id"),"type":types(n),"mainEntity":ids(n.get("mainEntity"))} for n in graph_nodes if "ProfilePage" in types(n)]
                results[path]["services"]=len([n for n in graph_nodes if "Service" in types(n)])
                results[path]["servicesBadProvider"]=[n.get("@id") for n in graph_nodes if "Service" in types(n) and PERSON not in ids(n.get("provider"))][:30]
                results[path]["articles"]=sum("Article" in types(n) for n in graph_nodes)
                results[path]["articlesWithCitation"]=sum("Article" in types(n) and bool(n.get("citation")) for n in graph_nodes)
                results[path]["personMainEntityOfPage"]=[ids(n.get("mainEntityOfPage")) for n in graph_nodes if n.get("@id")==PERSON]
                results[path]["homePageTypes"]=[types(n) for n in graph_nodes if n.get("@id")==HOME_ID]
                nodeids={x.get("@id") for x in graph_nodes}
                edge_ids=collections.Counter()
                def collect_ref(k,v):
                    if isinstance(v,dict):
                        if isinstance(v.get("@id"),str):edge_ids[v["@id"]]+=1
                        for a,b in v.items():
                            if a not in ("@id","@context","@value"):collect_ref(a,b)
                    elif isinstance(v,list):
                        for b in v:collect_ref(k,b)
                for n in graph_nodes:
                    for k,v in n.items():
                        if k not in ("@id","@context","@type"):collect_ref(k,v)
                unresolved=sorted((u,count) for u,count in edge_ids.items() if u.startswith(ORIGIN+"/") and u not in nodeids)
                results[path]["unresolvedLocalReferences"]=unresolved[:80]
                results[path]["unresolvedLocalRefCount"]=len(unresolved)
                if duplicates:issue("CRITICAL","graph_duplicate_ids",path,duplicates[:10])
                if results[path]["servicesBadProvider"]:issue("HIGH","service_provider_inconsistent",path,results[path]["servicesBadProvider"][:10])
                if not results[path]["personMainEntityOfPage"] or HOME_ID not in results[path]["personMainEntityOfPage"][0]:issue("CRITICAL","person_home_relation_wrong",path,results[path]["personMainEntityOfPage"])
            except Exception as e:
                results[path]["parseError"]=str(e)[:250];issue("HIGH","graph_parse_failed",path,str(e)[:250])
    except Exception as e:
        results[path]={"error":str(e)[:200]};issue("HIGH","machine_file_fetch_failed",path,str(e)[:200])
for p in ["/graph.jsonld","/graph.ttl","/entity-facts.csv","/shapes.ttl","/provenance.jsonld","/dcat.ttl","/void.ttl","/croissant.json","/answers.txt","/llms.txt","/sitemap.xml","/knowledge.xml","/release-provenance.json"]:
    if p not in results:
        try:
            r=req(geturl(p),timeout=40)
            results[p]={"status":r.status_code,"bytes":len(r.content),"sha256":digest(r.content),"headers":{k.lower():v for k,v in r.headers.items() if k.lower() in ("content-type","cache-control","cf-cache-status","age")}}
        except Exception as e:results[p]={"error":str(e)[:100]}
    h=results[p].get("headers",{})
    if h.get("cf-cache-status") in ("HIT","STALE","UPDATING") and int(h.get("age","0") or 0)>0:issue("MEDIUM","mutable_edge_cached",p,h)
other={}
for host,label in [(geturl("/audit-this-url-should-not-exist-1bc27f"),"missing_page"),(ORIGIN.replace("https://www.","https://")+"/","apex"),("http://www.ghezelbaash.ir/","http")]:
    try:
        r=requests.get(host,headers=UA,allow_redirects=False,timeout=(8,22))
        other[label]={"status":r.status_code,"location":r.headers.get("Location"),"cacheControl":r.headers.get("Cache-Control"),"contentType":r.headers.get("Content-Type")}
    except Exception as e:other[label]={"error":str(e)[:120]}
if other.get("missing_page",{}).get("status")!=404:issue("HIGH","soft_404","/audit-this-url-should-not-exist-1bc27f",other.get("missing_page"))
headers_missing=collections.Counter()
for row in rows:
    h=row["headers"]
    for header in ["strict-transport-security","content-security-policy","x-content-type-options","referrer-policy"]:
        if not h.get(header):headers_missing[header]+=1
sitemap=len(urls)
all_type_counts=collections.Counter()
for row in rows:
    all_type_counts.update(row["typeFrequencies"])
duplicate_titles=collections.defaultdict(list)
duplicate_descriptions=collections.defaultdict(list)
for row in rows:
    duplicate_titles[row["title"]].append(row["path"])
    duplicate_descriptions[row["description"]].append(row["path"])
title_dupes={k:v for k,v in duplicate_titles.items() if k and len(v)>1}
desc_dupes={k:v for k,v in duplicate_descriptions.items() if k and len(v)>1}
if title_dupes:issue("MEDIUM","duplicate_page_titles","site",list(title_dupes.items())[:8])
if desc_dupes:issue("LOW","duplicate_descriptions","site",list(desc_dupes.items())[:8])
sitelanguages=collections.Counter(r["htmlLang"] for r in rows)
sort_by_severity={"CRITICAL":0,"HIGH":1,"MEDIUM":2,"LOW":3}
FINDINGS.sort(key=lambda x:(sort_by_severity.get(x["severity"],8),x["code"],x["path"]))
def stats(attr):
    nums=[r[attr] for r in rows if isinstance(r.get(attr),(int,float))]
    return dict(min=min(nums) if nums else None,median=round(statistics.median(nums),2) if nums else None,max=max(nums) if nums else None)
summary={
  "startedUTC":datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "target":SITE,
  "sitemapURLCount":sitemap,
  "fetchedHTMLRoutes":len(rows),
  "failedHTMLRoutes":errors,
  "reachableViaHTMLFromHome":sitemap-len(unreachable),
  "sitemapButNotReachableFromHome":unreachable,
  "htmlBytes":stats("bytes"),
  "mainWordCount":stats("mainWordCount"),
  "mainTextShareWithin2MB":stats("mainTextShareWithin2MB"),
  "totalImages":sum(x["images"] for x in rows),
  "imagesMissingAlt":sum(x["imagesMissingAlt"] for x in rows),
  "imagesNoDimensions":sum(x["imagesNoDimensions"] for x in rows),
  "totalJsonLdNodesAcrossPagesWithOverlap":sum(x["jsonldNodes"] for x in rows),
  "jsonldParseErrors":sum(len(x["jsonldErrors"]) for x in rows),
  "primaryPageMissing":sum(x["primaryCount"]!=1 for x in rows),
  "incorrectCanonicalCount":sum(len(x["canonical"])!=1 or x["canonical"][0].rstrip("/")!=(ORIGIN+x["path"]).rstrip("/") for x in rows),
  "noTitleCount":sum(not x["title"] for x in rows),
  "noDescriptionCount":sum(not x["description"] for x in rows),
  "noOrMultipleH1":sum(len(x["h1"])!=1 for x in rows),
  "missingMainTag":sum(x["mainCount"]!=1 for x in rows),
  "pageLanguageDistribution":sitelanguages,
  "missingSecurityHeaders":headers_missing,
  "duplicateTitles":title_dupes,
  "duplicateDescriptions":desc_dupes,
  "pagesWithExternalMedEvidenceLinks":sum(bool(x["externalEvidenceDomains"]) for x in rows),
  "pagesOver2MB":sum(x["bytes"]>LIMIT for x in rows),
  "typeCountsOverAllInlineGraphs":all_type_counts.most_common(35),
  "unlistedLinkedInternalPages":extra_checks,
  "probeResults":other,
  "machineResources":results,
  "findingsCountBySeverity":dict(collections.Counter(x["severity"] for x in FINDINGS)),
  "findingsTop":FINDINGS[:120]
}
# Note source and deployment identity: git log and remote main, avoid assigning release commit to audit branch.
try:
    main_commit=subprocess.run(["git","ls-remote","origin","refs/heads/main"],capture_output=True,text=True,timeout=20).stdout.split()[0]
except Exception:main_commit=None
summary["githubMainSHA"]=main_commit
summary["deploymentCommit"]="824c02f4bd495cdbc3091b7b3911a5470fd9104b"
summary["mainDiffersFromDeployment"]=bool(main_commit and main_commit!=summary["deploymentCommit"])
(OUT/"full.json").write_text(json.dumps({"summary":summary,"pages":rows,"findings":FINDINGS},ensure_ascii=False,indent=2,default=list))
(OUT/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2,default=list))
with (OUT/"pages.tsv").open("w",encoding="utf8") as file:
    keys=["path","bytes","mainWordCount","mainTextCharsWithin2MB","mainTextShareWithin2MB","jsonldNodes","primaryCount","imagesMissingAlt","titleChars","descriptionChars"]
    file.write("\t".join(keys)+"\n")
    for row in rows:file.write("\t".join(str(row.get(k,"")).replace("\t"," ").replace("\n"," ") for k in keys)+"\n")
print("DEEP_AUDIT_SUMMARY="+json.dumps({k:v for k,v in summary.items() if k not in ("machineResources","typeCountsOverAllInlineGraphs","findingsTop","unlistedLinkedInternalPages","sitemapButNotReachableFromHome","duplicateTitles","duplicateDescriptions")},ensure_ascii=False,default=list),flush=True)
print("DEEP_AUDIT_MACHINE="+json.dumps({k:{q:results[k].get(q) for q in ("status","bytes","nodes","services","servicesBadProvider","articles","articlesWithCitation","homePageTypes","personMainEntityOfPage","duplicateEntityIds","unresolvedLocalRefCount") if q in results[k]} for k in ["/graph.jsonld","/entity-facts.csv","/croissant.json","/release-provenance.json"]},ensure_ascii=False),flush=True)
print("DEEP_AUDIT_FINDINGS="+json.dumps(FINDINGS[:85],ensure_ascii=False),flush=True)
print("DEEP_AUDIT_FOCUS_PAGES="+json.dumps([{k:v.get(k) for k in ("path","bytes","mainWordCount","mainTextCharsWithin2MB","mainTextShareWithin2MB","jsonldNodes","primaryPage","pageArticleCitationCount","externalEvidenceDomains","h1","imagesMissingAlt","imagesNoDimensions","duplicateDomIds")} for v in rows if v["path"] in ("/","/botox","/filler","/thread-lift","/saeed-ghezelbash-research-education-and-clinical-decisions")],ensure_ascii=False),flush=True)
