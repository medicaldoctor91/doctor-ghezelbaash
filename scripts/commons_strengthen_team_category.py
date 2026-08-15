#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
from typing import Any

import requests

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
USER_AGENT = "Medicaldoctor91CommonsHardening/1.0 (https://www.ghezelbaash.ir/)"

PERSON_QID = "Q140287622"
CLINIC_QID = "Q140288589"
PERSON_KGID = "/g/11nqdfk76c"
CLINIC_KGID = "/g/11r3rzdtb3"
PERSON_CATEGORY = "Category:Saeed Ghezelbash"
TEAM_FILE = "File:Saeed-Ghezelbaash-with-clinical-team.jpg"
TEAM_MEDIAINFO = "M196320111"
OFFICIAL_MASTER = "https://www.ghezelbaash.ir/media/images/physician/master/saeed-ghezelbaash-with-clinical-team.jpg"
Q_FILE_AVAILABLE_ON_INTERNET = "Q74228490"

CATEGORY_START = "<!-- saeed-ghezelbash-identity-profile:start -->"
CATEGORY_END = "<!-- saeed-ghezelbash-identity-profile:end -->"
FILE_START = "<!-- saeed-ghezelbash-team-entity-context:start -->"
FILE_END = "<!-- saeed-ghezelbash-team-entity-context:end -->"


def die(message: str, details: Any = None) -> None:
    out: dict[str, Any] = {"ok": False, "error": message}
    if details is not None:
        out["details"] = details
    print(json.dumps(out, ensure_ascii=False, indent=2))
    raise SystemExit(1)


def get(session: requests.Session, endpoint: str, params: dict[str, Any]) -> dict[str, Any]:
    r = session.get(endpoint, params={**params, "format": "json", "formatversion": 2}, timeout=60)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        die("MediaWiki GET failed", data["error"])
    return data


def post(session: requests.Session, endpoint: str, data: dict[str, Any], *, allow_error: bool = False) -> dict[str, Any]:
    r = session.post(endpoint, data={**data, "format": "json", "formatversion": 2, "maxlag": 5}, timeout=120)
    r.raise_for_status()
    result = r.json()
    if "error" in result and not allow_error:
        die("MediaWiki POST failed", result["error"])
    return result


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


def entity_qids(entity: dict[str, Any], prop: str) -> set[str]:
    return {
        q for claim in entity.get("claims", {}).get(prop, [])
        if (q := qid_from_snak(claim.get("mainsnak", {})))
    }


def entity_strings(entity: dict[str, Any], prop: str) -> set[str]:
    out: set[str] = set()
    for claim in entity.get("claims", {}).get(prop, []):
        value = scalar_from_snak(claim.get("mainsnak", {}))
        if isinstance(value, str):
            out.add(value)
    return out


def validate_wikidata() -> None:
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    data = get(s, WIKIDATA_API, {
        "action": "wbgetentities",
        "ids": f"{PERSON_QID}|{CLINIC_QID}",
        "props": "claims|labels|aliases|sitelinks",
        "languages": "fa|en",
    })
    entities = data.get("entities", {})
    person = entities.get(PERSON_QID, {})
    clinic = entities.get(CLINIC_QID, {})
    if not person or not clinic or person.get("missing") or clinic.get("missing"):
        die("Required Wikidata entities are missing")

    if PERSON_KGID not in entity_strings(person, "P2671"):
        die("Person Google Knowledge Graph ID drifted")
    if CLINIC_KGID not in entity_strings(clinic, "P2671"):
        die("Clinic Google Knowledge Graph ID drifted")
    if CLINIC_QID not in entity_qids(person, "P1830"):
        die("Person-to-clinic owner of (P1830) edge is missing")
    if CLINIC_QID not in entity_qids(person, "P937"):
        die("Person-to-clinic work location (P937) edge is missing")
    if "Saeed Ghezelbash" not in entity_strings(person, "P373"):
        die("Wikidata Commons category (P373) does not resolve to the person category")
    commons_title = person.get("sitelinks", {}).get("commonswiki", {}).get("title")
    if commons_title != PERSON_CATEGORY:
        die("Wikidata Commons sitelink does not resolve to the person category", commons_title)


def commons_login() -> tuple[requests.Session, str, str]:
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
    if not {"edit", "upload"}.issubset(rights):
        die("Commons account lacks edit/upload rights", {"rights": sorted(rights), "groups": info.get("groups", [])})
    csrf = get(s, COMMONS_API, {"action": "query", "meta": "tokens", "type": "csrf"})["query"]["tokens"]["csrftoken"]
    return s, str(info.get("name", "")), csrf


