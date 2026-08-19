#!/usr/bin/env python3
import json
import os
import sys
import time
from datetime import datetime, timezone

import requests

USERNAME = os.environ["WIKIMEDIA_USERNAME"]
PASSWORD = os.environ["WIKIMEDIA_BOT_PASSWORD"]
VAPI = "https://en.wikiversity.org/w/api.php"
WAPI = "https://www.wikidata.org/w/api.php"
TITLE = "Facial assessment before aesthetic botulinum toxin treatment"
PERSON = "Q140287622"
AUTHOR_ROLE = "Q482980"
OER = "Q116781"
WORK = "Q386724"
ENGLISH = "Q1860"
CC_BY_SA_4 = "Q18199165"
BONT_A = "Q4095199"
AESTHETIC_MEDICINE = "Q3332453"
UA = "GhezelbaashWikiversityWikidata/1.0 (https://www.ghezelbaash.ir/)"


def die(message, details=None):
    out = {"ok": False, "error": message}
    if details is not None:
        out["details"] = details
    print(json.dumps(out, ensure_ascii=False, indent=2))
    sys.exit(1)


def session_for(api, login=False):
    s = requests.Session()
    s.headers.update({"User-Agent": UA})

    def get(**params):
        params.setdefault("format", "json")
        params.setdefault("formatversion", "2")
        r = s.get(api, params=params, timeout=60)
        r.raise_for_status()
        d = r.json()
        if "error" in d:
            raise RuntimeError(d["error"])
        return d

    def post(**data):
        data.setdefault("format", "json")
        data.setdefault("formatversion", "2")
        r = s.post(api, data=data, timeout=90)
        r.raise_for_status()
        d = r.json()
        if d.get("error", {}).get("code") == "abusefilter-warning":
            r = s.post(api, data=data, timeout=90)
            r.raise_for_status()
            d = r.json()
        if "error" in d:
            raise RuntimeError(d["error"])
        return d

    if login:
        token = get(action="query", meta="tokens", type="login")["query"]["tokens"]["logintoken"]
        result = post(action="login", lgname=USERNAME, lgpassword=PASSWORD, lgtoken=token)
        if result.get("login", {}).get("result") != "Success":
            raise RuntimeError(result)
    return s, get, post


def time_value(date_text):
    y, m, d = map(int, date_text.split("-"))
    return {
        "time": f"+{y:04d}-{m:02d}-{d:02d}T00:00:00Z",
        "timezone": 0,
        "before": 0,
        "after": 0,
        "precision": 11,
        "calendarmodel": "http://www.wikidata.org/entity/Q1985727",
    }


def item_value(qid):
    return json.dumps({"entity-type": "item", "numeric-id": int(qid[1:]), "id": qid}, separators=(",", ":"))


def mono_value(text):
    return json.dumps({"text": text, "language": "en"}, ensure_ascii=False, separators=(",", ":"))


def string_value(text):
    return json.dumps(text, ensure_ascii=False)


def claim_value(claim):
    return claim.get("mainsnak", {}).get("datavalue", {}).get("value")


def item_id_from_claim(claim):
    value = claim_value(claim)
    return value.get("id") if isinstance(value, dict) else None


def has_url_reference(claim, url):
    for ref in claim.get("references", []):
        for snak in ref.get("snaks", {}).get("P854", []):
            if snak.get("datavalue", {}).get("value") == url:
                return True
    return False


