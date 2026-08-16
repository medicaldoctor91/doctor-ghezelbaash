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
USER_AGENT = "GhezelbaashWikimediaStrengthener/1.0 (https://github.com/medicaldoctor91/doctor-ghezelbaash)"
WD_API = "https://www.wikidata.org/w/api.php"
WP_API = "https://en.wikipedia.org/w/api.php"
WDQS = "https://query.wikidata.org/sparql"
CROSSREF = "https://api.crossref.org/works/{}"
TODAY = dt.datetime.now(dt.timezone.utc).date()

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})


def die(message, details=None):
    payload = {"ok": False, "error": message}
    if details is not None:
        payload["details"] = details
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    sys.exit(1)


def request(method, url, *, params=None, data=None, headers=None, timeout=60, tries=4):
    last = None
    for attempt in range(tries):
        try:
            response = session.request(method, url, params=params, data=data, headers=headers, timeout=timeout)
            if response.status_code in {429, 500, 502, 503, 504}:
                last = f"HTTP {response.status_code}: {response.text[:500]}"
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
    token = api_get(api, action="query", meta="tokens", type="login")["query"]["tokens"]["logintoken"]
    result = api_post(api, action="login", lgname=USERNAME, lgpassword=PASSWORD, lgtoken=token)
    if result.get("login", {}).get("result") != "Success":
        raise RuntimeError(f"Login failed for {api}: {result}")
    user = api_get(api, action="query", meta="userinfo", uiprop="groups|rights")["query"]["userinfo"]
    if user.get("anon"):
        raise RuntimeError(f"Anonymous after login at {api}")
    csrf = api_get(api, action="query", meta="tokens", type="csrf")["query"]["tokens"]["csrftoken"]
    return user, csrf


def qid_numeric(qid):
    return int(qid[1:])


def item_value(qid):
    return {"entity-type": "item", "numeric-id": qid_numeric(qid), "id": qid}


def get_entity(qid):
    entities = api_get(WD_API, action="wbgetentities", ids=qid, props="claims|labels|descriptions")
    entity = entities.get("entities", {}).get(qid)
    if not entity or entity.get("missing"):
        raise RuntimeError(f"Missing Wikidata entity {qid}")
    return entity


def claim_qid(statement):
    try:
        value = statement["mainsnak"]["datavalue"]["value"]
        if isinstance(value, dict):
            return value.get("id") or (f"Q{value['numeric-id']}" if "numeric-id" in value else None)
    except Exception:
        return None
    return None


def reference_snaks(evidence_url):
    timestamp = f"+{TODAY.isoformat()}T00:00:00Z"
    return {
        "P854": [{
            "snaktype": "value",
            "property": "P854",
            "datavalue": {"value": evidence_url, "type": "string"},
            "datatype": "url"
        }],
        "P813": [{
            "snaktype": "value",
            "property": "P813",
            "datavalue": {
                "value": {
                    "time": timestamp,
                    "timezone": 0,
                    "before": 0,
                    "after": 0,
                    "precision": 11,
                    "calendarmodel": "http://www.wikidata.org/entity/Q1985727"
                },
                "type": "time"
            },
            "datatype": "time"
        }]
    }


def reference_has_url(statement, url):
    for ref in statement.get("references", []):
        for snak in ref.get("snaks", {}).get("P854", []):
            try:
                if snak["datavalue"]["value"] == url:
                    return True
            except Exception:
                pass
    return False


def add_reference(claim_guid, evidence_url, csrf):
    return api_post(
        WD_API,
        action="wbsetreference",
        statement=claim_guid,
        snaks=json.dumps(reference_snaks(evidence_url), ensure_ascii=False),
        token=csrf,
        bot="1",
        summary="Add source supporting scholarly/entity statement"
    )


def ensure_item_claim(qid, prop, target_qid, evidence_url, csrf):
    entity = get_entity(qid)
    existing = None
    for statement in entity.get("claims", {}).get(prop, []):
        if statement.get("rank") == "deprecated":
            continue
        if claim_qid(statement) == target_qid:
            existing = statement
            break
    if existing:
        added_ref = False
        if evidence_url and not reference_has_url(existing, evidence_url):
            add_reference(existing["id"], evidence_url, csrf)
            added_ref = True
        return {"item": qid, "property": prop, "value": target_qid, "created": False, "reference_added": added_ref}

    result = api_post(
        WD_API,
        action="wbcreateclaim",
        entity=qid,
        property=prop,
        snaktype="value",
        value=json.dumps(item_value(target_qid)),
        token=csrf,
        bot="1",
        summary="Add sourced scholarly/entity graph statement"
    )
    claim = result.get("claim")
    if not claim or "id" not in claim:
        raise RuntimeError(f"Claim creation returned no GUID: {result}")
    if evidence_url:
        add_reference(claim["id"], evidence_url, csrf)
    return {"item": qid, "property": prop, "value": target_qid, "created": True, "reference_added": bool(evidence_url)}


