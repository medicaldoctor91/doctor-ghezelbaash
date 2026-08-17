#!/usr/bin/env python3
import json
import os
import requests

USERNAME = os.environ["WIKIMEDIA_USERNAME"]
PASSWORD = os.environ["WIKIMEDIA_BOT_PASSWORD"]
UA = "GhezelbaashWikimediaPreflight/1.0 (https://www.ghezelbaash.ir/)"

PROJECTS = {
    "wikidata": "https://www.wikidata.org/w/api.php",
    "commons": "https://commons.wikimedia.org/w/api.php",
    "wikisource": "https://en.wikisource.org/w/api.php",
    "wikiversity": "https://en.wikiversity.org/w/api.php",
}

QIDS = ["Q140287622", "Q140298431", "Q36942316", "Q140306302"]
WORK_TITLE = "Individuals with Major Depressive Disorder Report High Scores of Insecure-Avoidant and Insecure-Anxious Attachment Styles, Dissociative Identity Symptoms, and Adult Traumatic Events"
DOI = "10.3390/healthcare9091169"
PMID = "34574943"
WIKIVERSITY_TITLE = "Botulinum toxin in aesthetic medicine"


def api(session, url, method="get", **params):
    params.setdefault("format", "json")
    params.setdefault("formatversion", "2")
    r = getattr(session, method)(url, params=params if method == "get" else None, data=params if method == "post" else None, timeout=45)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(json.dumps(data["error"], ensure_ascii=False))
    return data


def login(url):
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    token = api(s, url, action="query", meta="tokens", type="login")["query"]["tokens"]["logintoken"]
    result = api(s, url, method="post", action="login", lgname=USERNAME, lgpassword=PASSWORD, lgtoken=token)
    if result.get("login", {}).get("result") != "Success":
        raise RuntimeError(f"login failed: {result}")
    info = api(s, url, action="query", meta="userinfo", uiprop="groups|rights")["query"]["userinfo"]
    return s, {"name": info.get("name"), "groups": info.get("groups", []), "rights": info.get("rights", [])}


def title_lookup(s, url, titles):
    data = api(s, url, action="query", titles="|".join(titles), prop="info|pageprops|revisions", rvprop="ids|timestamp", rvlimit="1")
    out = []
    for p in data.get("query", {}).get("pages", []):
        out.append({
            "title": p.get("title"),
            "missing": "missing" in p,
            "pageid": p.get("pageid"),
            "wikibase_item": p.get("pageprops", {}).get("wikibase_item"),
            "revid": (p.get("revisions") or [{}])[0].get("revid"),
        })
    return out


def search(s, url, query, namespace=None, limit=20):
    params = {"action": "query", "list": "search", "srsearch": query, "srlimit": limit, "srprop": ""}
    if namespace is not None:
        params["srnamespace"] = namespace
    data = api(s, url, **params)
    return [{"title": x.get("title"), "pageid": x.get("pageid")} for x in data.get("query", {}).get("search", [])]


def wikidata_snapshot(s):
    data = api(s, PROJECTS["wikidata"], action="wbgetentities", ids="|".join(QIDS), props="labels|descriptions|claims|sitelinks", languages="en|fa")
    out = {}
    for qid, e in data.get("entities", {}).items():
        claims = e.get("claims", {})
        def vals(pid):
            res = []
            for c in claims.get(pid, []):
                try:
                    res.append(c["mainsnak"]["datavalue"]["value"])
                except Exception:
                    pass
            return res
        out[qid] = {
            "label_en": e.get("labels", {}).get("en", {}).get("value"),
            "doi": vals("P356"),
            "pmid": vals("P698"),
            "authors_qid": [v.get("id") for v in vals("P50") if isinstance(v, dict)],
            "author_name_strings": vals("P2093"),
            "sitelinks": {k: v.get("title") for k, v in e.get("sitelinks", {}).items()},
        }
    return out


def enwiki_target_check():
    url = "https://en.wikipedia.org/w/api.php"
    s = requests.Session(); s.headers.update({"User-Agent": UA})
    data = api(s, url, action="query", titles="Treatment of bipolar disorder", prop="revisions", rvprop="ids|content", rvslots="main")
    p = data["query"]["pages"][0]
    text = (p.get("revisions") or [{}])[0].get("slots", {}).get("main", {}).get("content", "")
    needles = ["Ghezelbash", "27280013", "omega-3", "Omega-3"]
    return {"pageid": p.get("pageid"), "revid": (p.get("revisions") or [{}])[0].get("revid"), "contains": {n: n in text for n in needles}}


def main():
    report = {"ok": True, "mode": "READ_ONLY_PREFLIGHT", "duplicate_policy": "DO_NOT_CREATE_ANY_SCHOLARLY_WIKIDATA_ITEM"}
    sessions = {}
    for name, url in PROJECTS.items():
        try:
            sessions[name], info = login(url)
            report.setdefault("auth", {})[name] = {"ok": True, **info}
        except Exception as exc:
            report["ok"] = False
            report.setdefault("auth", {})[name] = {"ok": False, "error": str(exc)}

    if "wikidata" in sessions:
        report["wikidata"] = wikidata_snapshot(sessions["wikidata"])

    if "wikisource" in sessions:
        s = sessions["wikisource"]
        report["wikisource"] = {
            "exact_pages": title_lookup(s, PROJECTS["wikisource"], [WORK_TITLE, "Author:Saeed Ghezelbash", "Author:Mohammad Saeed Ghezelbash"]),
            "title_search": search(s, PROJECTS["wikisource"], f'"{WORK_TITLE}"', limit=20),
            "ghezelbash_search": search(s, PROJECTS["wikisource"], "Ghezelbash", limit=50),
        }

    if "commons" in sessions:
        s = sessions["commons"]
        report["commons"] = {
            "title_search": search(s, PROJECTS["commons"], f'"{WORK_TITLE}"', namespace=6, limit=20),
            "doi_search": search(s, PROJECTS["commons"], DOI, namespace=6, limit=20),
            "pmid_search": search(s, PROJECTS["commons"], PMID, namespace=6, limit=20),
            "ghezelbash_files": search(s, PROJECTS["commons"], "Ghezelbash", namespace=6, limit=50),
        }

    if "wikiversity" in sessions:
        s = sessions["wikiversity"]
        report["wikiversity"] = {
            "exact_page": title_lookup(s, PROJECTS["wikiversity"], [WIKIVERSITY_TITLE]),
            "ghezelbash_search": search(s, PROJECTS["wikiversity"], "Ghezelbash", limit=50),
        }

    try:
        report["enwiki"] = enwiki_target_check()
    except Exception as exc:
        report["enwiki"] = {"error": str(exc)}

    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    if not report["ok"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
