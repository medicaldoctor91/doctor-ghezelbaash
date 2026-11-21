"""Read-only full SHA256 public delivery audit for every site file in the live manifest.

Unlike link/HEAD probes this reads *all* bytes of each current public file.
Deployment controls are verified nonpublic. Persist a specific failure per path.
"""
import concurrent.futures,hashlib,json,time
from pathlib import Path
from urllib.parse import quote
import requests

ROOT=Path("/tmp/live-all-files-audit")
ROOT.mkdir(parents=True,exist_ok=True)
ORIGIN="https://www.ghezelbaash.ir/"
CONTROLS={"_headers","_redirects","_routes.json","_worker.js"}
HEADERS={"Cache-Control":"no-cache, no-store, max-age=0","Pragma":"no-cache",
         "Accept-Encoding":"identity"}
def sha(raw):return hashlib.sha256(raw).hexdigest()
def check_one(item):
 name,metadata=item
 url=ORIGIN+quote(name.lstrip("/"),safe="/")
 observations=[]
 for attempt in range(2):
  try:
   r=requests.get(url,headers=HEADERS,timeout=(12,80))
   got=sha(r.content)
   ok=r.status_code==200 and got==metadata["sha256"] and len(r.content)==metadata["bytes"]
   observation={"status":r.status_code,"sha256":got,"expected":metadata["sha256"],
                "bytes":len(r.content),"expectedBytes":metadata["bytes"],
                "cfCacheStatus":r.headers.get("CF-Cache-Status"),"etag":r.headers.get("ETag")}
   observations.append(observation)
   if ok:return {"path":name,"PASS":True,"attempts":attempt+1}
  except Exception as error:
   observations.append({"error":type(error).__name__+": "+str(error)[:150]})
  if attempt==0:time.sleep(1.5)
 return {"path":name,"PASS":False,"attempts":2,"observations":observations}

def main():
 r=requests.get(ORIGIN+"integrity-manifest.json",headers=HEADERS,timeout=(12,40))
 r.raise_for_status()
 manifest=r.json()
 items=[(name,meta) for name,meta in manifest["files"].items()
       if name.lstrip("/") not in CONTROLS]
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
  result=list(pool.map(check_one,items))
 failures=[a for a in result if not a["PASS"]]
 controls=[]
 for name in sorted(CONTROLS):
  try:
   q=requests.get(ORIGIN+name,headers=HEADERS,timeout=(12,40))
   controls.append({"name":name,"status":q.status_code,"PASS":q.status_code==404})
  except Exception as e:controls.append({"name":name,"PASS":False,"error":str(e)[:160]})
 summary={"time":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),
   "scope":"all published manifest files read and SHA256 verified; no writes",
   "manifestFiles":len(manifest["files"]),"publicFilesChecked":len(items),
   "sha256Pass":len(result)-len(failures),"retryPass":sum(a["PASS"] and a["attempts"]>1 for a in result),
   "failureCount":len(failures),"failures":failures,
   "deploymentControls":controls,"success":not failures and all(a["PASS"] for a in controls)}
 (ROOT/"manifest-delivery-audit.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n")
 print(json.dumps(summary,ensure_ascii=False,indent=2))
if __name__=="__main__":main()
