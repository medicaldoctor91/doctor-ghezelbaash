#!/usr/bin/env python3
import io
import json
import os
import re
import time

import requests
from pypdf import PdfReader

USERNAME = os.environ["WIKIMEDIA_USERNAME"]
PASSWORD = os.environ["WIKIMEDIA_BOT_PASSWORD"]
UA = "GhezelbaashWikisourceComplete/1.0 (https://www.ghezelbaash.ir/)"

WS_API = "https://en.wikisource.org/w/api.php"
WD_API = "https://www.wikidata.org/w/api.php"
PDF_URL = "https://europepmc.org/articles/PMC8469763?pdf=render"
FILE_NAME = "Healthcare 2021 9 1169 - Golshani et al.pdf"
INDEX_TITLE = f"Index:{FILE_NAME}"
WORK_QID = "Q140298431"
PERSON_QID = "Q140287622"
DOI = "10.3390/HEALTHCARE9091169"
PMID = "34574943"

WORK_TITLE = "Individuals with Major Depressive Disorder Report High Scores of Insecure-Avoidant and Insecure-Anxious Attachment Styles, Dissociative Identity Symptoms, and Adult Traumatic Events"
AUTHOR_TITLE = "Author:Mohammad Saeed Ghezelbash"

FULL_AUTHORS = [
    "Sanobar Golshani",
    "Ali Najafpour",
    "Seyed Sepehr Hashemian",
    "Nasser Goudarzi",
    "Ali Firoozabadi",
    "Mohammad Saeed Ghezelbash",
    "Sara Hookari",
    "Kimia Firoozabadi",
    "Kenneth M. Dürsteler",
    "Annette Beatrix Brühl",
    "Mostafa Alikhani",
    "Dena Sadeghi-Bahmani",
    "Serge Brand",
]


def fail(msg, details=None):
    out = {"ok": False, "error": msg}
    if details is not None:
        out["details"] = details
    print(json.dumps(out, ensure_ascii=False, indent=2))
    raise SystemExit(1)


