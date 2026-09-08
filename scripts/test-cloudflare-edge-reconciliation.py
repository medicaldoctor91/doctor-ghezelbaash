#!/usr/bin/env python3
"""Offline transaction and idempotence test for the Cloudflare edge contract."""

from __future__ import annotations

import copy
import contextlib
import importlib.util
import io
import json
import re
import tempfile
import urllib.parse
from pathlib import Path
from typing import Any
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent.parent
EDGE_PATH = ROOT / "scripts" / "configure-cloudflare-edge.py"
SPEC = importlib.util.spec_from_file_location("ghezelbaash_edge_test", EDGE_PATH)
if SPEC is None or SPEC.loader is None:
    raise SystemExit("Unable to import Cloudflare edge reconciler")
edge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(edge)


def existing_rule(rule_id: int, host: str, target: str) -> dict[str, Any]:
    return {
        "id": str(rule_id),
        "ref": f"existing_rule_{rule_id}",
        "expression": f'(http.host eq "{host}")',
        "description": "Pre-existing redirect",
        "action": "redirect",
        "action_parameters": {
            "from_value": {
                "status_code": 301,
                "target_url": {"value": target},
                "preserve_query_string": False,
            }
        },
        "enabled": True,
    }


class FakeCloudflareApi:
    def __init__(self) -> None:
        self.zone_rules = [
            existing_rule(1, "blog.ghezelbaash.ir", "https://www.ghezelbaash.ir/"),
            existing_rule(2, "doctor.ghezelbaash.ir", "https://www.google.com/maps/"),
            existing_rule(
                3,
                "github.ghezelbaash.ir",
                "https://github.com/medicaldoctor91/doctor-ghezelbaash",
            ),
            existing_rule(
                4,
                "ig.ghezelbaash.ir",
                "https://www.instagram.com/doctor.ghezelbaash/",
            ),
        ]
        self.next_zone_rule_id = 4
        self.redirect_list: dict[str, Any] | None = None
        self.list_items: list[dict[str, Any]] = []
        self.account_ruleset: dict[str, Any] | None = None
        self.events: list[str] = []
        self.mutations = 0

    def mutate(self, event: str) -> None:
        self.mutations += 1
        self.events.append(event)

    def expect(
        self,
        method: str,
        path: str,
        body: Any | None = None,
        ok: tuple[int, ...] = (200,),
    ) -> dict[str, Any]:
        del ok

        if method == "GET" and path == "/accounts/test-account/rules/lists?per_page=50":
            rows = [] if self.redirect_list is None else [self.redirect_list]
            return {"success": True, "result": copy.deepcopy(rows)}
        if method == "POST" and path == "/accounts/test-account/rules/lists":
            assert isinstance(body, dict)
            self.mutate("account:list-created")
            self.redirect_list = {"id": "blog-list", **copy.deepcopy(body)}
            return {"success": True, "result": copy.deepcopy(self.redirect_list)}
        if method == "PUT" and path == "/accounts/test-account/rules/lists/blog-list":
            assert isinstance(body, dict) and self.redirect_list is not None
            self.mutate("account:list-metadata-updated")
            self.redirect_list.update(copy.deepcopy(body))
            return {"success": True, "result": copy.deepcopy(self.redirect_list)}
        if method == "GET" and path == (
            "/accounts/test-account/rules/lists/blog-list/items?per_page=500"
        ):
            # Production Cloudflare decodes percent-encoded UTF-8 source URLs
            # when reading a redirect list back through the API.
            result = copy.deepcopy(self.list_items)
            for row in result:
                redirect = row.get("redirect") or {}
                if "source_url" in redirect:
                    redirect["source_url"] = urllib.parse.unquote(
                        str(redirect["source_url"])
                    )
            return {"success": True, "result": result}
        if method == "PUT" and path == "/accounts/test-account/rules/lists/blog-list/items":
            assert isinstance(body, list)
            self.mutate("account:list-items-replaced")
            self.list_items = copy.deepcopy(body)
            return {"success": True, "result": {"operation_id": "bulk-op-1"}}
        if method == "GET" and path == (
            "/accounts/test-account/rules/lists/bulk_operations/bulk-op-1"
        ):
            return {"success": True, "result": {"status": "completed"}}
        if method == "GET" and path == "/accounts/test-account/rulesets":
            rows = [] if self.account_ruleset is None else [
                {
                    "id": self.account_ruleset["id"],
                    "kind": self.account_ruleset["kind"],
                    "phase": self.account_ruleset["phase"],
                }
            ]
            return {"success": True, "result": copy.deepcopy(rows)}
        if method == "POST" and path == "/accounts/test-account/rulesets":
            assert isinstance(body, dict)
            self.mutate("account:bulk-rule-created")
            created = copy.deepcopy(body)
            created["id"] = "account-redirect-ruleset"
            created["rules"] = [
                {"id": "bulk-rule-1", **row} for row in created.get("rules", [])
            ]
            self.account_ruleset = created
            return {"success": True, "result": copy.deepcopy(created)}
        if method == "GET" and path == (
            "/accounts/test-account/rulesets/account-redirect-ruleset"
        ):
            assert self.account_ruleset is not None
            return {"success": True, "result": copy.deepcopy(self.account_ruleset)}

        if method == "GET" and path == "/zones/test-zone/rulesets":
            return {
                "success": True,
                "result": [
                    {
                        "id": "zone-redirect-ruleset",
                        "kind": "zone",
                        "phase": edge.SINGLE_REDIRECT_PHASE,
                    }
                ],
            }
        if method == "GET" and path == "/zones/test-zone/rulesets/zone-redirect-ruleset":
            return {
                "success": True,
                "result": {
                    "id": "zone-redirect-ruleset",
                    "rules": copy.deepcopy(self.zone_rules),
                },
            }
        if method == "DELETE" and path.startswith(
            "/zones/test-zone/rulesets/zone-redirect-ruleset/rules/"
        ):
            rule_id = path.rsplit("/", 1)[1]
            current = next(row for row in self.zone_rules if row["id"] == rule_id)
            event = (
                "zone:conflicting-blog-deleted"
                if "blog.ghezelbaash.ir" in current["expression"]
                else "zone:conflicting-single-deleted"
            )
            self.mutate(event)
            self.zone_rules = [row for row in self.zone_rules if row["id"] != rule_id]
            return {"success": True, "result": None}
        if method in ("PATCH", "POST") and path.startswith(
            "/zones/test-zone/rulesets/zone-redirect-ruleset/rules"
        ):
            assert isinstance(body, dict)
            desired = copy.deepcopy(body)
            if method == "PATCH":
                rule_id = path.rsplit("/", 1)[1]
                index = next(
                    i for i, row in enumerate(self.zone_rules) if row["id"] == rule_id
                )
                if desired.get("ref") != self.zone_rules[index].get("ref"):
                    raise AssertionError("Cloudflare rule refs are immutable")
                desired["id"] = rule_id
                self.zone_rules[index] = desired
                self.mutate("zone:single-rule-updated")
            else:
                self.next_zone_rule_id += 1
                desired["id"] = str(self.next_zone_rule_id)
                self.zone_rules.append(desired)
                self.mutate("zone:single-rule-created")
            return {"success": True, "result": copy.deepcopy(desired)}

        raise AssertionError((method, path, body))


