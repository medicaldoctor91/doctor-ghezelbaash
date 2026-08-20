#!/usr/bin/env python3
"""Reconcile the Cloudflare edge with the immutable Astro DIST contract.

The production API token is supplied only by GitHub Actions. This module keeps
all mutations narrow, idempotent, read back after write, and scoped to the
canonical hostname or the exact zone settings required by the site.
"""

from __future__ import annotations

import argparse
import atexit
import datetime as dt
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


API_BASE = "https://api.cloudflare.com/client/v4"

PLATFORM_CONTRACT_PATH = Path(__file__).resolve().parents[1] / ".release" / "policy" / "platform-contract.json"
PLATFORM_CONTRACT = json.loads(PLATFORM_CONTRACT_PATH.read_text(encoding="utf-8"))
PLATFORM_CF = PLATFORM_CONTRACT["cloudflare"]
CACHE_RULE_REF = "ghezelbaash_canonical_dist_cache_v1"
HSTS_RULE_REF = "ghezelbaash_canonical_hsts_v1"
NOT_FOUND_RULE_REF_PREFIX = "ghezelbaash_real_404_headers_"
HSTS_VALUE = "max-age=63072000; includeSubDomains; preload"
SUBDOMAIN_REDIRECT_PHASE = "http_request_dynamic_redirect"
SUBDOMAIN_REDIRECT_RULESET_NAME = "Canonical subdomain redirects"
SUBDOMAIN_REDIRECT_REFS = (
    "ghezelbaash_doctor_maps_v1",
    "ghezelbaash_github_entity_graph_v1",
    "ghezelbaash_ig_ai_corpus_v1",
)
BULK_REDIRECT_PHASE = "http_request_redirect"
BULK_REDIRECT_RULESET_NAME = "Canonical historical URL redirects"
BULK_REDIRECT_LIST_NAME = "ghezelbaash_blog_legacy_urls"
BULK_REDIRECT_RULE_REF = "ghezelbaash_blog_legacy_bulk_v1"
BLOG_HOST = "blog.ghezelbaash.ir"
PAGES_PROJECT_NAME = PLATFORM_CF["pagesProject"]
PAGES_ORIGIN_HOST = f"{PAGES_PROJECT_NAME}.pages.dev"
PAGES_REQUIRED_CUSTOM_DOMAINS = tuple(PLATFORM_CF["requiredCustomDomains"])
ZONE_SETTINGS_PERMISSION_IDS = (
    "517b21aee92c4d89936c976ba6e4be55",  # Zone Settings Read
    "3030687196b94b638145a3953da2b699",  # Zone Settings Write
)
SUBDOMAIN_SINGLE_REDIRECT_PERMISSION_ALIASES = (
    ("Dynamic URL Redirects Read", "Single Redirect Read", "Single Redirects Read"),
    (
        "Dynamic URL Redirects Write",
        "Single Redirect Edit",
        "Single Redirects Edit",
        "Single Redirect Write",
    ),
)
ZONE_RECONCILER_REQUIRED_PERMISSION_ALIASES = (
    ("DNS Read",),
    ("DNS Write", "DNS Edit"),
    ("Cache Rules Edit", "Cache Rules Write", "Cache Settings Write"),
    ("Bot Management Edit", "Bot Management Write"),
)
ZONE_RECONCILER_OPTIONAL_PERMISSION_ALIASES = (
    ("Cache Rules Read", "Cache Settings Read"),
    ("Bot Management Read",),
)
ACCOUNT_CACHE_REQUIRED_PERMISSION_ALIASES = (
    ("Account Rulesets Edit", "Account Rulesets Write"),
    (
        "Account Filter Lists Edit",
        "Account Filter Lists Write",
        "Account Rule Lists Write",
    ),
)
ACCOUNT_CACHE_OPTIONAL_PERMISSION_ALIASES = (
    ("Account Rulesets Read",),
    ("Account Filter Lists Read", "Account Rule Lists Read"),
)


class CloudflareError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.payload = payload or {}


def is_permission_error(exc: CloudflareError) -> bool:
    if exc.status in (401, 403):
        return True
    codes = {
        row.get("code")
        for row in exc.payload.get("errors", [])
        if isinstance(row, dict)
    }
    return 10000 in codes or 10001 in codes


def record_capability_gap(
    outcome: dict[str, Any], family: str, exc: CloudflareError
) -> None:
    status = exc.status if exc.status is not None else "unknown"
    outcome["scopeGaps"].append({"family": family, "status": status})
    print("EDGE_CAPABILITY_UNAVAILABLE", family, "http_status=", status)


def subset_equal(actual: Any, expected: Any) -> bool:
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(
            key in actual and subset_equal(actual[key], value)
            for key, value in expected.items()
        )
    if isinstance(expected, list):
        return actual == expected
    return actual == expected


def extract_header(headers_text: str, route: str, name: str) -> str:
    lines = headers_text.splitlines()
    try:
        start = lines.index(route)
    except ValueError as exc:
        raise CloudflareError(f"Missing {route} block in DIST _headers") from exc
    prefix = f"{name.lower()}:"
    for line in lines[start + 1 :]:
        if line and not line.startswith((" ", "\t")):
            break
        stripped = line.strip()
        if stripped.lower().startswith(prefix):
            return stripped.split(":", 1)[1].strip()
    raise CloudflareError(f"Missing {name} in {route} DIST _headers block")


def cache_rule(host: str) -> dict[str, Any]:
    return {
        "ref": CACHE_RULE_REF,
        "expression": (
            f'(http.host eq "{host}" and '
            'http.request.method in {"GET" "HEAD"} and '
            'not starts_with(http.request.uri.path, "/cdn-cgi/"))'
        ),
        "description": (
            "Canonical pure-static DIST: cache every GET/HEAD while respecting "
            "the exact origin browser and edge cache directives"
        ),
        "action": "set_cache_settings",
        "action_parameters": {
            "cache": True,
            "cache_key": {"cache_deception_armor": True},
            "edge_ttl": {"mode": "respect_origin"},
            "browser_ttl": {"mode": "respect_origin"},
            "serve_stale": {"disable_stale_while_updating": False},
            "respect_strong_etags": True,
        },
        "enabled": True,
    }


def not_found_rule(host: str, csp: str) -> dict[str, Any]:
    protected_hosts = " ".join(
        f'"{value}"' for value in (host, BLOG_HOST)
    )
    return {
        "ref": not_found_rule_ref(csp),
        "expression": (
            f"(http.host in {{{protected_hosts}}} and http.response.code eq 404)"
        ),
        "description": (
            "Restore the generated real-404 indexing and CSP contract on "
            "Cloudflare Pages fallback responses"
        ),
        "action": "rewrite",
        "action_parameters": {
            "headers": {
                "x-robots-tag": {
                    "operation": "set",
                    "value": "noindex, follow",
                },
                "content-language": {"operation": "set", "value": "fa-IR"},
                "content-security-policy": {"operation": "set", "value": csp},
                "cache-control": {"operation": "set", "value": "no-store"},
            }
        },
        "enabled": True,
    }


def not_found_rule_ref(csp: str) -> str:
    return NOT_FOUND_RULE_REF_PREFIX + hashlib.sha256(csp.encode("utf-8")).hexdigest()[:12]


def hsts_rule(host: str) -> dict[str, Any]:
    return {
        "ref": HSTS_RULE_REF,
        "expression": f'(http.host eq "{host}")',
        "description": (
            "Enforce the finalized canonical HSTS contract independently of "
            "Cloudflare Zone Settings API scope"
        ),
        "action": "rewrite",
        "action_parameters": {
            "headers": {
                "strict-transport-security": {
                    "operation": "set",
                    "value": HSTS_VALUE,
                }
            }
        },
        "enabled": True,
    }


def load_subdomain_redirect_contract(root: Path) -> dict[str, Any]:
    contract_path = root / "src" / "data" / "subdomain-redirects.json"
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    if contract.get("schemaVersion") != 2:
        raise CloudflareError("Unsupported subdomain redirect contract schema")
    if contract.get("zone") != "ghezelbaash.ir":
        raise CloudflareError("Subdomain redirect zone drift")
    if contract.get("canonicalOrigin") != "https://www.ghezelbaash.ir":
        raise CloudflareError("Subdomain redirect canonical origin drift")
    single = contract.get("singleRedirects") or {}
    if single.get("cloudflareProduct") != "Single Redirects":
        raise CloudflareError("Subdomain contract must declare Single Redirects")
    limit = single.get("planRuleLimit")
    rules = single.get("rules")
    if limit != 10 or not isinstance(rules, list) or not rules or len(rules) > limit:
        raise CloudflareError("Subdomain redirect contract exceeds Free-plan quota")
    refs = tuple(row.get("ref") for row in rules)
    if refs != SUBDOMAIN_REDIRECT_REFS:
        raise CloudflareError("Subdomain redirect ref/order contract drift")
    if any(
        row.get("statusCode") != 301
        or row.get("preserveQueryString") is not False
        or row.get("match") != "allPaths"
        for row in rules
    ):
        raise CloudflareError("Subdomain redirect status/query/match contract drift")
    bulk = contract.get("bulkRedirects") or {}
    if (
        bulk.get("cloudflareProduct") != "Bulk Redirects"
        or bulk.get("planUrlLimit") != 10_000
        or bulk.get("host") != BLOG_HOST
        or bulk.get("listName") != BULK_REDIRECT_LIST_NAME
        or bulk.get("ruleRef") != BULK_REDIRECT_RULE_REF
        or bulk.get("unmatchedPathPolicy") != "return-404"
        or not isinstance(bulk.get("groups"), list)
        or not bulk.get("groups")
    ):
        raise CloudflareError("Invalid historical blog Bulk Redirect contract")
    paths = [path for group in bulk["groups"] for path in group.get("paths", [])]
    if len(paths) != len(set(paths)) or len(paths) > int(bulk["planUrlLimit"]):
        raise CloudflareError("Bulk Redirect source path duplication or quota drift")
    if len(paths) != int((bulk.get("evidence") or {}).get("uniqueExecutableSourcePaths", -1)):
        raise CloudflareError("Bulk Redirect archive evidence count drift")
    return contract


def subdomain_redirect_rule(row: dict[str, Any]) -> dict[str, Any]:
    host = str(row["host"])
    if row["match"] != "allPaths" or "paths" in row:
        raise CloudflareError(f"Single Redirect must be a host catchall: {row['ref']}")
    expression = f'(http.host eq "{host}")'
    return {
        "ref": row["ref"],
        "expression": expression,
        "description": f"Git-managed permanent redirect for {host}",
        "action": "redirect",
        "action_parameters": {
            "from_value": {
                "status_code": row["statusCode"],
                "target_url": {"value": row["target"]},
                "preserve_query_string": row["preserveQueryString"],
            }
        },
        "enabled": True,
    }


