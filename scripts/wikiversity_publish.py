#!/usr/bin/env python3
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
    "Create educational learning resource with scholarly references and provenance",
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
    return response.json()


def api_post(session, **data):
    data.setdefault("format", "json")
    data.setdefault("formatversion", "2")
    response = session.post(API_URL, data=data, timeout=60)
    response.raise_for_status()
    return response.json()


def main():
    if not PAGE_FILE.is_file():
        die(f"Resource file not found: {PAGE_FILE}")

    text = PAGE_FILE.read_text(encoding="utf-8").strip() + "\n"
    if len(text) < 500:
        die("Refusing to publish an unexpectedly small resource")

    session = requests.Session()
    session.headers.update({
        "User-Agent": "GhezelbaashWikiversityPublisher/1.0 (https://www.ghezelbaash.ir/)"
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
    }
    if CREATE_ONLY:
        edit_payload["createonly"] = "1"

    result = api_post(session, **edit_payload)
    edit = result.get("edit", {})
    if edit.get("result") != "Success":
        die("MediaWiki edit failed", result)

    page_url = "https://en.wikiversity.org/wiki/" + PAGE_TITLE.replace(" ", "_")
    print(json.dumps({
        "ok": True,
        "authenticated_as": user.get("name"),
        "page_title": PAGE_TITLE,
        "page_url": page_url,
        "newrevid": edit.get("newrevid"),
        "new": edit.get("new", False),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
