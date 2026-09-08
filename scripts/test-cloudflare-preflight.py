#!/usr/bin/env python3
"""Offline coverage of Cloudflare preflight ordering, cleanup and diagnostics."""

from __future__ import annotations

import contextlib
import email.message
import importlib.util
import io
import json
import os
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch


PREFLIGHT_PATH = Path(__file__).resolve().with_name("preflight-cloudflare-edge.py")
SPEC = importlib.util.spec_from_file_location("ghezelbaash_preflight_test", PREFLIGHT_PATH)
if SPEC is None or SPEC.loader is None:
    raise SystemExit("Unable to import Cloudflare preflight")
preflight = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preflight)


class PreflightLifecycle(unittest.TestCase):
    def run_preflight(self, *, bot_error: bool = False):
        events = []
        parent_api, zone_api = Mock(), Mock()
        overrides = {"configuration_rules": {"rules": []}}
        account = preflight.edge.PLATFORM_CF["accountId"]
        zone_name = preflight.edge.PLATFORM_CONTRACT["zoneName"]
        host = preflight.edge.PLATFORM_CONTRACT["canonicalHost"]
        env = {
            "CLOUDFLARE_API_TOKEN": "test-parent-token",
            "CLOUDFLARE_ACCOUNT_ID": account,
            "ZONE_NAME": zone_name,
            "CANONICAL_HOST": host,
        }

        def reconcile_setting(api, zone, setting_id, desired):
            self.assertIs(api, zone_api)
            self.assertEqual(zone, "test-zone")
            events.append(("setting", setting_id))
            return desired

        def reconcile_bots(api, zone):
            self.assertIs(api, zone_api)
            self.assertEqual(zone, "test-zone")
            events.append(("bots",))
            if bot_error:
                raise preflight.edge.CloudflareError("Bot access read-back drift")
            return {"stale_zone_configuration": {}}

        def diagnose(api, zone):
            self.assertIs(api, zone_api)
            self.assertEqual(zone, "test-zone")
            events.append(("diagnostics",))
            return overrides

        def ensure_integrity(api, zone, canonical_host, observed):
            self.assertIs(api, zone_api)
            self.assertEqual((zone, canonical_host), ("test-zone", host))
            self.assertIs(observed, overrides)
            events.append(("integrity",))

        def diagnose_machine(api, account_id, canonical_host, *, zone_api=None, zone=None):
            self.assertIs(api, parent_api)
            self.assertEqual((account_id, canonical_host), (account, host))
            self.assertEqual(zone, "test-zone")
            events.append(("machine_diagnostic",))

        revoke = Mock(side_effect=lambda: events.append(("revoke",)))
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.dict(os.environ, env, clear=True))
            stack.enter_context(patch.object(sys, "argv", [str(PREFLIGHT_PATH)]))
            stack.enter_context(contextlib.redirect_stdout(stdout))
            stack.enter_context(contextlib.redirect_stderr(stderr))
            construct = stack.enter_context(patch.object(preflight.edge, "CloudflareApi", return_value=parent_api))
            resolve_zone = stack.enter_context(patch.object(preflight.edge, "zone_id", return_value="test-zone"))
            diagnostics = stack.enter_context(patch.object(preflight, "diagnose_request_overrides", side_effect=diagnose))
            issue = stack.enter_context(patch.object(preflight.edge, "issue_ephemeral_zone_api", return_value=(zone_api, revoke)))
            stack.enter_context(patch.object(preflight.edge, "reconcile_zone_setting", side_effect=reconcile_setting))
            stack.enter_context(patch.object(preflight.edge, "reconcile_bot_access", side_effect=reconcile_bots))
            integrity = stack.enter_context(patch.object(preflight, "ensure_public_browser_integrity", side_effect=ensure_integrity))
            machine = stack.enter_context(patch.object(preflight, "diagnose_public_machine_response", side_effect=diagnose_machine))
            live = stack.enter_context(patch.object(preflight, "check_live_apex_hsts", side_effect=lambda _: events.append(("live",))))
            result = preflight.main()

        construct.assert_called_once_with("test-parent-token")
        resolve_zone.assert_called_once_with(parent_api, account, zone_name)
        diagnostics.assert_called_once_with(zone_api, "test-zone")
        issue.assert_called_once_with(parent_api, account, "test-zone", include_bot_access=True, include_request_integrity=True)
        if bot_error:
            integrity.assert_not_called()
            machine.assert_not_called()
        else:
            integrity.assert_called_once_with(zone_api, "test-zone", host, overrides)
            machine.assert_called_once_with(parent_api, account, host, zone_api=zone_api, zone="test-zone")
        revoke.assert_called_once_with()
        self.assertNotIn("test-parent-token", stdout.getvalue() + stderr.getvalue())
        return result, events, live, stdout.getvalue(), stderr.getvalue()

    def test_bot_contract_precedes_revocation_and_public_probe(self):
        result, events, live, stdout, stderr = self.run_preflight()
        self.assertEqual(result, 0, stderr)
        self.assertEqual(events, [
            ("diagnostics",),
            *(("setting", name) for name in preflight.edge.ZONE_SETTINGS),
            ("bots",), ("integrity",), ("machine_diagnostic",), ("revoke",), ("live",),
        ])
        live.assert_called_once_with(preflight.edge.PLATFORM_CONTRACT["zoneName"])
        self.assertIn("CLOUDFLARE_REQUIRED_PREFLIGHT_EXACT", stdout)

    def test_bot_failure_revokes_child_and_blocks_public_probe(self):
        result, events, live, stdout, stderr = self.run_preflight(bot_error=True)
        self.assertEqual(result, 1)
        self.assertEqual(events[-2:], [("bots",), ("revoke",)])
        live.assert_not_called()
        self.assertIn("Bot access read-back drift", stderr)
        self.assertNotIn("CLOUDFLARE_REQUIRED_PREFLIGHT_EXACT", stdout)

    def test_optional_preflight_without_token_does_not_access_cloudflare(self):
        with patch.dict(os.environ, {"CLOUDFLARE_ACCOUNT_ID": "public-context-only"}, clear=True), \
             patch.object(sys, "argv", [str(PREFLIGHT_PATH), "--if-configured"]), \
             patch.object(preflight, "validate_static_contract") as validate, \
             patch.object(preflight.edge, "CloudflareApi") as construct, \
            patch.object(preflight.edge, "issue_ephemeral_zone_api") as issue, \
             patch.object(preflight, "diagnose_request_overrides") as diagnostics, \
             patch.object(preflight, "ensure_public_browser_integrity") as integrity, \
             patch.object(preflight, "diagnose_public_machine_response") as machine, \
             contextlib.redirect_stdout(io.StringIO()) as stdout:
            self.assertEqual(preflight.main(), 0)
        validate.assert_not_called()
        construct.assert_not_called()
        issue.assert_not_called()
        diagnostics.assert_not_called()
        integrity.assert_not_called()
        machine.assert_not_called()
        self.assertIn("api_token_not_configured", stdout.getvalue())