def fetch_page(session: requests.Session, title: str) -> tuple[str, str]:
    data = get(session, COMMONS_API, {
        "action": "query",
        "prop": "revisions",
        "rvprop": "content|timestamp",
        "rvslots": "main",
        "titles": title,
    })
    pages = data.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"):
        die("Commons page is missing", title)
    rev = pages[0].get("revisions", [{}])[0]
    text = rev.get("slots", {}).get("main", {}).get("content", "")
    timestamp = rev.get("timestamp", "")
    if not isinstance(text, str) or not timestamp:
        die("Could not fetch current page wikitext", title)
    return text, timestamp


def edit_page(session: requests.Session, csrf: str, title: str, text: str, basetimestamp: str, summary: str) -> None:
    result = post(session, COMMONS_API, {
        "action": "edit",
        "title": title,
        "text": text,
        "summary": summary,
        "token": csrf,
        "basetimestamp": basetimestamp,
        "nocreate": 1,
        "assert": "user",
    }, allow_error=True)
    if "error" in result:
        die(f"Commons edit rejected for {title}", result["error"])
    if result.get("edit", {}).get("result") not in {"Success", "Nochange"}:
        die(f"Unexpected Commons edit result for {title}", result.get("edit"))


def replace_managed_block(text: str, start: str, end: str, block: str) -> str:
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end) + r"\s*", re.S)
    text = pattern.sub("", text).lstrip()
    return block.rstrip() + "\n\n" + text


def strengthen_category(session: requests.Session, csrf: str) -> None:
    text, ts = fetch_page(session, PERSON_CATEGORY)
    outside = re.sub(re.escape(CATEGORY_START) + r".*?" + re.escape(CATEGORY_END), "", text, flags=re.S)
    standard_bits: list[str] = []
    if "{{Wikidata Infobox" not in outside:
        standard_bits.append("{{Wikidata Infobox|qid=Q140287622}}")

    standard_bits.extend([
        "{{fa|'''دکتر سعید قزلباش''' ('''سعید قزلباش'''؛ '''محمدسعید قزلباش''')، پزشک و پژوهشگر پزشکی ایرانی فعال در حوزهٔ پزشکی زیبایی در کرمانشاه است. این رده مستقیماً به [[d:Q140287622|Saeed Ghezelbash (Q140287622)]] متصل است؛ شناسهٔ Google Knowledge Graph شخص: <code>/g/11nqdfk76c</code>. کلینیک مرتبط: [[d:Q140288589|Q140288589]] با Google local Knowledge Graph ID <code>/g/11r3rzdtb3</code>.}}",
        "{{en|'''Saeed Ghezelbash''' (also known as '''Mohammad Saeed Ghezelbash'''; Persian: '''دکتر سعید قزلباش''', '''سعید قزلباش''', '''محمدسعید قزلباش''') is an Iranian physician and medical researcher working in aesthetic medicine in Kermanshah. This category is directly connected to [[d:Q140287622|Q140287622]]; Google Knowledge Graph ID: <code>/g/11nqdfk76c</code>. Related clinic: [[d:Q140288589|Q140288589]], Google local Knowledge Graph ID <code>/g/11r3rzdtb3</code>.}}",
        "{{fa|در ویکی‌داده، [[d:Q140287622|شخص]] از طریق [[d:Property:P1830|owner of (P1830)]] و [[d:Property:P937|work location (P937)]] به [[d:Q140288589|کلینیک]] متصل است؛ این دو، انتیتی‌های متمایز اما مرتبط‌اند.}}",
        "{{en|On Wikidata, the [[d:Q140287622|person]] is linked to the [[d:Q140288589|clinic]] through [[d:Property:P1830|owner of (P1830)]] and [[d:Property:P937|work location (P937)]]; they remain distinct but related entities.}}",
    ])
    if "{{DEFAULTSORT:" not in outside and "{{Wikidata Infobox" not in outside:
        standard_bits.append("{{DEFAULTSORT:Ghezelbash, Saeed}}")

    block = CATEGORY_START + "\n" + "\n".join(standard_bits) + "\n" + CATEGORY_END
    new_text = replace_managed_block(text, CATEGORY_START, CATEGORY_END, block)
    edit_page(session, csrf, PERSON_CATEGORY, new_text, ts, "Strengthen multilingual person identity and Wikidata entity context")


