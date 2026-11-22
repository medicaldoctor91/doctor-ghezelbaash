"""Independent public read-only four-platform release audit, no provider credentials or writes."""
import concurrent.futures
import hashlib
import json
import re
import time
from pathlib import Path
from urllib.parse import quote
import requests

SITE = "https://www.ghezelbaash.ir"
HF = "doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data"
KG = "saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data"
NB = "saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter"
SOURCE = "bc19dddf05b81d1cccd0cf1050b6af17d8b99943"  # Published Kaggle v42 data-source revision
LIVE_SOURCE = "71d137141022ff76bbe28f3ea20b862a06d7173f"  # Full active graph HTML-only restoration
HF_SHA = "11f2af63dab81e3d717726ed1305bdc252bdf3e2"
GRAPH_SHA = "25440dbc062dc69131341744562da86e30037f00af681d8e8fc55ad078cb2f50"
ROWS = {"clinical_passages":3276,"clinical_answers":125,"entity_facts":26761,
        "query_matrix":876,"market_positioning":60}
API = "https://www.kaggle.com/api/v1/datasets"
REPORT = Path("/tmp/four-platforms-live-evidence.json")
HTTP = requests.Session()
HTTP.headers.update({"Cache-Control":"no-cache, no-store", "Pragma":"no-cache",
                     "Accept-Encoding":"identity", "User-Agent":"Mozilla/5.0 Release-Provenance-ReadOnly-Audit"})
def get(url):
    for attempt in range(4):
        try:
            response = HTTP.get(url, timeout=120)
            if response.status_code in (429,500,502,503,504) and attempt<3:
                time.sleep(3*(attempt+1));continue
            response.raise_for_status()
            return response.content
        except requests.RequestException:
            if attempt==3:raise
            time.sleep(3*(attempt+1))
def jget(url):
    return json.loads(get(url))
def sha(data):
    return hashlib.sha256(data).hexdigest()
def require(ok,details):
    if not ok:raise AssertionError(details)

report={"status":"FAIL","readOnly":True,"providerWrites":0,"sourceCommit":LIVE_SOURCE,
        "kaggleManifestSourceCommit":SOURCE,
        "hfRevision":HF_SHA,"canonicalGraphSHA256":GRAPH_SHA,"checks":{}}
