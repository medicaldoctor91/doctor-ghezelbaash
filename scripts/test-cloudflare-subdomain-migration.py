#!/usr/bin/env python3
"""Offline transaction and idempotence test for subdomain redirect migration."""

from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
EDGE_PATH = ROOT / "scripts" / "configure-cloudflare-edge.py"
SPEC = importlib.util.spec_from_file_location("ghezelbaash_edge_test", EDGE_PATH)
if SPEC is None or SPEC.loader is None:
    raise SystemExit("Unable to import Cloudflare edge reconciler")
edge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(edge)


def legacy_rule(rule_id: int, host: str, target: str) -> dict[str, Any]:
    return {
        "id": str(rule_id),
        "ref": f"dashboard_manual_{rule_id}",
        "expression": f'(http.host eq "{host}")',
        "description": "Legacy dashboard redirect",
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
            legacy_rule(1, "blog.ghezelbaash.ir", "https://www.ghezelbaash.ir/"),
            legacy_rule(2, "doctor.ghezelbaash.ir", "https://www.google.com/maps/"),
            legacy_rule(
                3,
                "github.ghezelbaash.ir",
                "https://github.com/medicaldoctor91/doctor-ghezelbaash",
            ),
            legacy_rule(
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
            "/accounts/test-account/rules/lists/blog-list/items?per_page=1000"
        ):
            return {"success": True, "result": copy.deepcopy(self.list_items)}
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
            self.mutate("zone:legacy-blog-deleted")
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


contract = edge.load_subdomain_redirect_contract(ROOT)
api = FakeCloudflareApi()

# The production entrypoint must establish and verify all exact Bulk Redirects
# before removing the higher-priority legacy blog Single Redirect.
bulk_first = edge.reconcile_bulk_redirects(api, "test-account", contract)
if bulk_first["itemCount"] != 87:
    raise AssertionError("The complete 87-path historical inventory was not installed")
single_first = edge.reconcile_subdomain_redirects(api, "test-zone", contract)
if len(api.zone_rules) != 3 or single_first["managedRuleCount"] != 3:
    raise AssertionError("Legacy four-rule migration did not converge to three catchalls")
if any("blog.ghezelbaash.ir" in row["expression"] for row in api.zone_rules):
    raise AssertionError("A Single Redirect still pre-empts historical blog URLs")
if api.events.index("account:list-items-replaced") > api.events.index(
    "zone:legacy-blog-deleted"
) or api.events.index("account:bulk-rule-created") > api.events.index(
    "zone:legacy-blog-deleted"
):
    raise AssertionError("Legacy blog catchall was removed before Bulk Redirect readiness")

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
            "idempotent": True,
        },
        sort_keys=True,
    )
)