def main():
    # Resolve and verify the live Wikiversity page before touching Wikidata.
    _, vg, vp = session_for(VAPI, login=False)
    page_query = vg(
        action="query",
        titles=TITLE,
        prop="info|pageprops|revisions",
        inprop="url",
        rvprop="ids|timestamp|user|comment|sha1|content",
        rvslots="main",
        rvlimit=1,
        curtimestamp="1",
    )
    page = page_query["query"]["pages"][0]
    if "missing" in page:
        die("Live Wikiversity resource is missing")
    revision = page.get("revisions", [{}])[0]
    content = revision.get("slots", {}).get("main", {}).get("content", "")
    if "[[d:Q140287622|Saeed Ghezelbash]]" not in content:
        die("Expected author provenance link is absent from live resource")
    if "A compact pre-treatment assessment framework" not in content:
        die("Live resource does not match expected facial-assessment content")
    page_url = page.get("fullurl") or ("https://en.wikiversity.org/wiki/" + TITLE.replace(" ", "_"))
    revision_ts = revision.get("timestamp")
    if not revision_ts:
        die("Live resource revision timestamp is missing")
    publication_date = revision_ts[:10]
    server_ts = page_query.get("curtimestamp") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    retrieved_date = server_ts[:10]
    publication_time = time_value(publication_date)
    retrieved_time = time_value(retrieved_date)

    # Login to Wikidata using the same Wikimedia bot-password account.
    _, wg, wp = session_for(WAPI, login=True)
    wd_token = wg(action="query", meta="tokens", type="csrf")["query"]["tokens"]["csrftoken"]

    # Resolve by exact sitelink first: reruns continue the same entity rather than duplicate it.
    resolved = wg(
        action="wbgetentities",
        sites="enwikiversity",
        titles=TITLE,
        props="info|labels|descriptions|sitelinks|claims",
    )
    candidates = [(qid, e) for qid, e in resolved.get("entities", {}).items() if qid != "-1" and not e.get("missing")]
    created_item = False
    if len(candidates) > 1:
        die("Multiple Wikidata entities unexpectedly resolve from one sitelink", [q for q, _ in candidates])
    if candidates:
        qid = candidates[0][0]
    else:
        data = {
            "labels": {"en": {"language": "en", "value": TITLE}},
            "descriptions": {
                "en": {
                    "language": "en",
                    "value": "Wikiversity learning resource on structured facial assessment before aesthetic botulinum toxin treatment",
                }
            },
            "aliases": {
                "en": [
                    {"language": "en", "value": "Facial assessment before aesthetic BoNT-A treatment"},
                    {"language": "en", "value": "Pre-treatment facial assessment for aesthetic botulinum toxin"},
                ]
            },
            "sitelinks": {"enwikiversity": {"site": "enwikiversity", "title": TITLE, "badges": []}},
        }
        created = wp(
            action="wbeditentity",
            new="item",
            data=json.dumps(data, ensure_ascii=False),
            token=wd_token,
            summary="Create item for Wikiversity open educational resource on pre-treatment facial assessment",
            assert="user",
        )
        qid = created.get("entity", {}).get("id")
        if not qid:
            die("Wikidata item creation did not return a QID", created)
        created_item = True
        time.sleep(2)

    def fetch_entity(entity=qid):
        return wg(action="wbgetentities", ids=entity, props="labels|descriptions|aliases|sitelinks|claims")["entities"][entity]

    def add_reference(guid, url):
        snaks = {
            "P854": [{"snaktype": "value", "property": "P854", "datavalue": {"value": url, "type": "string"}}],
            "P813": [{"snaktype": "value", "property": "P813", "datavalue": {"value": retrieved_time, "type": "time"}}],
        }
        result = wp(
            action="wbsetreference",
            statement=guid,
            snaks=json.dumps(snaks, separators=(",", ":")),
            token=wd_token,
            summary="Reference live Wikiversity resource",
            assert="user",
        )
        if not result.get("reference"):
            die("Reference write failed", result)

    def ensure_qualifier(guid, prop, value_json, expected_item=None, expected_string=None):
        entity = fetch_entity()
        target = None
        for claims in entity.get("claims", {}).values():
            for claim in claims:
                if claim.get("id") == guid:
                    target = claim
                    break
        if target is None:
            die("Could not refetch statement for qualifier", guid)
        existing = target.get("qualifiers", {}).get(prop, [])
        for snak in existing:
            value = snak.get("datavalue", {}).get("value")
            if expected_item and isinstance(value, dict) and value.get("id") == expected_item:
                return
            if expected_string is not None and value == expected_string:
                return
        result = wp(
            action="wbsetqualifier",
            claim=guid,
            property=prop,
            snaktype="value",
            value=value_json,
            token=wd_token,
            summary="Add author-role metadata",
            assert="user",
        )
        if not result.get("claim"):
            die("Qualifier write failed", result)

    def ensure_claim(prop, value_json, matcher, ref_url=page_url, qualifiers=None):
        entity = fetch_entity()
        found = None
        for claim in entity.get("claims", {}).get(prop, []):
            if matcher(claim_value(claim)):
                found = claim
                break
        created = False
        if found is None:
            result = wp(
                action="wbcreateclaim",
                entity=qid,
                property=prop,
                snaktype="value",
                value=value_json,
                token=wd_token,
                summary=f"Add {prop} metadata for Wikiversity learning resource",
                assert="user",
            )
            found = result.get("claim")
            if not found:
                die(f"Failed to create {prop}", result)
            created = True
        guid = found["id"]
        for qp, qvalue, qitem, qstring in qualifiers or []:
            ensure_qualifier(guid, qp, qvalue, expected_item=qitem, expected_string=qstring)
        refreshed = fetch_entity()
        refreshed_claim = next(c for c in refreshed.get("claims", {}).get(prop, []) if c.get("id") == guid)
        if ref_url and not has_url_reference(refreshed_claim, ref_url):
            add_reference(guid, ref_url)
        return {"guid": guid, "created": created}

    ensure_claim("P31", item_value(OER), lambda v: isinstance(v, dict) and v.get("id") == OER)
    ensure_claim("P31", item_value(WORK), lambda v: isinstance(v, dict) and v.get("id") == WORK)
    ensure_claim("P1476", mono_value(TITLE), lambda v: isinstance(v, dict) and v.get("text") == TITLE and v.get("language") == "en")
    ensure_claim(
        "P50",
        item_value(PERSON),
        lambda v: isinstance(v, dict) and v.get("id") == PERSON,
        qualifiers=[("P1545", string_value("1"), None, "1")],
    )
    ensure_claim("P407", item_value(ENGLISH), lambda v: isinstance(v, dict) and v.get("id") == ENGLISH)
    ensure_claim(
        "P275",
        item_value(CC_BY_SA_4),
        lambda v: isinstance(v, dict) and v.get("id") == CC_BY_SA_4,
        ref_url="https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use",
    )
    ensure_claim("P921", item_value(BONT_A), lambda v: isinstance(v, dict) and v.get("id") == BONT_A)
    ensure_claim("P921", item_value(AESTHETIC_MEDICINE), lambda v: isinstance(v, dict) and v.get("id") == AESTHETIC_MEDICINE)
    ensure_claim("P577", json.dumps(publication_time), lambda v: isinstance(v, dict) and v.get("time") == publication_time["time"])

    # Reciprocal edge: person -> creative work, qualified as author.
    person_entity = wg(action="wbgetentities", ids=PERSON, props="claims")["entities"][PERSON]
    back_claim = None
    for claim in person_entity.get("claims", {}).get("P3919", []):
        if item_id_from_claim(claim) == qid:
            back_claim = claim
            break
    back_created = False
    if back_claim is None:
        result = wp(
            action="wbcreateclaim",
            entity=PERSON,
            property="P3919",
            snaktype="value",
            value=item_value(qid),
            token=wd_token,
            summary="Link Saeed Ghezelbash to authored Wikiversity facial-assessment learning resource",
            assert="user",
        )
        back_claim = result.get("claim")
        if not back_claim:
            die("Failed to create reciprocal person-to-work edge", result)
        back_created = True

    # Ensure author role on the person-side back edge.
    person_entity = wg(action="wbgetentities", ids=PERSON, props="claims")["entities"][PERSON]
    back_claim = next(c for c in person_entity.get("claims", {}).get("P3919", []) if item_id_from_claim(c) == qid)
    role_present = False
    for snak in back_claim.get("qualifiers", {}).get("P2868", []):
        value = snak.get("datavalue", {}).get("value")
        if isinstance(value, dict) and value.get("id") == AUTHOR_ROLE:
            role_present = True
    if not role_present:
        result = wp(
            action="wbsetqualifier",
            claim=back_claim["id"],
            property="P2868",
            snaktype="value",
            value=item_value(AUTHOR_ROLE),
            token=wd_token,
            summary="Qualify contribution role as author",
            assert="user",
        )
        if not result.get("claim"):
            die("Failed to add author-role qualifier to reciprocal edge", result)

    person_entity = wg(action="wbgetentities", ids=PERSON, props="claims")["entities"][PERSON]
    back_claim = next(c for c in person_entity.get("claims", {}).get("P3919", []) if item_id_from_claim(c) == qid)
    if not has_url_reference(back_claim, page_url):
        # P3919 lives on PERSON, but wbsetreference accepts its GUID directly.
        snaks = {
            "P854": [{"snaktype": "value", "property": "P854", "datavalue": {"value": page_url, "type": "string"}}],
            "P813": [{"snaktype": "value", "property": "P813", "datavalue": {"value": retrieved_time, "type": "time"}}],
        }
        result = wp(
            action="wbsetreference",
            statement=back_claim["id"],
            snaks=json.dumps(snaks, separators=(",", ":")),
            token=wd_token,
            summary="Reference live Wikiversity learning resource",
            assert="user",
        )
        if not result.get("reference"):
            die("Failed to reference reciprocal edge", result)

    time.sleep(3)
    # Purge Wikiversity so pageprops reflects the newly attached Wikidata item.
    try:
        vp(action="purge", titles=TITLE, forcelinkupdate="1")
    except Exception:
        pass
    time.sleep(3)

    page_verify = vg(action="query", titles=TITLE, prop="info|pageprops|revisions", inprop="url", rvprop="ids|timestamp|sha1", rvlimit=1)["query"]["pages"][0]
    entity = fetch_entity()
    person_verify = wg(action="wbgetentities", ids=PERSON, props="claims")["entities"][PERSON]

    def ids(prop):
        values = []
        for claim in entity.get("claims", {}).get(prop, []):
            value = claim_value(claim)
            values.append(value.get("id") if isinstance(value, dict) and "id" in value else value)
        return values

    back_edges = []
    for claim in person_verify.get("claims", {}).get("P3919", []):
        if item_id_from_claim(claim) == qid:
            roles = []
            for snak in claim.get("qualifiers", {}).get("P2868", []):
                value = snak.get("datavalue", {}).get("value")
                roles.append(value.get("id") if isinstance(value, dict) else value)
            back_edges.append({
                "guid": claim.get("id"),
                "roles": roles,
                "references": len(claim.get("references", [])),
            })

    checks = {
        "page_exists": "missing" not in page_verify,
        "page_revision_is_expected_or_newer": page_verify.get("revisions", [{}])[0].get("revid", 0) >= revision.get("revid", 0),
        "page_wikibase_item": page_verify.get("pageprops", {}).get("wikibase_item") == qid,
        "sitelink_exact": entity.get("sitelinks", {}).get("enwikiversity", {}).get("title") == TITLE,
        "p31_oer": OER in ids("P31"),
        "p31_work": WORK in ids("P31"),
        "author_forward": PERSON in ids("P50"),
        "language_english": ENGLISH in ids("P407"),
        "license_cc_by_sa_4": CC_BY_SA_4 in ids("P275"),
        "topic_bont_a": BONT_A in ids("P921"),
        "topic_aesthetic_medicine": AESTHETIC_MEDICINE in ids("P921"),
        "publication_date": any(isinstance(v, dict) and v.get("time") == publication_time["time"] for v in [claim_value(c) for c in entity.get("claims", {}).get("P577", [])]),
        "single_reciprocal_back_edge": len(back_edges) == 1,
        "back_edge_role_author": len(back_edges) == 1 and AUTHOR_ROLE in back_edges[0]["roles"],
        "back_edge_referenced": len(back_edges) == 1 and back_edges[0]["references"] >= 1,
    }

    out = {
        "ok": all(checks.values()),
        "qid": qid,
        "wikidata_url": "https://www.wikidata.org/wiki/" + qid,
        "created_item": created_item,
        "created_person_back_edge": back_created,
        "page_title": TITLE,
        "page_url": page_url,
        "pageid": page.get("pageid"),
        "page_revision": revision.get("revid"),
        "publication_date": publication_date,
        "checks": checks,
        "sitelink": entity.get("sitelinks", {}).get("enwikiversity"),
        "claim_values": {p: ids(p) for p in ["P31", "P50", "P407", "P275", "P921", "P577", "P1476"]},
        "person_back_edges": back_edges,
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))
    if not out["ok"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
