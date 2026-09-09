from __future__ import annotations

import difflib
import hashlib
import json
import os
import time
from dataclasses import dataclass
from typing import Any

import requests

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
DEAD_QID = "Q140288589"
DEFAULT_UA = (
    "GhezelbaashCommonsBot/1.0 "
    "(authorized Commons maintenance; operator User:Medicaldoctor91; https://www.ghezelbaash.ir/)"
)

TARGETS = (
    "Category:Saeed Ghezelbash",
    "Category:Dr. Saeed Ghezelbash Aesthetic Clinic",
    "File:Saeed-Ghezelbaash-with-clinical-team.jpg",
    "File:دکتر سعید قزلباش درباره جالپرو و پروفایلو.webm",
)
MEDIA_IDS = ("M196320105", "M196320110", "M196320111", "M197490366")


class CommonsError(RuntimeError):
    pass


@dataclass(frozen=True)
class PageState:
    title: str
    revid: int
    timestamp: str
    text: str


class CommonsClient:
    def __init__(self, username: str | None = None, password: str | None = None) -> None:
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": os.getenv("COMMONS_USER_AGENT", DEFAULT_UA)})
        self.username = username
        self.password = password
        self.csrf: str | None = None

    def api(self, *, method: str = "GET", **params: Any) -> dict[str, Any]:
        params.setdefault("format", "json")
        params.setdefault("formatversion", "2")
        params.setdefault("maxlag", "5")
        r = self.s.request(method, COMMONS_API, params=params if method == "GET" else None,
                           data=params if method != "GET" else None, timeout=45)
        r.raise_for_status()
        out = r.json()
        if "error" in out:
            raise CommonsError(json.dumps(out["error"], ensure_ascii=False, sort_keys=True))
        return out

    def login(self) -> None:
        if not self.username or not self.password:
            raise CommonsError("Bot credentials are not configured")
        token = self.api(action="query", meta="tokens", type="login")["query"]["tokens"]["logintoken"]
        out = self.api(method="POST", action="login", lgname=self.username,
                       lgpassword=self.password, lgtoken=token)
        if out.get("login", {}).get("result") != "Success":
            raise CommonsError("Commons bot login failed")
        info = self.api(action="query", meta="userinfo", uiprop="rights|groups|blockinfo")["query"]["userinfo"]
        if info.get("id", 0) == 0 or "anon" in info:
            raise CommonsError("Commons session is anonymous after login")
        if info.get("blockid") or info.get("blockedby"):
            raise CommonsError("Authenticated bot account/IP is blocked on Commons")
        if "edit" not in set(info.get("rights", [])):
            raise CommonsError("Authenticated bot account lacks edit right")
        self.csrf = self.api(action="query", meta="tokens", type="csrf")["query"]["tokens"]["csrftoken"]
        if not self.csrf or self.csrf == "+\\":
            raise CommonsError("Could not obtain CSRF token")

    def read_pages(self, titles: tuple[str, ...] = TARGETS) -> dict[str, PageState]:
        pages = self.api(action="query", prop="revisions", titles="|".join(titles),
                         rvprop="ids|timestamp|content", rvslots="main")["query"]["pages"]
        out: dict[str, PageState] = {}
        for page in pages:
            if "missing" in page or not page.get("revisions"):
                raise CommonsError(f"Missing Commons page: {page.get('title')}")
            rev = page["revisions"][0]
            text = rev.get("slots", {}).get("main", {}).get("content", "")
            out[page["title"]] = PageState(page["title"], int(rev["revid"]), rev["timestamp"], text)
        if set(out) != set(titles):
            raise CommonsError("Commons page set did not match expected targets")
        return out

    def read_media(self) -> dict[str, Any]:
        return self.api(action="wbgetentities", ids="|".join(MEDIA_IDS),
                        props="claims|labels|descriptions|info")["entities"]

    def edit_page(self, before: PageState, text: str, summary: str) -> int:
        if self.csrf is None:
            raise CommonsError("edit_page called before login")
        params: dict[str, Any] = {
            "action": "edit",
            "title": before.title,
            "text": text,
            "summary": summary,
            "token": self.csrf,
            "baserevid": before.revid,
            "basetimestamp": before.timestamp,
            "assert": "user",
            "nocreate": "1",
        }
        if os.getenv("COMMONS_USE_BOT_FLAG") == "1":
            params["bot"] = "1"
        result = self.api(method="POST", **params).get("edit", {})
        if result.get("result") != "Success" or not result.get("newrevid"):
            raise CommonsError(f"Commons edit failed for {before.title}")
        return int(result["newrevid"])


def _replace_once(text: str, old: str, new: str, title: str) -> str:
    count = text.count(old)
    if count != 1:
        raise CommonsError(f"Expected exactly one match in {title}; found {count}: {old[:90]!r}")
    return text.replace(old, new, 1)


