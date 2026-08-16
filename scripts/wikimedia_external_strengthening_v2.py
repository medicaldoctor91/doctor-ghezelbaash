#!/usr/bin/env python3
import datetime as dt
import html
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests

CONFIG_PATH = Path(os.environ.get("WIKIMEDIA_STRENGTHENING_CONFIG", "wikimedia/external-strengthening-2026-08-16.json"))
USERNAME = os.environ["WIKIMEDIA_USERNAME"]
PASSWORD = os.environ["WIKIMEDIA_BOT_PASSWORD"]
USER_AGENT = "GhezelbaashWikimediaStrengthener/2.0 (https://github.com/medicaldoctor91/doctor-ghezelbaash)"
WD_API = "https://www.wikidata.org/w/api.php"
WP_API = "https://en.wikipedia.org/w/api.php"
WDQS = "https://query.wikidata.org/sparql"
CROSSREF = "https://api.crossref.org/works/{}"
TODAY = dt.datetime.now(dt.timezone.utc).date()

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})


def request(method, url, *, params=None, data=None, headers=None, timeout=60, tries=4):
    last = None
    for attempt in range(tries):
        try:
            response = session.request(method, url, params=params, data=data, headers=headers, timeout=timeout)
            if response.status_code in {429, 500, 502, 503, 504}:
                last = f"HTTP {response.status_code}: {response.text[:300]}"
                time.sleep(2 ** attempt)
                continue
            response.raise_for_status()
            return response
        except Exception as exc:
            last = repr(exc)
            if attempt + 1 == tries:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError(last)


def api_get(api, **params):
    params.setdefault("format", "json")
    params.setdefault("formatversion", "2")
    result = request("GET", api, params=params).json()
    if "error" in result:
        raise RuntimeError(f"MediaWiki GET error: {result['error']}")
    return result


def api_post(api, **data):
    data.setdefault("format", "json")
    data.setdefault("formatversion", "2")
    result = request("POST", api, data=data).json()
    if "error" in result:
        raise RuntimeError(f"MediaWiki POST error: {result['error']}")
    return result


def login(api):
    login_token = api_get(api, action="query", meta="tokens", type="login")["query"]["tokens"]["logintoken"]
    login_result = api_post(api, action="login", lgname=USERNAME, lgpassword=PASSWORD, lgtoken=login_token)
    if login_result.get("login", {}).get("result") != "Success":
        raise RuntimeError(f"Login failed at {api}: {login_result}")
    user = api_get(api, action="query", meta="userinfo", uiprop="groups|rights")["query"]["userinfo"]
    if user.get("anon"):
        raise RuntimeError(f"Session became anonymous at {api}")
    csrf = api_get(api, action="query", meta="tokens", type="csrf")["query"]["tokens"]["csrftoken"]
    return user, csrf


def qid_numeric(qid):
    return int(qid[1:])


def item_value(qid):
    return {"entity-type": "item", "numeric-id": qid_numeric(qid), "id": qid}


def get_entity(qid):
    entity = api_get(WD_API, action="wbgetentities", ids=qid, props="claims|labels|descriptions").get("entities", {}).get(qid)
    if not entity or entity.get("missing"):
        raise RuntimeError(f"Missing Wikidata entity: {qid}")
    return entity


def statement_qid(statement):
    try:
        value = statement["mainsnak"]["datavalue"]["value"]
        if isinstance(value, dict):
            return value.get("id") or f"Q{value['numeric-id']}"
    except Exception:
        return None
    return None


def statement_string(statement):
    try:
        value = statement["mainsnak"]["datavalue"]["value"]
        return value if isinstance(value, str) else None
    except Exception:
        return None


def item_doi(qid):
    entity = get_entity(qid)
    for statement in entity.get("claims", {}).get("P356", []):
        value = statement_string(statement)
        if value:
            return normalize_doi(value)
    raise RuntimeError(f"Target scholarly item {qid} has no DOI (P356)")


def reference_snaks(url):
    return {
        "P854": [{
            "snaktype": "value", "property": "P854",
            "datavalue": {"value": url, "type": "string"}, "datatype": "url"
        }],
        "P813": [{
            "snaktype": "value", "property": "P813",
            "datavalue": {"value": {
                "time": f"+{TODAY.isoformat()}T00:00:00Z", "timezone": 0,
                "before": 0, "after": 0, "precision": 11,
                "calendarmodel": "http://www.wikidata.org/entity/Q1985727"
            }, "type": "time"}, "datatype": "time"
        }]
    }


def reference_has_url(statement, url):
    for ref in statement.get("references", []):
        for snak in ref.get("snaks", {}).get("P854", []):
            if snak.get("datavalue", {}).get("value") == url:
                return True
    return False


def add_reference(guid, url, csrf):
    api_post(
        WD_API, action="wbsetreference", statement=guid,
        snaks=json.dumps(reference_snaks(url), ensure_ascii=False),
        token=csrf, bot="1", summary="Add source supporting scholarly graph statement"
    )


