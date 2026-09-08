#!/usr/bin/env python3
"""Reconcile required Cloudflare settings and bot access before publication."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


HERE = Path(__file__).resolve().parent
EDGE_PATH = HERE / "configure-cloudflare-edge.py"
spec = importlib.util.spec_from_file_location("ghezelbaash_edge", EDGE_PATH)
if spec is None or spec.loader is None:
    raise SystemExit("Unable to load configure-cloudflare-edge.py")
edge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edge)

EXPECTED_HSTS = {
    "enabled": True,
    "max_age": 63_072_000,
    "include_subdomains": True,
    "preload": True,
    "nosniff": True,
}
REQUIRED_ENV = (
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "ZONE_NAME",
    "CANONICAL_HOST",
)


def fail(message: str) -> None:
    raise edge.CloudflareError(message)


def validate_static_contract() -> None:
    if edge.ZONE_SETTINGS.get("always_online") != "off":
        fail("Always Online must remain off so route-specific stale policy is effective")
    if edge.ZONE_SETTINGS.get("tls_1_3") != "zrt":
        fail("Required TLS 1.3 contract must be zrt")
    if edge.ZONE_SETTINGS.get("0rtt") != "on":
        fail("Required 0-RTT contract must be on")
    if edge.ZONE_SETTINGS.get("automatic_https_rewrites") != "off":
        fail("Automatic HTTPS Rewrites must remain off")
    hsts = (
        edge.ZONE_SETTINGS.get("security_header", {})
        .get("strict_transport_security", {})
    )
    if hsts != EXPECTED_HSTS:
        fail(f"Required HSTS contract drift: {hsts!r}")


def check_live_apex_hsts(zone_name: str) -> None:
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    opener = urllib.request.build_opener(NoRedirect)
    request = urllib.request.Request(
        f"https://{zone_name}/",
        headers={"User-Agent": "ghezelbaash-edge-preflight/1.0"},
    )
    try:
        try:
            with opener.open(request, timeout=30) as response:
                status = response.status
                hsts = response.headers.get("Strict-Transport-Security") or ""
        except urllib.error.HTTPError as exc:
            status = exc.code
            hsts = exc.headers.get("Strict-Transport-Security") or ""
    except Exception as exc:
        fail(f"Unable to verify apex HTTPS/HSTS: {type(exc).__name__}: {exc}")

    lowered = hsts.lower()
    if not (
        "max-age=63072000" in lowered
        and "includesubdomains" in lowered
        and "preload" in lowered
    ):
        fail(f"Apex HSTS read-back mismatch HTTP {status}: {hsts!r}")
    print("APEX_HSTS_EXACT", status, hsts)


def diagnose_request_overrides(api, zone: str) -> dict:
    """Read per-request overrides without modifying rules or logging request secrets.

    A zone-level browser_check=off does not prove that a Configuration Rule or
    Page Rule cannot enable BIC again. These optional diagnostics do not replace
    the required settings read-back or the workflow's ordinary machine probe.
    """
    endpoints = {
        "configuration_rules": f"/zones/{zone}/rulesets/phases/http_config_settings/entrypoint",
        "page_rules": f"/zones/{zone}/pagerules",
        "user_agent_rules": f"/zones/{zone}/firewall/ua_rules?paused=false&per_page=1000&page=1",
    }
    observed = {}
    for kind, path in endpoints.items():
        try:
            status, payload = api.raw("GET", path)
            summary = {"kind": kind, "httpStatus": status}
            if status != 200 or payload.get("success") is not True:
                summary["errorCodes"] = [
                    row.get("code") for row in payload.get("errors", [])
                ]
            else:
                result = payload.get("result") or []
                observed[kind] = result
                rows = result.get("rules", []) if isinstance(result, dict) else result
                safe_rows = []
                for position, row in enumerate(rows):
                    safe = {
                        key: row[key] for key in
                        ("id", "ref", "enabled", "status", "action", "mode", "priority", "paused")
                        if key in row
                    }
                    safe["position"] = position
                    expression = str(row.get("expression") or "")
                    if expression:
                        safe["expressionSha256"] = hashlib.sha256(expression.encode()).hexdigest()
                        # Host/path expressions are useful diagnostic context; redact
                        # anything inspecting headers, cookies, query strings or bodies.
                        fields = set(re.findall(r"\b(?:http|cf|ip)\.[A-Za-z0-9_.]+", expression))
                        if fields <= {"http.host", "http.request.uri.path", "http.request.method", "cf.client.bot", "ip.src"}:
                            safe["expression"] = expression
                    parameters = row.get("action_parameters") or {}
                    safe["settings"] = {
                        key: parameters[key] for key in ("bic", "security_level")
                        if key in parameters
                    }
                    safe["pageSettings"] = [
                        {"id": action["id"], "value": action.get("value")}
                        for action in row.get("actions", [])
                        if action.get("id") in ("browser_check", "security_level", "disable_security")
                    ]
                    safe["targets"] = []
                    for target in row.get("targets", []):
                        constraint = target.get("constraint") or {}
                        value = str(constraint.get("value") or "")
                        safe["targets"].append({
                            "target": target.get("target"),
                            "operator": constraint.get("operator"),
                            "value": value if "?" not in value else "[query redacted]",
                            "valueSha256": hashlib.sha256(value.encode()).hexdigest(),
                        })
                    configuration = row.get("configuration") or {}
                    if configuration.get("target") == "ua":
                        safe["userAgent"] = configuration.get("value")
                    safe_rows.append(safe)
                summary["rules"] = safe_rows
                summary["resultInfo"] = payload.get("result_info") or {}
            print("CLOUDFLARE_REQUEST_OVERRIDE_DIAGNOSTIC", json.dumps(summary, sort_keys=True))
        except (edge.CloudflareError, OSError, ValueError, KeyError, TypeError) as exc:
            # Diagnostic access may be narrower than settings access. Do not expose
            # raw API payloads or change the mandatory publication gates.
            print("CLOUDFLARE_REQUEST_OVERRIDE_DIAGNOSTIC_UNAVAILABLE", kind, type(exc).__name__)
    return observed


def ensure_public_browser_integrity(api, zone: str, host: str, overrides: dict) -> None:
    """Maintain the owned public BIC rule, or repair a proven browser-signature block.

    The release workflow still verifies an ordinary Python client after this
    function, allowing the edge rule time to propagate before publication.
    """
    configuration = overrides.get("configuration_rules") or {}
    rules = configuration.get("rules", []) if isinstance(configuration, dict) else []
    if any(row.get("ref") == edge.REQUEST_INTEGRITY_RULE_REF for row in rules):
        edge.reconcile_public_browser_integrity(api, zone, host)
        return

    url = f"https://{host}/graph.jsonld"
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            if response.status != 200 or response.geturl() != url:
                fail("Public graph must return directly at the canonical URL with HTTP 200")
            graph = json.load(response)
            if not isinstance(graph, dict) or not isinstance(graph.get("@graph"), list):
                fail("Public graph response is not the canonical JSON-LD document")
        print("CLOUDFLARE_PUBLIC_BROWSER_INTEGRITY_ALREADY_ACCESSIBLE")
    except urllib.error.HTTPError as exc:
        body = exc.read(512).strip()
        print("CLOUDFLARE_PUBLIC_MACHINE_RESPONSE", json.dumps({
            "httpStatus": exc.code,
            "cfRay": exc.headers.get("CF-Ray"),
            "contentType": exc.headers.get("Content-Type"),
            "browserSignatureBlock": exc.code == 403 and body == b"error code: 1010",
        }, sort_keys=True))
        if exc.code != 403 or body != b"error code: 1010":
            fail(f"Public graph HTTP {exc.code} is not an identified Browser Integrity Check block")
        edge.reconcile_public_browser_integrity(api, zone, host)


def probe_public_machine_url(url: str) -> dict:
    """Observe a public URL with the unmodified standard-library client."""
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            status, headers, response_url, body = response.status, response.headers, response.geturl(), b""
    except urllib.error.HTTPError as exc:
        status, headers, response_url, body = exc.code, exc.headers, exc.geturl(), exc.read(512).strip()
    target = urllib.parse.urlsplit(response_url)
    return {
        "httpStatus": status,
        "cfRay": headers.get("CF-Ray"),
        "cfErrorType": headers.get("CF-Error-Type"),
        "cfErrorOrigin": headers.get("CF-Error-Origin"),
        "cfCacheStatus": headers.get("CF-Cache-Status"),
        "responseDate": headers.get("Date"),
        "responseAge": headers.get("Age"),
        "responseHost": target.hostname,
        "responsePath": target.path,
        "contentType": headers.get("Content-Type"),
        "browserSignatureBlock": status == 403 and body == b"error code: 1010",
    }


def diagnose_available_python_patch(urls: list[str]) -> None:
    """Compare an already installed newer patch; never install or change the gate runtime."""
    cache = os.environ.get("RUNNER_TOOL_CACHE")
    if not cache:
        return
    candidates = []
    for directory in (Path(cache) / "Python").glob("*"):
        if not re.fullmatch(r"\d+\.\d+\.\d+", directory.name):
            continue
        version = tuple(map(int, directory.name.split(".")))
        executable = directory / "x64" / "bin" / "python"
        if version[:2] == sys.version_info[:2] and version > sys.version_info[:3] and executable.is_file():
            candidates.append((version, executable))
    if not candidates:
        print("CLOUDFLARE_INSTALLED_PATCH_COMPARISON_UNAVAILABLE no_newer_installed_patch")
        return
    version, executable = max(candidates)
    prefix = executable.parent.parent
    child_env = os.environ.copy()
    child_env["LD_LIBRARY_PATH"] = str(prefix / "lib") + (
        ":" + child_env["LD_LIBRARY_PATH"] if child_env.get("LD_LIBRARY_PATH") else ""
    )
    child_env["PYTHONHOME"] = str(prefix)
    child_env.pop("PYTHONPATH", None)
    program = (
        "import json,runpy,ssl,sys; "
        "ns=runpy.run_path(sys.argv[1]); "
        "print(json.dumps({'python':sys.version.split()[0],'tlsLibrary':ssl.OPENSSL_VERSION,"
        "'responses':[ns['probe_public_machine_url'](url) for url in sys.argv[2:]]},sort_keys=True))"
    )
    try:
        result = subprocess.run(
            [str(executable), "-c", program, str(Path(__file__).resolve()), *urls],
            capture_output=True, text=True, timeout=75, check=True, env=child_env,
        )
        comparison = json.loads(result.stdout)
        if comparison.get("python") != ".".join(map(str, version)):
            raise ValueError("Installed patch runtime identity mismatch")
        print("CLOUDFLARE_INSTALLED_PATCH_COMPARISON", json.dumps(comparison, sort_keys=True))
    except (OSError, subprocess.SubprocessError, ValueError):
        print("CLOUDFLARE_INSTALLED_PATCH_COMPARISON_UNAVAILABLE probe_failed")


def diagnose_serving_zone(api, zone: str, account: str) -> None:
    """Compare the configured zone with public DNS delegation, without changing it."""
    try:
        metadata = api.expect("GET", f"/zones/{zone}").get("result") or {}
        assigned = sorted(str(name).rstrip(".").lower() for name in metadata.get("name_servers", []))
        zone_name = edge.PLATFORM_CONTRACT["zoneName"]
        query = urllib.parse.urlencode({"name": zone_name, "type": "NS"})
        request = urllib.request.Request(
            "https://cloudflare-dns.com/dns-query?" + query,
            headers={"Accept": "application/dns-json"},
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            dns = json.load(response)
        delegated = sorted({
            str(row["data"]).rstrip(".").lower()
            for row in dns.get("Answer", []) if row.get("type") == 2
        })
        print("CLOUDFLARE_SERVING_ZONE_DIAGNOSTIC", json.dumps({
            "zoneName": metadata.get("name"), "status": metadata.get("status"),
            "zoneType": metadata.get("type"),
            "accountMatchesContract": (metadata.get("account") or {}).get("id") == account,
            "assignedNameservers": assigned, "publicNameservers": delegated,
            "delegationMatches": bool(assigned) and assigned == delegated,
            "dnsStatus": dns.get("Status"),
        }, sort_keys=True))
    except (edge.CloudflareError, OSError, ValueError, KeyError, TypeError) as exc:
        print("CLOUDFLARE_SERVING_ZONE_DIAGNOSTIC_UNAVAILABLE", type(exc).__name__)


def diagnose_public_machine_response(parent_api, account: str, host: str, *, zone_api=None, zone=None) -> None:
    """Trace a real public denial without changing the mandatory publication gate."""
    try:
        url = f"https://{host}/graph.jsonld"
        observed = probe_public_machine_url(url)
        print("CLOUDFLARE_PUBLIC_MACHINE_DIAGNOSTIC", json.dumps({
            **observed, "python": sys.version.split()[0], "tlsLibrary": ssl.OPENSSL_VERSION,
        }, sort_keys=True))
        if observed["httpStatus"] == 403:
            if zone_api is not None and zone is not None:
                diagnose_serving_zone(zone_api, zone, account)
            pages_url = f"https://{edge.PAGES_ORIGIN_HOST}/graph.jsonld"
            try:
                print("CLOUDFLARE_PAGES_ORIGIN_DIAGNOSTIC", json.dumps(probe_public_machine_url(pages_url), sort_keys=True))
            except (OSError, ValueError) as exc:
                print("CLOUDFLARE_PAGES_ORIGIN_DIAGNOSTIC_UNAVAILABLE", type(exc).__name__)
            diagnose_available_python_patch([url, pages_url])
            try:
                edge.trace_public_machine_request(parent_api, account, host)
            except (edge.CloudflareError, OSError, ValueError, KeyError, TypeError) as exc:
                print("CLOUDFLARE_PUBLIC_MACHINE_TRACE_UNAVAILABLE", json.dumps({
                    "errorType": type(exc).__name__, "httpStatus": getattr(exc, "status", None)
                }, sort_keys=True))
            if zone_api is not None and zone is not None:
                try:
                    # Give the observed request some ingestion time. Sampled empty
                    # results still remain inconclusive after this bounded delay.
                    time.sleep(15)
                    security_event = edge.diagnose_security_event(zone_api, zone, observed.get("cfRay") or "")
                    if security_event.get("status") != "events":
                        edge.diagnose_origin_response(zone_api, zone)
                except (edge.CloudflareError, OSError, ValueError, KeyError, TypeError) as exc:
                    print("CLOUDFLARE_SECURITY_EVENT_DIAGNOSTIC_UNAVAILABLE", json.dumps({
                        "errorType": type(exc).__name__, "httpStatus": getattr(exc, "status", None)
                    }, sort_keys=True))
    except (edge.CloudflareError, OSError, ValueError, KeyError, TypeError) as exc:
        print("CLOUDFLARE_PUBLIC_MACHINE_TRACE_UNAVAILABLE", json.dumps({
            "errorType": type(exc).__name__, "httpStatus": getattr(exc, "status", None)
        }, sort_keys=True))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--if-configured", action="store_true")
    args = parser.parse_args()

    values = {name: os.environ.get(name, "").strip() for name in REQUIRED_ENV}
    # `--if-configured` is a credential-aware optional live gate. Build environments may
    # legitimately know a public account/project identifier without receiving a privileged
    # API token; that partial public context must not be treated as an attempted live mutation.
    # Once a token is supplied, however, all companion identity fields are mandatory and the
    # check remains fail-closed.
    if args.if_configured and not values["CLOUDFLARE_API_TOKEN"]:
        print("CLOUDFLARE_PREFLIGHT_SKIPPED api_token_not_configured")
        return 0
    missing = [name for name, value in values.items() if not value]
    if missing:
        print(
            f"CLOUDFLARE_PREFLIGHT_ERROR: Missing required environment: {', '.join(missing)}",
            file=sys.stderr,
        )
        return 1

    token = values["CLOUDFLARE_API_TOKEN"]
    account = values["CLOUDFLARE_ACCOUNT_ID"]
    zone_name = values["ZONE_NAME"]
    host = values["CANONICAL_HOST"]
    if account != edge.PLATFORM_CF["accountId"] or zone_name != edge.PLATFORM_CONTRACT["zoneName"] or host != edge.PLATFORM_CONTRACT["canonicalHost"]:
        print("CLOUDFLARE_PREFLIGHT_ERROR: Environment disagrees with platform contract", file=sys.stderr)
        return 1
    if host != f"www.{zone_name}":
        print(
            f"CLOUDFLARE_PREFLIGHT_ERROR: Unexpected canonical host/zone pairing: {host}/{zone_name}",
            file=sys.stderr,
        )
        return 1

    try:
        validate_static_contract()
        parent_api = edge.CloudflareApi(token)
        zone = edge.zone_id(parent_api, account, zone_name)
        zone_api, revoke = edge.issue_ephemeral_zone_api(
            parent_api, account, zone, include_bot_access=True, include_request_integrity=True
        )
        readback: dict[str, object] = {}
        try:
            overrides = diagnose_request_overrides(zone_api, zone)
            for setting_id, desired in edge.ZONE_SETTINGS.items():
                readback[setting_id] = edge.reconcile_zone_setting(
                    zone_api, zone, setting_id, desired
                )
            bot_readback = edge.reconcile_bot_access(zone_api, zone)
            print("CLOUDFLARE_BOT_STALE_CONFIGURATION", json.dumps(
                bot_readback.get("stale_zone_configuration"), sort_keys=True
            ))
            ensure_public_browser_integrity(zone_api, zone, host, overrides)
            diagnose_public_machine_response(parent_api, account, host, zone_api=zone_api, zone=zone)
        finally:
            revoke()

        for setting_id, desired in edge.ZONE_SETTINGS.items():
            if not edge.subset_equal(readback.get(setting_id), desired):
                fail(
                    f"Required zone setting did not survive read-back: "
                    f"{setting_id}={readback.get(setting_id)!r}"
                )

        check_live_apex_hsts(zone_name)
        print(
            "CLOUDFLARE_REQUIRED_PREFLIGHT_EXACT",
            json.dumps(readback, sort_keys=True),
        )
        return 0
    except (edge.CloudflareError, OSError, ValueError, KeyError) as exc:
        print(f"CLOUDFLARE_PREFLIGHT_ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