class FakeTokenAuthority:
    def __init__(self) -> None:
        self.revoked = False

    def expect(
        self,
        method: str,
        path: str,
        body: Any | None = None,
        ok: tuple[int, ...] = (200,),
    ) -> dict[str, Any]:
        del ok
        if method == "GET" and path == (
            "/accounts/test-account/tokens/permission_groups?"
            "scope=com.cloudflare.api.account.zone"
        ):
            return {
                "success": True,
                "result": [
                    {
                        "id": "redirect-read",
                        "name": "Single Redirect Read",
                        "scopes": ["com.cloudflare.api.account.zone"],
                    },
                    {
                        "id": "redirect-write",
                        "name": "Dynamic URL Redirects Write",
                        "scopes": ["com.cloudflare.api.account.zone"],
                    },
                ],
            }
        if method == "POST" and path == "/accounts/test-account/tokens":
            policy = body["policies"][0]
            ids = {row["id"] for row in policy["permission_groups"]}
            if ids != {"redirect-read", "redirect-write"}:
                raise AssertionError(ids)
            if policy["resources"] != {"com.cloudflare.api.account.zone.test-zone": "*"}:
                raise AssertionError(policy["resources"])
            return {
                "success": True,
                "result": {"id": "ephemeral-redirect-token", "value": "child-secret"},
            }
        raise AssertionError((method, path, body))

    def raw(
        self, method: str, path: str, body: Any | None = None
    ) -> tuple[int, dict[str, Any]]:
        if body is not None:
            raise AssertionError(body)
        if method != "DELETE" or path != (
            "/accounts/test-account/tokens/ephemeral-redirect-token"
        ):
            raise AssertionError((method, path))
        self.revoked = True
        return 200, {"success": True}


