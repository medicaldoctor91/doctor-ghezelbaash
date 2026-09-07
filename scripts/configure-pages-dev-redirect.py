#!/usr/bin/env python3
"""Ensure one exact Cloudflare Pages root URL redirects to the canonical site."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

API_BASE = "https://api.cloudflare.com/client/v4"
ROOT = Path(__file__).resolve().parents[1]
PLATFORM = json.loads(
    (ROOT / ".release" / "policy" / "platform-contract.json").read_text(encoding="utf-8")
)
ACCOUNT_ID = str(PLATFORM["cloudflare"]["accountId"])
PROJECT = str(PLATFORM["cloudflare"]["pagesProject"])
SOURCE_URL = f"https://{PROJECT}.pages.dev/"
TARGET_URL = str(PLATFORM["canonicalUrl"])
LIST_NAME = "ghezelbaash_pages_dev_root"
LIST_DESCRIPTION = "Exact Pages project root URL canonical redirect"
RULE_REF = "ghezelbaash_pages_dev_root_v1"
PHASE = "http_request_redirect"


class Api:
    def __init__(self, token: str) -> None:
        self.token = token

    def request(
        self,
        method: str,
        path: str,
        body: Any | None = None,
        ok: tuple[int, ...] = (200,),
    ) -> dict[str, Any]:
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            API_BASE + path,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "ghezelbaash-pages-dev-root-redirect/1.0",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                payload = json.loads(response.read().decode("utf-8") or "{}")
                status = response.status
        except urllib.error.HTTPError as exc:
            status = exc.code
            raw = exc.read().decode("utf-8", "replace")
            payload = json.loads(raw or "{}")
        if status not in ok or payload.get("success") is not True:
            raise RuntimeError(
                f"Cloudflare {method} {path} HTTP {status}: "
                f"{json.dumps(payload.get('errors') or [], ensure_ascii=False)}"
            )
        return payload


def normalized_item(row: dict[str, Any]) -> dict[str, Any]:
    redirect = row.get("redirect") or {}
    return {
        "redirect": {
            "source_url": redirect.get("source_url"),
            "target_url": redirect.get("target_url"),
            "status_code": redirect.get("status_code", 301),
            "include_subdomains": redirect.get("include_subdomains", False),
            "subpath_matching": redirect.get("subpath_matching", False),
            "preserve_query_string": redirect.get("preserve_query_string", False),
            "preserve_path_suffix": redirect.get("preserve_path_suffix", False),
        },
        "comment": row.get("comment", ""),
    }


def wait_bulk_operation(api: Api, operation_id: str) -> None:
    for _ in range(60):
        result = (
            api.request(
                "GET",
                f"/accounts/{ACCOUNT_ID}/rules/lists/bulk_operations/{operation_id}",
            ).get("result")
            or {}
        )
        status = result.get("status")
        if status == "completed":
            return
        if status == "failed":
            raise RuntimeError(f"Bulk operation failed: {result.get('error')}")
        time.sleep(1)
    raise RuntimeError("Timed out waiting for Bulk Redirect list operation")


def read_items(api: Api, list_id: str) -> list[dict[str, Any]]:
    payload = api.request(
        "GET", f"/accounts/{ACCOUNT_ID}/rules/lists/{list_id}/items?per_page=500"
    )
    rows = payload.get("result") or []
    if not isinstance(rows, list):
        raise RuntimeError("Bulk Redirect list items response is not a list")
    return rows


def desired_rule() -> dict[str, Any]:
    return {
        "ref": RULE_REF,
        "expression": f"http.request.full_uri in ${LIST_NAME}",
        "description": "Redirect only the exact Pages project root URL to canonical",
        "action": "redirect",
        "action_parameters": {
            "from_list": {"name": LIST_NAME, "key": "http.request.full_uri"}
        },
        "enabled": True,
    }


def rule_matches(actual: dict[str, Any], desired: dict[str, Any]) -> bool:
    return all(actual.get(key) == value for key, value in desired.items())


def ensure_list(api: Api) -> str:
    rows = (
        api.request("GET", f"/accounts/{ACCOUNT_ID}/rules/lists?per_page=50").get("result")
        or []
    )
    matches = [row for row in rows if row.get("name") == LIST_NAME]
    if len(matches) > 1:
        raise RuntimeError(f"Duplicate Bulk Redirect list: {LIST_NAME}")
    if matches:
        row = matches[0]
        if row.get("kind") != "redirect":
            raise RuntimeError(f"Existing {LIST_NAME} list has wrong kind")
        list_id = str(row["id"])
        if row.get("description") != LIST_DESCRIPTION:
            api.request(
                "PUT",
                f"/accounts/{ACCOUNT_ID}/rules/lists/{list_id}",
                {"description": LIST_DESCRIPTION},
            )
    else:
        row = (
            api.request(
                "POST",
                f"/accounts/{ACCOUNT_ID}/rules/lists",
                {"name": LIST_NAME, "description": LIST_DESCRIPTION, "kind": "redirect"},
                ok=(200, 201),
            ).get("result")
            or {}
        )
        list_id = str(row.get("id") or "")
        if not list_id:
            raise RuntimeError("Created Bulk Redirect list returned no id")

    desired = {
        "redirect": {
            "source_url": SOURCE_URL,
            "target_url": TARGET_URL,
            "status_code": 301,
            "include_subdomains": False,
            "subpath_matching": False,
            "preserve_query_string": True,
            "preserve_path_suffix": False,
        },
        "comment": "Exact production Pages root to canonical root",
    }
    actual = read_items(api, list_id)
    if [normalized_item(row) for row in actual] != [normalized_item(desired)]:
        operation = (
            api.request(
                "PUT",
                f"/accounts/{ACCOUNT_ID}/rules/lists/{list_id}/items",
                [desired],
                ok=(200, 201),
            ).get("result")
            or {}
        )
        operation_id = str(operation.get("operation_id") or "")
        if not operation_id:
            raise RuntimeError("Bulk Redirect list replacement returned no operation id")
        wait_bulk_operation(api, operation_id)

    actual = read_items(api, list_id)
    if [normalized_item(row) for row in actual] != [normalized_item(desired)]:
        raise RuntimeError("Exact Pages.dev redirect list read-back drift")
    print("PAGES_DEV_ROOT_LIST_EXACT", SOURCE_URL, "->", TARGET_URL)
    return list_id


def ensure_rule(api: Api) -> None:
    desired = desired_rule()
    rows = api.request("GET", f"/accounts/{ACCOUNT_ID}/rulesets").get("result") or []
    candidates = [
        row for row in rows if row.get("kind") == "root" and row.get("phase") == PHASE
    ]
    if len(candidates) > 1:
        raise RuntimeError(f"Multiple account entry-point rulesets found for {PHASE}")
    if not candidates:
        result = (
            api.request(
                "POST",
                f"/accounts/{ACCOUNT_ID}/rulesets",
                {
                    "name": "Canonical account redirects",
                    "description": "Git-managed account-level redirects",
                    "kind": "root",
                    "phase": PHASE,
                    "rules": [desired],
                },
                ok=(200, 201),
            ).get("result")
            or {}
        )
        ruleset_id = str(result.get("id") or "")
    else:
        ruleset_id = str(candidates[0]["id"])
        full = (
            api.request("GET", f"/accounts/{ACCOUNT_ID}/rulesets/{ruleset_id}").get("result")
            or {}
        )
        rules = full.get("rules") or []
        matches = [
            row
            for row in rules
            if row.get("ref") == RULE_REF
            or (row.get("action_parameters") or {}).get("from_list", {}).get("name")
            == LIST_NAME
        ]
        if len(matches) > 1:
            raise RuntimeError("Duplicate Pages.dev Bulk Redirect rules")
        if not matches:
            api.request(
                "POST",
                f"/accounts/{ACCOUNT_ID}/rulesets/{ruleset_id}/rules",
                desired,
                ok=(200, 201),
            )
        elif not rule_matches(matches[0], desired):
            api.request(
                "PATCH",
                f"/accounts/{ACCOUNT_ID}/rulesets/{ruleset_id}/rules/{matches[0]['id']}",
                desired,
            )

    full = (
        api.request("GET", f"/accounts/{ACCOUNT_ID}/rulesets/{ruleset_id}").get("result")
        or {}
    )
    matches = [row for row in (full.get("rules") or []) if row.get("ref") == RULE_REF]
    if len(matches) != 1 or not rule_matches(matches[0], desired):
        raise RuntimeError("Pages.dev Bulk Redirect rule read-back drift")
    print("PAGES_DEV_ROOT_RULE_EXACT", RULE_REF)


def main() -> None:
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    if not token:
        raise RuntimeError("CLOUDFLARE_API_TOKEN required")
    if SOURCE_URL != "https://doctor-ghezelbaash.pages.dev/":
        raise RuntimeError(f"Unexpected Pages source URL: {SOURCE_URL}")
    if TARGET_URL != "https://www.ghezelbaash.ir/":
        raise RuntimeError(f"Unexpected canonical target URL: {TARGET_URL}")
    api = Api(token)
    ensure_list(api)
    ensure_rule(api)
    print("PAGES_DEV_ROOT_REDIRECT_CONTROL_PLANE_PASS")


if __name__ == "__main__":
    main()