def strengthen_team_file(session: requests.Session, csrf: str) -> None:
    text, ts = fetch_page(session, TEAM_FILE)
    block = f"""{FILE_START}
== Entity and provenance context ==
{{{{fa|این تصویر '''دکتر سعید قزلباش''' ('''سعید قزلباش'''؛ '''محمدسعید قزلباش''') را همراه تیم بالینی کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه نشان می‌دهد. شخص: [[d:{PERSON_QID}|{PERSON_QID}]]، Google Knowledge Graph ID: <code>{PERSON_KGID}</code>. کلینیک: [[d:{CLINIC_QID}|{CLINIC_QID}]]، Google local Knowledge Graph ID: <code>{CLINIC_KGID}</code>.}}}}
{{{{en|This photograph depicts '''Saeed Ghezelbash''' (Mohammad Saeed Ghezelbash; Persian: '''دکتر سعید قزلباش''' / '''سعید قزلباش''') with the clinical team of Dr. Saeed Ghezelbash Aesthetic Clinic in Kermanshah. Person: [[d:{PERSON_QID}|{PERSON_QID}]], Google Knowledge Graph ID <code>{PERSON_KGID}</code>. Clinic: [[d:{CLINIC_QID}|{CLINIC_QID}]], Google local Knowledge Graph ID <code>{CLINIC_KGID}</code>.}}}}
* {{{{fa|نسخهٔ مرجع در وب‌سایت رسمی: [{OFFICIAL_MASTER} تصویر اصلی].}}}}
* {{{{en|Official-site master/provenance: [{OFFICIAL_MASTER} original image].}}}}
* [[d:{PERSON_QID}|{PERSON_QID}]] → [[d:Property:P1830|P1830]] / [[d:Property:P937|P937]] → [[d:{CLINIC_QID}|{CLINIC_QID}]].
{FILE_END}"""

    pattern = re.compile(re.escape(FILE_START) + r".*?" + re.escape(FILE_END) + r"\s*", re.S)
    base = pattern.sub("", text)
    if "== Licensing ==" in base:
        base = base.replace("== Licensing ==", block + "\n\n== Licensing ==", 1)
    else:
        base = base.rstrip() + "\n\n" + block + "\n"

    for category in ("Category:Physicians with stethoscopes", "Category:Scrubs"):
        link = f"[[{category}]]"
        if link not in base:
            base = base.rstrip() + "\n" + link + "\n"

    edit_page(session, csrf, TEAM_FILE, base, ts, "Strengthen Persian identity, entity provenance and precise topical categorization")


def mediainfo(session: requests.Session) -> dict[str, Any]:
    return get(session, COMMONS_API, {
        "action": "wbgetentities",
        "ids": TEAM_MEDIAINFO,
        "props": "labels|claims",
    }).get("entities", {}).get(TEAM_MEDIAINFO, {})


def item_value(qid: str) -> str:
    return json.dumps({"entity-type": "item", "numeric-id": int(qid[1:])}, separators=(",", ":"))


