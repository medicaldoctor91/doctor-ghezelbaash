#!/usr/bin/env python3
"""Offline transaction and idempotence test for the Cloudflare edge contract."""

from __future__ import annotations

import copy
import importlib.util
import json
import urllib.parse
from pathlib import Path
from typing import Any


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
                        "phase": edge.SUBDOMAIN_REDIRECT_PHASE,
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
                ("bot-write", "Bot Management Write"),
                ("bot-read", "Bot Management Read"),
            ]:
                rows.append(
                    {
                        "id": permission_id,
                        "name": name,
                        "scopes": ["com.cloudflare.api.account.zone"],
                    }
                )
            return {"success": True, "result": rows}
        if method == "GET" and path.endswith(
            "permission_groups?scope=com.cloudflare.api.account"
        ):
            return {
                "success": True,
                "result": [
                    {
                        "id": "account-rulesets-write",
                        "name": "Account Rulesets Write",
                        "scopes": ["com.cloudflare.api.account"],
                    },
                    {
                        "id": "account-rulesets-read",
                        "name": "Account Rulesets Read",
                        "scopes": ["com.cloudflare.api.account"],
                    },
                    {
                        "id": "account-lists-write",
                        "name": "Account Rule Lists Write",
                        "scopes": ["com.cloudflare.api.account"],
                    },
                    {
                        "id": "account-lists-read",
                        "name": "Account Rule Lists Read",
                        "scopes": ["com.cloudflare.api.account"],
                    },
                ],
            }
        if method == "POST" and path == "/accounts/test-account/tokens":
            assert isinstance(body, dict)
            if len(body["policies"]) != 2:
                raise AssertionError("Control-plane token must have zone and account policies")
            zone_policy, account_policy = body["policies"]
            zone_ids = {row["id"] for row in zone_policy["permission_groups"]}
            required_zone = {
                *edge.ZONE_SETTINGS_PERMISSION_IDS,
                "zone-read",
                "cache-purge",
                "dns-read",
                "dns-write",
                "cache-write",
                "cache-read",
                "bot-write",
                "bot-read",
            }
            if zone_ids != required_zone:
                raise AssertionError(zone_ids)
            account_ids = {row["id"] for row in account_policy["permission_groups"]}
            if account_ids != {
                "account-rulesets-write",
                "account-rulesets-read",
                "account-lists-write",
                "account-lists-read",
            }:
                raise AssertionError(account_ids)
            if zone_policy["resources"] != {
                "com.cloudflare.api.account.zone.test-zone": "*"
            } or account_policy["resources"] != {
                "com.cloudflare.api.account.test-account": "*"
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
        return 200, {"success": True}


class FakeInventoryApi:
    def __init__(self) -> None:
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
        return len(rows) == 1 and edge.pages_dns_record_matches(rows[0])

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
                    "production_branch": "production/deploy",
                    "domains": sorted(self.project_domains),
                    "source": {
                        "type": "github",
                        "config": {
                            "owner": "medicaldoctor91",
                            "repo_name": "doctor-ghezelbaash",
                            "deployments_enabled": True,
                            "production_deployments_enabled": True,
                            "preview_deployment_setting": "custom",
                            "preview_branch_includes": ["staging/deploy"],
                            "preview_branch_excludes": [],
                        },
                    },
                    "build_config": {
                        "build_command": "npm ci --ignore-scripts && npm run build",
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


contract = edge.load_subdomain_redirect_contract(ROOT)
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

inventory_api = FakeInventoryApi()
edge.ensure_pages_custom_domains(inventory_api, "test-account")
if inventory_api.pages_domains.get("blog.ghezelbaash.ir") != "pending":
    raise AssertionError("Pages blog domain should remain pending before exact DNS")
pages_dns = edge.reconcile_pages_dns_binding(inventory_api, "test-zone")
if pages_dns.get("content") != "doctor-ghezelbaash.pages.dev":
    raise AssertionError("Exact Pages blog CNAME was not installed")
pages_domains = edge.wait_pages_custom_domains(inventory_api, "test-account")
if pages_domains["statuses"].get("blog.ghezelbaash.ir") != "active":
    raise AssertionError("Historical blog Pages custom domain was not activated after DNS")
pages_contract = edge.read_pages_contract(
    inventory_api, "test-account", "www.ghezelbaash.ir"
)
dns_contract = edge.read_dns_contract(
    inventory_api, "test-zone", "ghezelbaash.ir", "www.ghezelbaash.ir"
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
single_first = edge.reconcile_subdomain_redirects(api, "test-zone", contract)
if len(api.zone_rules) != 3 or single_first["managedRuleCount"] != 3:
    raise AssertionError("Redirect reconciliation did not converge to three managed catchalls")
if any("blog.ghezelbaash.ir" in row["expression"] for row in api.zone_rules):
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
single_second = edge.reconcile_subdomain_redirects(api, "test-zone", contract)
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
            "pagesAndDnsInventory": True,
            "blogPagesFallbackBinding": True,
            "idempotent": True,
        },
        sort_keys=True,
    )
)