class FakeZoneTokenAuthority:
    def __init__(
        self,
        expected_permissions: set[str] | None = None,
        *,
        bot_write_name: str = "Bot Management Write",
        include_bot_read: bool = True,
        configuration_write_name: str = "Config Settings Write",
        configuration_read_name: str = "Config Settings Read",
        include_integrity_reads: bool = True,
    ) -> None:
        self.revoked = False
        self.revocations = 0
        self.expected_permissions = expected_permissions if expected_permissions is not None else {
            *edge.ZONE_SETTINGS_PERMISSION_IDS,
            "zone-read", "cache-purge", "dns-read", "dns-write",
            "cache-write", "cache-read", "bot-write", "bot-read",
        }
        self.bot_write_name = bot_write_name
        self.include_bot_read = include_bot_read
        self.configuration_write_name = configuration_write_name
        self.configuration_read_name = configuration_read_name
        self.include_integrity_reads = include_integrity_reads

    def expect(
        self,
        method: str,
        path: str,
        body: Any | None = None,
        ok: tuple[int, ...] = (200,),
    ) -> dict[str, Any]:
        del ok
        if method == "GET" and path.endswith(
            "permission_groups?scope=com.cloudflare.api.account.zone"
        ):
            rows = [
                {
                    "id": edge.ZONE_SETTINGS_PERMISSION_IDS[0],
                    "name": "Zone Settings Read",
                    "scopes": ["com.cloudflare.api.account.zone"],
                },
                {
                    "id": edge.ZONE_SETTINGS_PERMISSION_IDS[1],
                    "name": "Zone Settings Write",
                    "scopes": ["com.cloudflare.api.account.zone"],
                },
            ]
            for permission_id, name in [
                ("zone-read", "Zone Read"),
                ("cache-purge", "Cache Purge"),
                ("dns-read", "DNS Read"),
                ("dns-write", "DNS Write"),
                ("cache-write", "Cache Settings Write"),
                ("cache-read", "Cache Settings Read"),
                ("bot-write", self.bot_write_name),
                ("bot-read", "Bot Management Read"),
                ("configuration-write", self.configuration_write_name),
                ("configuration-read", self.configuration_read_name),
                ("firewall-read", "Firewall Services Read"),
            ]:
                if permission_id == "bot-read" and not self.include_bot_read:
                    continue
                if permission_id in ("configuration-read", "firewall-read") and not self.include_integrity_reads:
                    continue
                rows.append(
                    {
                        "id": permission_id,
                        "name": name,
                        "scopes": ["com.cloudflare.api.account.zone"],
                    }
                )
            return {"success": True, "result": rows}
        if method == "POST" and path == "/accounts/test-account/tokens":
            assert isinstance(body, dict)
            if len(body["policies"]) != 1:
                raise AssertionError("Ephemeral token must be zone-scoped")
            zone_policy = body["policies"][0]
            zone_ids = {row["id"] for row in zone_policy["permission_groups"]}
            if zone_ids != self.expected_permissions:
                raise AssertionError(zone_ids)
            if zone_policy["resources"] != {
                "com.cloudflare.api.account.zone.test-zone": "*"
            }:
                raise AssertionError(body["policies"])
            return {
                "success": True,
                "result": {"id": "ephemeral-zone-token", "value": "zone-child-secret"},
            }
        raise AssertionError((method, path, body))

    def raw(
        self, method: str, path: str, body: Any | None = None
    ) -> tuple[int, dict[str, Any]]:
        if body is not None:
            raise AssertionError(body)
        if method != "DELETE" or path != (
            "/accounts/test-account/tokens/ephemeral-zone-token"
        ):
            raise AssertionError((method, path))
        self.revoked = True
        self.revocations += 1
        return 200, {"success": True}


