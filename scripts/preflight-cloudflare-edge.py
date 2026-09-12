#!/usr/bin/env python3
"""Read-only verification of the required Cloudflare Zone Settings contract.

This build/release gate never creates credentials or repairs production drift.
Authorized reconciliation remains an explicit configure-cloudflare-edge.py --apply
operation, separate from compiling and checking the static distribution.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import urllib.error
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


class ReadOnlyCloudflareApi(edge.CloudflareApi):
    """Reject writes before transport, including accidental reconciliation calls."""

    def raw(
        self, method: str, path: str, body: object | None = None
    ) -> tuple[int, dict[str, object]]:
        if method != "GET" or body is not None:
            fail(f"Read-only Cloudflare preflight refused {method} {path}")
        return super().raw(method, path, body)


def verify_zone_settings(api: ReadOnlyCloudflareApi, zone: str) -> dict[str, object]:
    readback: dict[str, object] = {}
    for setting_id, desired in edge.ZONE_SETTINGS.items():
        result = api.expect("GET", f"/zones/{zone}/settings/{setting_id}").get("result")
        if (
            not isinstance(result, dict)
            or result.get("id") != setting_id
            or "value" not in result
        ):
            fail(f"Invalid zone setting response for {setting_id}")
        actual = result["value"]
        if not edge.subset_equal(actual, desired):
            fail(
                f"Required zone setting drift: {setting_id}={actual!r}; "
                f"expected {desired!r}. Preflight is read-only; "
                "use the separately authorized edge reconciliation operation to repair it."
            )
        readback[setting_id] = actual
    return readback


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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--if-configured", action="store_true")
    args = parser.parse_args()

    values = {name: os.environ.get(name, "").strip() for name in REQUIRED_ENV}
    # `--if-configured` is a credential-aware optional live gate. Build environments may
    # legitimately know a public account/project identifier without receiving a privileged
    # API token; that partial public context must not be treated as a live verification request.
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
        # Use only the existing credential. A token authority may lack direct
        # Zone Settings Read; that is a capability failure, never permission to
        # create a privileged child token during an otherwise ordinary build.
        api = ReadOnlyCloudflareApi(token)
        zone = edge.zone_id(api, account, zone_name)
        readback = verify_zone_settings(api, zone)

        check_live_apex_hsts(zone_name)
        print(
            "CLOUDFLARE_REQUIRED_PREFLIGHT_EXACT",
            json.dumps(readback, sort_keys=True),
        )
        return 0
    except (edge.CloudflareError, OSError, ValueError, KeyError) as exc:
        print(f"CLOUDFLARE_PREFLIGHT_ERROR: {exc}", file=sys.stderr)
        if isinstance(exc, edge.CloudflareError) and edge.is_permission_error(exc):
            print(
                "CLOUDFLARE_PREFLIGHT_SCOPE_REQUIRED: The existing credential must "
                "allow Zone Read and Zone Settings Read for the configured zone. "
                "No credential was created and no production repair was attempted.",
                file=sys.stderr,
            )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