class OverrideDiagnostics(unittest.TestCase):
    def test_read_only_diagnostics_distinguish_denied_and_failed_reads(self):
        events = []
        secret = "request-secret-must-not-be-logged"

        def raw(method, path, body=None):
            events.append((method, path, body))
            self.assertEqual(method, "GET")
            self.assertIsNone(body)
            if "/pagerules" in path:
                self.assertEqual(path, "/zones/test-zone/pagerules")
                return 403, {"success": False, "errors": [{"code": 10000, "message": "Authentication error"}]}
            if "/firewall/ua_rules" in path:
                raise OSError(secret)
            if "/http_config_settings/" in path:
                return 200, {"success": True, "result": {"rules": [
                    {"id": "bic-override", "enabled": True, "action": "set_config",
                     "expression": f'http.request.headers["x-api-key"][0] eq "{secret}"',
                     "action_parameters": {"bic": True, "security_level": "high", "unrelated": secret}},
                ]}}
            return 200, {"success": True, "result": []}

        api = Mock()
        api.raw.side_effect = raw
        with contextlib.redirect_stdout(io.StringIO()) as stdout:
            overrides = preflight.diagnose_request_overrides(api, "test-zone")
        self.assertEqual(set(overrides), {"configuration_rules"})
        self.assertEqual(overrides["configuration_rules"]["rules"][0]["id"], "bic-override")
        lines = stdout.getvalue().splitlines()
        prefix = "CLOUDFLARE_REQUEST_OVERRIDE_DIAGNOSTIC "
        summaries = {entry["kind"]: entry for entry in (
            json.loads(line[len(prefix):]) for line in lines if line.startswith(prefix)
        )}
        denied = summaries["page_rules"]
        self.assertEqual(denied["httpStatus"], 403)
        self.assertEqual(denied["errorCodes"], [10000])
        self.assertNotIn("rules", denied)
        observed = summaries["configuration_rules"]
        self.assertEqual(observed["httpStatus"], 200)
        self.assertEqual(observed["rules"][0]["settings"], {"bic": True, "security_level": "high"})
        self.assertEqual(len(observed["rules"][0]["expressionSha256"]), 64)
        self.assertNotIn("expression", observed["rules"][0])
        self.assertIn("CLOUDFLARE_REQUEST_OVERRIDE_DIAGNOSTIC_UNAVAILABLE user_agent_rules OSError", lines)
        self.assertNotIn(secret, stdout.getvalue())
        self.assertGreaterEqual(len(events), 3)
        api.expect.assert_not_called()


