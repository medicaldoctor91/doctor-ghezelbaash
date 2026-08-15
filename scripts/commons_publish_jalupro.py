#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import sys
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
CLINIC_NODE = "https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah"
VIDEO_NODE = "https://www.ghezelbaash.ir/#video-jalupro-vs-profhilo"
WEBM_NODE = "https://www.ghezelbaash.ir/#video-jalupro-vs-profhilo-webm-encoding"
SITE_CONTEXT_URL = "https://www.ghezelbaash.ir/#jalupro-vs-profhilo-selection"
INSTAGRAM_URL = "https://www.instagram.com/reel/DDty1BcujKB/"
PERSON_KGID = "/g/11nqdfk76c"
CLINIC_KGID = "/g/11r3rzdtb3"
FILE_BASENAME = "دکتر سعید قزلباش درباره جالپرو و پروفایلو.webm"
FILE_TITLE = f"File:{FILE_BASENAME}"
COMMONS_PAGE_URL = "https://commons.wikimedia.org/wiki/File:" + FILE_BASENAME.replace(" ", "_")

# Structured Data on Commons values.
Q_PERSIAN = "Q9168"
Q_INSTAGRAM = "Q209330"
Q_FILE_AVAILABLE_ON_INTERNET = "Q74228490"
Q_CC_BY_4 = "Q20007257"
Q_COPYRIGHTED = "Q50423863"

USER_AGENT = "Medicaldoctor91CommonsPublisher/1.0 (https://www.ghezelbaash.ir/)"


def fail(message: str, details: Any | None = None) -> None:
    payload: dict[str, Any] = {"ok": False, "error": message}
    if details is not None:
        payload["details"] = details
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    raise SystemExit(1)


def ids(value: Any) -> set[str]:
    if value is None:
        return set()
    values = value if isinstance(value, list) else [value]
    out: set[str] = set()
    for item in values:
        if isinstance(item, dict) and isinstance(item.get("@id"), str):
            out.add(item["@id"])
        elif isinstance(item, str):
            out.add(item)
    return out


def qid_from_snak(snak: dict[str, Any]) -> str | None:
    dv = snak.get("datavalue", {}).get("value")
    if isinstance(dv, dict):
        if isinstance(dv.get("id"), str):
            return dv["id"]
        if isinstance(dv.get("numeric-id"), int):
            return f"Q{dv['numeric-id']}"
    return None


def scalar_from_snak(snak: dict[str, Any]) -> Any:
    return snak.get("datavalue", {}).get("value")


def item_value(qid: str) -> str:
    return json.dumps({"entity-type": "item", "numeric-id": int(qid[1:])}, separators=(",", ":"))


