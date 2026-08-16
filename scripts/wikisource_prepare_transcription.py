#!/usr/bin/env python3
import io
import json
import os
import re

import requests
from pypdf import PdfReader

USERNAME = os.environ["WIKIMEDIA_USERNAME"]
PASSWORD = os.environ["WIKIMEDIA_BOT_PASSWORD"]
UA = "GhezelbaashWikisourcePrepare/1.0 (https://www.ghezelbaash.ir/)"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKISOURCE_API = "https://en.wikisource.org/w/api.php"
FILE_NAME = "Healthcare 2021 9 1169 - Golshani et al.pdf"
INDEX_TITLE = f"Index:{FILE_NAME}"
PDF_URL = "https://europepmc.org/articles/PMC8469763?pdf=render"

FULL_AUTHORS_WS = "Sanobar Golshani; Ali Najafpour; Seyed Sepehr Hashemian; Nasser Goudarzi; Ali Firoozabadi; [[Author:Mohammad Saeed Ghezelbash|Mohammad Saeed Ghezelbash]]; Sara Hookari; Kimia Firoozabadi; Kenneth M. Dürsteler; Annette Beatrix Brühl; Mostafa Alikhani; Dena Sadeghi-Bahmani; Serge Brand"
FULL_AUTHORS_COMMONS = "Sanobar Golshani; Ali Najafpour; Seyed Sepehr Hashemian; Nasser Goudarzi; Ali Firoozabadi; [[d:Q140287622|Mohammad Saeed Ghezelbash]]; Sara Hookari; Kimia Firoozabadi; Kenneth M. Dürsteler; Annette Beatrix Brühl; Mostafa Alikhani; Dena Sadeghi-Bahmani; Serge Brand"


def api_get(s, url, **params):
    params.setdefault("format", "json")
    params.setdefault("formatversion", "2")
    r = s.get(url, params=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(json.dumps(data["error"], ensure_ascii=False))
    return data


def api_post(s, url, data):
    data = dict(data)
    data.setdefault("format", "json")
    data.setdefault("formatversion", "2")
    r = s.post(url, data=data, timeout=90)
    r.raise_for_status()
    payload = r.json()
    if "error" in payload:
        raise RuntimeError(json.dumps(payload["error"], ensure_ascii=False))
    return payload


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
        raise RuntimeError(f"login failed: {result}")
    return s


def csrf(s, url):
    return api_get(s, url, action="query", meta="tokens", type="csrf")["query"]["tokens"]["csrftoken"]


def get_text(s, url, title):
    data = api_get(
        s, url,
        action="query",
        titles=title,
        prop="revisions|info",
        rvprop="ids|timestamp|content|contentmodel",
        rvslots="main",
        curtimestamp=1,
    )
    page = data["query"]["pages"][0]
    if "missing" in page:
        raise RuntimeError(f"required existing page is missing: {title}")
    rev = page["revisions"][0]
    slot = rev["slots"]["main"]
    return page, rev, slot.get("content", ""), slot.get("contentmodel"), data.get("curtimestamp")


def replace_existing_field(s, url, title, field, value, expected_model, summary):
    page, rev, text, model, now = get_text(s, url, title)
    if model != expected_model:
        raise RuntimeError(f"content model mismatch for {title}: {model}")
    pattern = re.compile(rf"(?m)^\|{re.escape(field)}=.*$")
    replacement = f"|{field}={value}"
    if not pattern.search(text):
        raise RuntimeError(f"field {field} not found in existing page {title}; refusing broad rewrite")
    new_text = pattern.sub(replacement, text, count=1)
    if new_text == text:
        return {"changed": False, "pageid": page.get("pageid"), "revid": rev.get("revid")}
    result = api_post(s, url, {
        "action": "edit",
        "title": title,
        "text": new_text,
        "summary": summary,
        "token": csrf(s, url),
        "assert": "user",
        "nocreate": "1",
        "basetimestamp": rev.get("timestamp"),
        "starttimestamp": now,
        "watchlist": "watch",
    })
    edit = result.get("edit", {})
    if edit.get("result") != "Success":
        raise RuntimeError(f"edit failed for {title}: {result}")
    return {"changed": True, "pageid": edit.get("pageid"), "oldrevid": edit.get("oldrevid"), "newrevid": edit.get("newrevid")}


def probe_pdf():
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    r = s.get(PDF_URL, timeout=90)
    r.raise_for_status()
    blob = r.content
    if not blob.startswith(b"%PDF"):
        raise RuntimeError(f"not PDF: {r.headers.get('content-type')} {len(blob)} bytes")
    reader = PdfReader(io.BytesIO(blob))
    pages = []
    for i, p in enumerate(reader.pages, start=1):
        text = p.extract_text() or ""
        compact = re.sub(r"\s+", " ", text).strip()
        pages.append({
            "page": i,
            "chars": len(text),
            "compact_chars": len(compact),
            "prefix": compact[:350],
            "suffix": compact[-250:] if compact else "",
        })
    viable = len(pages) > 0 and sum(x["compact_chars"] for x in pages) > 15000 and sum(1 for x in pages if x["compact_chars"] > 500) >= max(1, len(pages) - 2)
    return {
        "bytes": len(blob),
        "page_count": len(pages),
        "total_compact_chars": sum(x["compact_chars"] for x in pages),
        "text_layer_viable": viable,
        "pages": pages,
    }


def main():
    commons = login(COMMONS_API)
    wikisource = login(WIKISOURCE_API)
    index_fix = replace_existing_field(
        wikisource,
        WIKISOURCE_API,
        INDEX_TITLE,
        "Author",
        FULL_AUTHORS_WS,
        "proofread-index",
        "Correct complete author list and order from the published article/PMC",
    )
    commons_fix = replace_existing_field(
        commons,
        COMMONS_API,
        f"File:{FILE_NAME}",
        "author",
        FULL_AUTHORS_COMMONS,
        "wikitext",
        "Complete author attribution in published order; no new file created",
    )
    probe = probe_pdf()
    # Exact readback of the two edited existing pages.
    _, _, index_text, _, _ = get_text(wikisource, WIKISOURCE_API, INDEX_TITLE)
    _, _, commons_text, _, _ = get_text(commons, COMMONS_API, f"File:{FILE_NAME}")
    print(json.dumps({
        "ok": True,
        "duplicate_policy": "UPDATE_EXISTING_PAGES_ONLY; nocreate=1",
        "index_fix": index_fix,
        "commons_fix": commons_fix,
        "verified_full_author_list": {
            "index": FULL_AUTHORS_WS in index_text,
            "commons": FULL_AUTHORS_COMMONS in commons_text,
        },
        "pdf_probe": probe,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
