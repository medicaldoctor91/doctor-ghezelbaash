#!/usr/bin/env python3
import datetime as dt
import html
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import quote

import requests

CFG = Path(os.environ.get("WIKIMEDIA_STRENGTHENING_CONFIG", "wikimedia/external-strengthening-2026-08-16.json"))
USERNAME = os.environ["WIKIMEDIA_USERNAME"]
PASSWORD = os.environ["WIKIMEDIA_BOT_PASSWORD"]
WD_API = "https://www.wikidata.org/w/api.php"
WP_API = "https://en.wikipedia.org/w/api.php"
WDQS = "https://query.wikidata.org/sparql"
CROSSREF = "https://api.crossref.org/works/{}"
UA = "GhezelbaashWikimediaStrengthener/3.0 (https://github.com/medicaldoctor91/doctor-ghezelbaash)"
TODAY = dt.datetime.now(dt.timezone.utc).date()
WRITE_GAP = 2.5

s = requests.Session()
s.headers.update({"User-Agent": UA})


def req(method, url, *, params=None, data=None, timeout=60, tries=4):
    last = None
    for n in range(tries):
        try:
            r = s.request(method, url, params=params, data=data, timeout=timeout)
            if r.status_code in {429, 500, 502, 503, 504}:
                last = f"HTTP {r.status_code}"
                time.sleep(2 ** n)
                continue
            r.raise_for_status()
            return r
        except Exception as e:
            last = repr(e)
            if n + 1 == tries:
                raise
            time.sleep(2 ** n)
    raise RuntimeError(last)


def api_get(api, **p):
    p.setdefault("format", "json"); p.setdefault("formatversion", "2")
    j = req("GET", api, params=p).json()
    if "error" in j:
        raise RuntimeError(j["error"])
    return j


def api_post(api, **p):
    p.setdefault("format", "json"); p.setdefault("formatversion", "2")
    for attempt in range(7):
        j = req("POST", api, data=p).json()
        if "error" not in j:
            time.sleep(WRITE_GAP)
            return j
        err = j["error"]
        packed = json.dumps(err, ensure_ascii=False).lower()
        if "actionthrottled" in packed or "too many times in a short space" in packed:
            time.sleep(min(15 + attempt * 10, 60))
            continue
        if err.get("code") == "maxlag":
            time.sleep(min(5 + attempt * 5, 30))
            continue
        raise RuntimeError(err)
    raise RuntimeError("MediaWiki write remained throttled after retries")


def login(api):
    lt = api_get(api, action="query", meta="tokens", type="login")["query"]["tokens"]["logintoken"]
    j = api_post(api, action="login", lgname=USERNAME, lgpassword=PASSWORD, lgtoken=lt)
    if j.get("login", {}).get("result") != "Success":
        raise RuntimeError(f"login failed at {api}: {j}")
    u = api_get(api, action="query", meta="userinfo", uiprop="groups|rights")["query"]["userinfo"]
    if u.get("anon"):
        raise RuntimeError(f"anonymous after login at {api}")
    token = api_get(api, action="query", meta="tokens", type="csrf")["query"]["tokens"]["csrftoken"]
    return u, token


def item_value(qid):
    return {"entity-type": "item", "numeric-id": int(qid[1:]), "id": qid}


def entity(qid):
    e = api_get(WD_API, action="wbgetentities", ids=qid, props="claims|labels|descriptions").get("entities", {}).get(qid)
    if not e or e.get("missing"):
        raise RuntimeError(f"missing entity {qid}")
    return e


def qvalue(st):
    try:
        v = st["mainsnak"]["datavalue"]["value"]
        return v.get("id") or f"Q{v['numeric-id']}" if isinstance(v, dict) else None
    except Exception:
        return None


def svalue(st):
    try:
        v = st["mainsnak"]["datavalue"]["value"]
        return v if isinstance(v, str) else None
    except Exception:
        return None


def normalize_doi(v):
    v = (v or "").strip()
    for prefix in ("https://doi.org/", "http://doi.org/", "doi:"):
        if v.lower().startswith(prefix):
            v = v[len(prefix):]
    return v.strip()


def target_doi(qid):
    for st in entity(qid).get("claims", {}).get("P356", []):
        v = svalue(st)
        if v:
            return normalize_doi(v)
    raise RuntimeError(f"{qid} has no DOI")