def ensure_item_claim(qid, prop, target_qid, evidence_url, csrf):
    entity = get_entity(qid)
    for statement in entity.get("claims", {}).get(prop, []):
        if statement.get("rank") != "deprecated" and statement_qid(statement) == target_qid:
            ref_added = False
            if evidence_url and not reference_has_url(statement, evidence_url):
                add_reference(statement["id"], evidence_url, csrf)
                ref_added = True
            return {"item": qid, "property": prop, "value": target_qid, "created": False, "reference_added": ref_added}
    created = api_post(
        WD_API, action="wbcreateclaim", entity=qid, property=prop, snaktype="value",
        value=json.dumps(item_value(target_qid)), token=csrf, bot="1",
        summary="Add sourced scholarly graph statement"
    ).get("claim")
    if not created or not created.get("id"):
        raise RuntimeError(f"Failed to create {qid} {prop} {target_qid}")
    if evidence_url:
        add_reference(created["id"], evidence_url, csrf)
    return {"item": qid, "property": prop, "value": target_qid, "created": True, "reference_added": bool(evidence_url)}


def normalize_doi(value):
    value = (value or "").strip()
    for prefix in ("https://doi.org/", "http://doi.org/", "doi:"):
        if value.lower().startswith(prefix):
            value = value[len(prefix):]
    return value.strip()


def find_item_by_doi(doi):
    doi = normalize_doi(doi)
    variants = sorted({doi, doi.upper(), doi.lower()})
    values = " ".join(json.dumps(v) for v in variants)
    query = f"SELECT ?item WHERE {{ VALUES ?doi {{ {values} }} ?item wdt:P356 ?doi . }} LIMIT 5"
    result = request("GET", WDQS, params={"query": query, "format": "json"}, headers={"Accept": "application/sparql-results+json"}, timeout=90).json()
    qids = []
    for row in result.get("results", {}).get("bindings", []):
        match = re.search(r"/entity/(Q\d+)$", row.get("item", {}).get("value", ""))
        if match:
            qids.append(match.group(1))
    qids = sorted(set(qids), key=lambda q: int(q[1:]))
    if len(qids) > 1:
        raise RuntimeError(f"DOI {doi} is duplicated in Wikidata: {qids}")
    return qids[0] if qids else None


def crossref_metadata(doi):
    result = request("GET", CROSSREF.format(quote(normalize_doi(doi), safe="")), timeout=60).json().get("message")
    if not result:
        raise RuntimeError(f"No Crossref metadata for {doi}")
    return result


def citation_verified(citing_doi, target_qid, evidence_url):
    target = item_doi(target_qid).lower()
    meta = crossref_metadata(citing_doi)
    for ref in meta.get("reference") or []:
        candidate = normalize_doi(ref.get("DOI") or ref.get("doi") or "").lower()
        if candidate and candidate == target:
            return True, "crossref-reference"
    try:
        evidence = request("GET", evidence_url, timeout=60, tries=2).text.lower()
        if target in evidence or target.replace("-", "&#x2010;") in evidence:
            return True, "evidence-fulltext"
    except Exception:
        pass
    return False, None