def api_get(s, url, **params):
    params.setdefault("format", "json")
    params.setdefault("formatversion", 2)
    r = s.get(url, params=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        fail("MediaWiki GET error", data["error"])
    return data


def api_post(s, url, data):
    payload_data = dict(data)
    payload_data.setdefault("format", "json")
    payload_data.setdefault("formatversion", 2)
    backoffs = [20, 35, 60, 90]
    for attempt in range(len(backoffs) + 1):
        response = s.post(url, data=payload_data, timeout=120)
        response.raise_for_status()
        payload = response.json()
        error = payload.get("error")
        if not error:
            return payload
        if error.get("code") != "ratelimited" or attempt >= len(backoffs):
            fail("MediaWiki POST error", error)
        delay = backoffs[attempt]
        print(json.dumps({
            "status": "rate_limited_backoff",
            "attempt": attempt + 1,
            "delay_seconds": delay,
            "api": url,
        }))
        time.sleep(delay)
    fail("MediaWiki POST retries exhausted")


def login(url):
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    token = api_get(s, url, action="query", meta="tokens", type="login")["query"]["tokens"]["logintoken"]
    result = api_post(s, url, {
        "action": "login",
        "lgname": USERNAME,
        "lgpassword": PASSWORD,
        "lgtoken": token,
    })
    if result.get("login", {}).get("result") != "Success":
        fail("Login failed", {"url": url, "result": result})
    info = api_get(s, url, action="query", meta="userinfo", uiprop="groups|rights")["query"]["userinfo"]
    if info.get("anon"):
        fail("Session is anonymous after login", {"url": url})
    return s, info


def csrf(s, url):
    return api_get(s, url, action="query", meta="tokens", type="csrf")["query"]["tokens"]["csrftoken"]


def page_lookup(s, title):
    data = api_get(
        s, WS_API,
        action="query",
        titles=title,
        prop="info|revisions|pageprops",
        rvprop="ids|timestamp|sha1|content|contentmodel",
        rvslots="main",
        curtimestamp=1,
    )
    page = data["query"]["pages"][0]
    rev = (page.get("revisions") or [{}])[0]
    slot = rev.get("slots", {}).get("main", {})
    return {
        "title": page.get("title"),
        "missing": "missing" in page,
        "pageid": page.get("pageid"),
        "revid": rev.get("revid"),
        "timestamp": rev.get("timestamp"),
        "sha1": rev.get("sha1"),
        "contentmodel": slot.get("contentmodel"),
        "content": slot.get("content", ""),
        "wikibase_item": page.get("pageprops", {}).get("wikibase_item"),
        "server_time": data.get("curtimestamp"),
    }


def wd_entity(s, qid):
    data = api_get(s, WD_API, action="wbgetentities", ids=qid, props="labels|claims|sitelinks", languages="en")
    e = data.get("entities", {}).get(qid)
    if not e or e.get("missing") is not None:
        fail("Existing Wikidata item missing; refusing all writes", {"qid": qid})
    return e


def claim_values(entity, pid):
    out = []
    for claim in entity.get("claims", {}).get(pid, []):
        try:
            out.append(claim["mainsnak"]["datavalue"]["value"])
        except Exception:
            pass
    return out


def identity_guard(wd):
    work = wd_entity(wd, WORK_QID)
    person = wd_entity(wd, PERSON_QID)
    dois = [str(x).upper() for x in claim_values(work, "P356")]
    pmids = [str(x) for x in claim_values(work, "P698")]
    authors = [x.get("id") for x in claim_values(work, "P50") if isinstance(x, dict)]
    if DOI.upper() not in dois or PMID not in pmids or PERSON_QID not in authors:
        fail("Existing work identity guard failed", {"doi": dois, "pmid": pmids, "authors": authors})
    if work.get("sitelinks", {}).get("enwikisource") and work["sitelinks"]["enwikisource"].get("title") != WORK_TITLE:
        fail("Work already has a different English Wikisource sitelink", work["sitelinks"]["enwikisource"])
    if person.get("sitelinks", {}).get("enwikisource") and person["sitelinks"]["enwikisource"].get("title") != AUTHOR_TITLE:
        fail("Person already has a different English Wikisource sitelink", person["sitelinks"]["enwikisource"])
    return work, person


def download_pages():
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    r = s.get(PDF_URL, timeout=90)
    r.raise_for_status()
    blob = r.content
    if not blob.startswith(b"%PDF"):
        fail("Authoritative source is not a PDF", {"bytes": len(blob), "content_type": r.headers.get("content-type")})
    reader = PdfReader(io.BytesIO(blob))
    if len(reader.pages) != 13:
        fail("PDF page count changed; refusing automated transcription", {"expected": 13, "actual": len(reader.pages)})
    texts = []
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if len(re.sub(r"\s+", "", text)) < 500:
            fail("Text layer too sparse; refusing page creation", {"page": i, "chars": len(text)})
        texts.append(text)
    return texts


def clean_transcription(text, page_number):
    # Keep the source text substantially intact. Only normalize Unicode ligatures,
    # line endings, and obvious repeated running-page metadata. Pages remain quality=1.
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("ﬁ", "fi").replace("ﬂ", "fl").replace("ﬀ", "ff").replace("ﬃ", "ffi").replace("ﬄ", "ffl")
    lines = [ln.rstrip() for ln in text.split("\n")]
    cleaned = []
    running = re.compile(rf"^Healthcare\s+2021,\s*9,\s*1169\s+{page_number}\s+of\s+13\s*$", re.I)
    for line in lines:
        if running.match(line.strip()):
            continue
        cleaned.append(line)
    # Collapse excessive blank lines, but do not rewrite wording or tables.
    out = []
    blank = False
    for line in cleaned:
        if not line.strip():
            if not blank:
                out.append("")
            blank = True
        else:
            out.append(line)
            blank = False
    body = "\n".join(out).strip()
    return body


def create_page_only(ws, title, text, summary):
    state = page_lookup(ws, title)
    if not state["missing"]:
        return {"created": False, "existing": True, "pageid": state["pageid"], "revid": state["revid"], "contentmodel": state["contentmodel"]}
    result = api_post(ws, WS_API, {
        "action": "edit",
        "title": title,
        "text": text,
        "summary": summary,
        "token": csrf(ws, WS_API),
        "assert": "user",
        "createonly": 1,
        "watchlist": "watch",
        "starttimestamp": state["server_time"],
    })
    edit = result.get("edit", {})
    if edit.get("result") != "Success":
        fail("Create-only edit did not succeed", {"title": title, "result": result})
    after = page_lookup(ws, title)
    if after["missing"]:
        fail("Page missing after successful create", {"title": title})
    return {"created": True, "existing": False, "pageid": after["pageid"], "revid": after["revid"], "contentmodel": after["contentmodel"]}


def create_proofread_pages(ws, texts):
    results = []
    for i, raw in enumerate(texts, start=1):
        title = f"Page:{FILE_NAME}/{i}"
        body = clean_transcription(raw, i)
        source = f'<noinclude><pagequality level="1" user="{USERNAME}" /></noinclude>{body}<noinclude></noinclude>'
        result = create_page_only(
            ws, title, source,
            f"Initial text-layer transcription from the CC BY 4.0 source scan; page {i}/13; marked Not proofread",
        )
        state = page_lookup(ws, title)
        if state["contentmodel"] != "proofread-page":
            fail("Unexpected content model for Page namespace", {"title": title, "contentmodel": state["contentmodel"]})
        results.append({"page": i, **result, "chars": len(body)})
        time.sleep(8.5 if result.get("created") else 0.2)
    return results


def work_page_text():
    author_display = "; ".join(
        f"[[{AUTHOR_TITLE}|{name}]]" if name == "Mohammad Saeed Ghezelbash" else name
        for name in FULL_AUTHORS
    )
    return f'''{{{{header
 | title      = {WORK_TITLE}
 | author     = {author_display}
 | translator =
 | section    =
 | previous   =
 | next       =
 | year       = 2021
 | notes      = Peer-reviewed open-access research article originally published in ''Healthcare'', volume 9, issue 9, article 1169. DOI: 10.3390/healthcare9091169. PMID: 34574943.
}}}}
<pages index="{FILE_NAME}" from=1 to=13 />
{{{{Authority control}}}}
{{{{CC-BY-4.0}}}}
'''


def author_page_text():
    return f'''{{{{author
 | firstname    = Mohammad Saeed
 | lastname     = Ghezelbash
 | last_initial = Gh
 | birthyear    =
 | deathyear    =
 | description  = Iranian physician and medical researcher
}}}}

==Works==
* ''[[{WORK_TITLE}]]'' (September 6, 2021)

{{{{license container begin}}}}
{{{{Copyright author}}}}
{{{{CC-BY-4.0}}}}
{{{{license container end}}}}
{{{{Authority control}}}}
'''


def set_sitelink_if_absent(wd, qid, title):
    entity = wd_entity(wd, qid)
    current = entity.get("sitelinks", {}).get("enwikisource")
    if current:
        if current.get("title") == title:
            return {"created": False, "existing": True, "title": title}
        fail("Refusing to overwrite existing English Wikisource sitelink", {"qid": qid, "current": current, "requested": title})
    ws_state = None
    # Cross-wiki page existence is validated by caller. Only set the sitelink on the existing QID.
    result = api_post(wd, WD_API, {
        "action": "wbsetsitelink",
        "id": qid,
        "linksite": "enwikisource",
        "linktitle": title,
        "summary": f"Link existing item to its English Wikisource page: {title}",
        "token": csrf(wd, WD_API),
        "assert": "user",
        "bot": 1,
    })
    if not result.get("entity"):
        fail("wbsetsitelink did not return an entity", {"qid": qid, "result": result})
    after = wd_entity(wd, qid).get("sitelinks", {}).get("enwikisource")
    if not after or after.get("title") != title:
        fail("Sitelink readback mismatch", {"qid": qid, "expected": title, "actual": after})
    return {"created": True, "existing": False, "title": title}


def update_index(ws):
    state = page_lookup(ws, INDEX_TITLE)
    if state["missing"] or state["contentmodel"] != "proofread-index":
        fail("Required existing Index missing or wrong model", state)
    text = state["content"]
    linked_title = f"|Title=''[[{WORK_TITLE}]]''"
    if re.search(r"(?m)^\|Title=.*$", text):
        text = re.sub(r"(?m)^\|Title=.*$", linked_title, text, count=1)
    else:
        fail("Index Title field missing; refusing broad rewrite")
    if re.search(r"(?m)^\|Transclusion=.*$", text):
        text = re.sub(r"(?m)^\|Transclusion=.*$", "|Transclusion=yes", text, count=1)
    else:
        fail("Index Transclusion field missing; refusing broad rewrite")
    # Keep Progress=C (To be proofread) because all generated Page pages are quality level 1.
    if not re.search(r"(?m)^\|Progress=C\s*$", text):
        fail("Index progress is not C/To be proofread; refusing to alter quality semantics", {"current_excerpt": state["content"][:1500]})
    if text == state["content"]:
        return {"changed": False, "revid": state["revid"]}
    result = api_post(ws, WS_API, {
        "action": "edit",
        "title": INDEX_TITLE,
        "text": text,
        "summary": "Link mainspace work and mark Index transcluded; transcription remains Not proofread",
        "token": csrf(ws, WS_API),
        "assert": "user",
        "nocreate": 1,
        "basetimestamp": state["timestamp"],
        "starttimestamp": state["server_time"],
        "watchlist": "watch",
    })
    edit = result.get("edit", {})
    if edit.get("result") != "Success":
        fail("Index update failed", result)
    return {"changed": True, "oldrevid": edit.get("oldrevid"), "newrevid": edit.get("newrevid")}


def verify_no_variant_duplicate(ws):
    # Exact canonical pages must be absent or be the same pages on retry. Search plausible author variants.
    data = api_get(ws, WS_API, action="query", list="search", srsearch="Ghezelbash", srlimit=50, srprop="")
    hits = [{"title": x.get("title"), "pageid": x.get("pageid")} for x in data.get("query", {}).get("search", [])]
    author_like = [h for h in hits if h["title"].startswith("Author:") and h["title"] != AUTHOR_TITLE]
    if author_like:
        fail("Potential duplicate Author page detected; refusing canonical Author creation", author_like)
    return hits


def main():
    ws, ws_user = login(WS_API)
    wd, wd_user = login(WD_API)

    identity_guard(wd)
    index = page_lookup(ws, INDEX_TITLE)
    if index["missing"] or index["contentmodel"] != "proofread-index":
        fail("Existing Index guard failed", index)
    verify_no_variant_duplicate(ws)

    texts = download_pages()
    page_results = create_proofread_pages(ws, texts)

    # All 13 canonical Page: titles must now exist before mainspace work can be created.
    missing_pages = []
    for i in range(1, 14):
        st = page_lookup(ws, f"Page:{FILE_NAME}/{i}")
        if st["missing"]:
            missing_pages.append(i)
    if missing_pages:
        fail("Refusing mainspace creation because Page transcription is incomplete", missing_pages)

    work_state_before = page_lookup(ws, WORK_TITLE)
    if not work_state_before["missing"] and work_state_before.get("wikibase_item") not in (None, WORK_QID):
        fail("Mainspace title is already attached to another Wikidata item", work_state_before)
    work_result = create_page_only(
        ws, WORK_TITLE, work_page_text(),
        "Create scan-backed mainspace transclusion of the CC BY 4.0 peer-reviewed article",
    )
    work_state = page_lookup(ws, WORK_TITLE)
    if work_state["missing"]:
        fail("Mainspace work missing after create/readback")
    work_sitelink = set_sitelink_if_absent(wd, WORK_QID, WORK_TITLE)

    # Only after a live hosted work and its existing-work sitelink exist do we create the author page.
    author_state_before = page_lookup(ws, AUTHOR_TITLE)
    if not author_state_before["missing"] and author_state_before.get("wikibase_item") not in (None, PERSON_QID):
        fail("Canonical Author title is already attached to another Wikidata item", author_state_before)
    author_result = create_page_only(
        ws, AUTHOR_TITLE, author_page_text(),
        "Create author page for a living researcher with a hosted CC BY 4.0 work",
    )
    author_state = page_lookup(ws, AUTHOR_TITLE)
    if author_state["missing"]:
        fail("Author page missing after create/readback")
    person_sitelink = set_sitelink_if_absent(wd, PERSON_QID, AUTHOR_TITLE)

    index_result = update_index(ws)

    # Final hard readback.
    final_work = page_lookup(ws, WORK_TITLE)
    final_author = page_lookup(ws, AUTHOR_TITLE)
    final_index = page_lookup(ws, INDEX_TITLE)
    final_work_q = wd_entity(wd, WORK_QID)
    final_person_q = wd_entity(wd, PERSON_QID)
    if final_work.get("wikibase_item") not in (WORK_QID, None):
        fail("Unexpected work page Wikibase link on final readback", final_work)
    if final_author.get("wikibase_item") not in (PERSON_QID, None):
        fail("Unexpected author page Wikibase link on final readback", final_author)

    print(json.dumps({
        "ok": True,
        "duplicate_policy": "NO_NEW_WIKIDATA_ITEMS; CREATEONLY_CANONICAL_WIKISOURCE_PAGES; NEVER_OVERWRITE_DIFFERENT_SITELINKS",
        "authenticated_as": {"wikisource": ws_user.get("name"), "wikidata": wd_user.get("name")},
        "proofread_pages": page_results,
        "mainspace": {
            **work_result,
            "title": WORK_TITLE,
            "url": "https://en.wikisource.org/wiki/" + requests.utils.quote(WORK_TITLE.replace(" ", "_"), safe="_-/()"),
            "wikibase_item": final_work.get("wikibase_item"),
        },
        "author": {
            **author_result,
            "title": AUTHOR_TITLE,
            "url": "https://en.wikisource.org/wiki/" + requests.utils.quote(AUTHOR_TITLE.replace(" ", "_"), safe="_-/()"),
            "wikibase_item": final_author.get("wikibase_item"),
        },
        "sitelinks": {
            WORK_QID: work_sitelink,
            PERSON_QID: person_sitelink,
        },
        "index": {
            **index_result,
            "title": INDEX_TITLE,
            "progress_still_C": bool(re.search(r"(?m)^\|Progress=C\s*$", final_index["content"])),
            "transclusion_yes": bool(re.search(r"(?m)^\|Transclusion=yes\s*$", final_index["content"])),
        },
        "final_wikidata": {
            WORK_QID: final_work_q.get("sitelinks", {}).get("enwikisource"),
            PERSON_QID: final_person_q.get("sitelinks", {}).get("enwikisource"),
        },
    }, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