def ref_snaks(url):
    return {
        "P854": [{"snaktype": "value", "property": "P854", "datavalue": {"value": url, "type": "string"}, "datatype": "url"}],
        "P813": [{"snaktype": "value", "property": "P813", "datavalue": {"value": {
            "time": f"+{TODAY.isoformat()}T00:00:00Z", "timezone": 0, "before": 0, "after": 0, "precision": 11,
            "calendarmodel": "http://www.wikidata.org/entity/Q1985727"}, "type": "time"}, "datatype": "time"}]
    }


def has_ref(st, url):
    for ref in st.get("references", []):
        for sn in ref.get("snaks", {}).get("P854", []):
            if sn.get("datavalue", {}).get("value") == url:
                return True
    return False


def set_ref(guid, url, token):
    api_post(WD_API, action="wbsetreference", statement=guid, snaks=json.dumps(ref_snaks(url), ensure_ascii=False),
             token=token, summary="Add source supporting scholarly graph statement")


def ensure_qclaim(qid, prop, value_qid, source, token):
    for st in entity(qid).get("claims", {}).get(prop, []):
        if st.get("rank") != "deprecated" and qvalue(st) == value_qid:
            added = False
            if source and not has_ref(st, source):
                set_ref(st["id"], source, token); added = True
            return {"item": qid, "property": prop, "value": value_qid, "created": False, "reference_added": added}
    claim = api_post(WD_API, action="wbcreateclaim", entity=qid, property=prop, snaktype="value",
                     value=json.dumps(item_value(value_qid)), token=token,
                     summary="Add sourced scholarly graph statement").get("claim")
    if not claim:
        raise RuntimeError(f"claim creation failed: {qid} {prop} {value_qid}")
    if source:
        set_ref(claim["id"], source, token)
    return {"item": qid, "property": prop, "value": value_qid, "created": True, "reference_added": bool(source)}


def crossref(doi):
    j = req("GET", CROSSREF.format(quote(normalize_doi(doi), safe="")), timeout=60).json().get("message")
    if not j:
        raise RuntimeError(f"Crossref miss: {doi}")
    return j


def citation_verified(citing_doi, target_qid, evidence_url):
    needle = target_doi(target_qid).lower()
    meta = crossref(citing_doi)
    for r in meta.get("reference") or []:
        d = normalize_doi(r.get("DOI") or r.get("doi") or "").lower()
        if d == needle:
            return True, "crossref-reference"
    try:
        body = req("GET", evidence_url, timeout=45, tries=2).text.lower()
        if needle in body:
            return True, "evidence-fulltext"
    except Exception:
        pass
    return False, None


def recent_item_by_doi(doi):
    needle = normalize_doi(doi).lower()
    try:
        j = api_get(WD_API, action="query", list="usercontribs", ucuser="Medicaldoctor91", uclimit="100", ucnamespace="0",
                    ucprop="title|timestamp|ids")
        qids = []
        for c in j.get("query", {}).get("usercontribs", []):
            if re.fullmatch(r"Q\d+", c.get("title", "")):
                qids.append(c["title"])
        for qid in dict.fromkeys(qids):
            for st in entity(qid).get("claims", {}).get("P356", []):
                if normalize_doi(svalue(st) or "").lower() == needle:
                    return qid
    except Exception:
        pass
    return None


def sparql_item_by_doi(doi):
    d = normalize_doi(doi)
    vals = " ".join(json.dumps(x) for x in sorted({d, d.upper(), d.lower()}))
    query = f"SELECT ?item WHERE {{ VALUES ?doi {{ {vals} }} ?item wdt:P356 ?doi . }} LIMIT 5"
    j = req("GET", WDQS, params={"query": query, "format": "json"}, timeout=90).json()
    out = []
    for b in j.get("results", {}).get("bindings", []):
        m = re.search(r"/entity/(Q\d+)$", b.get("item", {}).get("value", ""))
        if m: out.append(m.group(1))
    out = sorted(set(out), key=lambda q: int(q[1:]))
    if len(out) > 1:
        raise RuntimeError(f"duplicate DOI {doi}: {out}")
    return out[0] if out else None


def find_doi_item(doi):
    return recent_item_by_doi(doi) or sparql_item_by_doi(doi)


def clean_title(v):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", v or ""))).strip()


