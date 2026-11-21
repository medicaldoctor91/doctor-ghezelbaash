#!/usr/bin/env python3
"""Read-only public-site QA: 72 sitemap pages, navigation links, fragments and assets.

This is NOT a publisher. Output contains only observations, not assumptions.
The intentionally large homepage payload is excluded from size-related findings.
"""
import collections
import concurrent.futures
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import requests
import time
from urllib.parse import urljoin,urlsplit,urldefrag,unquote
import xml.etree.ElementTree as ET

ORIGIN = "https://www.ghezelbaash.ir"
ROOT = Path("/tmp/live-site-technical-audit")
ROOT.mkdir(exist_ok=True,parents=True)
session_headers={"User-Agent":"GhezelbashTechnicalPreReleaseAudit/1.0","Accept-Encoding":"identity",
                 "Cache-Control":"no-cache","Pragma":"no-cache"}
session = requests.Session()
session.headers.update(session_headers)

class Inspector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links=[];self.assets=[];self.ids=set();self.canonicals=[]
        self.titles=[];self.active_title=False
        self.schema=[];self.current_script=None;self.charset=None
    def handle_starttag(self,tag,attributes):
        a=dict(attributes)
        if a.get("id"):self.ids.add(a["id"])
        if tag=="a":
            if a.get("name"):self.ids.add(a["name"])
            if a.get("href"):self.links.append(a["href"])
        if tag in ("img","script","source","video","audio","iframe") and a.get("src"):
            self.assets.append(a["src"])
        if tag=="link":
            if a.get("rel","").lower()=="canonical":self.canonicals.append(a.get("href"))
            if a.get("rel","").lower() in ("stylesheet","preload","icon") and a.get("href"):
                self.assets.append(a["href"])
        if tag=="meta" and a.get("charset"):self.charset=a["charset"]
        if tag=="title":self.active_title=True
        if tag=="script" and a.get("type")=="application/ld+json":
            self.schema.append({"id":a.get("id"),"type":"application/ld+json"})
    def handle_endtag(self,tag):
        if tag=="title":self.active_title=False
    def handle_data(self,data):
        if self.active_title:self.titles.append(data)

def get_bytes(url, limit=9_000_000):
    with requests.get(url,headers=session_headers,timeout=(12,55),allow_redirects=True,stream=True) as r:
        chunks=[];size=0
        for c in r.iter_content(512*1024):
            size+=len(c)
            if size>limit: raise ValueError("Response exceeded per-document limit (homepage size exempt)")
            chunks.append(c)
        return r.status_code,r.url,dict(r.headers),b"".join(chunks)

def local_path(raw, page):
    if not isinstance(raw,str) or not raw.strip() or raw.startswith(("data:","mailto:","tel:","javascript:")):
        return None
    url=urljoin(page,raw)
    parsed=urlsplit(url)
    if parsed.netloc != urlsplit(ORIGIN).netloc or parsed.scheme not in ("https","http"):
        return None
    return (parsed.path or "/"),unquote(parsed.fragment),url

def read_site():
    status,final,headers,body=get_bytes(ORIGIN+"/sitemap.xml",limit=400_000)
    assert status==200,("sitemap",status)
    root=ET.fromstring(body)
    locs=[n.text.strip() for n in root.iter() if n.tag.endswith("}loc") or n.tag=="loc"]
    return list(dict.fromkeys(locs))

