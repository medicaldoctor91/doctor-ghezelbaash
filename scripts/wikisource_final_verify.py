#!/usr/bin/env python3
import json
import requests

UA = "GhezelbaashWikimediaFinalVerify/1.0 (https://www.ghezelbaash.ir/)"
WS = "https://en.wikisource.org/w/api.php"
WD = "https://www.wikidata.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"

PERSON = "Q140287622"
WORK = "Q140298431"
FILE = "Healthcare 2021 9 1169 - Golshani et al.pdf"
INDEX = f"Index:{FILE}"
AUTHOR = "Author:Mohammad Saeed Ghezelbash"
MAIN = "Individuals with Major Depressive Disorder Report High Scores of Insecure-Avoidant and Insecure-Anxious Attachment Styles, Dissociative Identity Symptoms, and Adult Traumatic Events"

s = requests.Session(); s.headers.update({"User-Agent": UA})

def api(url, **params):
    params.update(format="json", formatversion=2)
    r = s.get(url, params=params, timeout=60)
    r.raise_for_status()
    d = r.json()
    if "error" in d:
        raise RuntimeError(d["error"])
    return d


def page(title, proofread=False):
    prop = "info|revisions|pageprops"
    if proofread:
        prop += "|proofread"
    d = api(WS, action="query", titles=title, prop=prop, rvprop="ids|timestamp|content|contentmodel", rvslots="main")
    p = d["query"]["pages"][0]
    rev = (p.get("revisions") or [{}])[0]
    slot = rev.get("slots", {}).get("main", {})
    return {
        "title": p.get("title"),
        "missing": "missing" in p,
        "pageid": p.get("pageid"),
        "revid": rev.get("revid"),
        "contentmodel": slot.get("contentmodel"),
        "wikibase_item": p.get("pageprops", {}).get("wikibase_item"),
        "content": slot.get("content", ""),
        "proofread": p.get("proofread"),
    }

pages = []
for i in range(1, 14):
    pages.append(page(f"Page:{FILE}/{i}", proofread=True))

index = page(INDEX)
main = page(MAIN)
author = page(AUTHOR)

entities = api(WD, action="wbgetentities", ids=f"{PERSON}|{WORK}", props="sitelinks|claims")["entities"]

def claim_values(qid, pid):
    vals = []
    for c in entities[qid].get("claims", {}).get(pid, []):
        try: vals.append(c["mainsnak"]["datavalue"]["value"])
        except Exception: pass
    return vals

commons = api(COMMONS, action="query", titles=f"File:{FILE}", prop="info|imageinfo", iiprop="url|size|mime|extmetadata")["query"]["pages"][0]
media_id = f"M{commons.get('pageid')}"
media = api(COMMONS, action="wbgetentities", ids=media_id, props="claims")["entities"].get(media_id, {})
media_links = []
for c in media.get("claims", {}).get("P6243", []):
    try: media_links.append(c["mainsnak"]["datavalue"]["value"]["id"])
    except Exception: pass

person_sl = entities[PERSON].get("sitelinks", {}).get("enwikisource")
work_sl = entities[WORK].get("sitelinks", {}).get("enwikisource")

checks = {
    "13_page_pages_exist": len(pages) == 13 and all(not p["missing"] for p in pages),
    "all_page_models_proofread": all(p["contentmodel"] == "proofread-page" for p in pages),
    "main_exists": not main["missing"],
    "author_exists": not author["missing"],
    "index_exists": not index["missing"] and index["contentmodel"] == "proofread-index",
    "index_transclusion_yes": "|Transclusion=yes" in index["content"],
    "index_progress_C": "|Progress=C" in index["content"],
    "person_sitelink_exact": bool(person_sl) and person_sl.get("title") == AUTHOR,
    "work_sitelink_exact": bool(work_sl) and work_sl.get("title") == MAIN,
    "author_pageprops_resolved": author.get("wikibase_item") == PERSON,
    "main_pageprops_resolved": main.get("wikibase_item") == WORK,
    "commons_exists": "missing" not in commons,
    "commons_media_links_work": WORK in media_links,
    "work_has_ccby4": any(isinstance(v, dict) and v.get("id") == "Q20007257" for v in claim_values(WORK, "P275")),
    "work_has_file": FILE in [str(v) for v in claim_values(WORK, "P996")],
    "work_has_index_url": any("en.wikisource.org/wiki/Index:Healthcare_2021_9_1169_-_Golshani_et_al.pdf" in str(v) for v in claim_values(WORK, "P1957")),
}

report = {
    "ok": all(checks.values()),
    "checks": checks,
    "person": {"qid": PERSON, "enwikisource": person_sl, "page": author},
    "work": {"qid": WORK, "enwikisource": work_sl, "P275": claim_values(WORK, "P275"), "P996": claim_values(WORK, "P996"), "P1957": claim_values(WORK, "P1957"), "page": main},
    "index": {"title": INDEX, "pageid": index["pageid"], "revid": index["revid"], "contentmodel": index["contentmodel"], "transclusion_yes": checks["index_transclusion_yes"], "progress_C": checks["index_progress_C"]},
    "proofread_pages": [{k: p.get(k) for k in ("title","pageid","revid","contentmodel","wikibase_item","proofread")} for p in pages],
    "commons": {"pageid": commons.get("pageid"), "media_id": media_id, "P6243": media_links},
}
print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
if not report["ok"]:
    raise SystemExit(2)
