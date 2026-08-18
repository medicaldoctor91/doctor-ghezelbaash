#!/usr/bin/env python3
import hashlib
import json
import os
import sys
from pathlib import Path

import requests

API_URL = os.environ.get("WIKIVERSITY_API_URL", "https://en.wikiversity.org/w/api.php")
USERNAME = os.environ["WIKIVERSITY_USERNAME"]
PASSWORD = os.environ["WIKIVERSITY_BOT_PASSWORD"]
PAGE_TITLE = os.environ["WIKIJOURNAL_PAGE_TITLE"]
PAGE_FILE = Path(os.environ["WIKIJOURNAL_PAGE_FILE"])
EDIT_SUMMARY = os.environ.get(
    "WIKIJOURNAL_EDIT_SUMMARY",
    "Publish or update an author-controlled WikiJournal preprint",
)
ALLOW_UPDATE = os.environ.get("WIKIJOURNAL_ALLOW_UPDATE", "true").lower() in {"1", "true", "yes", "on"}
EXPECTED_AUTHOR = "Saeed Ghezelbash"
EXPECTED_ORCID = "0009-0001-9346-8475"
EXPECTED_PREFIX = "WikiJournal Preprints/"


def die(message, payload=None):
    out = {"ok": False, "error": message}
    if payload is not None:
        out["details"] = payload
    print(json.dumps(out, ensure_ascii=False, indent=2))
    raise SystemExit(1)


def canonical_text(value):
    return value.replace("\r\n", "\n").rstrip() + "\n"


def sha256_text(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def api_get(session, **params):
    params.setdefault("format", "json")
    params.setdefault("formatversion", "2")
    r = session.get(API_URL, params=params, timeout=45)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        die("MediaWiki GET failed", data["error"])
    return data


def api_post(session, **data):
    data.setdefault("format", "json")
    data.setdefault("formatversion", "2")
    r = session.post(API_URL, data=data, timeout=90)
    r.raise_for_status()
    payload = r.json()
    if "error" in payload:
        die("MediaWiki POST failed", payload["error"])
    return payload


def fetch_page(session):
    data = api_get(
        session,
        action="query",
        titles=PAGE_TITLE,
        prop="info|revisions",
        rvprop="ids|timestamp|sha1|content",
        rvslots="main",
        curtimestamp="1",
    )
    pages = data.get("query", {}).get("pages", [])
    if len(pages) != 1:
        die("Unexpected page lookup", data)
    page = pages[0]
    missing = "missing" in page
    rev = None if missing else (page.get("revisions") or [None])[0]
    if not missing and not rev:
        die("Existing target returned without revision", page)
    content = None
    if rev:
        content = canonical_text(rev.get("slots", {}).get("main", {}).get("content", ""))
    return {
        "missing": missing,
        "pageid": page.get("pageid"),
        "revid": rev.get("revid") if rev else None,
        "timestamp": rev.get("timestamp") if rev else None,
        "sha1": rev.get("sha1") if rev else None,
        "content": content,
        "server_time": data.get("curtimestamp"),
    }


def main():
    if not PAGE_TITLE.startswith(EXPECTED_PREFIX):
        die("Refusing target outside WikiJournal Preprints namespace", {"title": PAGE_TITLE})
    if not PAGE_FILE.is_file():
        die("Manuscript file not found", {"path": str(PAGE_FILE)})

    desired = canonical_text(PAGE_FILE.read_text(encoding="utf-8"))
    required = ["{{Article info", "WikiJournal of Medicine", EXPECTED_AUTHOR, EXPECTED_ORCID, "== References =="]
    missing_markers = [x for x in required if x not in desired]
    if missing_markers:
        die("Manuscript identity/format guard failed", {"missing_markers": missing_markers})
    if len(desired) < 8000:
        die("Refusing unexpectedly short WikiJournal manuscript", {"chars": len(desired)})

    s = requests.Session()
    s.headers.update({"User-Agent": "GhezelbaashWikiJournalPublisher/1.0 (https://www.ghezelbaash.ir/)"})

    login_token = api_get(s, action="query", meta="tokens", type="login")["query"]["tokens"]["logintoken"]
    login = api_post(s, action="login", lgname=USERNAME, lgpassword=PASSWORD, lgtoken=login_token)
    if login.get("login", {}).get("result") != "Success":
        die("MediaWiki login failed", login)

    user = api_get(s, action="query", meta="userinfo", uiprop="groups|rights").get("query", {}).get("userinfo", {})
    if user.get("anon"):
        die("Authenticated session became anonymous", user)

    before = fetch_page(s)
    if before["content"] == desired:
        print(json.dumps({
            "ok": True,
            "noop": True,
            "authenticated_as": user.get("name"),
            "title": PAGE_TITLE,
            "revid": before["revid"],
            "source_sha256": sha256_text(desired),
            "verified_exact_readback": True,
        }, ensure_ascii=False, indent=2))
        return

    if not before["missing"] and not ALLOW_UPDATE:
        die("Target already exists and updates are disabled", {"revid": before["revid"]})

    csrf = api_get(s, action="query", meta="tokens", type="csrf")["query"]["tokens"]["csrftoken"]
    payload = {
        "action": "edit",
        "title": PAGE_TITLE,
        "text": desired,
        "summary": EDIT_SUMMARY,
        "token": csrf,
        "assert": "user",
        "watchlist": "watch",
        "maxlag": "5",
    }
    if before["missing"]:
        payload["createonly"] = "1"
        if before["server_time"]:
            payload["starttimestamp"] = before["server_time"]
    else:
        payload["baserevid"] = str(before["revid"])
        if before["timestamp"]:
            payload["basetimestamp"] = before["timestamp"]
        if before["server_time"]:
            payload["starttimestamp"] = before["server_time"]

    result = api_post(s, **payload)
    edit = result.get("edit", {})
    if edit.get("result") != "Success":
        die("WikiJournal preprint edit failed", result)

    after = fetch_page(s)
    if after["missing"] or after["content"] != desired:
        die("Post-publication exact read-back failed", {
            "expected_sha256": sha256_text(desired),
            "after_revid": after["revid"],
        })
    if edit.get("newrevid") and after["revid"] != edit.get("newrevid"):
        die("Revision drift detected immediately after edit", {
            "edit_newrevid": edit.get("newrevid"),
            "readback_revid": after["revid"],
        })

    print(json.dumps({
        "ok": True,
        "noop": False,
        "authenticated_as": user.get("name"),
        "title": PAGE_TITLE,
        "page_url": "https://en.wikiversity.org/wiki/" + PAGE_TITLE.replace(" ", "_"),
        "created": before["missing"],
        "previous_revid": before["revid"],
        "newrevid": after["revid"],
        "wikimedia_sha1": after["sha1"],
        "source_sha256": sha256_text(desired),
        "verified_exact_readback": True,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