def page_worker(url):
    result={"url":url,"errors":[]}
    try:
        status,final,headers,body=get_bytes(url)
        result.update(status=status,finalUrl=final,bytes=len(body),
                      contentType=headers.get("Content-Type"),sha256=hashlib.sha256(body).hexdigest())
        if status!=200:result["errors"].append("page_status_"+str(status))
        if not headers.get("Content-Type","").lower().startswith("text/html"):
            result["errors"].append("non_html_page")
        if b"<html" not in body.lower():
            result["errors"].append("missing_html_root")
        p=Inspector();p.feed(body.decode("utf-8",errors="replace"))
        title="".join(p.titles).strip()
        result["title"]=title[:240]
        result["canonical"]=p.canonicals
        result["links"]=p.links
        result["assets"]=p.assets
        result["ids"]=list(p.ids)
        result["schema"]=p.schema
        result["charset"]=p.charset
        if not title:result["errors"].append("empty_title")
        if len(p.canonicals)!=1:result["errors"].append("canonical_count_"+str(len(p.canonicals)))
        elif p.canonicals[0]!=url:
            result["errors"].append("canonical_mismatch")
        if final.rstrip("/")!=url.rstrip("/"):
            result["errors"].append("unexpected_redirect")
    except Exception as e:
        result["errors"].append(type(e).__name__+": "+str(e)[:160])
    return result

def resource_worker(url):
    try:
        r=requests.get(url,headers=session_headers,allow_redirects=True,stream=True,timeout=(12,38))
        status=r.status_code
        typ=r.headers.get("Content-Type")
        final=r.url
        r.close()
        return {"url":url,"status":status,"contentType":typ,"finalUrl":final,
                "broken":status>=400}
    except Exception as e:
        return {"url":url,"error":type(e).__name__+": "+str(e)[:160],"broken":True}

def main():
    urls=read_site()
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        pages=list(pool.map(page_worker,urls))
    pagemap={urlsplit(r["url"]).path:r for r in pages}
    links=collections.defaultdict(set);assets=collections.defaultdict(set);fragments=[]
    for page in pages:
        for raw in page.get("links",[]):
            p=local_path(raw,page["url"])
            if not p:continue
            path,fragment,full=p
            if fragment:
                fragments.append((page["url"],path,fragment,raw))
            # Check all page targets, and only non-fragment targets otherwise
            if path not in pagemap and path!="/":
                links[urljoin(ORIGIN,path)].add(page["url"])
        for raw in page.get("assets",[]):
            p=local_path(raw,page["url"])
            if p:
                path,fragment,full=p
                if path not in pagemap:assets[urljoin(ORIGIN,path)].add(page["url"])
    targets=collections.defaultdict(set)
    for path,sources in links.items():targets[path].update(sources)
    for path,sources in assets.items():targets[path].update(sources)
    # Avoid a request storm on a site with many repeated links.
    unique=list(targets)[:800]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        resources=list(pool.map(resource_worker,unique))
    byres={r["url"]:r for r in resources}
    broken=[{**r,"sources":sorted(targets[r["url"]])[:4]} for r in resources if r["broken"]]
    invalid_frag=[]
    for source,path,fragment,raw in fragments:
        p=pagemap.get(path)
        if p and fragment not in set(p.get("ids",[])):
            invalid_frag.append({"source":source,"target":path+"#"+fragment,"raw":raw})
    unexpected=[]
    for p in pages:
        if p["errors"]:unexpected.append({"page":p["url"],"errors":p["errors"]})
    report={
        "auditUTC":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),
        "scope":"Read-only live route / link / asset audit. Homepage size intentionally exempt.",
        "sitemapPages":len(urls),"pageHTTP200":sum(x.get("status")==200 for x in pages),
        "distinctNonpageLocalResourceTargets":len(targets),
        "resourcesChecked":len(resources),"truncatedResourceTargets":len(targets)-len(resources),
        "unexpectedPageFindings":unexpected,
        "brokenInternalTargets":broken,
        "fragmentLinksChecked":len(fragments),"missingFragments":invalid_frag[:200],
        "missingFragmentsCount":len(invalid_frag),
        "pageSummaries":[{"url":p["url"],"status":p.get("status"),"title":p.get("title"),
                          "canonical":p.get("canonical"),"schema":p.get("schema"),
                          "links":len(p.get("links",[])),"assets":len(p.get("assets",[])),
                          "errors":p["errors"]} for p in pages],
    }
    (ROOT/"live-audit.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({k:v for k,v in report.items() if k!="pageSummaries"},ensure_ascii=False,indent=2))
if __name__=="__main__":main()