def string_value(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def base36(n: int) -> str:
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    if n == 0:
        return "0"
    out = []
    while n:
        n, rem = divmod(n, 36)
        out.append(chars[rem])
    return "".join(reversed(out))


def local_sha1_base36(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    # MediaWiki imageinfo exposes the SHA-1 in base36, normally padded to 31 chars.
    return base36(int(h.hexdigest(), 16)).rjust(31, "0")


def api_get(session: requests.Session, url: str, params: dict[str, Any]) -> dict[str, Any]:
    params = {**params, "format": "json", "formatversion": 2}
    r = session.get(url, params=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        fail("API GET failed", data["error"])
    return data


def api_post(
    session: requests.Session,
    url: str,
    data: dict[str, Any],
    *,
    files: dict[str, Any] | None = None,
    allow_api_error: bool = False,
) -> dict[str, Any]:
    payload = {**data, "format": "json", "formatversion": 2, "maxlag": 5}
    r = session.post(url, data=payload, files=files, timeout=180)
    r.raise_for_status()
    result = r.json()
    if "error" in result and not allow_api_error:
        fail("API POST failed", result["error"])
    return result


def load_and_validate_site_truth() -> tuple[dict[str, Any], dict[str, Any], Path, str]:
    graph = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    release = json.loads(RELEASE_PATH.read_text(encoding="utf-8"))
    nodes = {n.get("@id"): n for n in graph.get("@graph", []) if isinstance(n, dict) and n.get("@id")}

    video = nodes.get(VIDEO_NODE)
    webm = nodes.get(WEBM_NODE)
    if not video or not webm:
        fail("Required VideoObject/WEBM encoding is missing from canonical site graph")

    expected_name_fragment = "دکتر سعید قزلباش"
    if expected_name_fragment not in str(video.get("name", "")):
        fail("Video name no longer matches the canonical Persian physician identity", video.get("name"))
    if video.get("sameAs") != INSTAGRAM_URL:
        fail("Instagram sameAs conflicts with the expected original Reel", video.get("sameAs"))
    if video.get("duration") != "PT1M2S":
        fail("Video duration conflicts with the audited baseline", video.get("duration"))
    if video.get("inLanguage") not in {"fa-IR", "fa"}:
        fail("Video language conflicts with Persian baseline", video.get("inLanguage"))

    for prop in ("creator", "publisher", "copyrightHolder"):
        if PERSON_NODE not in ids(video.get(prop)):
            fail(f"Canonical VideoObject does not identify Saeed Ghezelbash as {prop}", video.get(prop))

    if webm.get("encodingFormat") != "video/webm":
        fail("Canonical WebM encoding has unexpected MIME type", webm.get("encodingFormat"))
    webm_url = str(webm.get("contentUrl", ""))
    if not webm_url.startswith("https://www.ghezelbaash.ir/media/videos/education/"):
        fail("Canonical WebM URL is outside the expected official-site media namespace", webm_url)

    parsed = urlparse(webm_url)
    file_path = Path("public") / parsed.path.lstrip("/")
    if not file_path.is_file():
        fail("Canonical WebM file is not present in repository checkout", str(file_path))

    if release.get("primaryEntity", {}).get("wikidata") != PERSON_QID:
        fail("release.json person Wikidata ID drifted", release.get("primaryEntity", {}).get("wikidata"))
    if release.get("primaryEntity", {}).get("googleKnowledgeGraphId") != PERSON_KGID:
        fail("release.json person Google KG ID drifted", release.get("primaryEntity", {}).get("googleKnowledgeGraphId"))
    if release.get("identityFingerprint", {}).get("clinic", {}).get("wikidata") != CLINIC_QID:
        fail("release.json clinic Wikidata ID drifted", release.get("identityFingerprint", {}).get("clinic", {}).get("wikidata"))
    if release.get("clinic", {}).get("googleLocalKgmid") != CLINIC_KGID:
        fail("release.json clinic Google local KG ID drifted", release.get("clinic", {}).get("googleLocalKgmid"))

    return graph, video, file_path, webm_url


def wikidata_claim_qids(entity: dict[str, Any], prop: str) -> set[str]:
    out: set[str] = set()
    for claim in entity.get("claims", {}).get(prop, []):
        q = qid_from_snak(claim.get("mainsnak", {}))
        if q:
            out.add(q)
    return out


def wikidata_claim_scalars(entity: dict[str, Any], prop: str) -> set[str]:
    out: set[str] = set()
    for claim in entity.get("claims", {}).get(prop, []):
        val = scalar_from_snak(claim.get("mainsnak", {}))
        if isinstance(val, str):
            out.add(val)
    return out


def validate_wikidata_relationships() -> None:
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    data = api_get(
        s,
        WIKIDATA_API,
        {
            "action": "wbgetentities",
            "ids": f"{PERSON_QID}|{CLINIC_QID}",
            "props": "claims|labels|aliases",
            "languages": "fa|en",
        },
    )
    entities = data.get("entities", {})
    person = entities.get(PERSON_QID, {})
    clinic = entities.get(CLINIC_QID, {})
    if not person or not clinic or person.get("missing") or clinic.get("missing"):
        fail("Wikidata person/clinic entities could not be resolved")

    if PERSON_KGID not in wikidata_claim_scalars(person, "P2671"):
        fail("Wikidata person Google Knowledge Graph ID does not match audited value")
    if CLINIC_KGID not in wikidata_claim_scalars(clinic, "P2671"):
        fail("Wikidata clinic Google local Knowledge Graph ID does not match audited value")
    if CLINIC_QID not in wikidata_claim_qids(person, "P1830"):
        fail("Wikidata no longer models the physician as owner of the clinic (P1830)")
    if CLINIC_QID not in wikidata_claim_qids(person, "P937"):
        fail("Wikidata no longer models the clinic as physician work location (P937)")


def login_commons() -> tuple[requests.Session, str, set[str], str]:
    username = os.environ.get("COMMONS_USERNAME", "").strip()
    password = os.environ.get("COMMONS_BOT_PASSWORD", "").strip()
    if not username or not password:
        fail("Commons credentials are missing from GitHub Actions secrets")

    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    token_data = api_get(session, COMMONS_API, {"action": "query", "meta": "tokens", "type": "login"})
    login_token = token_data["query"]["tokens"]["logintoken"]
    login = api_post(
        session,
        COMMONS_API,
        {
            "action": "login",
            "lgname": username,
            "lgpassword": password,
            "lgtoken": login_token,
        },
    )
    if login.get("login", {}).get("result") != "Success":
        fail("Commons BotPassword login failed", login.get("login"))

    info = api_get(session, COMMONS_API, {"action": "query", "meta": "userinfo", "uiprop": "rights|groups"})["query"]["userinfo"]
    if info.get("anon") is not None:
        fail("Commons session is anonymous after login")
    rights = set(info.get("rights", []))
    required = {"edit", "upload"}
    missing = sorted(required - rights)
    if missing:
        fail("Commons account lacks required rights", {"missing": missing, "groups": info.get("groups", [])})

    csrf = api_get(session, COMMONS_API, {"action": "query", "meta": "tokens", "type": "csrf"})["query"]["tokens"]["csrftoken"]
    return session, info.get("name", ""), rights, csrf


def build_wikitext(webm_url: str, *, external_links: bool = True) -> str:
    person_google = f"https://www.google.com/search?kgmid={PERSON_KGID}"
    clinic_google = f"https://www.google.com/search?kgmid={CLINIC_KGID}"

    if external_links:
        source = (
            f"* [{{{{fullurl:{INSTAGRAM_URL}}}}} Original Instagram publication]" if False else
            f"* [{INSTAGRAM_URL} انتشار اصلی این ویدئو در اینستاگرام / Original Instagram publication]\n"
            f"* [{SITE_CONTEXT_URL} صفحهٔ زمینه و توضیحات در وب‌سایت رسمی / Context on the official website]\n"
            f"* [{webm_url} WebM source on the official website]"
        )
        person_kg = f"[{person_google} {PERSON_KGID}]"
        clinic_kg = f"[{clinic_google} {CLINIC_KGID}]"
    else:
        source = (
            "Original publication: Instagram Reel DDty1BcujKB.\n"
            "Official-site context: ghezelbaash.ir, Jalupro vs Profhilo educational section."
        )
        person_kg = f"<code>{PERSON_KGID}</code>"
        clinic_kg = f"<code>{CLINIC_KGID}</code>"

    return f'''{{{{Information
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
'''


def get_file_info(session: requests.Session) -> dict[str, Any] | None:
    data = api_get(
        session,
        COMMONS_API,
        {
            "action": "query",
            "titles": FILE_TITLE,
            "prop": "info|imageinfo|revisions",
            "iiprop": "sha1|url|size|mime|mediatype",
            "rvprop": "content",
            "rvslots": "main",
        },
    )
    page = data.get("query", {}).get("pages", [{}])[0]
    if page.get("missing"):
        return None
    return page


def current_wikitext(page: dict[str, Any]) -> str:
    revs = page.get("revisions") or []
    if not revs:
        return ""
    slots = revs[0].get("slots", {})
    return str(slots.get("main", {}).get("content", ""))


def upload_or_reuse(
    session: requests.Session,
    csrf: str,
    file_path: Path,
    local_sha1: str,
    final_text: str,
    fallback_text: str,
) -> dict[str, Any]:
    page = get_file_info(session)
    if page is None:
        with file_path.open("rb") as fh:
            result = api_post(
                session,
                COMMONS_API,
                {
                    "action": "upload",
                    "filename": FILE_BASENAME,
                    "token": csrf,
                    "text": final_text,
                    "comment": "Upload Persian-language educational video with factual multilingual metadata and provenance",
                    "ignorewarnings": 1,
                    "assert": "user",
                },
                files={"file": (file_path.name, fh, "video/webm")},
                allow_api_error=True,
            )
        if "error" in result:
            err = result["error"]
            if err.get("code") == "abusefilter-disallowed" and "external link" in str(err).lower():
                with file_path.open("rb") as fh:
                    result = api_post(
                        session,
                        COMMONS_API,
                        {
                            "action": "upload",
                            "filename": FILE_BASENAME,
                            "token": csrf,
                            "text": fallback_text,
                            "comment": "Upload Persian-language educational video; factual Wikimedia-linked metadata",
                            "ignorewarnings": 1,
                            "assert": "user",
                        },
                        files={"file": (file_path.name, fh, "video/webm")},
                    )
            else:
                fail("Commons upload failed", err)
        elif result.get("upload", {}).get("result") not in {"Success", "Warning"}:
            fail("Commons upload returned unexpected result", result)
        page = get_file_info(session)
        if page is None:
            fail("Commons file page is missing immediately after successful upload")

    imageinfo = (page.get("imageinfo") or [{}])[0]
    remote_sha1 = str(imageinfo.get("sha1", ""))
    if remote_sha1 and remote_sha1 != local_sha1:
        fail("Existing Commons file has a different SHA-1; refusing to overwrite", {"remote": remote_sha1, "local": local_sha1})

    # Bring the description page to the final form after the binary exists. This also
    # handles the new-user create-page external-link filter without weakening the final target.
    if current_wikitext(page) != final_text:
        edit = api_post(
            session,
            COMMONS_API,
            {
                "action": "edit",
                "title": FILE_TITLE,
                "text": final_text,
                "token": csrf,
                "summary": "Complete bilingual description, provenance and physician–clinic entity context",
                "assert": "user",
            },
            allow_api_error=True,
        )
        if "error" in edit:
            fail("Binary upload succeeded but final Commons description edit failed", edit["error"])
        page = get_file_info(session)
        if page is None:
            fail("Commons file page disappeared after metadata edit")
    return page


def get_mediainfo(session: requests.Session, entity_id: str) -> dict[str, Any]:
    data = api_get(
        session,
        COMMONS_API,
        {
            "action": "wbgetentities",
            "ids": entity_id,
            "props": "labels|claims",
        },
    )
    entity = data.get("entities", {}).get(entity_id)
    if not entity or entity.get("missing"):
        fail("MediaInfo entity could not be loaded", entity_id)
    return entity


def claims_map(entity: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    return entity.get("statements") or entity.get("claims") or {}


def ensure_label(session: requests.Session, csrf: str, entity_id: str, language: str, value: str) -> None:
    entity = get_mediainfo(session, entity_id)
    current = entity.get("labels", {}).get(language, {}).get("value")
    if current == value:
        return
    api_post(
        session,
        COMMONS_API,
        {
            "action": "wbsetlabel",
            "id": entity_id,
            "language": language,
            "value": value,
            "token": csrf,
            "summary": f"Set {language} file caption",
            "assert": "user",
        },
    )


def ensure_item_claim(session: requests.Session, csrf: str, entity_id: str, prop: str, qid: str) -> str:
    entity = get_mediainfo(session, entity_id)
    for claim in claims_map(entity).get(prop, []):
        if qid_from_snak(claim.get("mainsnak", {})) == qid:
            return claim["id"]
    result = api_post(
        session,
        COMMONS_API,
        {
            "action": "wbcreateclaim",
            "entity": entity_id,
            "property": prop,
            "snaktype": "value",
            "value": item_value(qid),
            "token": csrf,
            "summary": f"Add {prop} structured metadata",
            "assert": "user",
        },
    )
    return result["claim"]["id"]


def ensure_string_claim(session: requests.Session, csrf: str, entity_id: str, prop: str, value: str) -> str:
    entity = get_mediainfo(session, entity_id)
    for claim in claims_map(entity).get(prop, []):
        if scalar_from_snak(claim.get("mainsnak", {})) == value:
            return claim["id"]
    result = api_post(
        session,
        COMMONS_API,
        {
            "action": "wbcreateclaim",
            "entity": entity_id,
            "property": prop,
            "snaktype": "value",
            "value": string_value(value),
            "token": csrf,
            "summary": f"Add {prop} structured metadata",
            "assert": "user",
        },
    )
    return result["claim"]["id"]


def qualifier_values(claim: dict[str, Any], prop: str) -> list[Any]:
    return [scalar_from_snak(s) for s in claim.get("qualifiers", {}).get(prop, [])]


def qualifier_qids(claim: dict[str, Any], prop: str) -> set[str]:
    out: set[str] = set()
    for snak in claim.get("qualifiers", {}).get(prop, []):
        q = qid_from_snak(snak)
        if q:
            out.add(q)
    return out


def set_item_qualifier(session: requests.Session, csrf: str, claim_id: str, prop: str, qid: str) -> None:
    api_post(
        session,
        COMMONS_API,
        {
            "action": "wbsetqualifier",
            "claim": claim_id,
            "property": prop,
            "snaktype": "value",
            "value": item_value(qid),
            "token": csrf,
            "summary": f"Add {prop} provenance qualifier",
            "assert": "user",
        },
    )


def set_string_qualifier(session: requests.Session, csrf: str, claim_id: str, prop: str, value: str) -> None:
    api_post(
        session,
        COMMONS_API,
        {
            "action": "wbsetqualifier",
            "claim": claim_id,
            "property": prop,
            "snaktype": "value",
            "value": string_value(value),
            "token": csrf,
            "summary": f"Add {prop} provenance qualifier",
            "assert": "user",
        },
    )


def ensure_source_claim(
    session: requests.Session,
    csrf: str,
    entity_id: str,
    url: str,
    *,
    operator_qid: str | None = None,
) -> None:
    entity = get_mediainfo(session, entity_id)
    for claim in claims_map(entity).get("P7482", []):
        if qid_from_snak(claim.get("mainsnak", {})) != Q_FILE_AVAILABLE_ON_INTERNET:
            continue
        urls = qualifier_values(claim, "P973")
        operators = qualifier_qids(claim, "P137")
        if url in urls and (operator_qid is None or operator_qid in operators):
            return

    claim_id = ensure_item_claim(session, csrf, entity_id, "P7482", Q_FILE_AVAILABLE_ON_INTERNET)
    # If ensure_item_claim reused a generic P7482 statement, only add the requested URL when absent.
    entity = get_mediainfo(session, entity_id)
    claim = next(c for c in claims_map(entity).get("P7482", []) if c.get("id") == claim_id)
    if url not in qualifier_values(claim, "P973"):
        set_string_qualifier(session, csrf, claim_id, "P973", url)
    if operator_qid and operator_qid not in qualifier_qids(claim, "P137"):
        set_item_qualifier(session, csrf, claim_id, "P137", operator_qid)


def write_structured_data(session: requests.Session, csrf: str, entity_id: str, webm_url: str) -> None:
    ensure_label(
        session,
        csrf,
        entity_id,
        "fa",
        "دکتر سعید قزلباش (سعید قزلباش) درباره جالپرو، پروفایلو و جوانسازهای تزریقی توضیح می‌دهد",
    )
    ensure_label(
        session,
        csrf,
        entity_id,
        "en",
        "Dr. Saeed Ghezelbash explains Jalupro, Profhilo and injectable skin rejuvenation in Persian",
    )

    ensure_item_claim(session, csrf, entity_id, "P180", PERSON_QID)      # depicts
    ensure_item_claim(session, csrf, entity_id, "P10894", PERSON_QID)    # spoken by
    ensure_item_claim(session, csrf, entity_id, "P170", PERSON_QID)      # creator
    ensure_item_claim(session, csrf, entity_id, "P3931", PERSON_QID)     # copyright holder
    ensure_item_claim(session, csrf, entity_id, "P407", Q_PERSIAN)       # language
    ensure_item_claim(session, csrf, entity_id, "P275", Q_CC_BY_4)       # license
    ensure_item_claim(session, csrf, entity_id, "P6216", Q_COPYRIGHTED)  # copyright status
    ensure_item_claim(session, csrf, entity_id, "P1433", Q_INSTAGRAM)    # published in
    ensure_string_claim(session, csrf, entity_id, "P1163", "video/webm")

    ensure_source_claim(session, csrf, entity_id, INSTAGRAM_URL, operator_qid=Q_INSTAGRAM)
    ensure_source_claim(session, csrf, entity_id, webm_url)
    ensure_source_claim(session, csrf, entity_id, SITE_CONTEXT_URL)


def verify_final(session: requests.Session, entity_id: str, local_sha1: str) -> dict[str, Any]:
    page = get_file_info(session)
    if page is None:
        fail("Final verification: Commons file page is missing")
    imageinfo = (page.get("imageinfo") or [{}])[0]
    if imageinfo.get("mime") != "video/webm":
        fail("Final verification: Commons MIME type is not video/webm", imageinfo)
    if imageinfo.get("sha1") != local_sha1:
        fail("Final verification: Commons SHA-1 differs from repository WebM", {"remote": imageinfo.get("sha1"), "local": local_sha1})

    text = current_wikitext(page)
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
    missing_text = [x for x in required_text if x not in text]
    if missing_text:
        fail("Final verification: required identity/provenance text is missing", missing_text)

    entity = get_mediainfo(session, entity_id)
    labels = entity.get("labels", {})
    fa_caption = labels.get("fa", {}).get("value", "")
    en_caption = labels.get("en", {}).get("value", "")
    if "دکتر سعید قزلباش" not in fa_caption or "سعید قزلباش" not in fa_caption:
        fail("Final verification: Persian MediaInfo caption lacks target name variants", fa_caption)
    if "Saeed Ghezelbash" not in en_caption:
        fail("Final verification: English MediaInfo caption lacks physician name", en_caption)

    claims = claims_map(entity)
    expected_items = {
        "P180": PERSON_QID,
        "P10894": PERSON_QID,
        "P170": PERSON_QID,
        "P3931": PERSON_QID,
        "P407": Q_PERSIAN,
        "P275": Q_CC_BY_4,
        "P6216": Q_COPYRIGHTED,
        "P1433": Q_INSTAGRAM,
    }
    missing_claims = []
    for prop, qid in expected_items.items():
        if qid not in {qid_from_snak(c.get("mainsnak", {})) for c in claims.get(prop, [])}:
            missing_claims.append(f"{prop}={qid}")
    if "video/webm" not in {scalar_from_snak(c.get("mainsnak", {})) for c in claims.get("P1163", [])}:
        missing_claims.append("P1163=video/webm")
    if missing_claims:
        fail("Final verification: Structured Data on Commons is incomplete", missing_claims)

    source_urls: set[str] = set()
    instagram_operator_ok = False
    for claim in claims.get("P7482", []):
        if qid_from_snak(claim.get("mainsnak", {})) != Q_FILE_AVAILABLE_ON_INTERNET:
            continue
        urls = {x for x in qualifier_values(claim, "P973") if isinstance(x, str)}
        source_urls |= urls
        if INSTAGRAM_URL in urls and Q_INSTAGRAM in qualifier_qids(claim, "P137"):
            instagram_operator_ok = True
    expected_urls = {INSTAGRAM_URL, SITE_CONTEXT_URL}
    if not expected_urls.issubset(source_urls) or not instagram_operator_ok:
        fail(
            "Final verification: structured source provenance is incomplete",
            {"source_urls": sorted(source_urls), "instagram_operator_ok": instagram_operator_ok},
        )

    cats = api_get(
        session,
        COMMONS_API,
        {"action": "query", "titles": FILE_TITLE, "prop": "categories", "cllimit": "max"},
    ).get("query", {}).get("pages", [{}])[0].get("categories", [])
    category_names = {c.get("title") for c in cats}
    required_categories = {"Category:Saeed Ghezelbash", "Category:Aesthetic medicine", "Category:Videos in Persian"}
    if not required_categories.issubset(category_names):
        fail("Final verification: required Commons categories are missing", sorted(required_categories - category_names))

    return {
        "pageid": page.get("pageid"),
        "mediainfo": entity_id,
        "page_url": COMMONS_PAGE_URL,
        "file_url": imageinfo.get("url"),
        "mime": imageinfo.get("mime"),
        "size": imageinfo.get("size"),
        "sha1": imageinfo.get("sha1"),
        "fa_caption": fa_caption,
        "en_caption": en_caption,
        "verified_claims": expected_items,
        "source_urls": sorted(source_urls),
        "person_google_kgid": PERSON_KGID,
        "clinic_google_kgid": CLINIC_KGID,
        "person_clinic_relation": ["P1830 owner of", "P937 work location"],
    }


def main() -> None:
    _, video, file_path, webm_url = load_and_validate_site_truth()
    validate_wikidata_relationships()

    local_sha1 = local_sha1_base36(file_path)
    final_text = build_wikitext(webm_url, external_links=True)
    fallback_text = build_wikitext(webm_url, external_links=False)

    session, authenticated_as, rights, csrf = login_commons()
    page = upload_or_reuse(session, csrf, file_path, local_sha1, final_text, fallback_text)
    pageid = int(page.get("pageid"))
    entity_id = f"M{pageid}"

    write_structured_data(session, csrf, entity_id, webm_url)
    verified = verify_final(session, entity_id, local_sha1)

    print(
        json.dumps(
            {
                "ok": True,
                "authenticated_as": authenticated_as,
                "rights_checked": sorted({"edit", "upload"}.intersection(rights)),
                "site_video_name": video.get("name"),
                "instagram_original": INSTAGRAM_URL,
                "commons": verified,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