class FakeInventoryApi:
    def __init__(self, blog_host: str) -> None:
        self.blog_host = blog_host
        self.pages_domains = {"www.ghezelbaash.ir": "active"}
        self.project_domains = {
            "doctor-ghezelbaash.pages.dev",
            "www.ghezelbaash.ir",
        }
        self.dns_records = [
            {
                "id": "apex",
                "type": "CNAME",
                "name": "ghezelbaash.ir",
                "content": "doctor-ghezelbaash.pages.dev",
                "proxied": True,
                "ttl": 1,
            },
            {
                "id": "www",
                "type": "CNAME",
                "name": "www.ghezelbaash.ir",
                "content": "doctor-ghezelbaash.pages.dev",
                "proxied": True,
                "ttl": 1,
            },
            {
                "id": "wildcard",
                "type": "CNAME",
                "name": "*.ghezelbaash.ir",
                "content": "doctor-ghezelbaash.pages.dev",
                "proxied": True,
                "ttl": 1,
            },
        ]

    def blog_dns_exact(self) -> bool:
        rows = [row for row in self.dns_records if row.get("name") == "blog.ghezelbaash.ir"]
        return len(rows) == 1 and edge.pages_dns_record_matches(
            rows[0], self.blog_host
        )

    def expect(
        self,
        method: str,
        path: str,
        body: Any | None = None,
        ok: tuple[int, ...] = (200,),
    ) -> dict[str, Any]:
        del ok
        pages_domains_path = "/accounts/test-account/pages/projects/doctor-ghezelbaash/domains"
        if method == "GET" and path == pages_domains_path:
            if "blog.ghezelbaash.ir" in self.pages_domains and self.blog_dns_exact():
                self.pages_domains["blog.ghezelbaash.ir"] = "active"
                self.project_domains.add("blog.ghezelbaash.ir")
            return {
                "success": True,
                "result": [
                    {"name": name, "status": status}
                    for name, status in sorted(self.pages_domains.items())
                ],
            }
        if method == "POST" and path == pages_domains_path:
            assert isinstance(body, dict) and body.get("name")
            name = str(body["name"])
            self.pages_domains[name] = "pending"
            return {"success": True, "result": {"name": name, "status": "pending"}}
        if method == "GET" and path == "/accounts/test-account/pages/projects/doctor-ghezelbaash":
            return {
                "success": True,
                "result": {
                    "name": "doctor-ghezelbaash",
                    "production_branch": "main",
                    "domains": sorted(self.project_domains),
                    "source": {
                        "type": "github",
                        "config": {
                            "owner": "medicaldoctor91",
                            "repo_name": "doctor-ghezelbaash",
                            "deployments_enabled": True,
                            "production_deployments_enabled": True,
                            "preview_deployment_setting": "none",
                            "preview_branch_includes": [],
                            "preview_branch_excludes": [],
                        },
                    },
                    "build_config": {
                        "build_command": "npm run build",
                        "destination_dir": "dist",
                        "root_dir": "",
                    },
                },
            }
        exact_query = "/zones/test-zone/dns_records?name=blog.ghezelbaash.ir&per_page=100"
        if method == "GET" and path == exact_query:
            return {
                "success": True,
                "result": [
                    dict(row) for row in self.dns_records
                    if row.get("name") == "blog.ghezelbaash.ir"
                ],
            }
        if method == "POST" and path == "/zones/test-zone/dns_records":
            assert isinstance(body, dict)
            row={"id":"blog-pages", **body}
            self.dns_records.append(row)
            return {"success": True, "result": dict(row)}
        if method == "PATCH" and path == "/zones/test-zone/dns_records/blog-pages":
            assert isinstance(body, dict)
            for index,row in enumerate(self.dns_records):
                if row.get("id") == "blog-pages":
                    self.dns_records[index]={"id":"blog-pages", **body}
                    return {"success": True, "result": dict(self.dns_records[index])}
            raise AssertionError("missing blog-pages DNS record")
        if method == "GET" and path == "/zones/test-zone/dns_records?per_page=500":
            return {"success": True, "result": [dict(row) for row in self.dns_records]}
        raise AssertionError((method, path, body))


for invalid_cache_policy in (
    "public, max-age=60, immutable",
    "public, max-age=60, no-cache, stale-while-revalidate=60",
    "public, max-age=60, no-store, stale-if-error=60",
    "public, max-age=60, must-revalidate, stale-while-revalidate=60",
    "public, max-age=60, proxy-revalidate, stale-if-error=60",
    "public, max-age=60, s-maxage=60, stale-if-error=60",
    "private, max-age=60, stale-while-revalidate=60",
    "public, max-age=60, stale-if-error=2.5",
    "public, max-age=60, max-age=120",
):
    try:
        edge.validate_edge_cache_policy(invalid_cache_policy)
    except edge.CloudflareError:
        pass
    else:
        raise AssertionError(f"Invalid cache policy accepted: {invalid_cache_policy}")

if edge.cache_directives("public, max-age=60") != edge.cache_directives(
    "MAX-AGE=60, PUBLIC"
):
    raise AssertionError("Cache directive normalization is order-sensitive")