def transform(title: str, text: str) -> str:
    """Apply a bounded, semantics-preserving cleanup for the retired clinic QID."""
    if title == "Category:Saeed Ghezelbash":
        text = _replace_once(text,
            "کلینیک مرتبط: [[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|کلینیک زیبایی دکتر سعید قزلباش]] ([[d:Q140288589|Q140288589]]) با Google local Knowledge Graph ID <code>/g/11r3rzdtb3</code>.",
            "کلینیک مرتبط: [[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|کلینیک زیبایی دکتر سعید قزلباش]] با Google local Knowledge Graph ID <code>/g/11r3rzdtb3</code>.", title)
        text = _replace_once(text,
            "Related clinic: [[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|Dr. Saeed Ghezelbash Aesthetic Clinic]] ([[d:Q140288589|Q140288589]]), Google local Knowledge Graph ID <code>/g/11r3rzdtb3</code>.",
            "Related clinic: [[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|Dr. Saeed Ghezelbash Aesthetic Clinic]], Google local Knowledge Graph ID <code>/g/11r3rzdtb3</code>.", title)
        text = _replace_once(text,
            "{{fa|در ویکی‌داده، [[d:Q140287622|شخص]] از طریق [[d:Property:P1830|owner of (P1830)]] و [[d:Property:P937|work location (P937)]] به [[d:Q140288589|کلینیک]] متصل است؛ این دو، انتیتی‌های متمایز اما مرتبط‌اند.}}",
            "{{fa|در ویکی‌داده، [[d:Q140287622|شخص]] مالکیت، محل کار و وابستگی حرفه‌ای خود به کلینیک را با نام و شناسه‌های خارجی کلینیک مدل می‌کند؛ شخص و کلینیک دو انتیتی متمایز اما مرتبط‌اند.}}", title)
        text = _replace_once(text,
            "{{en|On Wikidata, the [[d:Q140287622|person]] is linked to the [[d:Q140288589|clinic]] through [[d:Property:P1830|owner of (P1830)]] and [[d:Property:P937|work location (P937)]]; they remain distinct but related entities.}}",
            "{{en|On Wikidata, [[d:Q140287622|the person]] records ownership, work-location and professional-affiliation relationships to the clinic using the clinic name and external identifiers; the physician and clinic remain distinct but related entities.}}", title)

    elif title == "Category:Dr. Saeed Ghezelbash Aesthetic Clinic":
        text = _replace_once(text, "{{Wikidata Infobox}}",
            "{{en|'''Dr. Saeed Ghezelbash Aesthetic Clinic''' is an aesthetic clinic in Kermanshah, Iran, owned by and serving as the clinical workplace of [[:Category:Saeed Ghezelbash|Saeed Ghezelbash]] ([[d:Q140287622|Q140287622]]). The clinic remains a distinct local entity and currently has no active Wikidata item.}}\n{{fa|'''کلینیک زیبایی دکتر سعید قزلباش''' یک کلینیک زیبایی در کرمانشاه، ایران است که مالک آن و پزشک فعال در آن [[:Category:Saeed Ghezelbash|دکتر سعید قزلباش]] ([[d:Q140287622|Q140287622]]) است. کلینیک یک انتیتی محلی متمایز است و در حال حاضر آیتم فعال ویکی‌دیتا ندارد.}}\n\n* {{en|Official website: [https://www.ghezelbaash.ir/ ghezelbaash.ir]}}\n* {{fa|وب‌سایت رسمی: [https://www.ghezelbaash.ir/ ghezelbaash.ir]}}\n* [https://www.openstreetmap.org/node/13530287096 OpenStreetMap node 13530287096]", title)

    elif title == "File:Saeed-Ghezelbaash-with-clinical-team.jpg":
        text = _replace_once(text,
            "{{en|1=Dr. Saeed Ghezelbash, an Iranian physician in aesthetic medicine, wearing medical scrubs and a stethoscope with members of his clinical team in Kermanshah, Iran.}}",
            "{{en|1=Dr. Saeed Ghezelbash, an Iranian physician in aesthetic medicine, wearing medical scrubs and a stethoscope with other people at Dr. Saeed Ghezelbash Aesthetic Clinic in Kermanshah, Iran. The other people are not identified here as employees or clinical staff of the clinic.}}", title)
        text = _replace_once(text,
            "{{fa|1=دکتر سعید قزلباش، پزشک ایرانی فعال در حوزه پزشکی زیبایی، با لباس پزشکی و گوشی پزشکی، همراه با اعضای تیم بالینی در یک محیط درمانی در کرمانشاه، ایران.}}",
            "{{fa|1=دکتر سعید قزلباش، پزشک ایرانی فعال در حوزه پزشکی زیبایی، با لباس پزشکی و گوشی پزشکی، همراه چند نفر در کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه، ایران. افراد دیگر حاضر در تصویر در این توضیح به‌عنوان کارمند یا عضو کادر بالینی کلینیک معرفی نمی‌شوند.}}", title)
        text = _replace_once(text,
            "کلینیک: [[d:Q140288589|Q140288589]]، Google local Knowledge Graph ID: <code>/g/11r3rzdtb3</code>.",
            "کلینیک: [[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|کلینیک زیبایی دکتر سعید قزلباش]]، Google local Knowledge Graph ID: <code>/g/11r3rzdtb3</code>.", title)
        text = _replace_once(text,
            "Clinic: [[d:Q140288589|Q140288589]], Google local Knowledge Graph ID <code>/g/11r3rzdtb3</code>.",
            "Clinic: [[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|Dr. Saeed Ghezelbash Aesthetic Clinic]], Google local Knowledge Graph ID <code>/g/11r3rzdtb3</code>.", title)
        text = _replace_once(text,
            "* [[d:Q140287622|Q140287622]] → [[d:Property:P1830|P1830]] / [[d:Property:P937|P937]] → [[d:Q140288589|Q140288589]].",
            "* {{en|[[d:Q140287622|Q140287622]] records ownership, work-location and professional-affiliation relationships to the clinic using the clinic name and external identifiers.}}", title)

    elif title == "File:دکتر سعید قزلباش درباره جالپرو و پروفایلو.webm":
        text = _replace_once(text,
            "* '''Clinic/local entity:''' [[:d:Q140288589|Dr. Saeed Ghezelbash Aesthetic Clinic]] — Google local Knowledge Graph ID: [https://www.google.com/search?kgmid=/g/11r3rzdtb3 /g/11r3rzdtb3].",
            "* '''Clinic/local entity:''' [[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|Dr. Saeed Ghezelbash Aesthetic Clinic]] — Google local Knowledge Graph ID: [https://www.google.com/search?kgmid=/g/11r3rzdtb3 /g/11r3rzdtb3].", title)
        text = _replace_once(text,
            "* Wikidata models [[:d:Q140287622|Q140287622]] with '''owner of (P1830)''' and '''work location (P937)''' pointing to [[:d:Q140288589|Q140288589]]. The physician and clinic are related but distinct entities; the two Google graph IDs are not asserted as equivalent.",
            "* Wikidata models [[:d:Q140287622|Q140287622]] with '''owner of (P1830)''', '''work location (P937)''' and '''affiliation (P1416)''' relationships to the clinic using its name and external identifiers. The physician and clinic are related but distinct entities; the two Google graph IDs are not asserted as equivalent.", title)
    else:
        raise CommonsError(f"Unsupported target: {title}")

    if DEAD_QID in text:
        raise CommonsError(f"Transformation left retired QID in {title}")
    return text


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _diff(before: str, after: str, title: str) -> str:
    return "".join(difflib.unified_diff(before.splitlines(True), after.splitlines(True),
                                        fromfile=title + " (before)", tofile=title + " (after)"))


