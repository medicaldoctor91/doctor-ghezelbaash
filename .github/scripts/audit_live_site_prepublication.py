#!/usr/bin/env python3
"""Independent, read-only crawl of every published sitemap URL and machine resource.

Reports actionable faults without altering the public website, external profiles,
DOI, title/copy, canonical IDs or publishing anything. This is a diagnostic
step; adding a release-blocking gate is a separate reviewed change.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import Counter, defaultdict
from datetime import datetime, timezone
from html import unescape
from urllib.parse import urljoin, urlsplit, unquote, urldefrag
from pathlib import Path
import hashlib, json, re, sys, time
import xml.etree.ElementTree as ET

import requests
from bs4 import BeautifulSoup

SITE = "https://www.ghezelbaash.ir/"
HOST = urlsplit(SITE).hostname
OUTPUT = Path("/tmp/136-site-audit")
OUTPUT.mkdir(parents=True, exist_ok=True)
TIMEOUT = (15, 90)
UA = "GhezelbaashReleaseAudit/1.0 (+read-only; 72 canonical page check)"
HEADERS = {"User-Agent": UA, "Cache-Control": "no-cache", "Accept-Encoding":"identity"}
RETRY = 2
errors, pages = [], []
def add(severity, code, url, detail=""):
    errors.append({"severity": severity, "code": code, "url": url,
                   "detail": str(detail)[:500]})
def get(url):
    last = None
    for attempt in range(RETRY):
        try:
            r = requests.get(url, timeout=TIMEOUT, headers=HEADERS, allow_redirects=True)
            if r.status_code >= 500 and attempt+1 < RETRY:
                r.close(); time.sleep(0.5); continue
            return r
        except requests.RequestException as exc:
            last = exc
            if attempt+1 < RETRY: time.sleep(0.3)
    raise last
def unique(xs):
    return list(dict.fromkeys(xs))
def first_meta(soup,name):
    m=soup.find("meta",attrs={"name": re.compile("^"+re.escape(name)+"$",re.I)})
    return (m.get("content") or "").strip() if m else ""
def rel_values(tag):
    return [str(v).lower() for v in tag.get("rel",[])]
def page_check(url, root_set):
    row={"url":url,"path":urlsplit(url).path,"issues":[]}
    try:
        r=get(url)
        row.update({"status":r.status_code, "finalUrl":r.url, "bytes":len(r.content),
                    "contentType":r.headers.get("Content-Type"), "cache":r.headers.get("CF-Cache-Status")})
        if r.status_code!=200:row["issues"].append(("ERROR","HTTP_STATUS",f"HTTP {r.status_code}"))
        if r.url.rstrip("/")!=url.rstrip("/"):
            row["issues"].append(("WARN","REDIRECT_OR_NONCANONICAL",r.url))
        if "html" not in r.headers.get("Content-Type","").lower():
            row["issues"].append(("ERROR","NON_HTML",r.headers.get("Content-Type")))
        soup=BeautifulSoup(r.content,"lxml")
        title=soup.find("title")
        title=(title.get_text(" ",strip=True) if title else "")
        row["title"]=title
        if not 8<=len(title)<=90:row["issues"].append(("WARN","TITLE_LENGTH",len(title)))
        desc=first_meta(soup,"description")
        row["metaDescription"]=desc
        if not desc:row["issues"].append(("WARN","MISSING_DESCRIPTION",""))
        elif len(desc)>350:row["issues"].append(("WARN","LONG_DESCRIPTION",len(desc)))
        robots=first_meta(soup,"robots")
        row["metaRobots"]=robots
        if "noindex" in (robots + r.headers.get("X-Robots-Tag","")).lower():
            row["issues"].append(("ERROR","NOINDEX","meta/X-Robots-Tag"))
        links=soup.find_all("link")
        canon=[tag.get("href") for tag in links if "canonical" in rel_values(tag)]
        row["canonicals"]=canon
        if len(canon)!=1:row["issues"].append(("ERROR","CANONICAL_COUNT",len(canon)))
        elif canon[0].rstrip("/")!=url.rstrip("/"):
            row["issues"].append(("ERROR","CANONICAL_MISMATCH",canon[0]))
        heading=[h.get_text(" ",strip=True) for h in soup.find_all("h1")]
        row["h1Count"]=len(heading)
        row["h1Samples"]=heading[:2]
        if not heading: row["issues"].append(("WARN","MISSING_H1",""))
        elif len(heading)>2: row["issues"].append(("WARN","MANY_H1",len(heading)))
        html=soup.find("html")
        row["lang"]=html.get("lang","") if html else ""
        if not row["lang"]:row["issues"].append(("WARN","MISSING_LANG",""))
        img=soup.find_all("img")
        img_alt=sum(1 for tag in img if tag.get("alt") is None)
        row["imageCount"]=len(img)
        row["missingImageAlt"]=img_alt
        if img_alt:row["issues"].append(("WARN","MISSING_IMAGE_ALT",img_alt))
        jsonld=soup.find_all("script",attrs={"type":"application/ld+json"})
        jsonld_data=[]
        for j in jsonld:
            try:jsonld_data.append(json.loads(j.string or j.get_text()))
            except (TypeError,ValueError) as exc:row["issues"].append(("ERROR","BROKEN_JSONLD",str(exc)))
        row["jsonldCount"]=len(jsonld)
        row["jsonldTypes"]=[str(v.get("@type",""))[:120] for v in jsonld_data if isinstance(v,dict)]
        if not jsonld:row["issues"].append(("WARN","NO_JSONLD",""))
        row["pageMainEntity"]=[v.get("mainEntity") for v in jsonld_data if isinstance(v,dict) and "mainEntity" in v][:2]
        row["alternateGraph"]=[{"href":l.get("href"),"type":l.get("type")} for l in links if l.get("type") in {"application/ld+json","text/turtle","application/rdf+xml"}]
        # Real hyperlinks, excluding JS-generated links and non-HTTP schemes.
        row["links"]=[]
        row["fragments"]=[]
        ids={v for t in soup.find_all(attrs={"id":True}) if (v:=t.get("id"))}
        row["idsCount"]=len(ids)
        for a in soup.find_all("a",href=True):
            href=(a.get("href") or "").strip()
            if href.startswith(("#","javascript:","mailto:","tel:","data:","blob:")):
                if href.startswith("#") and len(href)>1:
                    frag=unquote(href[1:])
                    if frag and frag not in ids:row["fragments"].append(frag)
                continue
            absurl=urljoin(url,href)
            parsed=urlsplit(absurl)
            if parsed.scheme not in ("http","https"):continue
            if parsed.hostname in {HOST,"ghezelbaash.ir"}:
                path=parsed.path or "/"
                row["links"].append(path)
                if parsed.fragment and parsed.path in {urlsplit(url).path,""}:
                    frag=unquote(parsed.fragment)
                    if frag and frag not in ids:row["fragments"].append(frag)
        row["links"]=unique(row["links"])
        row["fragments"]=unique(row["fragments"])
        row["internalLinks"]=len(row["links"])
        row["internalOutOfSitemap"]=sorted([u for u in row["links"] if
            (SITE.rstrip("/")+u).rstrip("/") not in root_set
            and (SITE.rstrip("/")+u) not in root_set
            and not re.search(r"\.[A-Za-z0-9]{1,7}$",u)])[:100]
        if row["fragments"] and len(row["fragments"])<=20:
            row["issues"].append(("WARN","MISSING_SAME_PAGE_FRAGMENT",row["fragments"][:20]))
        if urlsplit(url).path!="/" and len(r.content)>2_000_000:
            row["issues"].append(("WARN","LARGE_NONHOME_HTML",len(r.content)))
        row["sha256"]=hashlib.sha256(r.content).hexdigest()
    except Exception as exc:
        row["issues"].append(("ERROR","FETCH_PARSE_EXCEPTION",type(exc).__name__+": "+str(exc)[:230]))
    return row

sitemap_xml=None
try:
    s=get(urljoin(SITE,"sitemap.xml"))
    assert s.status_code==200
    sitemap_xml=s.content
    el=ET.fromstring(sitemap_xml)
    urls=unique([x.text.strip() for x in el.findall(".//{*}url/{*}loc") if x.text])
    assert urls, "Empty sitemap"
except Exception as exc:
    add("CRITICAL","SITEMAP_FETCH",SITE+"sitemap.xml",exc)
    (OUTPUT/"summary.json").write_text(json.dumps({"errors":errors},indent=2))
    sys.exit(2)
root_set=set(u.rstrip("/") for u in urls)
sitemap_paths={urlsplit(u).path for u in urls}
with ThreadPoolExecutor(max_workers=8) as pool:
    work={pool.submit(page_check,u,root_set):u for u in urls}
    for f in as_completed(work):pages.append(f.result())
pages.sort(key=lambda x:x["url"])
for p in pages:
    for severity,code,detail in p["issues"]:
        add(severity,code,p["url"],detail)
internal_targets=Counter(path for p in pages for path in p.get("links",[]))
broken=[]
candidates=[]
for path,count in internal_targets.items():
    if path in sitemap_paths:continue
    if re.search(r"\.(pdf|png|jpe?g|webp|svg|ico|woff2?|ttf|js|css|mp4|webm|xml|json|jsonld|csv|ttl|txt|vcf|rdf|nt)$",path,re.I):
        # These are generally assets, not canonical HTML pages. Probe only high-value structured resources below.
        continue
    candidates.append((path,count))
candidates.sort(key=lambda x:(-x[1],x[0]))
for path,count in candidates[:120]:
    try:
        r=get(urljoin(SITE,path))
        if r.status_code>=400:broken.append({"path":path,"status":r.status_code,"links":count})
    except Exception as exc:
        broken.append({"path":path,"status":"NETWORK","links":count,"error":str(exc)[:100]})
for item in broken:add("ERROR","BROKEN_INTERNAL_TARGET",SITE.rstrip("/")+item["path"],item)

resources={}
for path in ["robots.txt","graph.jsonld","sitemap.xml","llms.txt","entity-facts.csv","release-provenance.json","integrity-manifest.json","dcat.ttl","void.ttl"]:
    try:
        r=get(SITE+path)
        info={"status":r.status_code,"bytes":len(r.content),
              "contentType":r.headers.get("Content-Type"),
              "sha256":hashlib.sha256(r.content).hexdigest(),
              "xRobots":r.headers.get("X-Robots-Tag"),
              "contentDisposition":r.headers.get("Content-Disposition"),
              "finalUrl":r.url,
              "cacheStatus":r.headers.get("CF-Cache-Status")}
        if path=="graph.jsonld" and r.ok:
            v=r.json();graph=v.get("@graph",[])
            info.update({"nodes":len(graph),"typeCounts":dict(Counter(t for n in graph for t in
            ([n.get("@type")] if isinstance(n.get("@type"),str) else n.get("@type",[]))))})
            info["parsesAsJsonLd"]=bool(v.get("@context") and graph)
        if path=="robots.txt":info["text"]=r.text[:8000]
        if path=="integrity-manifest.json" and r.ok:
            v=r.json();info["entityFactsManifest"]=v.get("files",{}).get("/entity-facts.csv")
        if path=="release-provenance.json" and r.ok:info["sourceCommit"]=r.json().get("sourceCommit")
        resources[path]=info
        if r.status_code>=400:add("ERROR","RESOURCE_HTTP_STATUS",SITE+path,r.status_code)
        if path=="graph.jsonld" and "json" not in r.headers.get("Content-Type","").lower():
            add("WARN","GRAPH_MIME",SITE+path,r.headers.get("Content-Type"))
    except Exception as exc:
        resources[path]={"error":type(exc).__name__+": "+str(exc)[:250]}
        add("ERROR","RESOURCE_FETCH_EXCEPTION",SITE+path,exc)

summary={
  "auditedUTC":datetime.now(timezone.utc).isoformat(),
  "sitemapURLCount":len(urls),"pageCount":len(pages),
  "pageStatusCounts":dict(Counter(x.get("status","ERROR") for x in pages)),
  "titleCounts":dict(Counter(x.get("title","") for x in pages)),
  "descriptionDuplicateCounts":{v:n for v,n in Counter(x.get("metaDescription","") for x in pages).items() if n>1},
  "missingCanonicalCount":sum(len(p.get("canonicals",[]))!=1 for p in pages),
  "robotsNoindexCount":sum("noindex" in p.get("metaRobots","").lower() for p in pages),
  "pagesWithJsonLd":sum(p.get("jsonldCount",0)>0 for p in pages),
  "totalHTMLInternalLinkEdges":sum(p.get("internalLinks",0) for p in pages),
  "uniqueHTMLInternalTargets":len(internal_targets),
  "internalCandidatesProbed":len(candidates[:120]),
  "brokenInternalTargets":broken,
  "errorCount":sum(e["severity"] in {"ERROR","CRITICAL"} for e in errors),
  "warningCount":sum(e["severity"]=="WARN" for e in errors),
  "errorCodeCounts":dict(Counter(e["code"] for e in errors)),
  "notAnError":"Standalone RDF/JSON-LD can be crawlable yet not indexed as a WebPage; GSC verdict requires separate authenticated URL inspection.",
}
(OUTPUT/"summary.json").write_text(json.dumps(summary,indent=2,ensure_ascii=False)+"\n")
(OUTPUT/"pages.json").write_text(json.dumps(pages,indent=2,ensure_ascii=False)+"\n")
(OUTPUT/"resources.json").write_text(json.dumps(resources,indent=2,ensure_ascii=False)+"\n")
(OUTPUT/"issues.json").write_text(json.dumps(errors,indent=2,ensure_ascii=False)+"\n")
print(json.dumps({"summary":summary,"resources":{k:{a:b for a,b in v.items() if a in ("status","contentType","nodes","sourceCommit","sha256","entityFactsManifest","parsesAsJsonLd")} for k,v in resources.items()},"topIssues":errors[:60]},indent=2,ensure_ascii=False),flush=True)
# Diagnostic only; never suppress artifacts for identified website errors.