class FakeCompressionApi:
    def __init__(self, rules: list[dict[str, Any]] | None = None, *, phase: str = edge.COMPRESSION_PHASE) -> None:
        self.ruleset = None if rules is None else {
            "id": "compression-set", "kind": "zone", "phase": phase,
            "rules": copy.deepcopy(rules),
        }
        self.mutations = 0
        self.serial = len(rules or [])

    def expect(self, method: str, path: str, body: Any = None, ok: tuple[int, ...] = (200,)) -> dict[str, Any]:
        del ok
        base = "/zones/test-zone/rulesets"
        if method == "GET" and path == base:
            return {"result": [] if self.ruleset is None else [copy.deepcopy(self.ruleset)]}
        if method == "GET" and path == base + "/compression-set":
            return {"result": copy.deepcopy(self.ruleset)}
        if method == "POST" and path == base:
            assert self.ruleset is None
            self.mutations += 1
            self.ruleset = {"id": "compression-set", **copy.deepcopy(body)}
            self.ruleset["rules"] = [{"id": "rule-1", **row} for row in self.ruleset["rules"]]
            self.serial = len(self.ruleset["rules"])
            return {"result": copy.deepcopy(self.ruleset)}
        assert self.ruleset is not None
        rule_base = base + "/compression-set/rules"
        if method == "POST" and path == rule_base:
            self.serial += 1
            self.mutations += 1
            rule = {"id": f"rule-{self.serial}", **copy.deepcopy(body)}
            self.ruleset["rules"].append(rule)
            return {"result": copy.deepcopy(rule)}
        if method == "PATCH" and path.startswith(rule_base + "/"):
            rule_id = path.rsplit("/", 1)[1]
            previous_index = next(i for i, row in enumerate(self.ruleset["rules"]) if row["id"] == rule_id)
            rule = {"id": rule_id, **copy.deepcopy(body)}
            position = rule.pop("position", None)
            self.ruleset["rules"].pop(previous_index)
            index = previous_index
            if position:
                index = position.get("index", 1) - 1
                if "after" in position:
                    index = next(i for i, row in enumerate(self.ruleset["rules"]) if row["id"] == position["after"]) + 1
            self.ruleset["rules"].insert(index, rule)
            self.mutations += 1
            return {"result": copy.deepcopy(rule)}
        if method == "DELETE" and path.startswith(rule_base + "/"):
            rule_id = path.rsplit("/", 1)[1]
            self.ruleset["rules"] = [row for row in self.ruleset["rules"] if row["id"] != rule_id]
            self.mutations += 1
            return {"result": None}
        if method == "DELETE" and path == base + "/compression-set":
            self.ruleset = None
            self.mutations += 1
            return {"result": None}
        raise AssertionError((method, path, body))


def test_public_machine_request_trace() -> None:
    account = edge.PLATFORM_CF["accountId"]
    host = edge.PLATFORM_CONTRACT["canonicalHost"]
    secret = "trace-secret-must-not-be-logged"

    class Authority:
        def __init__(self):
            self.events = []

        def expect(self, method, path, body=None, ok=(200,)):
            self.events.append((method, path))
            if method == "GET":
                assert path == f"/accounts/{account}/tokens/permission_groups?scope=com.cloudflare.api.account"
                return {"result": [
                    {"id": "wrong-zone", "name": "Allow Request Tracer Read", "scopes": ["com.cloudflare.api.account.zone"]},
                    {"id": "trace-read", "name": "Allow Request Tracer Read", "scopes": ["com.cloudflare.api.account"]},
                ]}
            assert method == "POST" and path == f"/accounts/{account}/tokens"
            assert body["policies"] == [{
                "effect": "allow", "resources": {f"com.cloudflare.api.account.{account}": "*"},
                "permission_groups": [{"id": "trace-read"}],
            }]
            expiry = edge.dt.datetime.fromisoformat(body["expires_on"].replace("Z", "+00:00"))
            assert 14 * 60 < (expiry - edge.dt.datetime.now(edge.dt.timezone.utc)).total_seconds() <= 15 * 60
            return {"result": {"id": "trace-token-id", "value": secret}}

        def raw(self, method, path, body=None):
            self.events.append((method, path))
            assert method == "DELETE" and path == f"/accounts/{account}/tokens/trace-token-id"
            assert body is None
            return 200, {"success": True}

    for trace_fails, activation_failures in ((False, 0), (True, 0), (False, 2)):
        authority = Authority()

        class TraceApi:
            def __init__(self):
                self.calls = 0

            def expect(self, method, path, body=None, ok=(200,)):
                self.calls += 1
                assert method == "POST" and path == f"/accounts/{account}/request-tracer/trace"
                headers = dict(edge.urllib.request.build_opener().addheaders)
                headers["Accept-Encoding"] = "identity"
                assert body == {"method": "GET", "url": f"https://{host}/graph.jsonld", "protocol": "HTTP/1.1", "headers": headers}
                if self.calls <= activation_failures:
                    raise edge.CloudflareError(secret, status=401)
                if trace_fails:
                    raise edge.CloudflareError(secret, status=403, payload={"raw": secret})
                return {"result": {"status_code": 403, "response": secret, "headers": secret, "trace": [
                    {"kind": "zone", "step_name": "configuration", "matched": True,
                     "expression": secret, "cookies": secret,
                     "trace": [{"id": "rule-1", "type": "rule", "action": "set_config", "matched": True,
                                "action_parameters": {"bic": False, "headers": secret}}]},
                ]}}

        trace_api = TraceApi()
        with patch.object(edge, "CloudflareApi", return_value=trace_api) as create_api, \
             patch.object(edge.time, "sleep") as sleep, \
             contextlib.redirect_stdout(io.StringIO()) as stdout, \
             contextlib.redirect_stderr(io.StringIO()) as stderr:
            try:
                summary = edge.trace_public_machine_request(authority, account, host)
                assert not trace_fails, "Trace failure did not propagate"
                assert summary == {"status_code": 403, "trace": [
                    {"kind": "zone", "step_name": "configuration", "matched": True,
                     "trace": [{"id": "rule-1", "type": "rule", "action": "set_config", "matched": True,
                                "action_parameters": {"bic": False}}]},
                ]}
            except edge.CloudflareError as exc:
                assert trace_fails
                assert exc.status == 403 and secret not in str(exc)
        create_api.assert_called_once_with(secret)
        assert trace_api.calls == activation_failures + 1
        assert sleep.call_count == activation_failures
        assert all(call.args == (2,) for call in sleep.call_args_list)
        assert authority.events[-1] == ("DELETE", f"/accounts/{account}/tokens/trace-token-id")
        assert sum(method == "DELETE" for method, path in authority.events) == 1
        assert secret not in stdout.getvalue() + stderr.getvalue()

    authority = Authority()
    try:
        edge.trace_public_machine_request(authority, "wrong-account", host)
        raise AssertionError("Request Trace accepted an unrelated account")
    except edge.CloudflareError:
        assert not authority.events


