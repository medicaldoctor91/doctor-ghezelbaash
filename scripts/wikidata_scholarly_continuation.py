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
API = "https://www.wikidata.org/w/api.php"
WDQS = "https://query.wikidata.org/sparql"
CROSSREF = "https://api.crossref.org/works/{}"
TODAY = dt.datetime.now(dt.timezone.utc).date()
UA = "GhezelbaashWikidataCitationBuilder/1.0 (https://github.com/medicaldoctor91/doctor-ghezelbaash)"
WRITE_GAP = 5.0

s = requests.Session()
s.headers.update({"User-Agent": UA})


def http(method, url, *, params=None, data=None, timeout=75, tries=4):
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
        except Exception as exc:
            last = repr(exc)
            if n + 1 == tries:
                raise
            time.sleep(2 ** n)
    raise RuntimeError(last)


def get(**params):
    params.setdefault("format", "json"); params.setdefault("formatversion", "2")
    j = http("GET", API, params=params).json()
    if "error" in j:
        raise RuntimeError(j["error"])
    return j


def post(**params):
    params.setdefault("format", "json"); params.setdefault("formatversion", "2")
    for attempt in range(8):
        j = http("POST", API, data=params).json()
        if "error" not in j:
            time.sleep(WRITE_GAP)
            return j
        packed = json.dumps(j["error"], ensure_ascii=False).lower()
        if "actionthrottled" in packed or "too many times in a short space" in packed:
            time.sleep(min(20 + attempt * 10, 70))
            continue
        if j["error"].get("code") == "maxlag":
            time.sleep(min(5 + attempt * 5, 30))
            continue
        raise RuntimeError(j["error"])
    raise RuntimeError("Wikidata remained write-throttled after retries")


def login():
    lt = get(action="query", meta="tokens", type="login")["query"]["tokens"]["logintoken"]
    j = post(action="login", lgname=USERNAME, lgpassword=PASSWORD, lgtoken=lt)
    if j.get("login", {}).get("result") != "Success":
        raise RuntimeError(f"login failed: {j}")
    user = get(action="query", meta="userinfo", uiprop="groups|rights")["query"]["userinfo"]
    if user.get("anon"):
        raise RuntimeError("authenticated session is anonymous")
    token = get(action="query", meta="tokens", type="csrf")["query"]["tokens"]["csrftoken"]
    return user, token


def normalize_doi(v):
    v = (v or "").strip()
    for p in ("https://doi.org/", "http://doi.org/", "doi:"):
        if v.lower().startswith(p):
            v = v[len(p):]
    return v.strip()


def qval(statement):
    try:
        v = statement["mainsnak"]["datavalue"]["value"]
        if isinstance(v, dict):
            return v.get("id") or f"Q{v['numeric-id']}"
    except Exception:
        pass
    return None


def sval(statement):
    try:
        v = statement["mainsnak"]["datavalue"]["value"]
        return v if isinstance(v, str) else None
    except Exception:
        return None


def entity(qid):
    e = get(action="wbgetentities", ids=qid, props="claims|labels|descriptions").get("entities", {}).get(qid)
    if not e or e.get("missing"):
        raise RuntimeError(f"missing entity {qid}")
    return e


def target_doi(qid):
    for st in entity(qid).get("claims", {}).get("P356", []):
        v = sval(st)
        if v:
            return normalize_doi(v)
    raise RuntimeError(f"target {qid} lacks DOI")


def item_value(qid):
    return {"entity-type": "item", "numeric-id": int(qid[1:]), "id": qid}


def ref_snaks(url):
    return {
        "P854": [{"snaktype": "value", "property": "P854", "datavalue": {"value": url, "type": "string"}, "datatype": "url"}],
        "P813": [{"snaktype": "value", "property": "P813", "datavalue": {"value": {
            "time": f"+{TODAY.isoformat()}T00:00:00Z", "timezone": 0, "before": 0, "after": 0,
            "precision": 11, "calendarmodel": "http://www.wikidata.org/entity/Q1985727"
        }, "type": "time"}, "datatype": "time"}]
    }


def has_ref(st, url):
    for ref in st.get("references", []):
        for sn in ref.get("snaks", {}).get("P854", []):
            if sn.get("datavalue", {}).get("value") == url:
                return True
    return False


def add_ref(guid, url, token):
    post(action="wbsetreference", statement=guid, snaks=json.dumps(ref_snaks(url), ensure_ascii=False), token=token,
         summary="Add source for scholarly citation edge")


def ensure_qclaim(qid, prop, target, source, token):
    for st in entity(qid).get("claims", {}).get(prop, []):
        if st.get("rank") != "deprecated" and qval(st) == target:
            added = False
            if source and not has_ref(st, source):
                add_ref(st["id"], source, token); added = True
            return {"item": qid, "property": prop, "value": target, "created": False, "reference_added": added}
    claim = post(action="wbcreateclaim", entity=qid, property=prop, snaktype="value",
                 value=json.dumps(item_value(target)), token=token,
                 summary="Add verified scholarly citation edge").get("claim")
    if not claim:
        raise RuntimeError(f"failed claim {qid} {prop} {target}")
    if source:
        add_ref(claim["id"], source, token)
    return {"item": qid, "property": prop, "value": target, "created": True, "reference_added": bool(source)}


