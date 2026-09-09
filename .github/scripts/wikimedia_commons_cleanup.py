#!/usr/bin/env python3
import http.cookiejar
import json
import os
import sys
import urllib.parse
import urllib.request

API = "https://commons.wikimedia.org/w/api.php"
UA = "doctor-ghezelbaash-commons-cleanup/1.1 (authorized maintenance; https://www.ghezelbaash.ir/)"
DEAD = "Q140288589"

EXPECTED_REVISIONS = {
    "Category:Saeed Ghezelbash": 1262478261,
    "Category:Dr. Saeed Ghezelbash Aesthetic Clinic": 1265539847,
    "File:Saeed-Ghezelbaash-with-clinical-team.jpg": 1274558155,
    "File:دکتر سعید قزلباش درباره جالپرو و پروفایلو.webm": 1274558217,
}
EXPECTED_DEAD_COUNTS = {
    "Category:Saeed Ghezelbash": 6,
    "Category:Dr. Saeed Ghezelbash Aesthetic Clinic": 0,
    "File:Saeed-Ghezelbaash-with-clinical-team.jpg": 6,
    "File:دکتر سعید قزلباش درباره جالپرو و پروفایلو.webm": 3,
}
MEDIA_IDS = ["M196320105", "M196320110", "M196320111", "M197490366"]

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def api(params, post=False):
    params = dict(params)
    params.setdefault("format", "json")
    params.setdefault("formatversion", "2")
    params.setdefault("maxlag", "5")
    data = urllib.parse.urlencode(params).encode("utf-8")
    if post:
        req = urllib.request.Request(API, data=data, headers={"User-Agent": UA}, method="POST")
    else:
        req = urllib.request.Request(API + "?" + data.decode("utf-8"), headers={"User-Agent": UA})
    with opener.open(req, timeout=45) as response:
        out = json.load(response)
    if "error" in out:
        raise RuntimeError(json.dumps(out["error"], ensure_ascii=False))
    return out


def authenticate():
    username = os.environ["WIKIMEDIA_USERNAME"]
    password = os.environ["WIKIMEDIA_BOT_PASSWORD"]
    token = api({"action": "query", "meta": "tokens", "type": "login"})["query"]["tokens"]["logintoken"]
    login = api({
        "action": "login",
        "lgname": username,
        "lgpassword": password,
        "lgtoken": token,
    }, True)
    if login.get("login", {}).get("result") != "Success":
        raise SystemExit("COMMONS_AUTH_FAIL")
    info = api({"action": "query", "meta": "userinfo", "uiprop": "rights|blockinfo"})["query"]["userinfo"]
    if info.get("id", 0) == 0 or "anon" in info:
        raise SystemExit("COMMONS_AUTH_FAIL anonymous session")
    if info.get("blockid") or info.get("blockedby"):
        raise SystemExit("COMMONS_AUTH_FAIL account blocked")
    if "edit" not in set(info.get("rights", [])):
        raise SystemExit("COMMONS_AUTH_FAIL missing edit right")
    csrf = api({"action": "query", "meta": "tokens", "type": "csrf"})["query"]["tokens"]["csrftoken"]
    if not csrf or csrf == "+\\":
        raise SystemExit("COMMONS_CSRF_FAIL")
    return csrf


def fetch_pages():
    pages = api({
        "action": "query",
        "prop": "revisions",
        "titles": "|".join(EXPECTED_REVISIONS),
        "rvprop": "ids|timestamp|content",
        "rvslots": "main",
    })["query"]["pages"]
    out = {}
    for page in pages:
        revs = page.get("revisions", [])
        if not revs:
            raise SystemExit(f"COMMONS_PREFLIGHT_FAIL missing revision: {page.get('title')}")
        rev = revs[0]
        out[page["title"]] = {
            "revid": rev["revid"],
            "text": rev.get("slots", {}).get("main", {}).get("content", ""),
        }
    if set(out) != set(EXPECTED_REVISIONS):
        raise SystemExit("COMMONS_PREFLIGHT_FAIL title mismatch")
    return out


def assert_exact_once(text, old, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"COMMONS_PREFLIGHT_FAIL expected exactly one match for {label}, got {count}")
    return text.replace(old, label if False else old, 1)


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"COMMONS_PREFLIGHT_FAIL expected exactly one match for {label}, got {count}")
    return text.replace(old, new, 1)