def test_public_browser_integrity() -> None:
    host = edge.PLATFORM_CONTRACT["canonicalHost"]
    desired = edge.public_browser_integrity_rule(host)
    assert desired["action"] == "set_config"
    assert desired["action_parameters"] == {"bic": False}
    assert desired["enabled"] is True
    assert f'http.host eq "{host}"' in desired["expression"]
    assert 'http.request.method in {"GET" "HEAD"}' in desired["expression"]
    path_expression = desired["expression"].split("http.request.uri.path in {", 1)[1]
    actual_paths = set(re.findall(r'"([^"]*)"', path_expression))
    registry = json.loads((ROOT / "src/data/machine-resources.json").read_text())
    expected_paths = {
        "/" if row["path"] == "index.html" else "/" + row["path"]
        for row in registry["resources"] if "website" in row["targets"]
    } | {"/robots.txt"}
    assert actual_paths == expected_paths
    assert not any("*" in path for path in actual_paths)
    assert "/index.html" not in actual_paths
    assert "/query-matrix.jsonl" not in actual_paths
    try:
        edge.public_browser_integrity_rule("unrelated.example")
        raise AssertionError("Request integrity rule accepted a noncanonical host")
    except edge.CloudflareError:
        pass

    foreign = [
        {"id": f"foreign-{index}", "ref": f"unrelated-{index}",
         "expression": f'(http.host eq "other-{index}.example")',
         "action": "set_config", "action_parameters": {"bic": True}, "enabled": True}
        for index in range(2)
    ]
    owned = {"id": "owned-1", **desired}
    outdated = copy.deepcopy(owned)
    outdated["action_parameters"]["bic"] = True
    for original in (None, foreign, [outdated, *foreign], [foreign[0], owned, foreign[1]]):
        api = FakeCompressionApi(original, phase=edge.REQUEST_INTEGRITY_PHASE)
        result = edge.reconcile_public_browser_integrity(api, "test-zone", host)
        assert api.ruleset["phase"] == edge.REQUEST_INTEGRITY_PHASE
        assert api.ruleset["rules"][-1] == result
        remaining = [row for row in api.ruleset["rules"] if row.get("ref") != desired["ref"]]
        assert remaining == ([] if original is None else foreign), "Unrelated rules or their order changed"
        mutations = api.mutations
        edge.reconcile_public_browser_integrity(api, "test-zone", host)
        assert api.mutations == mutations, "Request integrity reconciliation must be idempotent"