def normalize_doi(doi):
    return doi.strip().replace("https://doi.org/", "").replace("http://doi.org/", "")


def find_item_by_doi(doi):
    doi = normalize_doi(doi)
    variants = sorted({doi, doi.upper(), doi.lower()})
    values = " ".join(json.dumps(v) for v in variants)
    query = f"SELECT ?item WHERE {{ VALUES ?doi {{ {values} }} ?item wdt:P356 ?doi . }} LIMIT 5"
    response = request("GET", WDQS, params={"query": query, "format": "json"}, headers={"Accept": "application/sparql-results+json"}, timeout=90)
    bindings = response.json().get("results", {}).get("bindings", [])
    qids = []
    for row in bindings:
        uri = row.get("item", {}).get("value", "")
        match = re.search(r"/entity/(Q\d+)$", uri)
        if match:
            qids.append(match.group(1))
    qids = sorted(set(qids), key=lambda x: int(x[1:]))
    if len(qids) > 1:
        raise RuntimeError(f"DOI {doi} resolves to multiple Wikidata items: {qids}")
    return qids[0] if qids else None


def crossref_metadata(doi):
    response = request("GET", CROSSREF.format(quote(normalize_doi(doi), safe="")), timeout=60)
    message = response.json().get("message")
    if not message:
        raise RuntimeError(f"Crossref returned no metadata for DOI {doi}")
    return message


def clean_title(raw):
    text = html.unescape(re.sub(r"<[^>]+>", "", raw or ""))
    return re.sub(r"\s+", " ", text).strip()


def date_parts(meta):
    for key in ("published-print", "published-online", "published", "issued", "created"):
        parts = meta.get(key, {}).get("date-parts")
        if parts and parts[0]:
            return parts[0]
    return None


def wikibase_time(parts):
    year = int(parts[0])
    month = int(parts[1]) if len(parts) > 1 else 1
    day = int(parts[2]) if len(parts) > 2 else 1
    precision = 11 if len(parts) > 2 else (10 if len(parts) > 1 else 9)
    return {
        "time": f"+{year:04d}-{month:02d}-{day:02d}T00:00:00Z",
        "timezone": 0,
        "before": 0,
        "after": 0,
        "precision": precision,
        "calendarmodel": "http://www.wikidata.org/entity/Q1985727"
    }


def create_scholarly_item(doi, csrf):
    meta = crossref_metadata(doi)
    titles = meta.get("title") or []
    title = clean_title(titles[0] if titles else "")
    if not title:
        raise RuntimeError(f"Crossref has no usable title for {doi}")
    parts = date_parts(meta)
    year = str(parts[0]) if parts else ""
    data = {
        "labels": {"en": {"language": "en", "value": title[:250]}},
        "descriptions": {"en": {"language": "en", "value": (f"scholarly article published in {year}" if year else "scholarly article")}}
    }
    result = api_post(
        WD_API,
        action="wbeditentity",
        new="item",
        data=json.dumps(data, ensure_ascii=False),
        token=csrf,
        bot="1",
        summary="Create scholarly article item from DOI metadata"
    )
    qid = result.get("entity", {}).get("id")
    if not qid:
        raise RuntimeError(f"Failed to create scholarly article for {doi}: {result}")

    # Instance of scholarly article.
    ensure_item_claim(qid, "P31", "Q13442814", f"https://doi.org/{normalize_doi(doi)}", csrf)

    # DOI string.
    doi_value = normalize_doi(doi).upper()
    claim = api_post(
        WD_API,
        action="wbcreateclaim",
        entity=qid,
        property="P356",
        snaktype="value",
        value=json.dumps(doi_value),
        token=csrf,
        bot="1",
        summary="Add DOI from Crossref"
    ).get("claim")
    if claim:
        add_reference(claim["id"], f"https://api.crossref.org/works/{quote(normalize_doi(doi), safe='')}", csrf)

    # Title as monolingual text.
    api_post(
        WD_API,
        action="wbcreateclaim",
        entity=qid,
        property="P1476",
        snaktype="value",
        value=json.dumps({"text": title, "language": "en"}, ensure_ascii=False),
        token=csrf,
        bot="1",
        summary="Add article title from Crossref"
    )

    # Publication date when available.
    if parts:
        api_post(
            WD_API,
            action="wbcreateclaim",
            entity=qid,
            property="P577",
            snaktype="value",
            value=json.dumps(wikibase_time(parts)),
            token=csrf,
            bot="1",
            summary="Add publication date from Crossref"
        )

    # English language when Crossref identifies it as English.
    if (meta.get("language") or "").lower() == "en":
        ensure_item_claim(qid, "P407", "Q1860", f"https://api.crossref.org/works/{quote(normalize_doi(doi), safe='')}", csrf)

    # Author name strings with ordinals. Keep this conservative and source-faithful.
    for idx, author in enumerate(meta.get("author") or [], 1):
        given = (author.get("given") or "").strip()
        family = (author.get("family") or "").strip()
        name = " ".join(x for x in (given, family) if x).strip()
        if not name:
            continue
        created = api_post(
            WD_API,
            action="wbcreateclaim",
            entity=qid,
            property="P2093",
            snaktype="value",
            value=json.dumps(name),
            token=csrf,
            bot="1",
            summary="Add author name from Crossref"
        ).get("claim")
        if created and created.get("id"):
            ordinal_snak = {
                "P1545": [{
                    "snaktype": "value",
                    "property": "P1545",
                    "datavalue": {"value": str(idx), "type": "string"},
                    "datatype": "string"
                }]
            }
            api_post(
                WD_API,
                action="wbsetqualifier",
                claim=created["id"],
                property="P1545",
                snaktype="value",
                value=json.dumps(str(idx)),
                token=csrf,
                bot="1"
            )
    return qid