def run_deleted_clinic_cleanup(*, dry_run: bool) -> dict[str, Any]:
    client = CommonsClient(os.getenv("COMMONS_BOT_USERNAME"), os.getenv("COMMONS_BOT_PASSWORD"))
    before = client.read_pages()
    media = client.read_media()
    for mid in MEDIA_IDS:
        if DEAD_QID in json.dumps(media.get(mid, {}), ensure_ascii=False):
            raise CommonsError(f"Retired QID is still present in Structured Data: {mid}")

    changes: list[dict[str, Any]] = []
    transformed: dict[str, str] = {}
    for title in TARGETS:
        new_text = transform(title, before[title].text)
        transformed[title] = new_text
        changes.append({"title": title, "old_revid": before[title].revid,
                        "before_sha256": _sha256(before[title].text), "after_sha256": _sha256(new_text),
                        "dead_qid_before": before[title].text.count(DEAD_QID), "dead_qid_after": 0,
                        "changed": new_text != before[title].text, "diff": _diff(before[title].text, new_text, title)})
    if dry_run:
        return {"ok": True, "dry_run": True, "changes": changes, "sdc_clean": True}

    client.login()
    summary = "Remove retired clinic Wikidata QID while preserving the real clinic identity and physician/clinic distinction"
    edited: list[tuple[PageState, int]] = []
    try:
        for title in TARGETS:
            if transformed[title] == before[title].text:
                continue
            newrevid = client.edit_page(before[title], transformed[title], summary)
            edited.append((before[title], newrevid))
            time.sleep(float(os.getenv("COMMONS_EDIT_DELAY_SECONDS", "6")))
        after = client.read_pages()
        for title, state in after.items():
            if DEAD_QID in state.text:
                raise CommonsError(f"Post-write verification found retired QID in {title}")
        media_after = client.read_media()
        for mid in MEDIA_IDS:
            if DEAD_QID in json.dumps(media_after.get(mid, {}), ensure_ascii=False):
                raise CommonsError(f"Post-write verification found retired QID in SDC {mid}")
    except Exception:
        for old, newrevid in reversed(edited):
            try:
                current = client.read_pages((old.title,))[old.title]
                if current.revid == newrevid:
                    client.edit_page(current, old.text, "Rollback failed retired-QID cleanup transaction")
                    time.sleep(float(os.getenv("COMMONS_EDIT_DELAY_SECONDS", "6")))
            except Exception:
                pass
        raise
    return {"ok": True, "dry_run": False, "sdc_clean": True,
            "edited": [{"title": old.title, "old_revid": old.revid, "new_revid": new} for old, new in edited],
            "verified_dead_qid_occurrences": 0}