def test_machine_compression() -> None:
    host = "www.ghezelbaash.ir"
    desired = edge.machine_compression_rule(host)
    assert desired["action_parameters"] == {"algorithms": [{"name": "auto"}]}
    assert 'http.response.code eq 200' in desired["expression"]
    assert '{"csv" "ttl"}' in desired["expression"]
    foreign = {"id": "foreign-1", "ref": "unrelated_compression", "action": "compress_response"}
    prior_owned = {"id": "owned-1", **copy.deepcopy(desired)}
    prior_owned["enabled"] = False
    with tempfile.TemporaryDirectory() as tmp:
        for index, original in enumerate([None, [foreign], [prior_owned, foreign], [{"id": "owned-1", **desired}, foreign]]):
            fake = FakeCompressionApi(original)
            snapshot = Path(tmp) / f"before-{index}.json"
            edge.reconcile_machine_compression(fake, "test-zone", host, snapshot)
            assert snapshot.exists()
            assert len([row for row in fake.ruleset["rules"] if row["ref"] == edge.COMPRESSION_RULE_REF]) == 1
            initial_mutations = fake.mutations
            edge.reconcile_machine_compression(fake, "test-zone", host, Path(tmp) / f"repeat-{index}.json")
            assert fake.mutations == initial_mutations, "Compression reconciliation must be idempotent"
            try:
                edge.reconcile_machine_compression(fake, "test-zone", host, snapshot)
                raise AssertionError("Rollback snapshot was overwritten")
            except FileExistsError:
                assert fake.mutations == initial_mutations
            edge.rollback_machine_compression(fake, "test-zone", host, snapshot)
            assert (fake.ruleset or {}).get("rules") == original
            after_rollback = fake.mutations
            edge.rollback_machine_compression(fake, "test-zone", host, snapshot)
            assert fake.mutations == after_rollback
        fake = FakeCompressionApi([foreign])
        snapshot = Path(tmp) / "concurrent.json"
        edge.reconcile_machine_compression(fake, "test-zone", host, snapshot)
        fake.ruleset["rules"][-1]["action_parameters"] = {"algorithms": [{"name": "gzip"}]}
        before_refusal = fake.mutations
        try:
            edge.rollback_machine_compression(fake, "test-zone", host, snapshot)
            raise AssertionError("Rollback overwrote a concurrent change")
        except edge.CloudflareError:
            assert fake.mutations == before_refusal


test_machine_compression()
test_public_browser_integrity()
test_public_machine_request_trace()
cache_contract = edge.cache_rule("www.ghezelbaash.ir")
assert cache_contract["action_parameters"]["respect_strong_etags"] is False
identity_locked_cache = copy.deepcopy(cache_contract)
identity_locked_cache["action_parameters"]["respect_strong_etags"] = True
assert not edge.rule_matches(identity_locked_cache, cache_contract), (
    "The reconciler must detect a cache policy that prevents compression of identity origin bytes"
)
contract = edge.load_redirect_registry(ROOT)
api = FakeCloudflareApi()
token_authority = FakeTokenAuthority()
child_api, revoke_child_api = edge.issue_ephemeral_single_redirect_api(
    token_authority, "test-account", "test-zone"
)
if child_api.token != "child-secret":
    raise AssertionError("Ephemeral Single Redirect child token was not returned")
revoke_child_api()
if not token_authority.revoked:
    raise AssertionError("Ephemeral Single Redirect child token was not revoked")

zone_token_authority = FakeZoneTokenAuthority()
zone_child_api, revoke_zone_child_api = edge.issue_ephemeral_zone_api(
    zone_token_authority,
    "test-account",
    "test-zone",
    include_control_plane=True,
)
if zone_child_api.token != "zone-child-secret":
    raise AssertionError("Ephemeral control-plane child token was not returned")
revoke_zone_child_api()
if not zone_token_authority.revoked:
    raise AssertionError("Ephemeral control-plane child token was not revoked")

bot_permissions = {
    *edge.ZONE_SETTINGS_PERMISSION_IDS,
    "zone-read", "cache-purge", "bot-write",
}
for bot_write_name, include_bot_read in (
    ("Bot Management Write", True),
    ("Bot Management Edit", False),
):
    bot_token_authority = FakeZoneTokenAuthority(
        bot_permissions | ({"bot-read"} if include_bot_read else set()),
        bot_write_name=bot_write_name,
        include_bot_read=include_bot_read,
    )
    bot_child_api, revoke_bot_child_api = edge.issue_ephemeral_zone_api(
        bot_token_authority, "test-account", "test-zone", include_bot_access=True,
    )
    if bot_child_api.token != "zone-child-secret":
        raise AssertionError("Ephemeral bot-access child token was not returned")
    revoke_bot_child_api()
    revoke_bot_child_api()
    if not bot_token_authority.revoked or bot_token_authority.revocations != 1:
        raise AssertionError("Ephemeral bot-access child token revocation must be idempotent")

integrity_base = {*edge.ZONE_SETTINGS_PERMISSION_IDS, "zone-read", "cache-purge", "configuration-write"}
for options, extra_permissions, write_name, include_reads in (
    ({}, set(), "Config Settings Write", True),
    ({"include_bot_access": True}, {"bot-write", "bot-read"}, "Config Settings Edit", False),
    ({}, set(), "Select Configuration Write", True),
    ({"include_bot_access": True}, {"bot-write", "bot-read"}, "Select Configuration Edit", False),
    ({"include_control_plane": True}, {"dns-read", "dns-write", "cache-write", "cache-read", "bot-write", "bot-read"}, "Config Settings Write", True),
):
    expected_permissions = integrity_base | extra_permissions
    if include_reads:
        expected_permissions |= {"configuration-read", "firewall-read"}
    authority = FakeZoneTokenAuthority(
        expected_permissions,
        configuration_write_name=write_name,
        configuration_read_name="Select Configuration Read" if write_name.startswith("Select") else "Config Settings Read",
        include_integrity_reads=include_reads,
    )
    child, revoke = edge.issue_ephemeral_zone_api(
        authority, "test-account", "test-zone", include_request_integrity=True, **options,
    )
    assert child.token == "zone-child-secret"
    revoke()
    assert authority.revocations == 1