def ensure_citing_item(doi, csrf):
    found = find_item_by_doi(doi)
    if found:
        return found, False
    # Recheck after Crossref fetch and a short delay to reduce accidental duplication from transient WDQS issues.
    crossref_metadata(doi)
    time.sleep(1)
    found = find_item_by_doi(doi)
    if found:
        return found, False
    created = create_scholarly_item(doi, csrf)
    return created, True


def fetch_page_text(api, title):
    result = api_get(api, action="query", titles=title, prop="revisions", rvprop="content|ids", rvslots="main")
    pages = result.get("query", {}).get("pages", [])
    if not pages:
        return None, None
    page = pages[0]
    if "missing" in page:
        return None, None
    revisions = page.get("revisions") or []
    if not revisions:
        return "", None
    rev = revisions[0]
    return rev.get("slots", {}).get("main", {}).get("content", ""), rev.get("revid")


def ensure_talk_request(request_cfg, csrf):
    title = request_cfg["title"]
    marker = request_cfg["marker"]
    current, revid = fetch_page_text(WP_API, title)
    if current is None:
        raise RuntimeError(f"Wikipedia talk page does not exist: {title}")
    if marker in current:
        return {"title": title, "created": False, "existing_revid": revid}
    result = api_post(
        WP_API,
        action="edit",
        title=title,
        section="new",
        sectiontitle=request_cfg["section_title"],
        text=request_cfg["text"],
        summary="COI edit request: update scholarly evidence with current secondary sources",
        token=csrf,
        assert_="user",
        watchlist="watch",
        bot="1"
    )
    edit = result.get("edit", {})
    if edit.get("result") != "Success":
        raise RuntimeError(f"Wikipedia edit failed for {title}: {result}")
    after, after_revid = fetch_page_text(WP_API, title)
    if marker not in (after or ""):
        raise RuntimeError(f"Wikipedia readback marker missing for {title}")
    return {"title": title, "created": True, "new_revid": after_revid}


def main():
    if not CONFIG_PATH.is_file():
        die(f"Missing config: {CONFIG_PATH}")
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    report = {
        "ok": False,
        "date": TODAY.isoformat(),
        "wikidata": [],
        "created_scholarly_items": [],
        "wikipedia": []
    }
    try:
        wd_user, wd_csrf = login(WD_API)
        wp_user, wp_csrf = login(WP_API)
        report["authenticated"] = {
            "wikidata": wd_user.get("name"),
            "wikipedia": wp_user.get("name")
        }

        for entry in config.get("wikidata_claims", []):
            report["wikidata"].append(ensure_item_claim(
                entry["item"], entry["property"], entry["value"], entry.get("evidence_url"), wd_csrf
            ))

        for entry in config.get("incoming_citations", []):
            qid, created = ensure_citing_item(entry["doi"], wd_csrf)
            if created:
                report["created_scholarly_items"].append({"doi": entry["doi"], "qid": qid})
            outcome = ensure_item_claim(qid, "P2860", entry["target"], entry["evidence_url"], wd_csrf)
            outcome["doi"] = entry["doi"]
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