def build_replacements(before):
    new = {title: item["text"] for title, item in before.items()}

    # Person category: preserve the clinic category and both Google entity IDs,
    # remove only the deleted Wikidata clinic identity and stale relationship prose.
    title = "Category:Saeed Ghezelbash"
    text = new[title]
    text = replace_once(
        text,
        "[[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|کلینیک زیبایی دکتر سعید قزلباش]] ([[d:Q140288589|Q140288589]])",
        "[[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|کلینیک زیبایی دکتر سعید قزلباش]]",
        "person category Persian clinic QID",
    )
    text = replace_once(
        text,
        "[[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|Dr. Saeed Ghezelbash Aesthetic Clinic]] ([[d:Q140288589|Q140288589]])",
        "[[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|Dr. Saeed Ghezelbash Aesthetic Clinic]]",
        "person category English clinic QID",
    )
    text = replace_once(
        text,
        "{{fa|در ویکی‌داده، [[d:Q140287622|شخص]] از طریق [[d:Property:P1830|owner of (P1830)]] و [[d:Property:P937|work location (P937)]] به [[d:Q140288589|کلینیک]] متصل است؛ این دو، انتیتی‌های متمایز اما مرتبط‌اند.}}",
        "{{fa|در ویکی‌داده، [[d:Q140287622|شخص]] رابطهٔ مالکیت، محل کار و وابستگی حرفه‌ای خود با [[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|کلینیک زیبایی دکتر سعید قزلباش]] را ثبت می‌کند؛ شخص و کلینیک دو انتیتی متمایز اما مرتبط‌اند.}}",
        "person category Persian relationship",
    )
    text = replace_once(
        text,
        "{{en|On Wikidata, the [[d:Q140287622|person]] is linked to the [[d:Q140288589|clinic]] through [[d:Property:P1830|owner of (P1830)]] and [[d:Property:P937|work location (P937)]]; they remain distinct but related entities.}}",
        "{{en|On Wikidata, [[d:Q140287622|the person]] records ownership, work-location and professional-affiliation relationships with [[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|Dr. Saeed Ghezelbash Aesthetic Clinic]]; the physician and clinic remain distinct but related entities.}}",
        "person category English relationship",
    )
    new[title] = text

    # Clinic category: the old Wikidata Infobox depended on the deleted clinic item.
    # Replace it with a concise, neutral Commons-native identity description.
    title = "Category:Dr. Saeed Ghezelbash Aesthetic Clinic"
    text = new[title]
    text = replace_once(
        text,
        "{{Wikidata Infobox}}",
        "{{en|'''Dr. Saeed Ghezelbash Aesthetic Clinic''' is an aesthetic clinic in Kermanshah, Iran, associated with physician [[:Category:Saeed Ghezelbash|Saeed Ghezelbash]] ([[d:Q140287622|Q140287622]]). The clinic is a distinct local entity and currently has no active Wikidata item.}}\n{{fa|'''کلینیک زیبایی دکتر سعید قزلباش''' یک کلینیک زیبایی در کرمانشاه، ایران است که با پزشک [[:Category:Saeed Ghezelbash|دکتر سعید قزلباش]] ([[d:Q140287622|Q140287622]]) مرتبط است. کلینیک یک انتیتی محلی مستقل است و در حال حاضر آیتم فعال ویکی‌دیتا ندارد.}}\n\n* {{en|Official website: [https://www.ghezelbaash.ir/ ghezelbaash.ir]}}\n* {{fa|وب‌سایت رسمی: [https://www.ghezelbaash.ir/ ghezelbaash.ir]}}\n* OpenStreetMap: [https://www.openstreetmap.org/node/13530287096 node 13530287096]",
        "clinic category deleted Wikidata Infobox",
    )
    new[title] = text

    # Group photo: remove the unsupported implication that the other people are clinic staff.
    title = "File:Saeed-Ghezelbaash-with-clinical-team.jpg"
    text = new[title]
    text = replace_once(
        text,
        "{{en|1=Dr. Saeed Ghezelbash, an Iranian physician in aesthetic medicine, wearing medical scrubs and a stethoscope with members of his clinical team in Kermanshah, Iran.}}",
        "{{en|1=Dr. Saeed Ghezelbash, an Iranian physician in aesthetic medicine, wearing medical scrubs and a stethoscope with other people at Dr. Saeed Ghezelbash Aesthetic Clinic in Kermanshah, Iran. The other people are not identified here as employees or clinical staff of the clinic.}}",
        "group photo English description",
    )
    text = replace_once(
        text,
        "{{fa|1=دکتر سعید قزلباش، پزشک ایرانی فعال در حوزه پزشکی زیبایی، با لباس پزشکی و گوشی پزشکی، همراه با اعضای تیم بالینی در یک محیط درمانی در کرمانشاه، ایران.}}",
        "{{fa|1=دکتر سعید قزلباش، پزشک ایرانی فعال در حوزه پزشکی زیبایی، با لباس پزشکی و گوشی پزشکی، همراه چند نفر در کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه، ایران. افراد دیگر در این توضیح به‌عنوان کارمند یا عضو کادر بالینی کلینیک معرفی نمی‌شوند.}}",
        "group photo Persian description",
    )
    text = replace_once(
        text,
        "{{fa|این تصویر '''دکتر سعید قزلباش''' ('''سعید قزلباش'''؛ '''محمدسعید قزلباش''') را همراه تیم بالینی کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه نشان می‌دهد. شخص: [[d:Q140287622|Q140287622]]، Google Knowledge Graph ID: <code>/g/11nqdfk76c</code>. کلینیک: [[d:Q140288589|Q140288589]]، Google local Knowledge Graph ID: <code>/g/11r3rzdtb3</code>.}}",
        "{{fa|این تصویر '''دکتر سعید قزلباش''' ('''سعید قزلباش'''؛ '''محمدسعید قزلباش''') را همراه چند نفر در [[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|کلینیک زیبایی دکتر سعید قزلباش]] در کرمانشاه نشان می‌دهد. شخص: [[d:Q140287622|Q140287622]]، Google Knowledge Graph ID: <code>/g/11nqdfk76c</code>. کلینیک: Google local Knowledge Graph ID <code>/g/11r3rzdtb3</code>.}}",
        "group photo Persian entity context",
    )
    text = replace_once(
        text,
        "{{en|This photograph depicts '''Saeed Ghezelbash''' (Mohammad Saeed Ghezelbash; Persian: '''دکتر سعید قزلباش''' / '''سعید قزلباش''') with the clinical team of Dr. Saeed Ghezelbash Aesthetic Clinic in Kermanshah. Person: [[d:Q140287622|Q140287622]], Google Knowledge Graph ID <code>/g/11nqdfk76c</code>. Clinic: [[d:Q140288589|Q140288589]], Google local Knowledge Graph ID <code>/g/11r3rzdtb3</code>.}}",
        "{{en|This photograph depicts '''Saeed Ghezelbash''' (Mohammad Saeed Ghezelbash; Persian: '''دکتر سعید قزلباش''' / '''سعید قزلباش''') with other people at [[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|Dr. Saeed Ghezelbash Aesthetic Clinic]] in Kermanshah. Person: [[d:Q140287622|Q140287622]], Google Knowledge Graph ID <code>/g/11nqdfk76c</code>. Clinic: Google local Knowledge Graph ID <code>/g/11r3rzdtb3</code>. No employment or staff relationship is asserted for the other people in the image.}}",
        "group photo English entity context",
    )
    text = replace_once(
        text,
        "* [[d:Q140287622|Q140287622]] → [[d:Property:P1830|P1830]] / [[d:Property:P937|P937]] → [[d:Q140288589|Q140288589]].",
        "* {{en|Wikidata item [[d:Q140287622|Q140287622]] records the physician's ownership, work-location and professional-affiliation relationships with the clinic without relying on the deleted clinic item.}}",
        "group photo stale relationship line",
    )
    new[title] = text

    # Video: point clinic identity to the live Commons category + Google local entity,
    # not the deleted Wikidata item. Add the clinic category because the current SDC
    # records this clinic as the location of creation.
    title = "File:دکتر سعید قزلباش درباره جالپرو و پروفایلو.webm"
    text = new[title]
    text = replace_once(
        text,
        "* '''Clinic/local entity:''' [[:d:Q140288589|Dr. Saeed Ghezelbash Aesthetic Clinic]] — Google local Knowledge Graph ID: [https://www.google.com/search?kgmid=/g/11r3rzdtb3 /g/11r3rzdtb3].",
        "* '''Clinic/local entity:''' [[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|Dr. Saeed Ghezelbash Aesthetic Clinic]] — Google local Knowledge Graph ID: [https://www.google.com/search?kgmid=/g/11r3rzdtb3 /g/11r3rzdtb3].",
        "video clinic identity",
    )
    text = replace_once(
        text,
        "* Wikidata models [[:d:Q140287622|Q140287622]] with '''owner of (P1830)''' and '''work location (P937)''' pointing to [[:d:Q140288589|Q140288589]]. The physician and clinic are related but distinct entities; the two Google graph IDs are not asserted as equivalent.",
        "* Wikidata item [[:d:Q140287622|Q140287622]] records ownership, work-location and professional-affiliation relationships with the clinic without relying on the deleted clinic item. The physician and clinic remain distinct but related entities; the two Google graph IDs are not asserted as equivalent.",
        "video stale Wikidata relationship",
    )
    if "[[Category:Dr. Saeed Ghezelbash Aesthetic Clinic]]" not in text:
        text = text.rstrip() + "\n[[Category:Dr. Saeed Ghezelbash Aesthetic Clinic]]\n"
    new[title] = text

    for title, text in new.items():
        if DEAD in text:
            raise SystemExit(f"COMMONS_PREFLIGHT_FAIL replacement still contains {DEAD}: {title}")
    return new


