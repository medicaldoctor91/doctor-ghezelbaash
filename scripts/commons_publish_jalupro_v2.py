#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
GRAPH_PATH = Path("src/data/semantic/knowledge-graph.jsonld")
RELEASE_PATH = Path("src/data/release.json")

PERSON_QID = "Q140287622"
CLINIC_QID = "Q140288589"
PERSON_NODE = "https://www.ghezelbaash.ir/#saeed-ghezelbash"
VIDEO_NODE = "https://www.ghezelbaash.ir/#video-jalupro-vs-profhilo"
WEBM_NODE = "https://www.ghezelbaash.ir/#video-jalupro-vs-profhilo-webm-encoding"
SITE_CONTEXT_URL = "https://www.ghezelbaash.ir/#jalupro-vs-profhilo-selection"
INSTAGRAM_URL = "https://www.instagram.com/reel/DDty1BcujKB/"
PERSON_KGID = "/g/11nqdfk76c"
CLINIC_KGID = "/g/11r3rzdtb3"

FILE_BASENAME = "دکتر سعید قزلباش درباره جالپرو و پروفایلو.webm"
FILE_TITLE = f"File:{FILE_BASENAME}"
COMMONS_PAGE_URL = "https://commons.wikimedia.org/wiki/File:" + FILE_BASENAME.replace(" ", "_")

Q_PERSIAN = "Q9168"
Q_INSTAGRAM = "Q209330"
Q_FILE_AVAILABLE_ON_INTERNET = "Q74228490"
Q_CC_BY_4 = "Q20007257"
Q_COPYRIGHTED = "Q50423863"

USER_AGENT = "Medicaldoctor91CommonsPublisher/2.0 (https://www.ghezelbaash.ir/)"


def die(message: str, details: Any = None) -> None:
    out: dict[str, Any] = {"ok": False, "error": message}
    if details is not None:
        out["details"] = details
    print(json.dumps(out, ensure_ascii=False, indent=2))
    raise SystemExit(1)


def item_value(qid: str) -> str:
    return json.dumps({"entity-type": "item", "numeric-id": int(qid[1:])}, separators=(",", ":"))