blog_host = contract["bulkRedirects"]["host"]
inventory_api = FakeInventoryApi(blog_host)
edge.ensure_pages_custom_domains(inventory_api, "test-account")
if inventory_api.pages_domains.get("blog.ghezelbaash.ir") != "pending":
    raise AssertionError("Pages blog domain should remain pending before exact DNS")
pages_dns = edge.reconcile_pages_dns_binding(inventory_api, "test-zone", blog_host)
if pages_dns.get("content") != "doctor-ghezelbaash.pages.dev":
    raise AssertionError("Exact Pages blog CNAME was not installed")
pages_domains = edge.wait_pages_custom_domains(inventory_api, "test-account")
if pages_domains["statuses"].get("blog.ghezelbaash.ir") != "active":
    raise AssertionError("Historical blog Pages custom domain was not activated after DNS")
pages_contract = edge.read_pages_contract(
    inventory_api, "test-account", "www.ghezelbaash.ir"
)
dns_contract = edge.read_dns_contract(
    inventory_api,
    "test-zone",
    "ghezelbaash.ir",
    "www.ghezelbaash.ir",
    blog_host,
)
if pages_contract["repository"] != "medicaldoctor91/doctor-ghezelbaash":
    raise AssertionError("Pages repository contract was not read back")
if not all(dns_contract["requiredHostCoverage"].values()):
    raise AssertionError("Required DNS host coverage was not read back")

# The production entrypoint must establish and verify all exact Bulk Redirects
# before removing the higher-priority competing blog Single Redirect.
bulk_first = edge.reconcile_bulk_redirects(api, "test-account", contract)
if bulk_first["itemCount"] != 87:
    raise AssertionError("The complete 87-path historical inventory was not installed")
single_first = edge.reconcile_single_redirects(api, "test-zone", contract)
expected_single_count = len(contract["singleRedirects"]["rules"])
if (
    len(api.zone_rules) != expected_single_count
    or single_first["managedRuleCount"] != expected_single_count
):
    raise AssertionError("Redirect reconciliation did not converge to the registry")
apex_source = next(
    row for row in contract["singleRedirects"]["rules"]
    if row["host"] == contract["zone"]
)
apex_rule = next(row for row in api.zone_rules if row["ref"] == apex_source["ref"])
apex_from_value = apex_rule["action_parameters"]["from_value"]
if apex_from_value["target_url"] != {"expression": apex_source["targetExpression"]}:
    raise AssertionError("Apex redirect target expression drift")
if apex_from_value["preserve_query_string"] is not True:
    raise AssertionError("Apex redirect query preservation drift")
if any(blog_host in row["expression"] for row in api.zone_rules):
    raise AssertionError("A Single Redirect still pre-empts historical blog URLs")
if api.events.index("account:list-items-replaced") > api.events.index(
    "zone:conflicting-blog-deleted"
) or api.events.index("account:bulk-rule-created") > api.events.index(
    "zone:conflicting-blog-deleted"
):
    raise AssertionError("Competing blog catchall was removed before Bulk Redirect readiness")

first_mutations = api.mutations
api.mutations = 0
api.events.clear()
bulk_second = edge.reconcile_bulk_redirects(api, "test-account", contract)
single_second = edge.reconcile_single_redirects(api, "test-zone", contract)
if api.mutations != 0:
    raise AssertionError("Subdomain redirect reconciliation is not idempotent")
if bulk_second != bulk_first or single_second["refs"] != single_first["refs"]:
    raise AssertionError("Read-back changed after an idempotent reconciliation")

print(
    json.dumps(
        {
            "valid": True,
            "historicalBlogRedirects": bulk_first["itemCount"],
            "finalSingleRedirectCount": len(api.zone_rules),
            "firstPassMutations": first_mutations,
            "bulkBeforeSingleRemoval": True,
            "ephemeralSingleRedirectToken": True,
            "ephemeralControlPlaneToken": True,
            "ephemeralBotAccessToken": True,
            "ephemeralRequestIntegrityToken": True,
            "publicBrowserIntegrityRule": True,
            "publicMachineRequestTrace": True,
            "pagesAndDnsInventory": True,
            "blogPagesFallbackBinding": True,
            "idempotent": True,
            "machineCompressionTransaction": True,
            "machineCompressionRollback": True,
        },
        sort_keys=True,
    )
)
