#!/usr/bin/env python3
import json
import requests

UA = "GhezelbaashWikimediaVerifier/1.0 (https://www.ghezelbaash.ir/)"
WIKISOURCE_API = "https://en.wikisource.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
FILE_NAME = "Healthcare 2021 9 1169 - Golshani et al.pdf"
INDEX_TITLE = f"Index:{FILE_NAME}"
WORK_QID = "Q140298431"
PERSON_QID = "Q140287622"
SAMPLE_PAGE = "Page:Wikipedia - Why is the common knowledge resource still neglected by academics.pdf/1"

s = requests.Session()
s.headers.update({"User-Agent": UA})

def get(url, **params):
    params.update(format="json", formatversion=2)
    r = s.get(url, params=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(json.dumps(data["error"], ensure_ascii=False))
    return data

index = get(
    WIKISOURCE_API,
    action="query",
    titles=INDEX_TITLE,
    prop="revisions|info",
    rvprop="ids|timestamp|content|contentmodel",
    rvslots="main",
)["query"]["pages"][0]

pages = get(
    WIKISOURCE_API,
    action="query",
    list="allpages",
    apnamespace=104,
    apprefix=f"{FILE_NAME}/",
    aplimit=100,
)["query"]["allpages"]

sample = get(
    WIKISOURCE_API,
    action="query",
    titles=SAMPLE_PAGE,
    prop="revisions|proofread",
    rvprop="ids|timestamp|content|contentmodel",
    rvslots="main",
)["query"]["pages"][0]

commons = get(
    COMMONS_API,
    action="query",
    titles=f"File:{FILE_NAME}",
    prop="imageinfo|info",
    iiprop="url|size|mime|mediatype|commonmetadata|extmetadata",
)["query"]["pages"][0]

entities = get(
    WIKIDATA_API,
    action="wbgetentities",
    ids=f"{WORK_QID}|{PERSON_QID}",
    props="claims|sitelinks",
)["entities"]

def claim_values(entity, pid):
    out = []
    for claim in entity.get("claims", {}).get(pid, []):
        try:
            out.append(claim["mainsnak"]["datavalue"]["value"])
        except Exception:
            out.append(None)
    return out

index_rev = (index.get("revisions") or [{}])[0]
index_content = index_rev.get("slots", {}).get("main", {}).get("content")
index_model = index_rev.get("slots", {}).get("main", {}).get("contentmodel")
sample_rev = (sample.get("revisions") or [{}])[0]
sample_content = sample_rev.get("slots", {}).get("main", {}).get("content", "")
sample_model = sample_rev.get("slots", {}).get("main", {}).get("contentmodel")
ii = (commons.get("imageinfo") or [{}])[0]

report = {
    "ok": "missing" not in index and "missing" not in commons,
    "index": {
        "title": index.get("title"),
        "pageid": index.get("pageid"),
        "revid": index_rev.get("revid"),
        "contentmodel": index_model,
        "content": index_content,
    },
    "page_namespace": {
        "count": len(pages),
        "titles": [p.get("title") for p in pages],
    },
    "commons": {
        "pageid": commons.get("pageid"),
        "url": ii.get("url"),
        "size": ii.get("size"),
        "width": ii.get("width"),
        "height": ii.get("height"),
        "mime": ii.get("mime"),
        "mediatype": ii.get("mediatype"),
        "commonmetadata": ii.get("commonmetadata"),
        "extmetadata_license": (ii.get("extmetadata") or {}).get("LicenseShortName"),
    },
    "work": {
        "qid": WORK_QID,
        "P275": claim_values(entities[WORK_QID], "P275"),
        "P996": claim_values(entities[WORK_QID], "P996"),
        "P1957": claim_values(entities[WORK_QID], "P1957"),
        "sitelinks": entities[WORK_QID].get("sitelinks", {}),
    },
    "person": {
        "qid": PERSON_QID,
        "sitelinks": entities[PERSON_QID].get("sitelinks", {}),
    },
    "sample_page_source_shape": {
        "title": sample.get("title"),
        "missing": "missing" in sample,
        "contentmodel": sample_model,
        "source_prefix": sample_content[:2500],
    },
}
print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
if not report["ok"]:
    raise SystemExit(2)
