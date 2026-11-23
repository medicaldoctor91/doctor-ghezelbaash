"""Read-only live machine-resource, canonical-head and media-delivery contract audit."""
import base64, hashlib, json, re, requests, time
from pathlib import Path
from html.parser import HTMLParser

ROOT=Path("/tmp/live-contract-audit");ROOT.mkdir(parents=True,exist_ok=True)
ORIGIN="https://www.ghezelbaash.ir/"
HEADER={"Cache-Control":"no-cache, no-store","Pragma":"no-cache","Accept-Encoding":"identity"}
def get(path,**kwargs):
 return requests.get(ORIGIN+path.lstrip("/"),headers={**HEADER,**kwargs.pop("headers",{})},timeout=(12,75),**kwargs)
def sha(data):return hashlib.sha256(data).hexdigest()
def digest(data):return "sha-256=:"+base64.b64encode(hashlib.sha256(data).digest()).decode()+":"

class Schema(HTMLParser):
 def __init__(self):
  super().__init__();self.scripts=[];self.data=None;self.in_head=False
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=="head":self.in_head=True
  if tag=="script" and a.get("type")=="application/ld+json":
   self.data={"id":a.get("id"),"head":self.in_head,"raw":""}
 def handle_data(self,text):
  if self.data is not None:self.data["raw"]+=text
 def handle_endtag(self,tag):
  if tag=="script" and self.data is not None:
   self.scripts.append(self.data);self.data=None
  if tag=="head":self.in_head=False

def main():
 report={"auditedUTC":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),
         "operation":"READ ONLY","failures":[],"details":{}}
 def record_failure(name,desc):
  report["failures"].append({"name":name,"reason":desc})
 # Public homepage/graph consistency
 page=get("");graph=get("graph.jsonld");manifest=get("integrity-manifest.json");provenance=get("release-provenance.json")
 report["details"]["coreHTTP"]={k:v.status_code for k,v in [("homepage",page),("graph",graph),("manifest",manifest),("provenance",provenance)]}
 if not all(x.ok for x in [page,graph,manifest,provenance]):
  record_failure("core_http",str(report["details"]["coreHTTP"]))
 else:
  try:
   html=page.content.decode("utf-8");obj=graph.json();p=Schema();p.feed(html)
   script=p.scripts;full=[s for s in script if s["id"]=="canonical-entity-graph"]
   valid=(len(script)==1 and len(full)==1 and full[0]["head"] and json.loads(full[0]["raw"])==obj)
   m=manifest.json();expected=m.get("files",{}).get("/index.html",{}).get("sha256")
   report["details"]["homepageSchema"]={"activeFullHead":valid,"jsonLdCount":len(script),
     "homepageSHA256":sha(page.content),"manifestSHA256":expected,
     "graphNodes":len(obj["@graph"]),"uniqueIDs":len(set(x["@id"] for x in obj["@graph"])),
     "sourceCommit":provenance.json().get("sourceCommit")}
   if not valid:record_failure("homepage_schema_parity","Full embedded JSON-LD differs from graph.jsonld")
   if expected!=sha(page.content):record_failure("homepage_sha","Manifest does not match live homepage")
  except Exception as e:record_failure("core_parse",type(e).__name__+": "+str(e)[:180])
 # Canonical machine-reading aliases must deliver identical bytes.
 if graph.ok:
  aliases=["data-catalog","procedure-botulinum-toxin-chronic-migraine","service-botulinum-toxin-chronic-migraine"]
  details={}
  for path in aliases:
   try:
    r=get(path)
    details[path]={"status":r.status_code,"contentType":r.headers.get("Content-Type"),
      "sha256":sha(r.content),"equalsGraph":r.status_code==200 and r.content==graph.content}
    if not details[path]["equalsGraph"]:record_failure("alias_"+path,"public alias differs from graph.jsonld")
   except Exception as e:record_failure("alias_"+path,str(e)[:190])
  report["details"]["machineAliases"]=details
 # Cloudflare signed Content-Digest and byte-range protocol for all routed videos.
 eligibility=get("content-digest-eligibility.json")
 if eligibility.ok:
  spec=eligibility.json()
  videos={path:meta for path,meta in spec["eligible"].items() if path.endswith((".mp4",".webm"))}
  evidence={}
  for path,meta in videos.items():
   item={}
   try:
    head=requests.head(ORIGIN+path.lstrip("/"),headers=HEADER,timeout=(10,40))
    item["HEAD"]={"status":head.status_code,"digest":head.headers.get("Content-Digest"),
      "etag":head.headers.get("ETag"),"length":head.headers.get("Content-Length")}
    if head.status_code!=200:record_failure("media_head_"+path,"HEAD status "+str(head.status_code))
    for name,h in [("prefix",{"Range":"bytes=0-63"}),("suffix",{"Range":"bytes=-17"})]:
     r=get(path,headers=h)
     actual=r.content
     item[name]={"status":r.status_code,"bytes":len(actual),"contentRange":r.headers.get("Content-Range"),
       "digest":r.headers.get("Content-Digest"),"expectedDigest":digest(actual)}
     if r.status_code!=206 or r.headers.get("Content-Digest")!=digest(actual) or len(actual)!=(64 if name=="prefix" else 17):
      record_failure("media_range_"+name+"_"+path,str(item[name]))
    invalid=get(path,headers={"Range":"bytes="+str(meta["bytes"])+"-"})
    item["invalidRange"]={"status":invalid.status_code,"digest":invalid.headers.get("Content-Digest")}
    if invalid.status_code!=416:record_failure("media_416_"+path,str(item["invalidRange"]))
    etag=head.headers.get("ETag")
    if etag:
     conditional=get(path,headers={"If-None-Match":etag})
     item["conditional"]={"status":conditional.status_code,"bodyBytes":len(conditional.content),
       "digest":conditional.headers.get("Content-Digest")}
     if conditional.status_code!=304:record_failure("media_304_"+path,str(item["conditional"]))
   except Exception as e:record_failure("media_"+path,type(e).__name__+": "+str(e)[:220])
   evidence[path]=item
  report["details"]["media"]=evidence
 else:record_failure("eligibility","Content-Digest eligibility file unavailable")
 report["success"]=len(report["failures"])==0
 (ROOT/"contract-audit.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
 print(json.dumps({"success":report["success"],"failures":report["failures"],
  "coreHTTP":report["details"].get("coreHTTP"),"homepageSchema":report["details"].get("homepageSchema"),
  "machineAliases":report["details"].get("machineAliases"),
  "videoCount":len(report["details"].get("media",{}))},ensure_ascii=False,indent=2))
if __name__=="__main__":main()