class PublicBrowserIntegrity(unittest.TestCase):
    def setUp(self):
        self.api = Mock()
        self.zone = "test-zone"
        self.host = preflight.edge.PLATFORM_CONTRACT["canonicalHost"]
        self.url = f"https://{self.host}/graph.jsonld"
        self.overrides = {"configuration_rules": {"rules": []}}

    def http_error(self, body):
        headers = email.message.Message()
        headers["Content-Type"] = "text/plain;charset=UTF-8"
        headers["CF-Ray"] = "test-ray"
        return urllib.error.HTTPError(
            self.url, 403, "Forbidden", headers, io.BytesIO(body)
        )

    def test_healthy_public_graph_does_not_create_rule(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.geturl.return_value = self.url
        response.headers = email.message.Message()
        response.headers["Content-Type"] = "application/ld+json"
        response.read.return_value = b'{"@context":"https://schema.org","@graph":[]}'
        with patch.object(preflight.urllib.request, "urlopen", return_value=response) as probe, \
             patch.object(preflight.edge, "reconcile_public_browser_integrity") as reconcile, \
             contextlib.redirect_stdout(io.StringIO()):
            preflight.ensure_public_browser_integrity(self.api, self.zone, self.host, self.overrides)
        probe.assert_called_once()
        reconcile.assert_not_called()
        self.api.raw.assert_not_called()
        self.api.expect.assert_not_called()

    def test_exact_1010_repairs_only_public_browser_integrity(self):
        with patch.object(preflight.urllib.request, "urlopen", side_effect=self.http_error(b"error code: 1010\n")) as probe, \
             patch.object(preflight.edge, "reconcile_public_browser_integrity") as reconcile, \
             contextlib.redirect_stdout(io.StringIO()):
            preflight.ensure_public_browser_integrity(self.api, self.zone, self.host, self.overrides)
        probe.assert_called_once()
        reconcile.assert_called_once_with(self.api, self.zone, self.host)
        self.api.raw.assert_not_called()
        self.api.expect.assert_not_called()

    def test_other_403_is_not_a_browser_integrity_mutation_trigger(self):
        for body in (b"Forbidden\n", b"error code: 1020\n", b"not error code: 1010\n"):
            with self.subTest(body=body), \
                 patch.object(preflight.urllib.request, "urlopen", side_effect=self.http_error(body)), \
                 patch.object(preflight.edge, "reconcile_public_browser_integrity") as reconcile, \
                 contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(preflight.edge.CloudflareError):
                    preflight.ensure_public_browser_integrity(self.api, self.zone, self.host, self.overrides)
            reconcile.assert_not_called()
        self.api.raw.assert_not_called()
        self.api.expect.assert_not_called()

    def test_existing_owned_rule_is_maintained_without_probe(self):
        overrides = {"configuration_rules": {"rules": [
            {"id": "owned-rule", "ref": preflight.edge.REQUEST_INTEGRITY_RULE_REF,
             "enabled": True, "action": "set_config", "action_parameters": {"bic": False}},
        ]}}
        with patch.object(preflight.urllib.request, "urlopen") as probe, \
             patch.object(preflight.edge, "reconcile_public_browser_integrity") as reconcile:
            preflight.ensure_public_browser_integrity(self.api, self.zone, self.host, overrides)
        probe.assert_not_called()
        reconcile.assert_called_once_with(self.api, self.zone, self.host)


class PublicMachineDiagnostics(unittest.TestCase):
    def setUp(self):
        self.api = Mock()
        self.account = preflight.edge.PLATFORM_CF["accountId"]
        self.host = preflight.edge.PLATFORM_CONTRACT["canonicalHost"]
        self.url = f"https://{self.host}/graph.jsonld"
        self.secret = "raw-response-or-token-must-not-be-logged"

    def blocked_response(self):
        headers = email.message.Message()
        headers["Content-Type"] = "text/plain;charset=UTF-8"
        headers["CF-Ray"] = "test-machine-ray"
        return urllib.error.HTTPError(
            self.url, 403, "Forbidden", headers, io.BytesIO(self.secret.encode())
        )

    def test_healthy_machine_response_does_not_request_trace(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.geturl.return_value = self.url
        response.headers = email.message.Message()
        response.headers["Content-Type"] = "application/ld+json"
        response.read.return_value = b'{"@graph":[]}'
        with patch.object(preflight.urllib.request, "urlopen", return_value=response) as probe, \
             patch.object(preflight.edge, "trace_public_machine_request") as trace, \
             contextlib.redirect_stdout(io.StringIO()):
            preflight.diagnose_public_machine_response(self.api, self.account, self.host)
        probe.assert_called_once_with(self.url, timeout=30)
        trace.assert_not_called()
        self.api.raw.assert_not_called()
        self.api.expect.assert_not_called()

    def test_forbidden_machine_response_requests_trace_without_logging_body(self):
        with patch.object(preflight.urllib.request, "urlopen", side_effect=self.blocked_response()) as probe, \
             patch.object(preflight.edge, "trace_public_machine_request") as trace, \
             contextlib.redirect_stdout(io.StringIO()) as stdout, \
             contextlib.redirect_stderr(io.StringIO()) as stderr:
            preflight.diagnose_public_machine_response(self.api, self.account, self.host)
        probe.assert_called_once_with(self.url, timeout=30)
        trace.assert_called_once_with(self.api, self.account, self.host)
        self.assertNotIn(self.secret, stdout.getvalue() + stderr.getvalue())

    def test_trace_permission_failure_is_nonfatal_and_redacted(self):
        with patch.object(preflight.urllib.request, "urlopen", side_effect=self.blocked_response()), \
             patch.object(preflight.edge, "trace_public_machine_request", side_effect=preflight.edge.CloudflareError(self.secret)) as trace, \
             contextlib.redirect_stdout(io.StringIO()) as stdout, \
             contextlib.redirect_stderr(io.StringIO()) as stderr:
            preflight.diagnose_public_machine_response(self.api, self.account, self.host)
        trace.assert_called_once_with(self.api, self.account, self.host)
        output = stdout.getvalue() + stderr.getvalue()
        self.assertNotIn(self.secret, output)
        self.assertIn("CloudflareError", output)


if __name__ == "__main__":
    unittest.main()