try:
    site=jget(SITE+"/release-provenance.json")
    require(site["sourceCommit"]==LIVE_SOURCE,"Website does not match reviewed Entity Home production release")
    report["checks"]["website"]={"status":"PASS","sourceCommit":site["sourceCommit"]}
    hub=jget("https://huggingface.co/api/datasets/"+HF)
    require(hub["sha"]==HF_SHA,"Hugging Face revision changed")
    require(not hub.get("private") and not hub.get("gated"),"Hub dataset is not open")
    report["checks"]["hf"]={"status":"PASS","sha":hub["sha"]}
    public=jget("https://api.kaggle.com/v1/datasets/view/"+KG)
    require(public["currentVersionNumber"]==42,"Kaggle default dataset is not v42")
    versions={v["versionNumber"]:v["status"] for v in public["versions"]}
    require(versions.get(42)=="Ready","Kaggle exact version 42 not Ready")
    require(not any(x>42 for x in versions),"A newer unverified dataset version exists")
    files=jget(API+"/list/"+KG+"?datasetVersionNumber=42&pageSize=1000")
    inventory={x["name"]:x["totalBytes"] for x in files["datasetFiles"]}
    require(len(inventory)==48,"Kaggle public file inventory does not contain 48 files")
    manifest=jget(API+"/download/"+KG+"/kaggle-manifest.json?datasetVersionNumber=42&raw=true")
    default_manifest=jget(API+"/download/"+KG+"/kaggle-manifest.json?raw=true")
    for m in (manifest,default_manifest):
        require(m["desired_kaggle_version"]==42,"Unexpected Kaggle manifest revision")
        require(m["website_source_commit"]==SOURCE,"Kaggle manifest points to wrong website source")
        require(m["upstream_revision"]==HF_SHA,"Kaggle manifest points to wrong HF revision")
        require(m["tables"]==ROWS,"Kaggle table count drift")
        require(m.get("archived_files_are_current_dist") is False,"Zenodo archive incorrectly described as current mutable bytes")
    require(manifest==default_manifest,"Default and explicit v42 Kaggle manifests differ")
    report["checks"]["kaggleMetadata"]={"status":"PASS","publicDefault":42,
                                         "exactVersion":42,"files":len(inventory)}
    refs={
        "website":SITE+"/graph.jsonld",
        "hf":"https://huggingface.co/datasets/"+HF+"/resolve/"+HF_SHA+"/graph.jsonld",
        "kaggle42":API+"/download/"+KG+"/graph.jsonld?datasetVersionNumber=42&raw=true",
        "kaggleDefault":API+"/download/"+KG+"/graph.jsonld?raw=true",
    }
    graphs={key:get(url) for key,url in refs.items()}
    gh={key:sha(body) for key,body in graphs.items()}
    require(all(d==GRAPH_SHA for d in gh.values()),"Four live graph representations differ")
    graph=json.loads(graphs["website"])["@graph"]
    require(len(graph)==1916,"Graph node count mismatch")
    report["checks"]["graphs"]={"status":"PASS","sha256":GRAPH_SHA,"nodes":len(graph),
                                "bytes":len(graphs["website"]),"fourVersionsMatch":True}

    checksums=get(API+"/download/"+KG+"/checksums.sha256?datasetVersionNumber=42&raw=true")
    ck={}
    for line in checksums.decode().splitlines():
        if not line.strip():continue
        digest,name=line.split(None,1);name=name.strip().lstrip("*")
        require(re.fullmatch("[a-f0-9]{64}",digest) is not None,"Malformed checksum")
        require(name not in ck,"Duplicate checksum entry")
        ck[name]=digest
    require(len(ck)==47 and set(ck)==set(inventory)-{"checksums.sha256"},
            "Kaggle checksum coverage differs from public inventory")
    def check_file(pair):
        name,expected=pair
        body=get(API+"/download/"+KG+"/"+quote(name,safe="")+"?datasetVersionNumber=42&raw=true")
        require(len(body)==inventory[name],name+": size mismatch")
        require(sha(body)==expected,name+": checksum mismatch")
        return {"name":name,"bytes":len(body),"sha256":expected}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        checked=list(pool.map(check_file,ck.items()))
    require(len(checksums)==inventory["checksums.sha256"],"Checksum file size mismatch")
    report["checks"]["kaggleFiles"]={"status":"PASS","verified":len(checked),
                                    "includingChecksumFile":48,"files":checked}

    viewer=jget("https://datasets-server.huggingface.co/is-valid?dataset="+quote(HF,safe=""))
    require(all(viewer.get(k) is True for k in ("preview","viewer","search","filter","statistics")),
            "Hugging Face Viewer capability incomplete")
    pq=jget("https://datasets-server.huggingface.co/parquet?dataset="+quote(HF,safe=""))
    require(not pq.get("pending") and not pq.get("failed") and not pq.get("partial"),
            "HF parquet conversion is pending, failed or partial")
    require(len(pq["parquet_files"])==5,"HF Viewer converted parquet count mismatch")
    configs={x["config"] for x in pq["parquet_files"]}
    require(configs==set(ROWS),"Wrong HF Viewer dataset configs")
    sizes=jget("https://datasets-server.huggingface.co/size?dataset="+quote(HF,safe=""))
    require(not sizes.get("pending") and not sizes.get("failed") and not sizes.get("partial"),
            "HF Viewer size calculation is pending or failed")
    require(sizes["size"]["dataset"]["num_rows"]==sum(ROWS.values()),
            "HF Viewer total row count differs from pinned Kaggle manifest")
    row_checks={}
    for name in ROWS:
        u="https://datasets-server.huggingface.co/first-rows?dataset="+quote(HF,safe="")+"&config="+name+"&split=train"
        preview=jget(u)
        require(bool(preview.get("rows")) and bool(preview.get("features")),
                "HF first rows missing for "+name)
        row_checks[name]={"returnedRows":len(preview["rows"]),"fields":len(preview["features"])}
    report["checks"]["hfViewer"]={"status":"PASS","capabilities":viewer,"rows":sum(ROWS.values()),
                                 "configs":row_checks,"pending":0,"failed":0}

    notebook=jget("https://www.kaggle.com/api/v1/kernels/pull/"+NB)
    nbmeta=notebook["metadata"]
    require(nbmeta["currentVersionNumber"]==22,"Notebook default version not v22")
    require(KG in nbmeta.get("datasetDataSources",[]),"Notebook is not attached to this dataset")
    raw=notebook["blob"].get("source") or notebook["blob"].get("sourceNullable")
    parsed=json.loads(raw) if isinstance(raw,str) else raw
    require(parsed.get("nbformat")==4 and len(parsed.get("cells",[]))>=5,
            "Kaggle Notebook source invalid")
    report["checks"]["kaggleNotebook"]={"status":"PASS","version":22,
                                        "datasetSource":KG,"cells":len(parsed["cells"])}
    report["status"]="PASS"
except Exception as error:
    report["error"]={"type":type(error).__name__,"message":str(error)}
finally:
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    summary={key:(dict(value) if isinstance(value,dict) else value)
              for key,value in report.items() if key!="checks"}
    summary["checks"]={k:{key:value for key,value in v.items() if key!="files"}
                       for k,v in report["checks"].items()}
    print(json.dumps(summary,ensure_ascii=False),flush=True)
if report["status"]!="PASS":
    raise SystemExit(1)
