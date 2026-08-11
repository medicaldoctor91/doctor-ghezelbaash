#!/usr/bin/env python3
"""Install the Cloudflare cache guard that keeps Pages redirects deterministic.

This is a narrow 2026 cache-response hardening layer. The existing edge
reconciler remains authoritative for zone settings, bot access, HSTS, headers
and the canonical cache rule. This module makes any non-canonical/legacy path
non-cacheable *before* Cloudflare stores the origin response, and also prevents
3xx/4xx responses on canonical paths from entering edge cache.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
EDGE_PATH = HERE / "configure-cloudflare-edge.py"
RESPONSE_CACHE_RULE_REF = "ghezelbaash_redirect_cache_guard_v1"
OUTCOME_SCHEMA = 1

spec = importlib.util.spec_from_file_location("ghezelbaash_edge_core", EDGE_PATH)
if spec is None or spec.loader is None:
    raise SystemExit("Unable to load configure-cloudflare-edge.py")
edge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edge)


def fail(message: str) -> None:
    raise edge.CloudflareError(message)


def parse_static_redirects(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        fail(f"Missing finalized redirects file: {path}")
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for line_no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) != 3:
            fail(f"_redirects line {line_no} must have source target status")
        source, target, status_raw = parts
        try:
            status = int(status_raw)
        except ValueError as exc:
            raise edge.CloudflareError(
                f"_redirects line {line_no} has non-integer status {status_raw!r}"
            ) from exc
        if not source.startswith("/"):
            fail(f"_redirects line {line_no} source must be root-relative: {source}")
        if source in seen:
            fail(f"Duplicate _redirects source: {source}")
        if status < 300 or status > 399:
            fail(f"_redirects line {line_no} is not a redirect status: {status}")
        seen.add(source)
        rows.append(
            {
                "line": line_no,
                "source": source,
                "target": target,
                "status": status,
            }
        )
    if not rows:
        fail("Finalized _redirects contains no redirect rules")
    return rows


def quote_expr(value: str) -> str:
    return json.dumps(value, ensure_ascii=True)


def canonical_safe_paths(dist_dir: Path, redirects: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
    redirect_sources = {row["source"] for row in redirects}
    excluded = {"_headers", "_redirects", "index.html"}
    exact = {"/"}
    for entry in dist_dir.iterdir():
        if not entry.is_file() or entry.name in excluded:
            continue
        route = f"/{entry.name}"
        if route not in redirect_sources:
            exact.add(route)

    prefixes: list[str] = []
    for directory in ("assets", "media", "fonts"):
        if (dist_dir / directory).is_dir():
            prefix = f"/{directory}/"
            # A future redirect inside one of these immutable namespaces is still
            # protected by the response-status clause below. The prefix stays safe
            # for successful immutable assets so their aggressive cache contract
            # remains intact.
            prefixes.append(prefix)

    return sorted(exact), prefixes


def cache_guard_rule(host: str, dist_dir: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    redirects = parse_static_redirects(dist_dir / "_redirects")
    exact, prefixes = canonical_safe_paths(dist_dir, redirects)

    exact_set = " ".join(quote_expr(path) for path in exact)
    safe_parts = [f"http.request.uri.path in {{{exact_set}}}"]
    safe_parts.extend(
        f"starts_with(http.request.uri.path, {quote_expr(prefix)})"
        for prefix in prefixes
    )
    safe_expr = "(" + " or ".join(safe_parts) + ")"

    expression = (
        f'(http.host eq {quote_expr(host)} and '
        'http.request.method in {"GET" "HEAD"} and '
        f'((http.response.code ge 300 and http.response.code le 499) '
        f'or not {safe_expr}))'
    )
    rule = {
        "ref": RESPONSE_CACHE_RULE_REF,
        "expression": expression,
        "description": (
            "Pages redirect/error cache guard: never store legacy or unknown paths, "
            "and never store 3xx/4xx responses before Pages redirect state can change"
        ),
        "action": "set_cache_control",
        "action_parameters": {
            "no-store": {
                "operation": "set",
                "cloudflare_only": True,
            }
        },
        "enabled": True,
    }
    contract = {
        "redirectCount": len(redirects),
        "redirectSources": [row["source"] for row in redirects],
        "safeExactPaths": exact,
        "safePrefixes": prefixes,
    }
    return rule, contract


def self_test(dist_dir: Path) -> dict[str, Any]:
    rule, contract = cache_guard_rule("www.ghezelbaash.ir", dist_dir)
    expression = rule["expression"]
    for source in contract["redirectSources"]:
        if source in contract["safeExactPaths"]:
            fail(f"Redirect source leaked into canonical safe path set: {source}")
    if "/" not in contract["safeExactPaths"]:
        fail("Canonical root missing from safe cache path set")
    if "http.response.code ge 300" not in expression or "http.response.code le 499" not in expression:
        fail("3xx/4xx response guard missing")
    if "or not" not in expression:
        fail("Unknown/legacy path cache guard missing")
    if len(expression) > 4096:
        fail(f"Cache Response Rule expression exceeds Cloudflare limit: {len(expression)}")
    no_store = rule.get("action_parameters", {}).get("no-store", {})
    if (
        rule.get("action") != "set_cache_control"
        or no_store.get("operation") != "set"
        or no_store.get("cloudflare_only") is not True
    ):
        fail("Cache Response Rule no-store contract drift")
    print(
        json.dumps(
            {
                "valid": True,
                "responseCacheRuleRef": RESPONSE_CACHE_RULE_REF,
                **contract,
            },
            sort_keys=True,
        )
    )
    return contract


def required_env() -> dict[str, str]:
    names = (
        "CLOUDFLARE_API_TOKEN",
        "CLOUDFLARE_ACCOUNT_ID",
        "ZONE_NAME",
        "CANONICAL_HOST",
    )
    values = {name: os.environ.get(name, "").strip() for name in names}
    missing = [name for name, value in values.items() if not value]
    if missing:
        fail(f"Missing required environment: {', '.join(missing)}")
    if values["CANONICAL_HOST"] != f'www.{values["ZONE_NAME"]}':
        fail(
            "Unexpected canonical host/zone pairing: "
            f'{values["CANONICAL_HOST"]}/{values["ZONE_NAME"]}'
        )
    return values


def apply(dist_dir: Path, outcome_path: Path) -> dict[str, Any]:
    values = required_env()
    token = values["CLOUDFLARE_API_TOKEN"]
    account = values["CLOUDFLARE_ACCOUNT_ID"]
    zone_name = values["ZONE_NAME"]
    host = values["CANONICAL_HOST"]

    api = edge.CloudflareApi(token)
    zone = edge.zone_id(api, account, zone_name)
    rule, contract = cache_guard_rule(host, dist_dir)

    readback = edge.reconcile_phase_rule(
        api,
        zone,
        "http_response_cache_settings",
        "Canonical Pages response cache guards",
        "Git-managed pre-cache guards for redirects, legacy paths and client errors",
        rule,
    )
    if readback.get("ref") != RESPONSE_CACHE_RULE_REF:
        fail("Cache Response Rule read-back ref mismatch")

    # Purging is mandatory here. A newly installed response guard cannot evict
    # an object that was cached before the guard existed, so successful purge is
    # part of the correctness contract rather than a best-effort optimization.
    edge.purge_canonical(api, zone, host)

    outcome = {
        "schemaVersion": OUTCOME_SCHEMA,
        "valid": True,
        "zone": zone_name,
        "host": host,
        "responseCacheRule": True,
        "purgeRequiredAndCompleted": True,
        "responseCacheRuleRef": RESPONSE_CACHE_RULE_REF,
        **contract,
    }
    outcome_path.write_text(
        json.dumps(outcome, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print("REDIRECT_CACHE_HARDENING_COMPLETE", json.dumps(outcome, sort_keys=True))
    return outcome


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--self-test", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--dist", default="dist")
    parser.add_argument("--outcome", default="redirect-cache-hardening.json")
    args = parser.parse_args()

    try:
        dist_dir = Path(args.dist).resolve()
        if not dist_dir.is_dir():
            fail(f"Missing DIST directory: {dist_dir}")
        if args.self_test:
            self_test(dist_dir)
        else:
            apply(dist_dir, Path(args.outcome).resolve())
        return 0
    except (edge.CloudflareError, OSError, ValueError, KeyError) as exc:
        print(f"REDIRECT_CACHE_HARDENING_ERROR: {exc}", file=os.sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