def string_value(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def qid_from_snak(snak: dict[str, Any]) -> str | None:
    value = snak.get("datavalue", {}).get("value")
    if isinstance(value, dict):
        if isinstance(value.get("id"), str):
            return value["id"]
        if isinstance(value.get("numeric-id"), int):
            return f"Q{value['numeric-id']}"
    return None


def scalar_from_snak(snak: dict[str, Any]) -> Any:
    return snak.get("datavalue", {}).get("value")


def id_values(value: Any) -> set[str]:
    values = value if isinstance(value, list) else [value]
    out: set[str] = set()
    for v in values:
        if isinstance(v, dict) and isinstance(v.get("@id"), str):
            out.add(v["@id"])
        elif isinstance(v, str):
            out.add(v)
    return out


def base36(n: int) -> str:
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    if n == 0:
        return "0"
    chars: list[str] = []
    while n:
        n, rem = divmod(n, 36)
        chars.append(alphabet[rem])
    return "".join(reversed(chars))


def file_sha1_base36(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return base36(int(h.hexdigest(), 16)).rjust(31, "0")


def get(session: requests.Session, endpoint: str, params: dict[str, Any]) -> dict[str, Any]:
    r = session.get(endpoint, params={**params, "format": "json", "formatversion": 2}, timeout=60)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        die("MediaWiki GET failed", data["error"])
    return data


def post(
    session: requests.Session,
    endpoint: str,
    data: dict[str, Any],
    *,
    files: dict[str, Any] | None = None,
    allow_error: bool = False,
) -> dict[str, Any]:
    payload = {**data, "format": "json", "formatversion": 2, "maxlag": 5}
    r = session.post(endpoint, data=payload, files=files, timeout=240)
    r.raise_for_status()
    result = r.json()
    if "error" in result and not allow_error:
        die("MediaWiki POST failed", result["error"])
    return result


def load_site_baseline() -> tuple[dict[str, Any], Path, str]:
    graph = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    release = json.loads(RELEASE_PATH.read_text(encoding="utf-8"))
    nodes = {n.get("@id"): n for n in graph.get("@graph", []) if isinstance(n, dict) and n.get("@id")}
    video = nodes.get(VIDEO_NODE)
    webm = nodes.get(WEBM_NODE)
    if not video or not webm:
        die("Canonical VideoObject or its WebM encoding is missing")

    required = {
        "name_contains": "دکتر سعید قزلباش",
        "sameAs": INSTAGRAM_URL,
        "duration": "PT1M2S",
        "inLanguage": "fa-IR",
    }
    if required["name_contains"] not in str(video.get("name", "")):
        die("Video name conflicts with canonical site identity", video.get("name"))
    for key in ("sameAs", "duration", "inLanguage"):
        if video.get(key) != required[key]:
            die(f"Video {key} conflicts with canonical site graph", {"actual": video.get(key), "expected": required[key]})
    for key in ("creator", "publisher", "copyrightHolder"):
        if PERSON_NODE not in id_values(video.get(key)):
            die(f"Canonical video does not identify the physician as {key}", video.get(key))

    webm_url = str(webm.get("contentUrl", ""))
    if webm.get("encodingFormat") != "video/webm" or not webm_url.startswith("https://www.ghezelbaash.ir/media/videos/education/"):
        die("Canonical WebM encoding conflicts with expected official source", webm)
    local_path = Path("public") / urlparse(webm_url).path.lstrip("/")
    if not local_path.is_file():
        die("Canonical WebM file is not present in the repository checkout", str(local_path))

    if release.get("primaryEntity", {}).get("wikidata") != PERSON_QID:
        die("Person Wikidata ID drift in release.json")
    if release.get("primaryEntity", {}).get("googleKnowledgeGraphId") != PERSON_KGID:
        die("Person Google KG ID drift in release.json")
    if release.get("identityFingerprint", {}).get("clinic", {}).get("wikidata") != CLINIC_QID:
        die("Clinic Wikidata ID drift in release.json")
    if release.get("clinic", {}).get("googleLocalKgmid") != CLINIC_KGID:
        die("Clinic Google local KG ID drift in release.json")

    return video, local_path, webm_url


def entity_item_values(entity: dict[str, Any], prop: str) -> set[str]:
    out: set[str] = set()
    for claim in entity.get("claims", {}).get(prop, []):
        q = qid_from_snak(claim.get("mainsnak", {}))
        if q:
            out.add(q)
    return out


def entity_string_values(entity: dict[str, Any], prop: str) -> set[str]:
    out: set[str] = set()
    for claim in entity.get("claims", {}).get(prop, []):
        v = scalar_from_snak(claim.get("mainsnak", {}))
        if isinstance(v, str):
            out.add(v)
    return out


def validate_wikidata() -> None:
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    data = get(s, WIKIDATA_API, {
        "action": "wbgetentities",
        "ids": f"{PERSON_QID}|{CLINIC_QID}",
        "props": "claims|labels|aliases",
        "languages": "fa|en",
    })
    person = data.get("entities", {}).get(PERSON_QID, {})
    clinic = data.get("entities", {}).get(CLINIC_QID, {})
    if person.get("missing") or clinic.get("missing"):
        die("Wikidata person or clinic item is missing")
    if PERSON_KGID not in entity_string_values(person, "P2671"):
        die("Person Wikidata item does not carry the audited Google KG ID")
    if CLINIC_KGID not in entity_string_values(clinic, "P2671"):
        die("Clinic Wikidata item does not carry the audited Google local KG ID")
    if CLINIC_QID not in entity_item_values(person, "P1830"):
        die("Person Wikidata item no longer links to clinic via owner of (P1830)")
    if CLINIC_QID not in entity_item_values(person, "P937"):
        die("Person Wikidata item no longer links to clinic via work location (P937)")


def commons_login() -> tuple[requests.Session, str, set[str], str]:
    username = os.environ.get("COMMONS_USERNAME", "").strip()
    password = os.environ.get("COMMONS_BOT_PASSWORD", "").strip()
    if not username or not password:
        die("Commons credentials are missing")
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    login_token = get(s, COMMONS_API, {"action": "query", "meta": "tokens", "type": "login"})["query"]["tokens"]["logintoken"]
    auth = post(s, COMMONS_API, {
        "action": "login",
        "lgname": username,
        "lgpassword": password,
        "lgtoken": login_token,
    })
    if auth.get("login", {}).get("result") != "Success":
        die("Commons BotPassword login failed", auth.get("login"))
    info = get(s, COMMONS_API, {"action": "query", "meta": "userinfo", "uiprop": "rights|groups"})["query"]["userinfo"]
    rights = set(info.get("rights", []))
    missing = {"edit", "upload"} - rights
    if missing:
        die("Authenticated Commons account lacks required rights", {"missing": sorted(missing), "groups": info.get("groups", [])})
    csrf = get(s, COMMONS_API, {"action": "query", "meta": "tokens", "type": "csrf"})["query"]["tokens"]["csrftoken"]
    return s, str(info.get("name", "")), rights, csrf


def final_wikitext(webm_url: str, external_links: bool = True) -> str:
    if external_links:
        source = (
            f"* [{INSTAGRAM_URL} انتشار اصلی این ویدئو در اینستاگرام / Original Instagram publication]\n"
            f"* [{SITE_CONTEXT_URL} زمینه و توضیحات در وب‌سایت رسمی / Context on the official website]\n"
            f"* [{webm_url} نسخه WebM در وب‌سایت رسمی / Official-site WebM source]"
        )
        person_kg = f"[https://www.google.com/search?kgmid={PERSON_KGID} {PERSON_KGID}]"
        clinic_kg = f"[https://www.google.com/search?kgmid={CLINIC_KGID} {CLINIC_KGID}]"
    else:
        source = "Instagram Reel DDty1BcujKB; official-site source: ghezelbaash.ir."
        person_kg = f"<code>{PERSON_KGID}</code>"
        clinic_kg = f"<code>{CLINIC_KGID}</code>"

    return f"""{{{{Information
|description=
{{{{fa|'''دکتر سعید قزلباش''' ('''سعید قزلباش'''؛ محمدسعید قزلباش، [[:d:{PERSON_QID}|{PERSON_QID}]]) در این ویدیوی آموزشی فارسی دربارهٔ جالپرو، پروفایلو و تفاوت جوانسازهای تزریقی توضیح می‌دهد.}}}}
{{{{en|'''Saeed Ghezelbash''' (Dr. Saeed Ghezelbash; Mohammad Saeed Ghezelbash, [[:d:{PERSON_QID}|{PERSON_QID}]]) explains Jalupro, Profhilo and injectable skin rejuvenation in this Persian-language educational video.}}}}
|date=2024-12-18
|source={source}
|author=[[:d:{PERSON_QID}|Saeed Ghezelbash / دکتر سعید قزلباش]]
|permission=
|other_versions=
}}}}

== Identity and entity context ==
* '''Physician entity:''' [[:d:{PERSON_QID}|دکتر سعید قزلباش / Saeed Ghezelbash]] — Google Knowledge Graph ID: {person_kg}.
* '''Clinic/local entity:''' [[:d:{CLINIC_QID}|Dr. Saeed Ghezelbash Aesthetic Clinic]] — Google local Knowledge Graph ID: {clinic_kg}.
* Wikidata models [[:d:{PERSON_QID}|{PERSON_QID}]] with '''owner of (P1830)''' and '''work location (P937)''' pointing to [[:d:{CLINIC_QID}|{CLINIC_QID}]]. The physician and clinic are related but distinct entities; the two Google graph IDs are not asserted as equivalent.

== {{{{int:license-header}}}} ==
{{{{Cc-by-4.0}}}}

[[Category:Saeed Ghezelbash]]
[[Category:Aesthetic medicine]]
[[Category:Videos in Persian]]
"""


def file_page(s: requests.Session) -> dict[str, Any] | None:
    data = get(s, COMMONS_API, {
        "action": "query",
        "titles": FILE_TITLE,
        "prop": "imageinfo|revisions|categories",
        "iiprop": "sha1|url|size|mime|mediatype",
        "rvprop": "content",
        "rvslots": "main",
        "cllimit": "max",
    })
    page = data.get("query", {}).get("pages", [{}])[0]
    return None if page.get("missing") else page


def page_text(page: dict[str, Any]) -> str:
    revs = page.get("revisions") or []
    if not revs:
        return ""
    return str(revs[0].get("slots", {}).get("main", {}).get("content", ""))


def upload_binary(s: requests.Session, csrf: str, local_path: Path, local_sha1: str, webm_url: str) -> dict[str, Any]:
    page = file_page(s)
    if page:
        remote_sha1 = str((page.get("imageinfo") or [{}])[0].get("sha1", ""))
        if remote_sha1 != local_sha1:
            die("A Commons file with the target title exists but its binary differs", {"remote": remote_sha1, "local": local_sha1})
        return page

    full = final_wikitext(webm_url, True)
    fallback = final_wikitext(webm_url, False)
    with local_path.open("rb") as f:
        result = post(s, COMMONS_API, {
            "action": "upload",
            "filename": FILE_BASENAME,
            "token": csrf,
            "text": full,
            "comment": "Upload Persian educational video with bilingual physician identity and source provenance",
            "ignorewarnings": 1,
            "assert": "user",
        }, files={"file": (local_path.name, f, "video/webm")}, allow_error=True)
    if "error" in result:
        err = result["error"]
        if err.get("code") != "abusefilter-disallowed" or "external link" not in str(err).lower():
            die("Commons upload failed", err)
        with local_path.open("rb") as f:
            post(s, COMMONS_API, {
                "action": "upload",
                "filename": FILE_BASENAME,
                "token": csrf,
                "text": fallback,
                "comment": "Upload Persian educational video with Wikimedia-linked identity metadata",
                "ignorewarnings": 1,
                "assert": "user",
            }, files={"file": (local_path.name, f, "video/webm")})

    page = file_page(s)
    if not page:
        die("Commons file is missing immediately after upload")
    remote_sha1 = str((page.get("imageinfo") or [{}])[0].get("sha1", ""))
    if remote_sha1 != local_sha1:
        die("Uploaded Commons binary SHA-1 does not match repository file", {"remote": remote_sha1, "local": local_sha1})
    return page


def ensure_final_description(s: requests.Session, csrf: str, page: dict[str, Any], webm_url: str) -> dict[str, Any]:
    desired = final_wikitext(webm_url, True)
    if page_text(page) != desired:
        result = post(s, COMMONS_API, {
            "action": "edit",
            "title": FILE_TITLE,
            "text": desired,
            "token": csrf,
            "summary": "Complete bilingual identity, Instagram provenance and physician–clinic graph context",
            "assert": "user",
        }, allow_error=True)
        if "error" in result:
            die("Commons binary exists but final description edit was rejected", result["error"])
        page = file_page(s)
        if not page:
            die("Commons page disappeared after description edit")
    return page


def mediainfo(s: requests.Session, mid: str) -> dict[str, Any]:
    data = get(s, COMMONS_API, {"action": "wbgetentities", "ids": mid, "props": "labels|claims"})
    entity = data.get("entities", {}).get(mid, {})
    if not entity or entity.get("missing"):
        die("MediaInfo entity is unavailable", mid)
    return entity


def claim_map(entity: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    return entity.get("statements") or entity.get("claims") or {}


def ensure_label(s: requests.Session, csrf: str, mid: str, lang: str, value: str) -> None:
    entity = mediainfo(s, mid)
    if entity.get("labels", {}).get(lang, {}).get("value") == value:
        return
    post(s, COMMONS_API, {
        "action": "wbsetlabel",
        "id": mid,
        "language": lang,
        "value": value,
        "token": csrf,
        "summary": f"Set {lang} structured file caption",
        "assert": "user",
    })


def ensure_item_claim(s: requests.Session, csrf: str, mid: str, prop: str, qid: str) -> str:
    entity = mediainfo(s, mid)
    for claim in claim_map(entity).get(prop, []):
        if qid_from_snak(claim.get("mainsnak", {})) == qid:
            return str(claim["id"])
    result = post(s, COMMONS_API, {
        "action": "wbcreateclaim",
        "entity": mid,
        "property": prop,
        "snaktype": "value",
        "value": item_value(qid),
        "token": csrf,
        "summary": f"Add {prop} structured media metadata",
        "assert": "user",
    })
    return str(result["claim"]["id"])


def ensure_string_claim(s: requests.Session, csrf: str, mid: str, prop: str, value: str) -> str:
    entity = mediainfo(s, mid)
    for claim in claim_map(entity).get(prop, []):
        if scalar_from_snak(claim.get("mainsnak", {})) == value:
            return str(claim["id"])
    result = post(s, COMMONS_API, {
        "action": "wbcreateclaim",
        "entity": mid,
        "property": prop,
        "snaktype": "value",
        "value": string_value(value),
        "token": csrf,
        "summary": f"Add {prop} structured media metadata",
        "assert": "user",
    })
    return str(result["claim"]["id"])


def q_qualifiers(claim: dict[str, Any], prop: str) -> set[str]:
    return {q for q in (qid_from_snak(s) for s in claim.get("qualifiers", {}).get(prop, [])) if q}


def s_qualifiers(claim: dict[str, Any], prop: str) -> set[str]:
    return {v for v in (scalar_from_snak(s) for s in claim.get("qualifiers", {}).get(prop, [])) if isinstance(v, str)}


def add_string_qualifier(s: requests.Session, csrf: str, claim_id: str, prop: str, value: str) -> None:
    post(s, COMMONS_API, {
        "action": "wbsetqualifier",
        "claim": claim_id,
        "property": prop,
        "snaktype": "value",
        "value": string_value(value),
        "token": csrf,
        "summary": f"Add {prop} source qualifier",
        "assert": "user",
    })


def add_item_qualifier(s: requests.Session, csrf: str, claim_id: str, prop: str, qid: str) -> None:
    post(s, COMMONS_API, {
        "action": "wbsetqualifier",
        "claim": claim_id,
        "property": prop,
        "snaktype": "value",
        "value": item_value(qid),
        "token": csrf,
        "summary": f"Add {prop} source qualifier",
        "assert": "user",
    })


def ensure_source(s: requests.Session, csrf: str, mid: str, url: str, operator_qid: str | None = None) -> None:
    entity = mediainfo(s, mid)
    for claim in claim_map(entity).get("P7482", []):
        if qid_from_snak(claim.get("mainsnak", {})) != Q_FILE_AVAILABLE_ON_INTERNET:
            continue
        if url in s_qualifiers(claim, "P973") and (operator_qid is None or operator_qid in q_qualifiers(claim, "P137")):
            return

    result = post(s, COMMONS_API, {
        "action": "wbcreateclaim",
        "entity": mid,
        "property": "P7482",
        "snaktype": "value",
        "value": item_value(Q_FILE_AVAILABLE_ON_INTERNET),
        "token": csrf,
        "summary": "Add distinct source-of-file statement",
        "assert": "user",
    })
    claim_id = str(result["claim"]["id"])
    add_string_qualifier(s, csrf, claim_id, "P973", url)
    if operator_qid:
        add_item_qualifier(s, csrf, claim_id, "P137", operator_qid)


def apply_sdc(s: requests.Session, csrf: str, mid: str, webm_url: str) -> None:
    ensure_label(s, csrf, mid, "fa", "دکتر سعید قزلباش (سعید قزلباش) درباره جالپرو، پروفایلو و جوانسازهای تزریقی توضیح می‌دهد")
    ensure_label(s, csrf, mid, "en", "Dr. Saeed Ghezelbash explains Jalupro, Profhilo and injectable skin rejuvenation in Persian")

    ensure_item_claim(s, csrf, mid, "P180", PERSON_QID)
    ensure_item_claim(s, csrf, mid, "P10894", PERSON_QID)
    ensure_item_claim(s, csrf, mid, "P170", PERSON_QID)
    ensure_item_claim(s, csrf, mid, "P3931", PERSON_QID)
    ensure_item_claim(s, csrf, mid, "P407", Q_PERSIAN)
    ensure_item_claim(s, csrf, mid, "P275", Q_CC_BY_4)
    ensure_item_claim(s, csrf, mid, "P6216", Q_COPYRIGHTED)
    ensure_string_claim(s, csrf, mid, "P1163", "video/webm")

    ensure_source(s, csrf, mid, INSTAGRAM_URL, Q_INSTAGRAM)
    ensure_source(s, csrf, mid, webm_url)
    ensure_source(s, csrf, mid, SITE_CONTEXT_URL)


def verify(s: requests.Session, mid: str, local_sha1: str) -> dict[str, Any]:
    page = file_page(s)
    if not page:
        die("Final Commons page is missing")
    image = (page.get("imageinfo") or [{}])[0]
    if image.get("mime") != "video/webm" or image.get("sha1") != local_sha1:
        die("Final Commons binary verification failed", image)

    text = page_text(page)
    required_text = [
        "دکتر سعید قزلباش",
        "سعید قزلباش",
        PERSON_QID,
        CLINIC_QID,
        PERSON_KGID,
        CLINIC_KGID,
        INSTAGRAM_URL,
        SITE_CONTEXT_URL,
        "owner of (P1830)",
        "work location (P937)",
        "{{Cc-by-4.0}}",
    ]
    missing = [v for v in required_text if v not in text]
    if missing:
        die("Final Commons description is incomplete", missing)

    entity = mediainfo(s, mid)
    claims = claim_map(entity)
    expected = {
        "P180": PERSON_QID,
        "P10894": PERSON_QID,
        "P170": PERSON_QID,
        "P3931": PERSON_QID,
        "P407": Q_PERSIAN,
        "P275": Q_CC_BY_4,
        "P6216": Q_COPYRIGHTED,
    }
    missing_claims: list[str] = []
    for prop, qid in expected.items():
        actual = {qid_from_snak(c.get("mainsnak", {})) for c in claims.get(prop, [])}
        if qid not in actual:
            missing_claims.append(f"{prop}={qid}")
    if "video/webm" not in {scalar_from_snak(c.get("mainsnak", {})) for c in claims.get("P1163", [])}:
        missing_claims.append("P1163=video/webm")
    if missing_claims:
        die("Final Structured Data on Commons is incomplete", missing_claims)

    sources: list[dict[str, Any]] = []
    for c in claims.get("P7482", []):
        if qid_from_snak(c.get("mainsnak", {})) == Q_FILE_AVAILABLE_ON_INTERNET:
            sources.append({"urls": sorted(s_qualifiers(c, "P973")), "operators": sorted(q_qualifiers(c, "P137"))})
    all_urls = {u for source in sources for u in source["urls"]}
    if not {INSTAGRAM_URL, SITE_CONTEXT_URL}.issubset(all_urls):
        die("Final structured provenance does not include Instagram and official-site context", sources)
    if not any(INSTAGRAM_URL in source["urls"] and Q_INSTAGRAM in source["operators"] for source in sources):
        die("Instagram source lacks explicit Instagram operator qualifier", sources)

    categories = {c.get("title") for c in page.get("categories", [])}
    expected_categories = {"Category:Saeed Ghezelbash", "Category:Aesthetic medicine", "Category:Videos in Persian"}
    if not expected_categories.issubset(categories):
        die("Final Commons categories are incomplete", sorted(expected_categories - categories))

    fa = entity.get("labels", {}).get("fa", {}).get("value", "")
    en = entity.get("labels", {}).get("en", {}).get("value", "")
    if "دکتر سعید قزلباش" not in fa or "سعید قزلباش" not in fa or "Saeed Ghezelbash" not in en:
        die("Final multilingual captions do not satisfy identity targets", {"fa": fa, "en": en})

    return {
        "pageid": page.get("pageid"),
        "mediainfo": mid,
        "page_url": COMMONS_PAGE_URL,
        "file_url": image.get("url"),
        "sha1": image.get("sha1"),
        "size": image.get("size"),
        "fa_caption": fa,
        "en_caption": en,
        "structured_sources": sources,
        "person": {"wikidata": PERSON_QID, "google_kgid": PERSON_KGID},
        "clinic": {"wikidata": CLINIC_QID, "google_local_kgid": CLINIC_KGID},
        "verified_person_clinic_edges": ["P1830 owner of", "P937 work location"],
    }


def main() -> None:
    video, local_path, webm_url = load_site_baseline()
    validate_wikidata()
    local_sha1 = file_sha1_base36(local_path)

    s, authenticated_as, rights, csrf = commons_login()
    page = upload_binary(s, csrf, local_path, local_sha1, webm_url)
    page = ensure_final_description(s, csrf, page, webm_url)
    pageid = int(page["pageid"])
    mid = f"M{pageid}"
    apply_sdc(s, csrf, mid, webm_url)
    result = verify(s, mid, local_sha1)

    print(json.dumps({
        "ok": True,
        "authenticated_as": authenticated_as,
        "rights_verified": sorted({"edit", "upload"}.intersection(rights)),
        "canonical_site_video": video.get("name"),
        "instagram_original": INSTAGRAM_URL,
        "commons": result,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
