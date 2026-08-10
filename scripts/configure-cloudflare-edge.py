#!/usr/bin/env python3
"""Reconcile the Cloudflare edge with the immutable Astro DIST contract.

The production API token is supplied only by GitHub Actions. This module keeps
all mutations narrow, idempotent, read back after write, and scoped to the
canonical hostname or the exact zone settings required by the site.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


API_BASE = "https://api.cloudflare.com/client/v4"
CACHE_RULE_REF = "ghezelbaash_canonical_dist_cache_v1"
NOT_FOUND_RULE_REF = "ghezelbaash_real_404_headers_v1"


class CloudflareError(RuntimeError):
    pass


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
            "edge_ttl": {"mode": "respect_origin"},
            "browser_ttl": {"mode": "respect_origin"},
            "serve_stale": {"disable_stale_while_updating": False},
            "respect_strong_etags": True,
        },
        "enabled": True,
    }


def not_found_rule(host: str, csp: str) -> dict[str, Any]:
    return {
        "ref": NOT_FOUND_RULE_REF,
        "expression": f'(http.host eq "{host}" and http.response.code eq 404)',
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


ZONE_SETTINGS: dict[str, Any] = {
    "always_use_https": "on",
    "http2": "on",
    "http3": "on",
    "brotli": "on",
    "ipv6": "on",
    "tls_1_3": "on",
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

# Cloudflare documents Crawler Hints as dashboard-managed and does not expose it
# in the current public Zone Settings SDK. Probe the generic setting endpoint so
# accounts where it is available still get it, but rely on the repository's
# independently verified IndexNow workflow when the API reports it unknown.
OPTIONAL_ZONE_SETTINGS: dict[str, Any] = {
    "crawler_hints": "on",
    # Auto Minify has been retired from some current Cloudflare accounts. The
    # exact production Repr-Digest check independently proves no HTML mutation.
    "minify": {"css": "off", "html": "off", "js": "off"},
}


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
        self, method: str, path: str, body: dict[str, Any] | None = None
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
        body: dict[str, Any] | None = None,
        ok: tuple[int, ...] = (200,),
    ) -> dict[str, Any]:
        status, payload = self.raw(method, path, body)
        if status not in ok or payload.get("success") is not True:
            raise CloudflareError(
                f"Cloudflare {method} {path} failed HTTP {status}: "
                f"{json.dumps(payload, ensure_ascii=False)[:1800]}"
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
        if current and rule_matches(current, desired) and rules[-1].get("id") == current.get("id"):
            state = "ALREADY_EXACT"
        elif current:
            body = dict(desired)
            if rules[-1].get("id") != current.get("id"):
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
    if not rules or rules[-1].get("id") != owned[0].get("id"):
        raise CloudflareError(
            f"Owned {phase} rule is not last; a later rule could override it"
        )
    print(state, phase, desired["ref"], "rule_count=", len(rules))
    return owned[0]


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
                f"{json.dumps(payload, ensure_ascii=False)[:1600]}"
            )
        current = payload.get("result") or current
        print("BOT_ACCESS_UPDATED", key, json.dumps(desired))

    after = api.expect("GET", path).get("result") or {}
    for key, desired in BOT_ACCESS_SETTINGS.items():
        if key in after and after.get(key) != desired:
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
    status, payload = api.raw("POST", path, {"hosts": [host]})
    if status in (200, 201) and payload.get("success") is True:
        print("CANONICAL_HOST_CACHE_PURGED", host)
        return
    print(
        "HOST_PURGE_UNAVAILABLE_FALLING_BACK_TO_ZONE_PURGE",
        status,
        json.dumps(payload, ensure_ascii=False)[:800],
    )
    api.expect("POST", path, {"purge_everything": True}, ok=(200, 201))
    print("ZONE_CACHE_PURGED", zone)


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
    missing = not_found_rule("www.ghezelbaash.ir", csp)
    if not rule_matches(json.loads(json.dumps(cache)), cache):
        raise CloudflareError("Cache rule subset comparator failed")
    drifted = json.loads(json.dumps(cache))
    drifted["action_parameters"]["cache"] = False
    if rule_matches(drifted, cache):
        raise CloudflareError("Cache rule drift was not detected")
    if "http.response.code eq 404" not in missing["expression"]:
        raise CloudflareError("Real 404 response match is missing")
    if (
        missing["action_parameters"]["headers"]["content-security-policy"]["value"]
        != csp
    ):
        raise CloudflareError("Generated 404 CSP is not wired to the edge rule")
    if ZONE_SETTINGS["security_header"]["strict_transport_security"]["max_age"] != 63_072_000:
        raise CloudflareError("HSTS contract drift")
    print(
        json.dumps(
            {
                "valid": True,
                "cacheRuleRef": CACHE_RULE_REF,
                "notFoundRuleRef": NOT_FOUND_RULE_REF,
                "zoneSettingCount": len(ZONE_SETTINGS),
                "optionalZoneSettingCount": len(OPTIONAL_ZONE_SETTINGS),
                "botAccessSettingCount": len(BOT_ACCESS_SETTINGS),
                "cspBytes": len(csp.encode("utf-8")),
            },
            sort_keys=True,
        )
    )


def apply(dist_dir: Path) -> None:
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

    headers_text = (dist_dir / "_headers").read_text(encoding="utf-8")
    csp_404 = extract_header(headers_text, "/404.html", "Content-Security-Policy")
    if "{{" in csp_404:
        raise CloudflareError("Refusing to publish an unresolved 404 CSP")

    api = CloudflareApi(token)
    zone = zone_id(api, account, zone_name)
    print("ZONE_RESOLVED", zone_name, zone)

    settings_readback = {}
    for setting_id, desired in ZONE_SETTINGS.items():
        settings_readback[setting_id] = reconcile_zone_setting(
            api, zone, setting_id, desired
        )
    for setting_id, desired in OPTIONAL_ZONE_SETTINGS.items():
        try:
            settings_readback[setting_id] = reconcile_zone_setting(
                api, zone, setting_id, desired
            )
        except CloudflareError as exc:
            print(
                "OPTIONAL_ZONE_SETTING_API_UNAVAILABLE",
                setting_id,
                str(exc)[:1200],
            )

    cache_readback = reconcile_phase_rule(
        api,
        zone,
        "http_request_cache_settings",
        "Canonical DIST cache rules",
        "Git-managed cache eligibility for the immutable static production DIST",
        cache_rule(host),
    )
    not_found_readback = reconcile_phase_rule(
        api,
        zone,
        "http_response_headers_transform",
        "Canonical response header transforms",
        "Git-managed response corrections for Cloudflare Pages fallbacks",
        not_found_rule(host, csp_404),
    )
    bots_readback = reconcile_bot_access(api, zone)
    purge_canonical(api, zone, host)

    print(
        "EDGE_RECONCILIATION_COMPLETE",
        json.dumps(
            {
                "zone": zone_name,
                "host": host,
                "settings": len(settings_readback),
                "cacheRule": cache_readback.get("ref"),
                "responseRule": not_found_readback.get("ref"),
                "aiBotsProtection": bots_readback.get("ai_bots_protection"),
                "managedRobots": bots_readback.get("is_robots_txt_managed"),
            },
            sort_keys=True,
        ),
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--self-test", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--dist", default="dist")
    args = parser.parse_args()
    try:
        dist_dir = Path(args.dist).resolve()
        if args.self_test:
            self_test(dist_dir)
        else:
            apply(dist_dir)
        return 0
    except (CloudflareError, OSError, ValueError, KeyError) as exc:
        print(f"CLOUDFLARE_EDGE_ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