def string_value(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def ensure_label(session: requests.Session, csrf: str, lang: str, value: str) -> None:
    current = mediainfo(session).get("labels", {}).get(lang, {}).get("value")
    if current == value:
        return
    result = post(session, COMMONS_API, {
        "action": "wbsetlabel",
        "id": TEAM_MEDIAINFO,
        "language": lang,
        "value": value,
        "token": csrf,
        "summary": "Strengthen multilingual structured caption",
        "assert": "user",
    }, allow_error=True)
    if "error" in result:
        die("Could not update MediaInfo caption", {"lang": lang, "error": result["error"]})


def qualifier_strings(claim: dict[str, Any], prop: str) -> set[str]:
    out: set[str] = set()
    for snak in claim.get("qualifiers", {}).get(prop, []):
        value = scalar_from_snak(snak)
        if isinstance(value, str):
            out.add(value)
    return out


def ensure_official_source(session: requests.Session, csrf: str) -> None:
    entity = mediainfo(session)
    for claim in entity.get("claims", {}).get("P7482", []):
        if qid_from_snak(claim.get("mainsnak", {})) == Q_FILE_AVAILABLE_ON_INTERNET and OFFICIAL_MASTER in qualifier_strings(claim, "P973"):
            return

    created = post(session, COMMONS_API, {
        "action": "wbcreateclaim",
        "entity": TEAM_MEDIAINFO,
        "property": "P7482",
        "snaktype": "value",
        "value": item_value(Q_FILE_AVAILABLE_ON_INTERNET),
        "token": csrf,
        "summary": "Add official-site structured provenance",
        "assert": "user",
    }, allow_error=True)
    if "error" in created:
        die("Could not create structured source statement", created["error"])
    claim = created.get("claim", {})
    claim_id = claim.get("id")
    if not claim_id:
        die("Structured source claim ID missing", created)
    qualified = post(session, COMMONS_API, {
        "action": "wbsetqualifier",
        "claim": claim_id,
        "property": "P973",
        "snaktype": "value",
        "value": string_value(OFFICIAL_MASTER),
        "token": csrf,
        "summary": "Attach official master URL to structured provenance",
        "assert": "user",
    }, allow_error=True)
    if "error" in qualified:
        die("Could not attach official master URL qualifier", qualified["error"])


def verify(session: requests.Session) -> dict[str, Any]:
    cat = get(session, COMMONS_API, {
        "action": "query",
        "prop": "revisions|categories",
        "rvprop": "content",
        "rvslots": "main",
        "cllimit": "max",
        "titles": PERSON_CATEGORY,
    }).get("query", {}).get("pages", [])[0]
    cat_text = cat.get("revisions", [{}])[0].get("slots", {}).get("main", {}).get("content", "")
    required_category_fragments = [
        "{{Wikidata Infobox|qid=Q140287622}}",
        "دکتر سعید قزلباش",
        "سعید قزلباش",
        "محمدسعید قزلباش",
        PERSON_QID,
        PERSON_KGID,
        CLINIC_QID,
        CLINIC_KGID,
        "P1830",
        "P937",
    ]
    missing_cat = [x for x in required_category_fragments if x not in cat_text]
    if missing_cat:
        die("Person category verification failed", missing_cat)

    page = get(session, COMMONS_API, {
        "action": "query",
        "prop": "revisions|categories",
        "rvprop": "content",
        "rvslots": "main",
        "cllimit": "max",
        "titles": TEAM_FILE,
    }).get("query", {}).get("pages", [])[0]
    team_text = page.get("revisions", [{}])[0].get("slots", {}).get("main", {}).get("content", "")
    cats = {c.get("title") for c in page.get("categories", [])}
    required_cats = {"Category:Saeed Ghezelbash", "Category:Physicians with stethoscopes", "Category:Scrubs"}
    if not required_cats.issubset(cats):
        die("Team-photo category verification failed", sorted(required_cats - cats))
    for fragment in ("دکتر سعید قزلباش", "سعید قزلباش", PERSON_KGID, CLINIC_KGID, OFFICIAL_MASTER):
        if fragment not in team_text:
            die("Team-photo visible entity context verification failed", fragment)

    entity = mediainfo(session)
    fa = entity.get("labels", {}).get("fa", {}).get("value", "")
    en = entity.get("labels", {}).get("en", {}).get("value", "")
    if "دکتر سعید قزلباش" not in fa or "سعید قزلباش" not in fa:
        die("Persian MediaInfo caption does not contain target identity forms", fa)
    if "Saeed Ghezelbash" not in en or "Mohammad Saeed Ghezelbash" not in en:
        die("English MediaInfo caption is not identity-complete", en)

    claims = entity.get("claims", {})
    if {PERSON_QID, CLINIC_QID} - entity_qids(entity, "P180"):
        die("Team photo depicts edges are incomplete")
    if PERSON_QID not in entity_qids(entity, "P170"):
        die("Team photo creator edge is missing")
    if CLINIC_QID not in entity_qids(entity, "P1071"):
        die("Team photo location-of-creation clinic edge is missing")
    if PERSON_QID not in entity_qids(entity, "P3931"):
        die("Team photo copyright-holder person edge is missing")
    source_ok = any(
        qid_from_snak(c.get("mainsnak", {})) == Q_FILE_AVAILABLE_ON_INTERNET and OFFICIAL_MASTER in qualifier_strings(c, "P973")
        for c in claims.get("P7482", [])
    )
    if not source_ok:
        die("Official-site structured provenance verification failed")

    return {
        "person_category": PERSON_CATEGORY,
        "team_file": TEAM_FILE,
        "mediainfo": TEAM_MEDIAINFO,
        "fa_caption": fa,
        "en_caption": en,
        "team_categories": sorted(required_cats),
        "person_google_kgid": PERSON_KGID,
        "clinic_google_kgid": CLINIC_KGID,
        "verified_person_clinic_edges": ["P1830 owner of", "P937 work location"],
        "structured_official_source": OFFICIAL_MASTER,
    }


def main() -> None:
    validate_wikidata()
    session, username, csrf = commons_login()
    strengthen_category(session, csrf)
    strengthen_team_file(session, csrf)
    ensure_label(session, csrf, "fa", "دکتر سعید قزلباش (سعید قزلباش) همراه تیم بالینی کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه")
    ensure_label(session, csrf, "en", "Saeed Ghezelbash (Mohammad Saeed Ghezelbash) with the clinical team of Dr. Saeed Ghezelbash Aesthetic Clinic in Kermanshah, Iran")
    ensure_official_source(session, csrf)
    result = verify(session)
    print(json.dumps({"ok": True, "authenticated_as": username, **result}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
