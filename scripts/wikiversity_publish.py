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
PAGE_TITLE = os.environ["WIKIVERSITY_PAGE_TITLE"]
PAGE_FILE = Path(os.environ["WIKIVERSITY_PAGE_FILE"])
EDIT_SUMMARY = os.environ.get(
    "WIKIVERSITY_EDIT_SUMMARY",
    "Publish or update an educational learning resource with scholarly references and provenance",
)
CREATE_ONLY = os.environ.get("WIKIVERSITY_CREATE_ONLY", "true").lower() in {"1", "true", "yes", "on"}


def die(message, payload=None):
    data = {"ok": False, "error": message}
    if payload is not None:
        data["details"] = payload
    print(json.dumps(data, ensure_ascii=False, indent=2))
    sys.exit(1)


def api_get(session, **params):
    params.setdefault("format", "json")
    params.setdefault("formatversion", "2")
    response = session.get(API_URL, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()
    if "error" in data:
        die("MediaWiki GET failed", data["error"])
    return data


def api_post(session, **data):
    data.setdefault("format", "json")
    data.setdefault("formatversion", "2")
    response = session.post(API_URL, data=data, timeout=60)
    response.raise_for_status()
    result = response.json()
    # AbuseFilter's warning action explicitly allows a constructive action to be
    # submitted again. Confirm once, with the identical payload and same session.
    if result.get("error", {}).get("code") == "abusefilter-warning":
        response = session.post(API_URL, data=data, timeout=60)
        response.raise_for_status()
        result = response.json()
    if "error" in result:
        die("MediaWiki POST failed", result["error"])
    return result


def canonical_text(value):
    return value.replace("\r\n", "\n").rstrip() + "\n"


def source_sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


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
        die("Unexpected page lookup result", data)
    page = pages[0]
    missing = "missing" in page
    revision = None
    content = None
    if not missing:
        revisions = page.get("revisions", [])
        if not revisions:
            die("Existing page returned without a revision", page)
        revision = revisions[0]
        content = revision.get("slots", {}).get("main", {}).get("content", "")
    return {
        "missing": missing,
        "pageid": page.get("pageid"),
        "revid": revision.get("revid") if revision else None,
        "timestamp": revision.get("timestamp") if revision else None,
        "sha1": revision.get("sha1") if revision else None,
        "content": canonical_text(content) if content is not None else None,
        "server_time": data.get("curtimestamp"),
    }


def main():
    if not PAGE_FILE.is_file():
        die(f"Resource file not found: {PAGE_FILE}")

    text = canonical_text(PAGE_FILE.read_text(encoding="utf-8"))
    if len(text) < 1200:
        die("Refusing to publish an unexpectedly small learning resource")
    desired_sha256 = source_sha256(text)

    session = requests.Session()
    session.headers.update({
        "User-Agent": "GhezelbaashWikiversityPublisher/2.1 (https://www.ghezelbaash.ir/)"
    })

    login_token_data = api_get(session, action="query", meta="tokens", type="login")
    try:
        login_token = login_token_data["query"]["tokens"]["logintoken"]
    except KeyError:
        die("Could not obtain MediaWiki login token", login_token_data)

    login_data = api_post(
        session,
        action="login",
        lgname=USERNAME,
        lgpassword=PASSWORD,
        lgtoken=login_token,
    )
    if login_data.get("login", {}).get("result") != "Success":
        die("MediaWiki login failed", login_data)

    userinfo = api_get(session, action="query", meta="userinfo", uiprop="groups|rights")
    user = userinfo.get("query", {}).get("userinfo", {})
    if user.get("anon"):
        die("Authenticated session unexpectedly became anonymous", userinfo)

    before = fetch_page(session)
    if CREATE_ONLY and not before["missing"]:
        die("CREATE_ONLY is enabled but the target page already exists", {"revid": before["revid"]})
    if not CREATE_ONLY and before["missing"]:
        die("Update mode requires the target page to already exist")

    page_url = "https://en.wikiversity.org/wiki/" + PAGE_TITLE.replace(" ", "_")
    if before["content"] == text:
        print(json.dumps({
            "ok": True,
            "noop": True,
            "authenticated_as": user.get("name"),
            "page_title": PAGE_TITLE,
            "page_url": page_url,
            "revid": before["revid"],
            "source_sha256": desired_sha256,
            "verified_exact_readback": True,
        }, ensure_ascii=False, indent=2))
        return

    csrf_data = api_get(session, action="query", meta="tokens", type="csrf")
    try:
        csrf_token = csrf_data["query"]["tokens"]["csrftoken"]
    except KeyError:
        die("Could not obtain CSRF token", csrf_data)

    edit_payload = {
        "action": "edit",
        "title": PAGE_TITLE,
        "text": text,
        "summary": EDIT_SUMMARY,
        "token": csrf_token,
        "assert": "user",
        "watchlist": "watch",
        "maxlag": "5",
    }
    if CREATE_ONLY:
        edit_payload["createonly"] = "1"
    else:
        edit_payload["baserevid"] = str(before["revid"])
        if before["timestamp"]:
            edit_payload["basetimestamp"] = before["timestamp"]
        if before["server_time"]:
            edit_payload["starttimestamp"] = before["server_time"]

    result = api_post(session, **edit_payload)
    edit = result.get("edit", {})
    if edit.get("result") != "Success":
        die("MediaWiki edit failed", result)

    after = fetch_page(session)
    if after["missing"]:
        die("Target page disappeared after successful edit")
    if after["content"] != text:
        die("Post-publication readback does not exactly match repository source", {
            "expected_sha256": desired_sha256,
            "published_revid": after["revid"],
        })
    if edit.get("newrevid") and after["revid"] != edit.get("newrevid"):
        die("Post-publication revision drift detected", {
            "edit_newrevid": edit.get("newrevid"),
            "readback_revid": after["revid"],
        })

    print(json.dumps({
        "ok": True,
        "noop": False,
        "authenticated_as": user.get("name"),
        "page_title": PAGE_TITLE,
        "page_url": page_url,
        "previous_revid": before["revid"],
        "newrevid": after["revid"],
        "wikimedia_sha1": after["sha1"],
        "source_sha256": desired_sha256,
        "verified_exact_readback": True,
        "new": edit.get("new", False),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