def clean_title(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", value or ""))).strip()


def date_parts(meta):
    for key in ("published-print", "published-online", "published", "issued", "created"):
        parts = meta.get(key, {}).get("date-parts")
        if parts and parts[0]:
            return parts[0]
    return None


def wikibase_time(parts):
    year = int(parts[0]); month = int(parts[1]) if len(parts) > 1 else 1; day = int(parts[2]) if len(parts) > 2 else 1
    precision = 11 if len(parts) > 2 else (10 if len(parts) > 1 else 9)
    return {"time": f"+{year:04d}-{month:02d}-{day:02d}T00:00:00Z", "timezone": 0, "before": 0, "after": 0,
            "precision": precision, "calendarmodel": "http://www.wikidata.org/entity/Q1985727"}


def create_string_claim(qid, prop, value, csrf, summary):
    return api_post(WD_API, action="wbcreateclaim", entity=qid, property=prop, snaktype="value",
                    value=json.dumps(value), token=csrf, bot="1", summary=summary).get("claim")


def create_scholarly_item(doi, csrf):
    meta = crossref_metadata(doi)
    title = clean_title((meta.get("title") or [""])[0])
    if not title:
        raise RuntimeError(f"Crossref returned no title for {doi}")
    parts = date_parts(meta)
    year = str(parts[0]) if parts else ""
    entity_data = {
        "labels": {"en": {"language": "en", "value": title[:250]}},
        "descriptions": {"en": {"language": "en", "value": f"scholarly article{(' published in ' + year) if year else ''}"}}
    }
    result = api_post(WD_API, action="wbeditentity", new="item", data=json.dumps(entity_data, ensure_ascii=False), token=csrf,
                      bot="1", summary="Create scholarly article item from DOI/Crossref metadata")
    qid = result.get("entity", {}).get("id")
    if not qid:
        raise RuntimeError(f"Wikidata item creation failed for {doi}")

    source = f"https://api.crossref.org/works/{quote(normalize_doi(doi), safe='')}"
    ensure_item_claim(qid, "P31", "Q13442814", source, csrf)
    doi_claim = create_string_claim(qid, "P356", normalize_doi(doi).upper(), csrf, "Add DOI from Crossref")
    if doi_claim:
        add_reference(doi_claim["id"], source, csrf)
    api_post(WD_API, action="wbcreateclaim", entity=qid, property="P1476", snaktype="value",
             value=json.dumps({"text": title, "language": "en"}, ensure_ascii=False), token=csrf, bot="1",
             summary="Add article title from Crossref")
    if parts:
        api_post(WD_API, action="wbcreateclaim", entity=qid, property="P577", snaktype="value",
                 value=json.dumps(wikibase_time(parts)), token=csrf, bot="1", summary="Add publication date from Crossref")
    if (meta.get("language") or "").lower() == "en":
        ensure_item_claim(qid, "P407", "Q1860", source, csrf)

    for idx, author in enumerate(meta.get("author") or [], 1):
        name = " ".join(x for x in ((author.get("given") or "").strip(), (author.get("family") or "").strip()) if x).strip()
        if not name:
            continue
        claim = create_string_claim(qid, "P2093", name, csrf, "Add author name from Crossref")
        if claim:
            api_post(WD_API, action="wbsetqualifier", claim=claim["id"], property="P1545", snaktype="value",
                     value=json.dumps(str(idx)), token=csrf, bot="1")
    return qid


def ensure_citing_item(doi, csrf):
    existing = find_item_by_doi(doi)
    if existing:
        return existing, False
    # Two-pass DOI lookup; only create after stable absence and authoritative Crossref metadata.
    crossref_metadata(doi)
    time.sleep(2)
    existing = find_item_by_doi(doi)
    if existing:
        return existing, False
    return create_scholarly_item(doi, csrf), True


def fetch_page_text(api, title):
    result = api_get(api, action="query", titles=title, prop="revisions", rvprop="content|ids", rvslots="main")
    pages = result.get("query", {}).get("pages", [])
    if not pages or "missing" in pages[0]:
        return None, None
    revisions = pages[0].get("revisions") or []
    if not revisions:
        return "", None
    rev = revisions[0]
    return rev.get("slots", {}).get("main", {}).get("content", ""), rev.get("revid")


def ensure_talk_request(cfg, csrf):
    current, old_revid = fetch_page_text(WP_API, cfg["title"])
    if current is None:
        raise RuntimeError(f"Missing talk page: {cfg['title']}")
    if cfg["marker"] in current:
        return {"title": cfg["title"], "created": False, "existing_revid": old_revid}
    payload = {
        "action": "edit", "title": cfg["title"], "section": "new", "sectiontitle": cfg["section_title"],
        "text": cfg["text"], "summary": "COI edit request: update evidence using current secondary literature",
        "token": csrf, "watchlist": "watch", "maxlag": "5"
    }
    result = api_post(WP_API, **payload)
    if result.get("edit", {}).get("result") != "Success":
        raise RuntimeError(f"Wikipedia edit failed: {result}")
    after, new_revid = fetch_page_text(WP_API, cfg["title"])
    if cfg["marker"] not in (after or ""):
        raise RuntimeError(f"Post-edit marker missing from {cfg['title']}")
    return {"title": cfg["title"], "created": True, "new_revid": new_revid}


def main():
    if not CONFIG_PATH.is_file():
        raise RuntimeError(f"Config not found: {CONFIG_PATH}")
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    report = {"ok": False, "date": TODAY.isoformat(), "wikidata": [], "created_scholarly_items": [],
              "skipped_citations": [], "wikipedia": []}
    try:
        wd_user, wd_csrf = login(WD_API)
        wp_user, wp_csrf = login(WP_API)
        report["authenticated"] = {"wikidata": wd_user.get("name"), "wikipedia": wp_user.get("name")}

        for entry in config.get("wikidata_claims", []):
            report["wikidata"].append(ensure_item_claim(entry["item"], entry["property"], entry["value"], entry["evidence_url"], wd_csrf))

        for entry in config.get("incoming_citations", []):
            verified, method = citation_verified(entry["doi"], entry["target"], entry["evidence_url"])
            if not verified:
                report["skipped_citations"].append({"doi": entry["doi"], "target": entry["target"], "reason": "citation-not-machine-verifiable"})
                continue
            citing_qid, created = ensure_citing_item(entry["doi"], wd_csrf)
            if created:
                report["created_scholarly_items"].append({"doi": entry["doi"], "qid": citing_qid})
            outcome = ensure_item_claim(citing_qid, "P2860", entry["target"], entry["evidence_url"], wd_csrf)
            outcome.update({"doi": entry["doi"], "citation_verified_by": method})
            report["wikidata"].append(outcome)

        for req in config.get("wikipedia_requests", []):
            report["wikipedia"].append(ensure_talk_request(req, wp_csrf))

        report["ok"] = True
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except Exception as exc:
        report["error"] = repr(exc)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        raise


if __name__ == "__main__":
    main()