def subdomain_redirect_rules(contract: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        subdomain_redirect_rule(row)
        for row in contract["singleRedirects"]["rules"]
    ]


ZONE_SETTINGS: dict[str, Any] = {
    "always_use_https": "on",
    "ssl": "strict",
    "min_tls_version": "1.2",
    "always_online": "on",
    "cache_level": "aggressive",
    "ech": "on",
    "pq_keyex": "on",
    "opportunistic_encryption": "on",
    "fonts": "off",
    "speed_brain": "off",
    "minify": {"css": "off", "html": "off", "js": "off"},
    "http2": "on",
    "http3": "on",
    "brotli": "on",
    "ipv6": "on",
    "tls_1_3": "zrt",
    "0rtt": "on",
    "early_hints": "on",
    "development_mode": "off",
    "rocket_loader": "off",
    "email_obfuscation": "off",
    "automatic_https_rewrites": "off",
    "hotlink_protection": "off",
    "mirage": "off",
    "polish": "off",
    "security_header": {
        "strict_transport_security": {
            "enabled": True,
            "max_age": 63_072_000,
            "include_subdomains": True,
            "preload": True,
            "nosniff": True,
        }
    },
}

# Crawler Hints is intentionally not represented as a Zone Settings API key:
# Cloudflare's 2026 public API does not expose it through /zones/{zone}/settings.
# The site keeps its independent, release-verified IndexNow pipeline as the
# machine-controlled freshness source of truth.

BOT_ACCESS_SETTINGS: dict[str, Any] = {
    "ai_bots_protection": "disabled",
    "content_bots_protection": "disabled",
    "crawler_protection": "disabled",
    "cf_robots_variant": "off",
    "is_robots_txt_managed": False,
    "fight_mode": False,
}


OPTIONAL_BOT_ACCESS_SETTINGS: dict[str, Any] = {
    "enable_js": False,
    "optimize_wordpress": False,
    "sbfm_definitely_automated": "allow",
    "sbfm_likely_automated": "allow",
    "sbfm_verified_bots": "allow",
    "sbfm_static_resource_protection": False,
}