def crossref(doi):
    j = http("GET", CROSSREF.format(quote(normalize_doi(doi), safe=""))).json().get("message")
    if not j:
        raise RuntimeError(f"Crossref miss {doi}")
    return j


def verify_citation(citing_doi, target_qid, evidence_url):
    needle = target_doi(target_qid).lower()
    meta = crossref(citing_doi)
    for ref in meta.get("reference") or []:
        if normalize_doi(ref.get("DOI") or ref.get("doi") or "").lower() == needle:
            return True, "crossref-reference"
    try:
        body = http("GET", evidence_url, timeout=45, tries=2).text.lower()
        if needle in body:
            return True, "evidence-fulltext"
    except Exception:
        pass
    return False, None


def recent_item(doi):
    needle = normalize_doi(doi).lower()
    j = get(action="query", list="usercontribs", ucuser="Medicaldoctor91", uclimit="200", ucnamespace="0", ucprop="title|timestamp|ids")
    seen = set()
    for c in j.get("query", {}).get("usercontribs", []):
        qid = c.get("title", "")
        if not re.fullmatch(r"Q\d+", qid) or qid in seen:
            continue
        seen.add(qid)
        try:
            for st in entity(qid).get("claims", {}).get("P356", []):
                if normalize_doi(sval(st) or "").lower() == needle:
                    return qid
        except Exception:
            pass
    return None


def sparql_item(doi):
    d = normalize_doi(doi)
    values = " ".join(json.dumps(x) for x in sorted({d, d.upper(), d.lower()}))
    query = f"SELECT ?item WHERE {{ VALUES ?doi {{ {values} }} ?item wdt:P356 ?doi . }} LIMIT 5"
    j = http("GET", WDQS, params={"query": query, "format": "json"}, timeout=90).json()
    qids = []
    for b in j.get("results", {}).get("bindings", []):
        m = re.search(r"/entity/(Q\d+)$", b.get("item", {}).get("value", ""))
        if m: qids.append(m.group(1))
    qids = sorted(set(qids), key=lambda q: int(q[1:]))
    if len(qids) > 1:
        raise RuntimeError(f"duplicate DOI {doi}: {qids}")
    return qids[0] if qids else None


def find_item(doi):
    return recent_item(doi) or sparql_item(doi)


def clean_title(v):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", v or ""))).strip()


def create_minimal(doi, token):
    meta = crossref(doi)
    title = clean_title((meta.get("title") or [""])[0])
    if not title:
        raise RuntimeError(f"no Crossref title {doi}")
    year = None
    for k in ("published-print", "published-online", "published", "issued", "created"):
        p = meta.get(k, {}).get("date-parts")
        if p and p[0]: year = int(p[0][0]); break
    data = {"labels": {"en": {"language": "en", "value": title[:250]}},
            "descriptions": {"en": {"language": "en", "value": f"scholarly article{(' published in ' + str(year)) if year else ''}"}}}
    j = post(action="wbeditentity", new="item", data=json.dumps(data, ensure_ascii=False), token=token,
             summary="Create scholarly article item from DOI metadata")
    qid = j.get("entity", {}).get("id")
    if not qid:
        raise RuntimeError(f"item creation failed {doi}")
    # Keep creation intentionally minimal to reduce write pressure; later enrichment is separate.
    claim = post(action="wbcreateclaim", entity=qid, property="P31", snaktype="value",
                 value=json.dumps(item_value("Q13442814")), token=token, summary="Classify as scholarly article").get("claim")
    if not claim: raise RuntimeError(f"P31 failed {qid}")
    dclaim = post(action="wbcreateclaim", entity=qid, property="P356", snaktype="value",
                  value=json.dumps(normalize_doi(doi).upper()), token=token, summary="Add DOI").get("claim")
    if not dclaim: raise RuntimeError(f"DOI failed {qid}")
    return qid


def ensure_citing_item(doi, token):
    qid = find_item(doi)
    if qid: return qid, False
    crossref(doi); time.sleep(3)
    qid = find_item(doi)
    if qid: return qid, False
    return create_minimal(doi, token), True


def main():
    cfg = json.loads(CFG.read_text(encoding="utf-8"))
    user, token = login()
    report = {"ok": True, "authenticated_as": user.get("name"), "created_items": [], "edges": [], "skipped": []}
    for e in cfg.get("incoming_citations", []):
        try:
            ok, via = verify_citation(e["doi"], e["target"], e["evidence_url"])
            if not ok:
                report["skipped"].append({"doi": e["doi"], "target": e["target"], "reason": "citation-not-machine-verifiable"})
                continue
            qid, created = ensure_citing_item(e["doi"], token)
            if created:
                report["created_items"].append({"doi": e["doi"], "qid": qid})
            edge = ensure_qclaim(qid, "P2860", e["target"], e["evidence_url"], token)
            edge.update({"doi": e["doi"], "verified_by": via})
            report["edges"].append(edge)
        except Exception as exc:
            report["skipped"].append({"doi": e["doi"], "target": e["target"], "reason": repr(exc)})
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