def rollback(csrf, before, changed, result):
    errors = []
    for title, current_revid in reversed(changed):
        try:
            out = api({
                "action": "edit",
                "title": title,
                "text": before[title]["text"],
                "token": csrf,
                "baserevid": str(current_revid),
                "summary": "Rollback failed deleted-clinic cleanup transaction",
                "assert": "user",
            }, True)
            edit = out.get("edit", {})
            if edit.get("result") != "Success":
                raise RuntimeError(json.dumps(out, ensure_ascii=False))
            result["rollback"].append({"title": title, "status": "success", "newrevid": edit.get("newrevid")})
            print(f"COMMONS_ROLLBACK_PASS title={title}")
        except Exception as exc:
            errors.append(f"{title}: {exc}")
    return errors


def main():
    csrf = authenticate()
    before = fetch_pages()

    for title, expected in EXPECTED_REVISIONS.items():
        if before[title]["revid"] != expected:
            raise SystemExit(f"COMMONS_PREFLIGHT_FAIL revision drift {title}: {before[title]['revid']} != {expected}")
    for title, expected in EXPECTED_DEAD_COUNTS.items():
        actual = before[title]["text"].count(DEAD)
        if actual != expected:
            raise SystemExit(f"COMMONS_PREFLIGHT_FAIL dead-QID count {title}: {actual} != {expected}")

    entities = api({
        "action": "wbgetentities",
        "ids": "|".join(MEDIA_IDS),
        "props": "claims|labels|descriptions|info",
    })["entities"]
    for mid in MEDIA_IDS:
        if DEAD in json.dumps(entities.get(mid, {}), ensure_ascii=False):
            raise SystemExit(f"COMMONS_PREFLIGHT_FAIL dead QID remains in SDC {mid}")

    replacements = build_replacements(before)
    result = {
        "before": {title: item["revid"] for title, item in before.items()},
        "edits": {},
        "rollback": [],
        "verified": False,
    }
    changed = []

    try:
        for title in EXPECTED_REVISIONS:
            text = replacements[title]
            if text == before[title]["text"]:
                result["edits"][title] = {"status": "noop", "revid": before[title]["revid"]}
                continue
            out = api({
                "action": "edit",
                "title": title,
                "text": text,
                "token": csrf,
                "baserevid": str(before[title]["revid"]),
                "summary": "Remove deleted clinic Wikidata QID while preserving clinic identity and physician relationship",
                "assert": "user",
            }, True)
            edit = out.get("edit", {})
            if edit.get("result") != "Success" or not edit.get("newrevid"):
                raise RuntimeError(f"edit failed {title}: {json.dumps(out, ensure_ascii=False)}")
            changed.append((title, edit["newrevid"]))
            result["edits"][title] = {
                "status": "success",
                "oldrevid": edit.get("oldrevid"),
                "newrevid": edit["newrevid"],
            }
            print(f"COMMONS_EDIT_PASS title={title} newrevid={edit['newrevid']}")

        api({"action": "purge", "titles": "|".join(list(EXPECTED_REVISIONS) + ["Creator:Saeed Ghezelbash"])}, True)

        verify = fetch_pages()
        for title in EXPECTED_REVISIONS:
            if DEAD in verify[title]["text"]:
                raise RuntimeError(f"VERIFY_FAIL dead QID remains in wikitext {title}")
            print(f"WIKITEXT_CLEAN_PASS title={title} revid={verify[title]['revid']}")

        for title in EXPECTED_REVISIONS:
            rendered = api({"action": "parse", "page": title, "prop": "text"})["parse"]["text"]
            if DEAD in rendered:
                raise RuntimeError(f"VERIFY_FAIL rendered dead QID remains {title}")
            print(f"RENDER_CLEAN_PASS title={title}")

        entities2 = api({
            "action": "wbgetentities",
            "ids": "|".join(MEDIA_IDS),
            "props": "claims|labels|descriptions|info",
        })["entities"]
        for mid in MEDIA_IDS:
            if DEAD in json.dumps(entities2.get(mid, {}), ensure_ascii=False):
                raise RuntimeError(f"VERIFY_FAIL dead QID returned to SDC {mid}")
            print(f"SDC_CLEAN_PASS entity={mid}")

        result["verified"] = True
        print("COMMONS_CLEANUP_TRANSACTION_PASS")
    except Exception as exc:
        print(f"COMMONS_TRANSACTION_FAIL {exc}", file=sys.stderr)
        rollback_errors = rollback(csrf, before, changed, result)
        with open("/tmp/commons-cleanup-result.json", "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        if rollback_errors:
            raise SystemExit("ROLLBACK_FAILURE " + " | ".join(rollback_errors))
        raise SystemExit("COMMONS_TRANSACTION_ROLLED_BACK")

    with open("/tmp/commons-cleanup-result.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