class CloudflareApi:
    def __init__(self, token: str) -> None:
        self.token = token

    def raw(
        self, method: str, path: str, body: Any | None = None
    ) -> tuple[int, dict[str, Any]]:
        data = None
        if body is not None:
            data = json.dumps(body, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            API_BASE + path,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "ghezelbaash-edge-reconciler/1.0",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                raw = response.read().decode("utf-8", "replace")
                return response.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", "replace")
            try:
                payload = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                payload = {"raw": raw[:1200]}
            return exc.code, payload

    def expect(
        self,
        method: str,
        path: str,
        body: Any | None = None,
        ok: tuple[int, ...] = (200,),
    ) -> dict[str, Any]:
        status, payload = self.raw(method, path, body)
        if status not in ok or payload.get("success") is not True:
            raise CloudflareError(
                f"Cloudflare {method} {path} failed HTTP {status}: "
                f"{json.dumps(payload, ensure_ascii=False)[:1800]}",
                status=status,
                payload=payload,
            )
        return payload


def zone_id(api: CloudflareApi, account: str, zone_name: str) -> str:
    query = urllib.parse.urlencode(
        {"name": zone_name, "account.id": account, "per_page": 50}
    )
    payload = api.expect("GET", f"/zones?{query}")
    zones = payload.get("result") or []
    exact = [row for row in zones if row.get("name") == zone_name]
    if len(exact) != 1:
        raise CloudflareError(
            f"Expected one exact Cloudflare zone for {zone_name}; found {len(exact)}"
        )
    return str(exact[0]["id"])


def issue_ephemeral_zone_api(
    parent_api: CloudflareApi,
    account: str,
    zone: str,
    *,
    include_control_plane: bool = False,
) -> tuple[CloudflareApi, Any]:
    permissions = parent_api.expect(
        "GET",
        f"/accounts/{account}/tokens/permission_groups?scope=com.cloudflare.api.account.zone",
    ).get("result") or []
    available = {
        str(row["id"])
        for row in permissions
        if row.get("id")
        and "com.cloudflare.api.account.zone" in (row.get("scopes") or [])
    }
    missing_permissions = [
        permission_id
        for permission_id in ZONE_SETTINGS_PERMISSION_IDS
        if permission_id not in available
    ]
    if missing_permissions:
        raise CloudflareError(
            "Required Zone Settings permission groups unavailable: "
            + ",".join(missing_permissions)
        )
    groups = [{"id": permission_id} for permission_id in ZONE_SETTINGS_PERMISSION_IDS]
    # Cache-all rules can retain an old exact `/` object across a Pages deploy.
    # The parent credential is a token authority, so add only the two narrow
    # zone capabilities needed to invalidate that object, then revoke the child
    # token in the same process. This avoids relying on a broad long-lived
    # deployment credential for cache mutation.
    for permission_name in ("Zone Read", "Cache Purge"):
        matches = [
            row
            for row in permissions
            if row.get("name") == permission_name
            and "com.cloudflare.api.account.zone" in (row.get("scopes") or [])
        ]
        if len(matches) != 1:
            raise CloudflareError(
                f"Required {permission_name} permission group count: {len(matches)}"
            )
        permission_id = str(matches[0]["id"])
        if permission_id not in {str(row["id"]) for row in groups}:
            groups.append({"id": permission_id})

    resolved_permissions: list[str] = []
    account_groups: list[dict[str, str]] = []
    if include_control_plane:
        for aliases in ZONE_RECONCILER_REQUIRED_PERMISSION_ALIASES:
            match = next(
                (
                    row
                    for permission_name in aliases
                    for row in permissions
                    if row.get("name") == permission_name
                    and "com.cloudflare.api.account.zone" in (row.get("scopes") or [])
                ),
                None,
            )
            if match is None:
                relevant = sorted(
                    str(row.get("name"))
                    for row in permissions
                    if any(
                        token in str(row.get("name") or "").lower()
                        for token in ("cache", "bot", "dns")
                    )
                )
                raise CloudflareError(
                    "Required zone reconciler permission group unavailable: "
                    + " | ".join(aliases)
                    + "; relevant available groups: "
                    + ", ".join(relevant)
                )
            permission_id = str(match["id"])
            if permission_id not in {str(row["id"]) for row in groups}:
                groups.append({"id": permission_id})
            resolved_permissions.append(str(match["name"]))

        for aliases in ZONE_RECONCILER_OPTIONAL_PERMISSION_ALIASES:
            match = next(
                (
                    row
                    for permission_name in aliases
                    for row in permissions
                    if row.get("name") == permission_name
                    and "com.cloudflare.api.account.zone" in (row.get("scopes") or [])
                ),
                None,
            )
            if match is None:
                continue
            permission_id = str(match["id"])
            if permission_id not in {str(row["id"]) for row in groups}:
                groups.append({"id": permission_id})
            resolved_permissions.append(str(match["name"]))

        account_permissions = parent_api.expect(
            "GET",
            f"/accounts/{account}/tokens/permission_groups?scope=com.cloudflare.api.account",
        ).get("result") or []
        for aliases in ACCOUNT_CACHE_REQUIRED_PERMISSION_ALIASES:
            match = next(
                (
                    row
                    for permission_name in aliases
                    for row in account_permissions
                    if row.get("name") == permission_name
                    and "com.cloudflare.api.account" in (row.get("scopes") or [])
                ),
                None,
            )
            if match is None:
                relevant = sorted(
                    str(row.get("name"))
                    for row in account_permissions
                    if "rule" in str(row.get("name") or "").lower()
                    or "list" in str(row.get("name") or "").lower()
                )
                raise CloudflareError(
                    "Required account cache permission group unavailable: "
                    + " | ".join(aliases)
                    + "; relevant available groups: "
                    + ", ".join(relevant)
                )
            account_groups.append({"id": str(match["id"])})
            resolved_permissions.append(str(match["name"]))

        for aliases in ACCOUNT_CACHE_OPTIONAL_PERMISSION_ALIASES:
            match = next(
                (
                    row
                    for permission_name in aliases
                    for row in account_permissions
                    if row.get("name") == permission_name
                    and "com.cloudflare.api.account" in (row.get("scopes") or [])
                ),
                None,
            )
            if match is None:
                continue
            permission_id = str(match["id"])
            if permission_id not in {str(row["id"]) for row in account_groups}:
                account_groups.append({"id": permission_id})
            resolved_permissions.append(str(match["name"]))

    expires_on = (
        dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=15)
    ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    created = parent_api.expect(
        "POST",
        f"/accounts/{account}/tokens",
        {
            "name": "Ephemeral Ghezelbaash Zone, Cache and Bot Reconciler",
            "expires_on": expires_on,
            "policies": [
                {
                    "effect": "allow",
                    "resources": {f"com.cloudflare.api.account.zone.{zone}": "*"},
                    "permission_groups": groups,
                },
                *(
                    [
                        {
                            "effect": "allow",
                            "resources": {f"com.cloudflare.api.account.{account}": "*"},
                            "permission_groups": account_groups,
                        }
                    ]
                    if account_groups
                    else []
                ),
            ],
        },
        ok=(200, 201),
    ).get("result") or {}
    token_value = str(created.get("value") or "")
    token_id = str(created.get("id") or "")
    if not token_value or not token_id:
        raise CloudflareError("Ephemeral zone token creation returned no token/id")

    revoked = False

    def revoke(*, strict: bool = False) -> None:
        nonlocal revoked
        if revoked:
            return
        status, payload = parent_api.raw(
            "DELETE", f"/accounts/{account}/tokens/{token_id}"
        )
        if status in (200, 204) and payload.get("success") is True:
            revoked = True
            print("EPHEMERAL_ZONE_TOKEN_REVOKED", token_id)
            return
        message = (
            f"Ephemeral zone token revoke failed HTTP {status}: "
            f"{json.dumps(payload, ensure_ascii=False)[:1200]}"
        )
        if strict:
            raise CloudflareError(message, status=status, payload=payload)
        print("EPHEMERAL_ZONE_TOKEN_REVOKE_WARNING", message, file=sys.stderr)

    atexit.register(revoke)
    print(
        "EPHEMERAL_ZONE_TOKEN_ISSUED",
        token_id,
        "expires_on=",
        expires_on,
        "extra_permissions=",
        ",".join(resolved_permissions),
    )
    return CloudflareApi(token_value), lambda: revoke(strict=True)


def read_dns_contract(
    api: CloudflareApi, zone: str, zone_name: str, canonical_host: str
) -> dict[str, Any]:
    query = urllib.parse.urlencode({"per_page": 500})
    records = api.expect(
        "GET", f"/zones/{zone}/dns_records?{query}"
    ).get("result") or []
    routable_types = {"A", "AAAA", "CNAME"}
    required_hosts = [
        zone_name,
        canonical_host,
        f"blog.{zone_name}",
        f"doctor.{zone_name}",
        f"github.{zone_name}",
        f"ig.{zone_name}",
    ]
    wildcard = f"*.{zone_name}"

    def routes(hostname: str) -> list[dict[str, Any]]:
        return [
            row
            for row in records
            if row.get("type") in routable_types
            and row.get("name") in {hostname, wildcard}
            and row.get("proxied") is True
        ]

    coverage = {hostname: bool(routes(hostname)) for hostname in required_hosts}
    missing = [hostname for hostname, covered in coverage.items() if not covered]
    if missing:
        raise CloudflareError(
            "Required proxied DNS host coverage missing: " + ", ".join(missing)
        )
    blog_exact = [
        row
        for row in records
        if str(row.get("name") or "").rstrip(".").lower() == BLOG_HOST
        and str(row.get("type") or "").upper() in {"A", "AAAA", "CNAME"}
    ]
    if len(blog_exact) != 1 or not pages_dns_record_matches(blog_exact[0]):
        raise CloudflareError("Exact Pages CNAME binding for blog.ghezelbaash.ir is missing or drifted")

    relevant_names = set(required_hosts) | {wildcard}
    relevant = [
        {
            "type": row.get("type"),
            "name": row.get("name"),
            "content": row.get("content"),
            "proxied": row.get("proxied"),
            "ttl": row.get("ttl"),
        }
        for row in records
        if row.get("name") in relevant_names
    ]
    relevant.sort(key=lambda row: (str(row["name"]), str(row["type"]), str(row["content"])))
    summary = {
        "recordCount": len(records),
        "requiredHostCoverage": coverage,
        "blogPagesBinding": {
            "type": blog_exact[0].get("type"),
            "name": blog_exact[0].get("name"),
            "content": blog_exact[0].get("content"),
            "proxied": blog_exact[0].get("proxied"),
            "ttl": blog_exact[0].get("ttl"),
        },
        "relevantRecords": relevant,
    }
    print("DNS_REQUIRED_HOSTS_EXACT", json.dumps(summary, sort_keys=True))
    return summary


def read_pages_custom_domains(
    api: CloudflareApi, account: str
) -> dict[str, dict[str, Any]]:
    path = f"/accounts/{account}/pages/projects/{PAGES_PROJECT_NAME}/domains"
    rows = api.expect("GET", path).get("result") or []
    if not isinstance(rows, list):
        raise CloudflareError("Cloudflare Pages custom-domain listing is not a list")
    by_name: dict[str, dict[str, Any]] = {}
    for row in rows:
        name = str((row or {}).get("name") or "")
        if not name:
            continue
        if name in by_name:
            raise CloudflareError(f"Duplicate Cloudflare Pages custom domain: {name}")
        by_name[name] = row
    return by_name


def ensure_pages_custom_domains(api: CloudflareApi, account: str) -> None:
    path = f"/accounts/{account}/pages/projects/{PAGES_PROJECT_NAME}/domains"
    current = read_pages_custom_domains(api, account)
    for name in PAGES_REQUIRED_CUSTOM_DOMAINS:
        if name in current:
            continue
        api.expect("POST", path, {"name": name}, ok=(200, 201))
        print("PAGES_CUSTOM_DOMAIN_CREATED", name)
    after = read_pages_custom_domains(api, account)
    missing = sorted(set(PAGES_REQUIRED_CUSTOM_DOMAINS) - set(after))
    if missing:
        raise CloudflareError(
            "Pages custom-domain registration read-back missing: " + ", ".join(missing)
        )


def pages_dns_record_matches(row: dict[str, Any]) -> bool:
    return (
        str(row.get("type") or "").upper() == "CNAME"
        and str(row.get("name") or "").rstrip(".").lower() == BLOG_HOST
        and str(row.get("content") or "").rstrip(".").lower() == PAGES_ORIGIN_HOST
        and row.get("proxied") is True
        and int(row.get("ttl") or 0) == 1
    )


def reconcile_pages_dns_binding(api: CloudflareApi, zone: str) -> dict[str, Any]:
    query = urllib.parse.urlencode({"name": BLOG_HOST, "per_page": 100})
    collection = f"/zones/{zone}/dns_records"

    def read_exact() -> list[dict[str, Any]]:
        rows = api.expect("GET", f"{collection}?{query}").get("result") or []
        if not isinstance(rows, list):
            raise CloudflareError("Cloudflare DNS exact-name listing is not a list")
        return [
            row
            for row in rows
            if str(row.get("name") or "").rstrip(".").lower() == BLOG_HOST
            and str(row.get("type") or "").upper() in {"A", "AAAA", "CNAME"}
        ]

    desired = {
        "type": "CNAME",
        "name": BLOG_HOST,
        "content": PAGES_ORIGIN_HOST,
        "proxied": True,
        "ttl": 1,
    }
    rows = read_exact()
    if len(rows) > 1 or any(str(row.get("type") or "").upper() != "CNAME" for row in rows):
        raise CloudflareError(
            "Refusing ambiguous exact DNS records for Pages blog binding: "
            + json.dumps(
                [
                    {
                        "id": row.get("id"),
                        "type": row.get("type"),
                        "name": row.get("name"),
                        "content": row.get("content"),
                    }
                    for row in rows
                ],
                sort_keys=True,
            )
        )
    if not rows:
        api.expect("POST", collection, desired, ok=(200, 201))
        print("PAGES_BLOG_DNS_CREATED", BLOG_HOST, PAGES_ORIGIN_HOST)
    elif not pages_dns_record_matches(rows[0]):
        record_id = str(rows[0].get("id") or "")
        if not record_id:
            raise CloudflareError("Existing blog CNAME has no DNS record ID")
        api.expect("PATCH", f"{collection}/{record_id}", desired)
        print("PAGES_BLOG_DNS_UPDATED", BLOG_HOST, PAGES_ORIGIN_HOST)

    after = read_exact()
    if len(after) != 1 or not pages_dns_record_matches(after[0]):
        raise CloudflareError("Exact Pages blog DNS binding read-back drift")
    summary = {
        "id": after[0].get("id"),
        "type": after[0].get("type"),
        "name": after[0].get("name"),
        "content": after[0].get("content"),
        "proxied": after[0].get("proxied"),
        "ttl": after[0].get("ttl"),
    }
    print("PAGES_BLOG_DNS_EXACT", json.dumps(summary, sort_keys=True))
    return summary


def wait_pages_custom_domains(
    api: CloudflareApi, account: str
) -> dict[str, Any]:
    project_base = f"/accounts/{account}/pages/projects/{PAGES_PROJECT_NAME}"
    required = set(PAGES_REQUIRED_CUSTOM_DOMAINS)
    last_statuses: dict[str, str] = {}
    last_project_domains: list[str] = []
    for attempt in range(1, 181):
        by_name = read_pages_custom_domains(api, account)
        last_statuses = {
            name: str((by_name.get(name) or {}).get("status") or "missing")
            for name in PAGES_REQUIRED_CUSTOM_DOMAINS
        }
        failed = {
            name: status
            for name, status in last_statuses.items()
            if status in {"error", "blocked", "deactivated"}
        }
        if failed:
            raise CloudflareError(
                "Cloudflare Pages custom-domain activation failed: "
                + json.dumps(failed, sort_keys=True)
            )
        project = api.expect("GET", project_base).get("result") or {}
        last_project_domains = sorted(str(value) for value in (project.get("domains") or []))
        if (
            required.issubset(by_name)
            and all(last_statuses[name] == "active" for name in required)
            and required.issubset(last_project_domains)
        ):
            summary = {
                "project": PAGES_PROJECT_NAME,
                "requiredDomains": list(PAGES_REQUIRED_CUSTOM_DOMAINS),
                "statuses": last_statuses,
                "projectDomains": last_project_domains,
            }
            print("PAGES_CUSTOM_DOMAINS_EXACT", json.dumps(summary, sort_keys=True))
            return summary
        if attempt < 180:
            time.sleep(2)
    raise CloudflareError(
        "Timed out waiting for Cloudflare Pages custom domains: "
        + json.dumps(
            {"statuses": last_statuses, "projectDomains": last_project_domains},
            sort_keys=True,
        )
    )


def reconcile_pages_custom_domains(
    api: CloudflareApi, account: str
) -> dict[str, Any]:
    ensure_pages_custom_domains(api, account)
    return wait_pages_custom_domains(api, account)


def read_pages_contract(
    api: CloudflareApi, account: str, canonical_host: str
) -> dict[str, Any]:
    project_name = PAGES_PROJECT_NAME
    base = f"/accounts/{account}/pages/projects/{project_name}"
    project = api.expect("GET", base).get("result") or {}
    source = project.get("source") or {}
    source_config = source.get("config") or {}
    build = project.get("build_config") or {}
    domains = sorted(str(value) for value in (project.get("domains") or []))
    summary = {
        "name": project.get("name"),
        "productionBranch": project.get("production_branch"),
        "domains": domains,
        "sourceType": source.get("type"),
        "repository": (
            f"{source_config.get('owner')}/{source_config.get('repo_name')}"
            if source_config.get("owner") and source_config.get("repo_name")
            else None
        ),
        "deploymentsEnabled": source_config.get("deployments_enabled"),
        "productionDeploymentsEnabled": source_config.get(
            "production_deployments_enabled"
        ),
        "previewDeploymentSetting": source_config.get(
            "preview_deployment_setting"
        ),
        "previewBranchIncludes": source_config.get("preview_branch_includes") or [],
        "previewBranchExcludes": source_config.get("preview_branch_excludes") or [],
        "buildCommand": build.get("build_command"),
        "destinationDir": build.get("destination_dir"),
        "rootDir": build.get("root_dir"),
    }
    expected = {
        "name": project_name,
        "productionBranch": PLATFORM_CF["productionBranch"],
        "sourceType": "github",
        "repository": PLATFORM_CONTRACT["repository"],
        "deploymentsEnabled": True,
        "productionDeploymentsEnabled": True,
        "previewDeploymentSetting": PLATFORM_CF["preview"]["deploymentSetting"],
        "previewBranchIncludes": PLATFORM_CF["preview"]["branchIncludes"],
        "previewBranchExcludes": PLATFORM_CF["preview"]["branchExcludes"],
        "buildCommand": PLATFORM_CF["build"]["command"],
        "destinationDir": PLATFORM_CF["build"]["destinationDir"],
    }
    if canonical_host not in PAGES_REQUIRED_CUSTOM_DOMAINS:
        raise CloudflareError(f"Unexpected canonical Pages hostname: {canonical_host}")
    missing_domains = sorted(set(PAGES_REQUIRED_CUSTOM_DOMAINS) - set(domains))
    if missing_domains:
        raise CloudflareError(
            "Required Pages custom domains missing from project: "
            + ", ".join(missing_domains)
        )
    if not all(summary.get(key) == value for key, value in expected.items()):
        raise CloudflareError(
            "Cloudflare Pages project contract drift: "
            + json.dumps(summary, sort_keys=True)
        )
    print("CLOUDFLARE_PAGES_CONTRACT_EXACT", json.dumps(summary, sort_keys=True))
    return summary


def issue_ephemeral_single_redirect_api(
    parent_api: CloudflareApi, account: str, zone: str
) -> tuple[CloudflareApi, Any]:
    """Issue a 15-minute child token limited to the zone's Single Redirects."""
    permissions = parent_api.expect(
        "GET",
        f"/accounts/{account}/tokens/permission_groups?scope=com.cloudflare.api.account.zone",
    ).get("result") or []
    groups: list[dict[str, str]] = []
    for aliases in SUBDOMAIN_SINGLE_REDIRECT_PERMISSION_ALIASES:
        match: dict[str, Any] | None = None
        for permission_name in aliases:
            candidates = [
                row
                for row in permissions
                if row.get("name") == permission_name
                and "com.cloudflare.api.account.zone" in (row.get("scopes") or [])
            ]
            if len(candidates) == 1:
                match = candidates[0]
                break
        if match is None:
            raise CloudflareError(
                "Required Single Redirect permission group unavailable: "
                + " | ".join(aliases)
            )
        groups.append({"id": str(match["id"])})

    expires_on = (
        dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=15)
    ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    created = parent_api.expect(
        "POST",
        f"/accounts/{account}/tokens",
        {
            "name": "Ephemeral Ghezelbaash Single Redirect Reconciler",
            "expires_on": expires_on,
            "policies": [
                {
                    "effect": "allow",
                    "resources": {f"com.cloudflare.api.account.zone.{zone}": "*"},
                    "permission_groups": groups,
                }
            ],
        },
        ok=(200, 201),
    ).get("result") or {}
    token_value = str(created.get("value") or "")
    token_id = str(created.get("id") or "")
    if not token_value or not token_id:
        raise CloudflareError("Ephemeral Single Redirect token returned no token/id")

    revoked = False

    def revoke(*, strict: bool = False) -> None:
        nonlocal revoked
        if revoked:
            return
        status, payload = parent_api.raw(
            "DELETE", f"/accounts/{account}/tokens/{token_id}"
        )
        if status in (200, 204) and payload.get("success") is True:
            revoked = True
            print("EPHEMERAL_SINGLE_REDIRECT_TOKEN_REVOKED", token_id)
            return
        message = (
            f"Ephemeral Single Redirect token revoke failed HTTP {status}: "
            f"{json.dumps(payload, ensure_ascii=False)[:1200]}"
        )
        if strict:
            raise CloudflareError(message, status=status, payload=payload)
        print("EPHEMERAL_SINGLE_REDIRECT_TOKEN_REVOKE_WARNING", message, file=sys.stderr)

    atexit.register(revoke)
    print("EPHEMERAL_SINGLE_REDIRECT_TOKEN_ISSUED", token_id, "expires_on=", expires_on)
    return CloudflareApi(token_value), lambda: revoke(strict=True)


def reconcile_smart_tiered_cache(api: CloudflareApi, zone: str) -> dict[str, Any]:
    """Keep the Free-plan Smart Tiered Cache topology enabled and prove read-back."""
    path = f"/zones/{zone}/cache/tiered_cache_smart_topology_enable"
    before = api.expect("GET", path).get("result") or {}
    if before.get("value") != "on":
        if before.get("editable") is False:
            raise CloudflareError(
                f"Smart Tiered Cache is not editable and is {before.get('value')!r}"
            )
        api.expect("PATCH", path, {"value": "on"})
        state = "UPDATED"
    else:
        state = "ALREADY_EXACT"
    after = api.expect("GET", path).get("result") or {}
    if after.get("value") != "on":
        raise CloudflareError(
            f"Smart Tiered Cache read-back drift: {after.get('value')!r}"
        )
    print("SMART_TIERED_CACHE_" + state, json.dumps(after, sort_keys=True))
    return after


def reconcile_zone_setting(
    api: CloudflareApi, zone: str, setting_id: str, desired: Any
) -> Any:
    path = f"/zones/{zone}/settings/{setting_id}"
    before = api.expect("GET", path).get("result") or {}
    current = before.get("value")
    if not subset_equal(current, desired):
        if before.get("editable") is False:
            raise CloudflareError(
                f"Zone setting {setting_id} is not editable and conflicts with "
                f"the DIST contract: {current!r}"
            )
        api.expect("PATCH", path, {"value": desired})
        state = "UPDATED"
    else:
        state = "ALREADY_EXACT"
    after = api.expect("GET", path).get("result") or {}
    if not subset_equal(after.get("value"), desired):
        raise CloudflareError(
            f"Zone setting read-back drift for {setting_id}: {after.get('value')!r}"
        )
    print(f"ZONE_SETTING_{state}", setting_id, json.dumps(desired, sort_keys=True))
    return after.get("value")


def rule_matches(actual: dict[str, Any], desired: dict[str, Any]) -> bool:
    return all(subset_equal(actual.get(key), value) for key, value in desired.items())


def reconcile_phase_rule(
    api: CloudflareApi,
    zone: str,
    phase: str,
    ruleset_name: str,
    ruleset_description: str,
    desired: dict[str, Any],
    *,
    must_be_last: bool = True,
) -> dict[str, Any]:
    listing = api.expect("GET", f"/zones/{zone}/rulesets").get("result") or []
    candidates = [
        row
        for row in listing
        if row.get("kind") == "zone" and row.get("phase") == phase
    ]
    if len(candidates) > 1:
        raise CloudflareError(f"Multiple zone entry-point rulesets found for {phase}")
    if not candidates:
        payload = api.expect(
            "POST",
            f"/zones/{zone}/rulesets",
            {
                "name": ruleset_name,
                "description": ruleset_description,
                "kind": "zone",
                "phase": phase,
                "rules": [desired],
            },
            ok=(200, 201),
        )
        ruleset = payload.get("result") or {}
        ruleset_id = str(ruleset.get("id"))
        state = "RULESET_CREATED"
    else:
        ruleset_id = str(candidates[0]["id"])
        full = api.expect("GET", f"/zones/{zone}/rulesets/{ruleset_id}")
        rules = (full.get("result") or {}).get("rules") or []
        matches = [row for row in rules if row.get("ref") == desired["ref"]]
        if len(matches) > 1:
            raise CloudflareError(f"Duplicate owned rule ref {desired['ref']}")
        current = matches[0] if matches else None
        position_exact = (
            not must_be_last
            or (rules and rules[-1].get("id") == (current or {}).get("id"))
        )
        if current and rule_matches(current, desired) and position_exact:
            state = "ALREADY_EXACT"
        elif current:
            body = dict(desired)
            if must_be_last and rules[-1].get("id") != current.get("id"):
                body["position"] = {"after": str(rules[-1]["id"])}
            api.expect(
                "PATCH",
                f"/zones/{zone}/rulesets/{ruleset_id}/rules/{current['id']}",
                body,
            )
            state = "RULE_UPDATED"
        else:
            api.expect(
                "POST",
                f"/zones/{zone}/rulesets/{ruleset_id}/rules",
                desired,
                ok=(200, 201),
            )
            state = "RULE_CREATED"

    readback = api.expect("GET", f"/zones/{zone}/rulesets/{ruleset_id}")
    rules = (readback.get("result") or {}).get("rules") or []
    owned = [row for row in rules if row.get("ref") == desired["ref"]]
    if len(owned) != 1 or not rule_matches(owned[0], desired):
        raise CloudflareError(f"Rule read-back drift for {desired['ref']}")
    if must_be_last and (
        not rules or rules[-1].get("id") != owned[0].get("id")
    ):
        raise CloudflareError(
            f"Owned {phase} rule is not last; a later rule could override it"
        )
    print(state, phase, desired["ref"], "rule_count=", len(rules))
    return owned[0]


def prune_superseded_not_found_rules(
    api: CloudflareApi, zone: str, keep_ref: str
) -> None:
    phase = "http_response_headers_transform"
    listing = api.expect("GET", f"/zones/{zone}/rulesets").get("result") or []
    candidates = [
        row
        for row in listing
        if row.get("kind") == "zone" and row.get("phase") == phase
    ]
    if len(candidates) != 1:
        raise CloudflareError(
            f"Response-header ruleset count drift while pruning 404 rules: {len(candidates)}"
        )
    ruleset_id = str(candidates[0]["id"])
    readback = api.expect("GET", f"/zones/{zone}/rulesets/{ruleset_id}")
    rules = (readback.get("result") or {}).get("rules") or []
    superseded = [
        row
        for row in rules
        if str(row.get("ref") or "").startswith(NOT_FOUND_RULE_REF_PREFIX)
        and row.get("ref") != keep_ref
    ]
    for row in superseded:
        api.expect(
            "DELETE",
            f"/zones/{zone}/rulesets/{ruleset_id}/rules/{row['id']}",
        )
        print("SUPERSEDED_NOT_FOUND_RULE_REMOVED", row.get("ref"))
    final = api.expect("GET", f"/zones/{zone}/rulesets/{ruleset_id}")
    final_rules = (final.get("result") or {}).get("rules") or []
    owned = [
        row
        for row in final_rules
        if str(row.get("ref") or "").startswith(NOT_FOUND_RULE_REF_PREFIX)
    ]
    if len(owned) != 1 or owned[0].get("ref") != keep_ref:
        raise CloudflareError("Canonical 404 transform rule did not converge to one authority")


def reconcile_canonical_cache_ruleset(
    api: CloudflareApi, zone: str, host: str
) -> dict[str, Any]:
    """Make the cache-settings phase an exact single-rule source-owned contract."""
    desired = cache_rule(host)
    owned = reconcile_phase_rule(
        api,
        zone,
        "http_request_cache_settings",
        "Canonical DIST cache rules",
        "Git-managed cache eligibility for the immutable static production DIST",
        desired,
    )
    listing = api.expect("GET", f"/zones/{zone}/rulesets").get("result") or []
    candidates = [
        row for row in listing
        if row.get("kind") == "zone"
        and row.get("phase") == "http_request_cache_settings"
    ]
    if len(candidates) != 1:
        raise CloudflareError(f"Canonical cache ruleset count drift: {len(candidates)}")
    ruleset_id = str(candidates[0]["id"])
    readback = api.expect("GET", f"/zones/{zone}/rulesets/{ruleset_id}")
    rules = (readback.get("result") or {}).get("rules") or []
    owned_id = str(owned.get("id") or "")
    if not owned_id:
        raise CloudflareError("Canonical cache rule has no Cloudflare rule ID")
    extras = [row for row in rules if str(row.get("id") or "") != owned_id]
    for row in extras:
        api.expect("DELETE", f"/zones/{zone}/rulesets/{ruleset_id}/rules/{row['id']}")
        print("UNMANAGED_CACHE_RULE_REMOVED", row.get("ref") or row.get("id"))
    final = api.expect("GET", f"/zones/{zone}/rulesets/{ruleset_id}")
    final_rules = (final.get("result") or {}).get("rules") or []
    if (
        len(final_rules) != 1
        or final_rules[0].get("ref") != CACHE_RULE_REF
        or not rule_matches(final_rules[0], desired)
    ):
        raise CloudflareError("Canonical cache ruleset is not exact after reconciliation")
    print("CANONICAL_CACHE_RULESET_EXACT", CACHE_RULE_REF, "rule_count=", len(final_rules))
    return final_rules[0]


def expand_bulk_redirect_items(contract: dict[str, Any]) -> list[dict[str, Any]]:
    bulk = contract["bulkRedirects"]
    host = str(bulk["host"])
    items: list[dict[str, Any]] = []
    for group in bulk["groups"]:
        for source_path in group["paths"]:
            items.append(
                {
                    "redirect": {
                        "source_url": f"{host}{source_path}",
                        "target_url": group["target"],
                        "status_code": group["statusCode"],
                        "include_subdomains": False,
                        "subpath_matching": False,
                        "preserve_query_string": group["preserveQueryString"],
                        "preserve_path_suffix": False,
                    },
                    "comment": group["ref"],
                }
            )
    items.sort(key=lambda row: str(row["redirect"]["source_url"]))
    return items


def normalized_bulk_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for row in items:
        redirect = row.get("redirect") or {}
        normalized.append(
            {
                "redirect": {
                    # Cloudflare accepts percent-encoded Blogger paths but its
                    # List Items API reads them back as decoded Unicode. These
                    # spellings identify the same URL for our contract.
                    "source_url": urllib.parse.unquote(
                        str(redirect.get("source_url") or "")
                    ),
                    "target_url": redirect.get("target_url"),
                    "status_code": redirect.get("status_code", 301),
                    "include_subdomains": redirect.get("include_subdomains", False),
                    "subpath_matching": redirect.get("subpath_matching", False),
                    "preserve_query_string": redirect.get(
                        "preserve_query_string", False
                    ),
                    "preserve_path_suffix": redirect.get(
                        "preserve_path_suffix", False
                    ),
                },
                "comment": row.get("comment", ""),
            }
        )
    normalized.sort(key=lambda row: str(row["redirect"]["source_url"]))
    return normalized


def bulk_items_drift_summary(
    actual_items: list[dict[str, Any]], desired_items: list[dict[str, Any]]
) -> str:
    """Return a bounded, public-only diagnostic for Cloudflare normalization drift."""
    actual = normalized_bulk_items(actual_items)
    desired = normalized_bulk_items(desired_items)
    actual_by_source = {
        str(row["redirect"]["source_url"]): row for row in actual
    }
    desired_by_source = {
        str(row["redirect"]["source_url"]): row for row in desired
    }
    missing = sorted(set(desired_by_source) - set(actual_by_source))
    unexpected = sorted(set(actual_by_source) - set(desired_by_source))
    changed: list[dict[str, Any]] = []
    for source in sorted(set(actual_by_source) & set(desired_by_source)):
        if actual_by_source[source] != desired_by_source[source]:
            changed.append(
                {
                    "source": source,
                    "actual": actual_by_source[source],
                    "desired": desired_by_source[source],
                }
            )
        if len(changed) == 3:
            break
    return json.dumps(
        {
            "actualCount": len(actual),
            "desiredCount": len(desired),
            "missingSources": missing[:3],
            "unexpectedSources": unexpected[:3],
            "fieldMismatches": changed,
        },
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    )


def wait_bulk_operation(
    api: CloudflareApi, account: str, operation_id: str
) -> None:
    for _ in range(45):
        payload = api.expect(
            "GET",
            f"/accounts/{account}/rules/lists/bulk_operations/{operation_id}",
        )
        result = payload.get("result") or {}
        status = result.get("status")
        if status == "completed":
            return
        if status == "failed":
            raise CloudflareError(
                f"Cloudflare list operation failed: {result.get('error')}"
            )
        if status not in ("pending", "running"):
            raise CloudflareError(f"Unknown Cloudflare list operation status: {status}")
        time.sleep(1)
    raise CloudflareError("Timed out waiting for Cloudflare list operation")


def read_all_list_items(
    api: CloudflareApi, account: str, list_id: str
) -> list[dict[str, Any]]:
    """Read a Cloudflare account list using its opaque cursor contract."""
    items: list[dict[str, Any]] = []
    cursor: str | None = None
    seen_cursors: set[str] = set()
    while True:
        query_values: dict[str, Any] = {"per_page": 500}
        if cursor:
            query_values["cursor"] = cursor
        query = urllib.parse.urlencode(query_values)
        payload = api.expect(
            "GET",
            f"/accounts/{account}/rules/lists/{list_id}/items?{query}",
        )
        page = payload.get("result") or []
        if not isinstance(page, list):
            raise CloudflareError("Cloudflare List Items returned a non-list result")
        items.extend(page)
        after = str(
            (((payload.get("result_info") or {}).get("cursors") or {}).get("after"))
            or ""
        )
        if not after:
            return items
        if after in seen_cursors:
            raise CloudflareError("Cloudflare List Items cursor cycle detected")
        seen_cursors.add(after)
        cursor = after


def bulk_redirect_rule(contract: dict[str, Any]) -> dict[str, Any]:
    bulk = contract["bulkRedirects"]
    list_name = str(bulk["listName"])
    return {
        "ref": bulk["ruleRef"],
        "expression": f"http.request.full_uri in ${list_name}",
        "description": bulk["ruleDescription"],
        "action": "redirect",
        "action_parameters": {
            "from_list": {
                "name": list_name,
                "key": "http.request.full_uri",
            }
        },
        "enabled": True,
    }


def reconcile_bulk_redirects(
    api: CloudflareApi,
    account: str,
    contract: dict[str, Any],
) -> dict[str, Any]:
    """Replace only the owned historical-blog list, then enable its account rule."""
    bulk = contract["bulkRedirects"]
    desired_items = expand_bulk_redirect_items(contract)
    if len(desired_items) > int(bulk["planUrlLimit"]):
        raise CloudflareError("Cloudflare Bulk Redirect URL quota would be exceeded")

    query = urllib.parse.urlencode({"per_page": 50})
    listing = api.expect(
        "GET", f"/accounts/{account}/rules/lists?{query}"
    ).get("result") or []
    matches = [row for row in listing if row.get("name") == bulk["listName"]]
    if len(matches) > 1:
        raise CloudflareError(f"Duplicate Bulk Redirect list {bulk['listName']}")
    if not matches:
        created = api.expect(
            "POST",
            f"/accounts/{account}/rules/lists",
            {
                "name": bulk["listName"],
                "description": bulk["listDescription"],
                "kind": "redirect",
            },
            ok=(200, 201),
        )
        list_row = created.get("result") or {}
        list_state = "BULK_REDIRECT_LIST_CREATED"
    else:
        list_row = matches[0]
        list_state = "BULK_REDIRECT_LIST_REUSED"
    if list_row.get("kind") != "redirect":
        raise CloudflareError(f"Owned Bulk Redirect list has wrong kind: {list_row.get('kind')}")
    list_id = str(list_row["id"])
    if list_row.get("description") != bulk["listDescription"]:
        api.expect(
            "PUT",
            f"/accounts/{account}/rules/lists/{list_id}",
            {"description": bulk["listDescription"]},
        )
        list_state = "BULK_REDIRECT_LIST_METADATA_UPDATED"

    actual_items = read_all_list_items(api, account, list_id)
    if normalized_bulk_items(actual_items) != normalized_bulk_items(desired_items):
        replaced = api.expect(
            "PUT",
            f"/accounts/{account}/rules/lists/{list_id}/items",
            desired_items,
            ok=(200, 201),
        )
        operation_id = str((replaced.get("result") or {}).get("operation_id") or "")
        if not operation_id:
            raise CloudflareError("Bulk Redirect list replacement returned no operation ID")
        wait_bulk_operation(api, account, operation_id)
        list_state = "BULK_REDIRECT_LIST_ITEMS_REPLACED"

    actual_items = read_all_list_items(api, account, list_id)
    if normalized_bulk_items(actual_items) != normalized_bulk_items(desired_items):
        raise CloudflareError(
            "Bulk Redirect list read-back drift: "
            + bulk_items_drift_summary(actual_items, desired_items)
        )

    desired_rule = bulk_redirect_rule(contract)
    rulesets = api.expect("GET", f"/accounts/{account}/rulesets").get("result") or []
    candidates = [
        row
        for row in rulesets
        if row.get("kind") == "root" and row.get("phase") == BULK_REDIRECT_PHASE
    ]
    if len(candidates) > 1:
        raise CloudflareError(
            f"Multiple account entry-point rulesets found for {BULK_REDIRECT_PHASE}"
        )
    if not candidates:
        created = api.expect(
            "POST",
            f"/accounts/{account}/rulesets",
            {
                "name": BULK_REDIRECT_RULESET_NAME,
                "description": "Git-managed exact historical URL redirects",
                "kind": "root",
                "phase": BULK_REDIRECT_PHASE,
                "rules": [desired_rule],
            },
            ok=(200, 201),
        )
        ruleset_id = str((created.get("result") or {}).get("id"))
        rule_state = "BULK_REDIRECT_RULESET_CREATED"
    else:
        ruleset_id = str(candidates[0]["id"])
        full = api.expect("GET", f"/accounts/{account}/rulesets/{ruleset_id}")
        rules = (full.get("result") or {}).get("rules") or []
        matches = [
            row
            for row in rules
            if row.get("ref") == desired_rule["ref"]
            or (row.get("action_parameters") or {}).get("from_list", {}).get("name")
            == bulk["listName"]
        ]
        if len(matches) > 1:
            raise CloudflareError("Duplicate Bulk Redirect rules reference the owned list")
        if not matches:
            api.expect(
                "POST",
                f"/accounts/{account}/rulesets/{ruleset_id}/rules",
                desired_rule,
                ok=(200, 201),
            )
            rule_state = "BULK_REDIRECT_RULE_CREATED"
        elif not rule_matches(matches[0], desired_rule):
            api.expect(
                "PATCH",
                f"/accounts/{account}/rulesets/{ruleset_id}/rules/{matches[0]['id']}",
                desired_rule,
            )
            rule_state = "BULK_REDIRECT_RULE_UPDATED"
        else:
            rule_state = "BULK_REDIRECT_RULE_ALREADY_EXACT"

    readback = api.expect("GET", f"/accounts/{account}/rulesets/{ruleset_id}")
    rules = (readback.get("result") or {}).get("rules") or []
    owned = [row for row in rules if row.get("ref") == desired_rule["ref"]]
    if len(owned) != 1 or not rule_matches(owned[0], desired_rule):
        raise CloudflareError("Bulk Redirect rule read-back drift")
    print(list_state, bulk["listName"], "item_count=", len(actual_items))
    print(rule_state, BULK_REDIRECT_PHASE, desired_rule["ref"])
    return {
        "listId": list_id,
        "listName": bulk["listName"],
        "itemCount": len(actual_items),
        "rulesetId": ruleset_id,
        "ruleRef": desired_rule["ref"],
    }


def reconcile_subdomain_redirects(
    api: CloudflareApi,
    zone: str,
    contract: dict[str, Any],
) -> dict[str, Any]:
    """Reconcile three host catchalls and remove Single Redirects that pre-empt blog Bulk Redirects."""
    desired_rows = contract["singleRedirects"]["rules"]
    desired_rules = subdomain_redirect_rules(contract)
    desired_by_ref = {row["ref"]: row for row in desired_rules}
    desired_refs = set(desired_by_ref)
    plan_limit = int(contract["singleRedirects"]["planRuleLimit"])
    managed_hosts = {str(row["host"]) for row in desired_rows}
    blog_host = str(contract["bulkRedirects"]["host"])

    listing = api.expect("GET", f"/zones/{zone}/rulesets").get("result") or []
    candidates = [
        row
        for row in listing
        if row.get("kind") == "zone"
        and row.get("phase") == SUBDOMAIN_REDIRECT_PHASE
    ]
    if len(candidates) > 1:
        raise CloudflareError(
            f"Multiple zone entry-point rulesets found for {SUBDOMAIN_REDIRECT_PHASE}"
        )
    if not candidates:
        payload = api.expect(
            "POST",
            f"/zones/{zone}/rulesets",
            {
                "name": SUBDOMAIN_REDIRECT_RULESET_NAME,
                "description": "Git-managed machine entrypoints and external-intent subdomain redirects",
                "kind": "zone",
                "phase": SUBDOMAIN_REDIRECT_PHASE,
                "rules": desired_rules,
            },
            ok=(200, 201),
        )
        ruleset_id = str((payload.get("result") or {}).get("id"))
        state = "SINGLE_REDIRECT_RULESET_CREATED"
    else:
        ruleset_id = str(candidates[0]["id"])
        state = "SINGLE_REDIRECT_RULES_RECONCILED"

        def read_rules() -> list[dict[str, Any]]:
            payload = api.expect("GET", f"/zones/{zone}/rulesets/{ruleset_id}")
            return (payload.get("result") or {}).get("rules") or []

        rules = read_rules()
        for ref in desired_refs:
            if sum(1 for row in rules if row.get("ref") == ref) > 1:
                raise CloudflareError(f"Duplicate owned Single Redirect ref {ref}")

        # Bulk Redirects execute after Single Redirects. Remove every blog rule
        # only after the caller has successfully reconciled the exact Bulk list.
        for current in list(rules):
            expression = str(current.get("expression") or "")
            if blog_host not in expression:
                continue
            expression_hosts = set(
                re.findall(r'http\.host\s+eq\s+"([^"]+)"', expression)
            )
            if expression_hosts != {blog_host}:
                raise CloudflareError(
                    "Refusing to delete a competing blog redirect with an ambiguous "
                    "host expression: " + expression
                )
            api.expect(
                "DELETE",
                f"/zones/{zone}/rulesets/{ruleset_id}/rules/{current['id']}",
            )
            print("BLOG_SINGLE_REDIRECT_CONFLICT_REMOVED", current.get("ref") or current["id"])

        for source, desired in zip(desired_rows, desired_rules):
            rules = read_rules()
            host = str(source["host"])
            current = next(
                (row for row in rules if row.get("ref") == desired["ref"]), None
            )
            conflicting = [
                row
                for row in rules
                if row.get("ref") not in desired_refs
                and host in str(row.get("expression") or "")
                and not any(
                    other in str(row.get("expression") or "")
                    for other in managed_hosts
                    if other != host
                )
            ]
            if len(conflicting) > 1:
                raise CloudflareError(f"Ambiguous competing catchalls for {host}")
            if current is None:
                if len(rules) + 1 > plan_limit:
                    raise CloudflareError("Single Redirect quota would be exceeded")
                api.expect(
                    "POST",
                    f"/zones/{zone}/rulesets/{ruleset_id}/rules",
                    desired,
                    ok=(200, 201),
                )
                print("SUBDOMAIN_SINGLE_REDIRECT_CREATED", desired["ref"])
            elif not rule_matches(current, desired):
                api.expect(
                    "PATCH",
                    f"/zones/{zone}/rulesets/{ruleset_id}/rules/{current['id']}",
                    desired,
                )
                print("SUBDOMAIN_SINGLE_REDIRECT_UPDATED", desired["ref"])

            # Cloudflare treats a rule ref as immutable. Preserve continuous
            # redirect service by creating the owned rule first, then remove
            # a competing rule. If creation fails, the existing redirect remains.
            if conflicting:
                api.expect(
                    "DELETE",
                    f"/zones/{zone}/rulesets/{ruleset_id}/rules/{conflicting[0]['id']}",
                )
                print(
                    "SUBDOMAIN_SINGLE_REDIRECT_CONFLICT_REMOVED_AFTER_CREATE",
                    host,
                    conflicting[0].get("ref") or conflicting[0]["id"],
                )

    readback = api.expect("GET", f"/zones/{zone}/rulesets/{ruleset_id}")
    rules = (readback.get("result") or {}).get("rules") or []
    if len(rules) > plan_limit:
        raise CloudflareError(f"Cloudflare Single Redirect quota drift: {len(rules)}")
    for desired in desired_rules:
        owned = [row for row in rules if row.get("ref") == desired["ref"]]
        if len(owned) != 1 or not rule_matches(owned[0], desired):
            raise CloudflareError(f"Single Redirect read-back drift for {desired['ref']}")
    blog_conflicts = [
        row for row in rules if blog_host in str(row.get("expression") or "")
    ]
    if blog_conflicts:
        raise CloudflareError("A Single Redirect still pre-empts historical blog Bulk Redirects")
    for host in managed_hosts:
        conflicts = [
            row
            for row in rules
            if host in str(row.get("expression") or "")
            and row.get("ref") not in desired_refs
        ]
        if conflicts:
            raise CloudflareError(
                f"Unmanaged competing redirect remains for {host}: "
                + ",".join(str(row.get("id") or "unknown") for row in conflicts)
            )
    print(
        state,
        SUBDOMAIN_REDIRECT_PHASE,
        "managed_rule_count=",
        len(desired_rules),
        "total_rule_count=",
        len(rules),
    )
    safe_rules = []
    for position, row in enumerate(rules, start=1):
        from_value = (row.get("action_parameters") or {}).get("from_value") or {}
        target = from_value.get("target_url") or {}
        safe_rules.append(
            {
                "position": position,
                "ref": row.get("ref"),
                "description": row.get("description"),
                "expression": row.get("expression"),
                "action": row.get("action"),
                "enabled": row.get("enabled"),
                "statusCode": from_value.get("status_code"),
                "targetValue": target.get("value"),
                "targetExpression": target.get("expression"),
            }
        )
    return {
        "rulesetId": ruleset_id,
        "managedRuleCount": len(desired_rules),
        "totalRuleCount": len(rules),
        "refs": [row["ref"] for row in desired_rows],
        "blogSingleRedirectCount": 0,
        "allRules": safe_rules,
    }


def reconcile_bot_access(api: CloudflareApi, zone: str) -> dict[str, Any]:
    path = f"/zones/{zone}/bot_management"
    current = api.expect("GET", path).get("result") or {}
    targets = dict(BOT_ACCESS_SETTINGS)
    for key, value in OPTIONAL_BOT_ACCESS_SETTINGS.items():
        if key in current:
            targets[key] = value

    for key, desired in targets.items():
        if current.get(key) == desired:
            print("BOT_ACCESS_ALREADY_EXACT", key, json.dumps(desired))
            continue
        status, payload = api.raw("PUT", path, {key: desired})
        if status not in (200, 201) or payload.get("success") is not True:
            raise CloudflareError(
                f"Bot access setting {key} failed HTTP {status}: "
                f"{json.dumps(payload, ensure_ascii=False)[:1600]}",
                status=status,
                payload=payload,
            )
        current = payload.get("result") or current
        print("BOT_ACCESS_UPDATED", key, json.dumps(desired))

    after = api.expect("GET", path).get("result") or {}
    for key, desired in BOT_ACCESS_SETTINGS.items():
        if key not in after:
            raise CloudflareError(
                f"Required Bot Management field absent from read-back: {key}"
            )
        if after.get(key) != desired:
            raise CloudflareError(
                f"Bot access read-back drift for {key}: {after.get(key)!r}"
            )
    for key, desired in OPTIONAL_BOT_ACCESS_SETTINGS.items():
        if key in after and after.get(key) != desired:
            raise CloudflareError(
                f"Optional bot access read-back drift for {key}: {after.get(key)!r}"
            )
    summary = {
        key: after.get(key)
        for key in [*BOT_ACCESS_SETTINGS, *OPTIONAL_BOT_ACCESS_SETTINGS]
        if key in after
    }
    print("BOT_ACCESS_READBACK", json.dumps(summary, sort_keys=True))
    return after


def purge_canonical(api: CloudflareApi, zone: str, host: str) -> None:
    path = f"/zones/{zone}/purge_cache"
    # This zone is dedicated to the canonical site. Purge the entire zone so
    # tiered/regional cache shards and alternate cache-key variants cannot keep
    # an obsolete root representation after an atomic Pages release.
    for attempt in range(1, 31):
        status, payload = api.raw("POST", path, {"purge_everything": True})
        if status in (200, 201) and payload.get("success") is True:
            print("DEDICATED_ZONE_CACHE_PURGED", zone, "canonical_host=", host)
            return
        # A freshly issued narrow child token can take a few seconds to reach
        # every Cloudflare authorization edge. Retry only authentication
        # propagation; permission denials and other errors remain fail-closed.
        if status == 401 and attempt < 30:
            print("CACHE_PURGE_TOKEN_PROPAGATION_WAIT", attempt)
            time.sleep(1)
            continue
        raise CloudflareError(
            f"Cloudflare POST {path} failed HTTP {status}: "
            f"{json.dumps(payload, ensure_ascii=False)[:1800]}",
            status=status,
            payload=payload,
        )


def self_test(dist_dir: Path) -> None:
    headers_path = dist_dir / "_headers"
    if not headers_path.is_file():
        raise CloudflareError(
            f"Self-test requires finalized DIST headers at {headers_path}"
        )
    headers_text = headers_path.read_text(encoding="utf-8")
    csp = extract_header(headers_text, "/404.html", "Content-Security-Policy")
    if "{{" in csp or "unsafe-inline" in csp or "unsafe-eval" in csp:
        raise CloudflareError("Final 404 CSP is unresolved or weakened")
    cache = cache_rule("www.ghezelbaash.ir")
    if (cache.get("action_parameters") or {}).get("cache_key") != {
        "cache_deception_armor": True
    }:
        raise CloudflareError("Canonical cache deception armor contract drift")
    for setting_id, desired in {
        "ssl": "strict",
        "min_tls_version": "1.2",
        "always_online": "on",
        "cache_level": "aggressive",
        "ech": "on",
        "pq_keyex": "on",
        "fonts": "off",
        "speed_brain": "off",
    }.items():
        if ZONE_SETTINGS.get(setting_id) != desired:
            raise CloudflareError(f"Zone contract drift for {setting_id}")
    hsts = hsts_rule("www.ghezelbaash.ir")
    missing = not_found_rule("www.ghezelbaash.ir", csp)
    subdomain_contract = load_subdomain_redirect_contract(Path.cwd().resolve())
    subdomain_rules = subdomain_redirect_rules(subdomain_contract)
    if not rule_matches(json.loads(json.dumps(cache)), cache):
        raise CloudflareError("Cache rule subset comparator failed")
    drifted = json.loads(json.dumps(cache))
    drifted["action_parameters"]["cache"] = False
    if rule_matches(drifted, cache):
        raise CloudflareError("Cache rule drift was not detected")
    if "http.response.code eq 404" not in missing["expression"]:
        raise CloudflareError("Real 404 response match is missing")
    if BLOG_HOST not in missing["expression"]:
        raise CloudflareError("Historical blog 404 host is not protected by the fallback headers")
    if (
        hsts["action_parameters"]["headers"]["strict-transport-security"]["value"]
        != HSTS_VALUE
    ):
        raise CloudflareError("HSTS transform contract drift")
    if (
        missing["action_parameters"]["headers"]["content-security-policy"]["value"]
        != csp
    ):
        raise CloudflareError("Generated 404 CSP is not wired to the edge rule")
    if ZONE_SETTINGS["security_header"]["strict_transport_security"] != {
        "enabled": True,
        "max_age": 63_072_000,
        "include_subdomains": True,
        "preload": True,
        "nosniff": True,
    }:
        raise CloudflareError("HSTS contract drift")
    if ZONE_SETTINGS.get("tls_1_3") != "zrt" or ZONE_SETTINGS.get("0rtt") != "on":
        raise CloudflareError("TLS 1.3 / 0-RTT contract drift")
    if ZONE_SETTINGS.get("automatic_https_rewrites") != "off":
        raise CloudflareError("Automatic HTTPS Rewrites contract drift")
    single_contract = subdomain_contract["singleRedirects"]
    bulk_contract = subdomain_contract["bulkRedirects"]
    bulk_items = expand_bulk_redirect_items(subdomain_contract)
    desired_bulk_rule = bulk_redirect_rule(subdomain_contract)
    if len(subdomain_rules) != 3 or len(subdomain_rules) > int(
        single_contract["planRuleLimit"]
    ):
        raise CloudflareError("Cloudflare Free subdomain redirect quota drift")
    if any(row.get("action") != "redirect" for row in subdomain_rules):
        raise CloudflareError("Subdomain rule action drift")
    if any(
        bulk_contract["host"] in str(row.get("expression") or "")
        for row in subdomain_rules
    ):
        raise CloudflareError("Blog must not have a pre-emptive Single Redirect")
    if len(bulk_items) != 87 or len(bulk_items) > int(bulk_contract["planUrlLimit"]):
        raise CloudflareError("Historical blog Bulk Redirect inventory drift")
    if normalized_bulk_items(bulk_items) != normalized_bulk_items(bulk_items):
        raise CloudflareError("Bulk Redirect normalization is not stable")
    if desired_bulk_rule.get("action") != "redirect" or desired_bulk_rule.get(
        "expression"
    ) != f'http.request.full_uri in ${bulk_contract["listName"]}':
        raise CloudflareError("Bulk Redirect account rule contract drift")
    if any(
        not str(row["redirect"]["target_url"]).startswith(
            "https://www.ghezelbaash.ir/#"
        )
        for row in bulk_items
    ):
        raise CloudflareError("Historical blog target is not a visible canonical passage")
    machine_targets = {
        "ghezelbaash_github_entity_graph_v1": "https://www.ghezelbaash.ir/graph.jsonld",
        "ghezelbaash_ig_ai_corpus_v1": "https://www.ghezelbaash.ir/llms-full.txt",
    }
    actual_machine_targets = {
        str(row["ref"]): str(row["target"])
        for row in single_contract["rules"]
        if row.get("ref") in machine_targets
    }
    if actual_machine_targets != machine_targets:
        raise CloudflareError("First-party machine subdomain target drift")
    print(
        json.dumps(
            {
                "valid": True,
                "cacheRuleRef": CACHE_RULE_REF,
                "hstsRuleRef": HSTS_RULE_REF,
                "notFoundRuleRef": not_found_rule_ref(csp),
                "zoneSettingCount": len(ZONE_SETTINGS),
                "botAccessSettingCount": len(BOT_ACCESS_SETTINGS),
                "subdomainRedirectRuleCount": len(subdomain_rules),
                "subdomainRedirectRuleLimit": single_contract["planRuleLimit"],
                "historicalBlogRedirectCount": len(bulk_items),
                "bulkRedirectUrlLimit": bulk_contract["planUrlLimit"],
                "cspBytes": len(csp.encode("utf-8")),
            },
            sort_keys=True,
        )
    )


def apply(dist_dir: Path) -> dict[str, Any]:
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    zone_name = os.environ.get("ZONE_NAME", "").strip()
    host = os.environ.get("CANONICAL_HOST", "").strip()
    missing_env = [
        name
        for name, value in {
            "CLOUDFLARE_API_TOKEN": token,
            "CLOUDFLARE_ACCOUNT_ID": account,
            "ZONE_NAME": zone_name,
            "CANONICAL_HOST": host,
        }.items()
        if not value
    ]
    if missing_env:
        raise CloudflareError(f"Missing required environment: {', '.join(missing_env)}")
    if host != f"www.{zone_name}":
        raise CloudflareError(f"Unexpected canonical host/zone pairing: {host}/{zone_name}")

    subdomain_contract = load_subdomain_redirect_contract(Path.cwd().resolve())
    if subdomain_contract["zone"] != zone_name:
        raise CloudflareError("Runtime zone differs from subdomain redirect contract")

    headers_text = (dist_dir / "_headers").read_text(encoding="utf-8")
    csp_404 = extract_header(headers_text, "/404.html", "Content-Security-Policy")
    if "{{" in csp_404:
        raise CloudflareError("Refusing to publish an unresolved 404 CSP")

    parent_api = CloudflareApi(token)
    zone = zone_id(parent_api, account, zone_name)
    print("ZONE_RESOLVED", zone_name, zone)

    outcome: dict[str, Any] = {
        "schemaVersion": 1,
        "zone": zone_name,
        "host": host,
        "capabilities": {
            "pagesProject": False,
            "pagesCustomDomains": False,
            "pagesDnsBinding": False,
            "dns": False,
            "zoneSettings": False,
            "smartTieredCache": False,
            "cacheRule": False,
            "hstsTransformRule": False,
            "notFoundTransformRule": False,
            "historicalBlogBulkRedirects": False,
            "subdomainRedirectRules": False,
            "botManagement": False,
            "purgeCache": False,
        },
        "scopeGaps": [],
    }

    ensure_pages_custom_domains(parent_api, account)

    zone_api, revoke_ephemeral_zone_token = issue_ephemeral_zone_api(
        parent_api,
        account,
        zone,
        include_control_plane=True,
    )

    settings_readback = {}
    try:
        pages_dns_readback = reconcile_pages_dns_binding(zone_api, zone)
        outcome["capabilities"]["pagesDnsBinding"] = True
        outcome["pagesDnsBindingReadback"] = pages_dns_readback
        pages_domains_readback = wait_pages_custom_domains(parent_api, account)
        outcome["capabilities"]["pagesCustomDomains"] = True
        outcome["pagesCustomDomainsReadback"] = pages_domains_readback
        pages_readback = read_pages_contract(parent_api, account, host)
        outcome["capabilities"]["pagesProject"] = True
        outcome["pagesProjectReadback"] = pages_readback

        for setting_id, desired in ZONE_SETTINGS.items():
            settings_readback[setting_id] = reconcile_zone_setting(
                zone_api, zone, setting_id, desired
            )
        outcome["capabilities"]["zoneSettings"] = True
        outcome["zoneSettingsReadback"] = settings_readback

        smart_tiered_readback = reconcile_smart_tiered_cache(zone_api, zone)
        outcome["capabilities"]["smartTieredCache"] = True
        outcome["smartTieredCacheReadback"] = {
            "id": smart_tiered_readback.get("id"),
            "value": smart_tiered_readback.get("value"),
            "editable": smart_tiered_readback.get("editable"),
        }

        dns_readback = read_dns_contract(zone_api, zone, zone_name, host)
        outcome["capabilities"]["dns"] = True
        outcome["dnsReadback"] = dns_readback

        cache_readback = reconcile_canonical_cache_ruleset(
            zone_api, zone, host
        )
        outcome["capabilities"]["cacheRule"] = (
            cache_readback.get("ref") == CACHE_RULE_REF
        )
        outcome["cacheRuleReadback"] = {
            "ref": cache_readback.get("ref"),
            "expression": cache_readback.get("expression"),
            "enabled": cache_readback.get("enabled"),
            "cacheDeceptionArmor": (
                (cache_readback.get("action_parameters") or {})
                .get("cache_key", {})
                .get("cache_deception_armor")
            ),
        }

        bots_readback = reconcile_bot_access(zone_api, zone)
        outcome["capabilities"]["botManagement"] = True
        outcome["botReadback"] = {
            key: bots_readback.get(key)
            for key in [*BOT_ACCESS_SETTINGS, *OPTIONAL_BOT_ACCESS_SETTINGS]
            if key in bots_readback
        }

        purge_canonical(zone_api, zone, host)
        outcome["capabilities"]["purgeCache"] = True
    finally:
        revoke_ephemeral_zone_token()

    # The long-lived token remains the authority for account Bulk Redirects and
    # Transform Rules. Cache, DNS, Bot Management, Zone Settings and cache purge
    # have already passed exact read-back through the short-lived child token.
    api = parent_api

    bulk_ready = False
    try:
        bulk_readback = reconcile_bulk_redirects(
            api, account, subdomain_contract
        )
        expected_bulk_count = len(expand_bulk_redirect_items(subdomain_contract))
        bulk_ready = bulk_readback.get("itemCount") == expected_bulk_count
        if not bulk_ready:
            raise CloudflareError("Historical blog Bulk Redirect read-back count drift")
        outcome["capabilities"]["historicalBlogBulkRedirects"] = True
        outcome["historicalBlogBulkRedirectsReadback"] = bulk_readback
    except CloudflareError as exc:
        if not is_permission_error(exc):
            raise
        record_capability_gap(outcome, "historical_blog_bulk_redirects", exc)

    # Never remove the live blog catchall unless the exact account-level Bulk
    # Redirect list and rule have already passed their read-back checks.
    if bulk_ready:
        try:
            zone_redirect_api, revoke_zone_redirect_api = (
                issue_ephemeral_single_redirect_api(api, account, zone)
            )
            try:
                subdomain_readback = reconcile_subdomain_redirects(
                    zone_redirect_api, zone, subdomain_contract
                )
            finally:
                revoke_zone_redirect_api()
            outcome["capabilities"]["subdomainRedirectRules"] = (
                subdomain_readback.get("managedRuleCount")
                == len(subdomain_contract["singleRedirects"]["rules"])
            )
            outcome["subdomainRedirectsReadback"] = subdomain_readback
        except CloudflareError as exc:
            if not is_permission_error(exc):
                raise
            record_capability_gap(outcome, "subdomain_redirect_rules", exc)

    try:
        hsts_readback = reconcile_phase_rule(
            api,
            zone,
            "http_response_headers_transform",
            "Canonical response header transforms",
            "Git-managed response corrections for canonical and fallback responses",
            hsts_rule(host),
            must_be_last=False,
        )
        outcome["capabilities"]["hstsTransformRule"] = (
            hsts_readback.get("ref") == HSTS_RULE_REF
        )
    except CloudflareError as exc:
        if not is_permission_error(exc):
            raise
        record_capability_gap(outcome, "hsts_transform_rules", exc)

    try:
        not_found_readback = reconcile_phase_rule(
            api,
            zone,
            "http_response_headers_transform",
            "Canonical response header transforms",
            "Git-managed response corrections for canonical and fallback responses",
            not_found_rule(host, csp_404),
        )
        expected_not_found_ref = not_found_rule_ref(csp_404)
        prune_superseded_not_found_rules(api, zone, expected_not_found_ref)
        outcome["capabilities"]["notFoundTransformRule"] = (
            not_found_readback.get("ref") == expected_not_found_ref
        )
    except CloudflareError as exc:
        if not is_permission_error(exc):
            raise
        record_capability_gap(outcome, "not_found_transform_rules", exc)

    if not outcome["capabilities"]["purgeCache"]:
        try:
            purge_canonical(api, zone, host)
            outcome["capabilities"]["purgeCache"] = True
        except CloudflareError as exc:
            if not is_permission_error(exc):
                raise
            record_capability_gap(outcome, "cache_purge", exc)

    missing_capabilities = sorted(
        name
        for name, exact in outcome["capabilities"].items()
        if exact is not True
    )
    if missing_capabilities:
        raise CloudflareError(
            "Required Cloudflare capabilities were not proven exact: "
            + ", ".join(missing_capabilities)
        )
    print(
        "EDGE_RECONCILIATION_COMPLETE",
        json.dumps(outcome, sort_keys=True),
    )
    return outcome


def apply_subdomains_only(dist_dir: Path) -> dict[str, Any]:
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    zone_name = os.environ.get("ZONE_NAME", "").strip()
    missing_env = [
        name
        for name, value in {
            "CLOUDFLARE_API_TOKEN": token,
            "CLOUDFLARE_ACCOUNT_ID": account,
            "ZONE_NAME": zone_name,
        }.items()
        if not value
    ]
    if missing_env:
        raise CloudflareError(f"Missing required environment: {', '.join(missing_env)}")
    contract = load_subdomain_redirect_contract(Path.cwd().resolve())
    if contract["zone"] != zone_name:
        raise CloudflareError("Runtime zone differs from subdomain redirect contract")
    headers_text = (dist_dir / "_headers").read_text(encoding="utf-8")
    csp_404 = extract_header(headers_text, "/404.html", "Content-Security-Policy")
    api = CloudflareApi(token)
    zone = zone_id(api, account, zone_name)
    print("ZONE_RESOLVED", zone_name, zone)

    ensure_pages_custom_domains(api, account)
    zone_control_api, revoke_zone_control_api = issue_ephemeral_zone_api(
        api, account, zone, include_control_plane=True
    )
    try:
        pages_dns_readback = reconcile_pages_dns_binding(zone_control_api, zone)
        pages_domains_readback = wait_pages_custom_domains(api, account)

        # Account-level Bulk Redirects execute after zone-level Single Redirects.
        # The exact historical list must therefore be proven before any competing
        # blog catchall is removed.
        bulk_readback = reconcile_bulk_redirects(api, account, contract)
        expected_bulk_count = len(expand_bulk_redirect_items(contract))
        if bulk_readback.get("itemCount") != expected_bulk_count:
            raise CloudflareError("Historical blog Bulk Redirect read-back count drift")

        zone_redirect_api, revoke_zone_redirect_api = issue_ephemeral_single_redirect_api(
            api, account, zone
        )
        try:
            readback = reconcile_subdomain_redirects(zone_redirect_api, zone, contract)
        finally:
            revoke_zone_redirect_api()

        not_found_readback = reconcile_phase_rule(
            zone_control_api,
            zone,
            "http_response_headers_transform",
            "Canonical response header transforms",
            "Git-managed response corrections for canonical and fallback responses",
            not_found_rule(f"www.{zone_name}", csp_404),
        )
        expected_not_found_ref = not_found_rule_ref(csp_404)
        prune_superseded_not_found_rules(
            zone_control_api, zone, expected_not_found_ref
        )
    finally:
        revoke_zone_control_api()

    outcome = {
        "schemaVersion": 1,
        "mode": "subdomains-only",
        "zone": zone_name,
        "capabilities": {
            "pagesCustomDomains": True,
            "pagesDnsBinding": True,
            "historicalBlogBulkRedirects": True,
            "subdomainRedirectRules": True,
            "notFoundTransformRule": not_found_readback.get("ref") == expected_not_found_ref,
        },
        "pagesCustomDomainsReadback": pages_domains_readback,
        "pagesDnsBindingReadback": pages_dns_readback,
        "historicalBlogBulkRedirectsReadback": bulk_readback,
        "subdomainRedirectsReadback": readback,
        "notFoundTransformRuleReadback": {
            "ref": not_found_readback.get("ref"),
            "expression": not_found_readback.get("expression"),
            "enabled": not_found_readback.get("enabled"),
        },
        "scopeGaps": [],
    }
    if not outcome["capabilities"]["notFoundTransformRule"]:
        raise CloudflareError("Historical blog 404 transform rule read-back drift")
    print("SUBDOMAIN_EDGE_RECONCILIATION_COMPLETE", json.dumps(outcome, sort_keys=True))
    return outcome


def purge_cache_only() -> dict[str, Any]:
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    zone_name = os.environ.get("ZONE_NAME", "").strip()
    host = os.environ.get("CANONICAL_HOST", "").strip()
    missing_env = [
        name
        for name, value in {
            "CLOUDFLARE_API_TOKEN": token,
            "CLOUDFLARE_ACCOUNT_ID": account,
            "ZONE_NAME": zone_name,
            "CANONICAL_HOST": host,
        }.items()
        if not value
    ]
    if missing_env:
        raise CloudflareError(f"Missing required environment: {', '.join(missing_env)}")
    if host != f"www.{zone_name}":
        raise CloudflareError(f"Unexpected canonical host/zone pairing: {host}/{zone_name}")
    parent_api = CloudflareApi(token)
    zone = zone_id(parent_api, account, zone_name)
    zone_api, revoke_zone_api = issue_ephemeral_zone_api(parent_api, account, zone)
    try:
        purge_canonical(zone_api, zone, host)
    finally:
        revoke_zone_api()
    outcome = {
        "schemaVersion": 1,
        "mode": "cache-purge-only",
        "zone": zone_name,
        "host": host,
        "purged": True,
    }
    print("CACHE_PURGE_COMPLETE", json.dumps(outcome, sort_keys=True))
    return outcome


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--self-test", action="store_true")
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--apply-subdomains-only", action="store_true")
    mode.add_argument("--purge-cache-only", action="store_true")
    parser.add_argument("--dist", default="dist")
    parser.add_argument("--outcome", default="edge-reconciliation.json")
    args = parser.parse_args()
    try:
        dist_dir = Path(args.dist).resolve()
        if args.self_test:
            self_test(dist_dir)
        elif args.apply_subdomains_only:
            outcome = apply_subdomains_only(dist_dir)
            outcome_path = Path(args.outcome).resolve()
            outcome_path.write_text(
                json.dumps(outcome, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            print("EDGE_OUTCOME_WRITTEN", outcome_path)
        elif args.purge_cache_only:
            outcome = purge_cache_only()
            outcome_path = Path(args.outcome).resolve()
            outcome_path.write_text(
                json.dumps(outcome, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            print("EDGE_OUTCOME_WRITTEN", outcome_path)
        else:
            outcome = apply(dist_dir)
            outcome_path = Path(args.outcome).resolve()
            outcome_path.write_text(
                json.dumps(outcome, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            print("EDGE_OUTCOME_WRITTEN", outcome_path)
        return 0
    except (CloudflareError, OSError, ValueError, KeyError) as exc:
        print(f"CLOUDFLARE_EDGE_ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
