#!/usr/bin/env python3
"""Read-only verification of the required Cloudflare production control plane.

This gate never creates credentials or repairs production drift. Authorized
reconciliation remains an explicit configure-cloudflare-edge.py --apply
operation, separate from routine deployment verification.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE=Path(__file__).resolve().parent
EDGE_PATH=HERE/"configure-cloudflare-edge.py"
spec=importlib.util.spec_from_file_location("ghezelbaash_edge",EDGE_PATH)
if spec is None or spec.loader is None: raise SystemExit("Unable to load configure-cloudflare-edge.py")
edge=importlib.util.module_from_spec(spec); spec.loader.exec_module(edge)

EXPECTED_HSTS={"enabled":True,"max_age":63_072_000,"include_subdomains":True,"preload":True,"nosniff":True}
REQUIRED_ENV=("CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID","ZONE_NAME","CANONICAL_HOST")

def fail(message:str)->None: raise edge.CloudflareError(message)

class ReadOnlyCloudflareApi(edge.CloudflareApi):
    """Reject writes before transport, including accidental reconciliation calls."""
    def raw(self,method:str,path:str,body:object|None=None)->tuple[int,dict[str,object]]:
        if method!="GET" or body is not None: fail(f"Read-only Cloudflare preflight refused {method} {path}")
        return super().raw(method,path,body)

def only_ruleset(api,scope_path,kind,phase):
    rows=api.expect("GET",scope_path).get("result") or []
    matches=[row for row in rows if row.get("kind")==kind and row.get("phase")==phase]
    if len(matches)!=1: fail(f"Cloudflare {phase} ruleset count drift: {len(matches)}")
    ruleset_id=str(matches[0].get("id") or "")
    if not ruleset_id: fail(f"Cloudflare {phase} ruleset has no ID")
    return api.expect("GET",f"{scope_path}/{ruleset_id}").get("result") or {}

def verify_zone_settings(api,zone):
    readback={}
    for setting_id,desired in edge.ZONE_SETTINGS.items():
        result=api.expect("GET",f"/zones/{zone}/settings/{setting_id}").get("result")
        if not isinstance(result,dict) or result.get("id")!=setting_id or "value" not in result: fail(f"Invalid zone setting response for {setting_id}")
        actual=result["value"]
        if not edge.subset_equal(actual,desired): fail(f"Required zone setting drift: {setting_id}={actual!r}; expected {desired!r}")
        readback[setting_id]=actual
    return readback

def verify_pages(api,account,host):
    project=edge.read_pages_contract(api,account,host)
    domains=edge.read_pages_custom_domains(api,account)
    statuses={name:str((domains.get(name) or {}).get("status") or "missing") for name in edge.PAGES_REQUIRED_CUSTOM_DOMAINS}
    if any(statuses[name]!="active" for name in edge.PAGES_REQUIRED_CUSTOM_DOMAINS): fail(f"Cloudflare Pages custom-domain status drift: {statuses}")
    return {"project":project,"customDomainStatuses":statuses}

def verify_smart_tiered(api,zone):
    result=api.expect("GET",f"/zones/{zone}/cache/tiered_cache_smart_topology_enable").get("result") or {}
    if result.get("value")!="on": fail(f"Smart Tiered Cache drift: {result.get('value')!r}")
    return {"value":result.get("value"),"editable":result.get("editable")}

def verify_cache_rules(api,zone,host):
    full=only_ruleset(api,f"/zones/{zone}/rulesets","zone","http_request_cache_settings")
    rules=full.get("rules") or []; desired=edge.cache_rule(host)
    if len(rules)!=1 or rules[0].get("ref")!=edge.CACHE_RULE_REF or not edge.rule_matches(rules[0],desired):
        fail("Canonical cache ruleset is not the exact single source-owned rule")
    return {"ref":rules[0].get("ref"),"enabled":rules[0].get("enabled")}

def verify_bot_settings(api,zone):
    actual=api.expect("GET",f"/zones/{zone}/bot_management").get("result") or {}
    for key,desired in edge.BOT_ACCESS_SETTINGS.items():
        if key not in actual or actual.get(key)!=desired: fail(f"Bot Management drift for {key}: {actual.get(key)!r}")
    for key,desired in edge.OPTIONAL_BOT_ACCESS_SETTINGS.items():
        if key in actual and actual.get(key)!=desired: fail(f"Optional Bot Management drift for {key}: {actual.get(key)!r}")
    return {key:actual.get(key) for key in [*edge.BOT_ACCESS_SETTINGS,*edge.OPTIONAL_BOT_ACCESS_SETTINGS] if key in actual}

def verify_bulk_redirects(api,account,contract):
    bulk=contract["bulkRedirects"]
    query=urllib.parse.urlencode({"per_page":50})
    rows=api.expect("GET",f"/accounts/{account}/rules/lists?{query}").get("result") or []
    matches=[row for row in rows if row.get("name")==bulk["listName"]]
    if len(matches)!=1 or matches[0].get("kind")!="redirect": fail(f"Bulk Redirect list drift for {bulk['listName']}")
    list_id=str(matches[0].get("id") or "")
    if not list_id: fail("Bulk Redirect list has no ID")
    actual_items=edge.read_all_list_items(api,account,list_id); desired_items=edge.expand_bulk_redirect_items(contract)
    if edge.normalized_bulk_items(actual_items)!=edge.normalized_bulk_items(desired_items):
        fail("Bulk Redirect list drift: "+edge.bulk_items_drift_summary(actual_items,desired_items))
    full=only_ruleset(api,f"/accounts/{account}/rulesets","root",edge.BULK_REDIRECT_PHASE)
    rules=full.get("rules") or []; desired=edge.bulk_redirect_rule(contract)
    owned=[row for row in rules if row.get("ref")==desired["ref"]]
    if len(owned)!=1 or not edge.rule_matches(owned[0],desired): fail("Bulk Redirect account rule drift")
    return {"listName":bulk["listName"],"itemCount":len(actual_items),"ruleRef":desired["ref"]}

def expression_hosts(row):
    return set(re.findall(r'http\.host\s+eq\s+"([^"]+)"',str(row.get("expression") or "")))

def verify_single_redirects(api,zone,contract):
    full=only_ruleset(api,f"/zones/{zone}/rulesets","zone",edge.SINGLE_REDIRECT_PHASE)
    rules=full.get("rules") or []; desired=edge.single_redirect_rules(contract); desired_refs={row["ref"] for row in desired}
    for rule in desired:
        owned=[row for row in rules if row.get("ref")==rule["ref"]]
        if len(owned)!=1 or not edge.rule_matches(owned[0],rule): fail(f"Single Redirect drift for {rule['ref']}")
    blog_host=str(contract["bulkRedirects"]["host"])
    if any(expression_hosts(row)=={blog_host} for row in rules): fail("A Single Redirect still pre-empts historical blog Bulk Redirects")
    for source in contract["singleRedirects"]["rules"]:
        host=str(source["host"])
        conflicts=[row for row in rules if expression_hosts(row)=={host} and row.get("ref") not in desired_refs]
        if conflicts: fail(f"Unmanaged competing Single Redirect remains for {host}")
    return {"managedRuleCount":len(desired),"totalRuleCount":len(rules)}

def verify_response_transforms(api,zone,host,blog_host,dist_dir):
    headers=(dist_dir/"_headers").read_text(encoding="utf-8")
    csp=edge.extract_header(headers,"/404.html","Content-Security-Policy")
    desired_hsts=edge.hsts_rule(host); desired_404=edge.not_found_rule(host,blog_host,csp); expected_404_ref=edge.not_found_rule_ref(csp)
    full=only_ruleset(api,f"/zones/{zone}/rulesets","zone","http_response_headers_transform")
    rules=full.get("rules") or []
    hsts=[row for row in rules if row.get("ref")==edge.HSTS_RULE_REF]
    not_found=[row for row in rules if str(row.get("ref") or "").startswith(edge.NOT_FOUND_RULE_REF_PREFIX)]
    if len(hsts)!=1 or not edge.rule_matches(hsts[0],desired_hsts): fail("Canonical HSTS transform rule drift")
    if len(not_found)!=1 or not_found[0].get("ref")!=expected_404_ref or not edge.rule_matches(not_found[0],desired_404): fail("Canonical 404 transform rule drift")
    if not rules or rules[-1].get("id")!=not_found[0].get("id"): fail("Canonical 404 transform must remain last")
    return {"hstsRef":edge.HSTS_RULE_REF,"notFoundRef":expected_404_ref}

def validate_static_contract():
    if edge.ZONE_SETTINGS.get("always_online")!="off": fail("Always Online must remain off so route-specific stale policy is effective")
    if edge.ZONE_SETTINGS.get("tls_1_3")!="zrt": fail("Required TLS 1.3 contract must be zrt")
    if edge.ZONE_SETTINGS.get("0rtt")!="on": fail("Required 0-RTT contract must be on")
    if edge.ZONE_SETTINGS.get("automatic_https_rewrites")!="off": fail("Automatic HTTPS Rewrites must remain off")
    hsts=edge.ZONE_SETTINGS.get("security_header",{}).get("strict_transport_security",{})
    if hsts!=EXPECTED_HSTS: fail(f"Required HSTS contract drift: {hsts!r}")

def check_live_apex_hsts(zone_name):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,req,fp,code,msg,headers,newurl): return None
    opener=urllib.request.build_opener(NoRedirect)
    req=urllib.request.Request(f"https://{zone_name}/",headers={"User-Agent":"ghezelbaash-edge-preflight/2.0"})
    try:
        try:
            with opener.open(req,timeout=30) as response: status=response.status; hsts=response.headers.get("Strict-Transport-Security") or ""
        except urllib.error.HTTPError as exc: status=exc.code; hsts=exc.headers.get("Strict-Transport-Security") or ""
    except Exception as exc: fail(f"Unable to verify apex HTTPS/HSTS: {type(exc).__name__}: {exc}")
    lowered=hsts.lower()
    if not ("max-age=63072000" in lowered and "includesubdomains" in lowered and "preload" in lowered): fail(f"Apex HSTS read-back mismatch HTTP {status}: {hsts!r}")
    print("APEX_HSTS_EXACT",status,hsts)

def full_control_plane_readback(api,account,zone,zone_name,host,dist_dir):
    redirect_contract=edge.load_redirect_registry(Path.cwd().resolve()); blog_host=str(redirect_contract["bulkRedirects"]["host"])
    return {
      "pages":verify_pages(api,account,host),
      "dns":edge.read_dns_contract(api,zone,zone_name,host,blog_host),
      "zoneSettings":verify_zone_settings(api,zone),
      "smartTieredCache":verify_smart_tiered(api,zone),
      "cacheRule":verify_cache_rules(api,zone,host),
      "botManagement":verify_bot_settings(api,zone),
      "historicalBlogBulkRedirects":verify_bulk_redirects(api,account,redirect_contract),
      "singleRedirects":verify_single_redirects(api,zone,redirect_contract),
      "responseTransforms":verify_response_transforms(api,zone,host,blog_host,dist_dir),
    }

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--if-configured",action="store_true")
    parser.add_argument("--full-control-plane",action="store_true")
    parser.add_argument("--dist",default="dist")
    args=parser.parse_args()
    values={name:os.environ.get(name,"").strip() for name in REQUIRED_ENV}
    if args.if_configured and not values["CLOUDFLARE_API_TOKEN"]:
        print("CLOUDFLARE_PREFLIGHT_SKIPPED api_token_not_configured"); return 0
    missing=[name for name,value in values.items() if not value]
    if missing:
        print(f"CLOUDFLARE_PREFLIGHT_ERROR: Missing required environment: {', '.join(missing)}",file=sys.stderr); return 1
    token=values["CLOUDFLARE_API_TOKEN"]; account=values["CLOUDFLARE_ACCOUNT_ID"]; zone_name=values["ZONE_NAME"]; host=values["CANONICAL_HOST"]
    if account!=edge.PLATFORM_CF["accountId"] or zone_name!=edge.PLATFORM_CONTRACT["zoneName"] or host!=edge.PLATFORM_CONTRACT["canonicalHost"]:
        print("CLOUDFLARE_PREFLIGHT_ERROR: Environment disagrees with platform contract",file=sys.stderr); return 1
    if host!=f"www.{zone_name}":
        print(f"CLOUDFLARE_PREFLIGHT_ERROR: Unexpected canonical host/zone pairing: {host}/{zone_name}",file=sys.stderr); return 1
    try:
        validate_static_contract()
        api=ReadOnlyCloudflareApi(token); zone=edge.zone_id(api,account,zone_name)
        if args.full_control_plane:
            readback=full_control_plane_readback(api,account,zone,zone_name,host,Path(args.dist).resolve())
            mode="FULL_CONTROL_PLANE"
        else:
            readback=verify_zone_settings(api,zone)
            mode="ZONE_SETTINGS"
        check_live_apex_hsts(zone_name)
        print("CLOUDFLARE_REQUIRED_PREFLIGHT_EXACT",json.dumps({"mode":mode,"readback":readback},sort_keys=True))
        return 0
    except (edge.CloudflareError,OSError,ValueError,KeyError) as exc:
        print(f"CLOUDFLARE_PREFLIGHT_ERROR: {exc}",file=sys.stderr)
        if isinstance(exc,edge.CloudflareError) and edge.is_permission_error(exc):
            print("CLOUDFLARE_PREFLIGHT_SCOPE_REQUIRED: The existing read-only deployment credential lacks a required GET capability. No credential was created and no production repair was attempted.",file=sys.stderr)
        return 1

if __name__=="__main__": raise SystemExit(main())