def create_minimal_article(doi, token):
    meta = crossref(doi)
    title = clean_title((meta.get("title") or [""])[0])
    if not title:
        raise RuntimeError(f"no title for {doi}")
    year = None
    for k in ("published-print", "published-online", "published", "issued", "created"):
        parts = meta.get(k, {}).get("date-parts")
        if parts and parts[0]: year = int(parts[0][0]); break
    data = {"labels": {"en": {"language": "en", "value": title[:250]}},
            "descriptions": {"en": {"language": "en", "value": f"scholarly article{(' published in ' + str(year)) if year else ''}"}}}
    j = api_post(WD_API, action="wbeditentity", new="item", data=json.dumps(data, ensure_ascii=False), token=token,
                 summary="Create scholarly article item from DOI metadata")
    qid = j.get("entity", {}).get("id")
    if not qid: raise RuntimeError(f"new item failed for {doi}")
    ensure_qclaim(qid, "P31", "Q13442814", f"https://doi.org/{normalize_doi(doi)}", token)
    claim = api_post(WD_API, action="wbcreateclaim", entity=qid, property="P356", snaktype="value",
                     value=json.dumps(normalize_doi(doi).upper()), token=token, summary="Add DOI from Crossref").get("claim")
    if not claim: raise RuntimeError(f"DOI claim failed for {qid}")
    return qid


def ensure_citing_item(doi, token):
    qid = find_doi_item(doi)
    if qid: return qid, False
    # Stable second check before creating an item.
    crossref(doi); time.sleep(3)
    qid = find_doi_item(doi)
    if qid: return qid, False
    return create_minimal_article(doi, token), True


def page_text(title):
    j = api_get(WP_API, action="query", titles=title, prop="revisions", rvprop="content|ids", rvslots="main")
    pages = j.get("query", {}).get("pages", [])
    if not pages or "missing" in pages[0]: return None, None
    revs = pages[0].get("revisions") or []
    if not revs: return "", None
    return revs[0].get("slots", {}).get("main", {}).get("content", ""), revs[0].get("revid")


def ensure_talk(cfg, token):
    before, old = page_text(cfg["title"])
    if before is None: raise RuntimeError(f"missing talk page {cfg['title']}")
    if cfg["marker"] in before: return {"title": cfg["title"], "created": False, "existing_revid": old}
    j = api_post(WP_API, action="edit", title=cfg["title"], section="new", sectiontitle=cfg["section_title"], text=cfg["text"],
                 summary="COI edit request: update evidence using current secondary literature", token=token, watchlist="watch", maxlag="5")
    if j.get("edit", {}).get("result") != "Success": raise RuntimeError(f"Wikipedia edit failed: {j}")
    after, new = page_text(cfg["title"])
    if cfg["marker"] not in (after or ""): raise RuntimeError(f"Wikipedia readback failed: {cfg['title']}")
    return {"title": cfg["title"], "created": True, "new_revid": new}


def main():
    config = json.loads(CFG.read_text(encoding="utf-8"))
    report = {"ok": False, "date": TODAY.isoformat(), "wikidata": [], "wikipedia": [], "created_items": [], "skipped": []}
    wd_user, wd_token = login(WD_API)
    wp_user, wp_token = login(WP_API)
    report["authenticated"] = {"wikidata": wd_user.get("name"), "wikipedia": wp_user.get("name")}

    # Core graph statements are mandatory and idempotent.
    for e in config.get("wikidata_claims", []):
        report["wikidata"].append(ensure_qclaim(e["item"], e["property"], e["value"], e["evidence_url"], wd_token))

    # Publish transparent COI requests before citation expansion so Wikidata throttling cannot block them.
    for w in config.get("wikipedia_requests", []):
        report["wikipedia"].append(ensure_talk(w, wp_token))

    # Citation expansion is best-effort per paper: only machine-verified edges are written.
    for e in config.get("incoming_citations", []):
        try:
            verified, via = citation_verified(e["doi"], e["target"], e["evidence_url"])
            if not verified:
                report["skipped"].append({"doi": e["doi"], "target": e["target"], "reason": "citation-not-machine-verifiable"})
                continue
            qid, created = ensure_citing_item(e["doi"], wd_token)
            if created: report["created_items"].append({"doi": e["doi"], "qid": qid})
            out = ensure_qclaim(qid, "P2860", e["target"], e["evidence_url"], wd_token)
            out.update({"doi": e["doi"], "verified_by": via})
            report["wikidata"].append(out)
        except Exception as exc:
            report["skipped"].append({"doi": e["doi"], "target": e["target"], "reason": repr(exc)})

    report["ok"] = True
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
