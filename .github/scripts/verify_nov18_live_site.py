"""Read-only live audit of all sitemap pages against the 2026-11-18 approved attribution policy."""
import concurrent.futures
import hashlib
import json
import os
import re
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

SITE = "https://www.ghezelbaash.ir"
PERSON = SITE + "/#saeed-ghezelbash"
OFFICE = SITE + "/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah"
FORBIDDEN = ("medicalSpecialty", "availableService", "hasOfferCatalog")
OUTPUT = Path("/tmp/live-nov18-audit.json")
S = requests.Session()
S.headers.update({"Cache-Control": "no-cache, no-store", "Pragma": "no-cache",
                  "Accept-Encoding": "identity", "User-Agent": "clinical-attribution-live-audit/1.0"})

def read(url):
    for attempt in range(3):
        try:
            res = S.get(url, timeout=100, allow_redirects=True)
            if res.status_code in (429, 502, 503, 504) and attempt < 2:
                time.sleep(3 * (attempt + 1))
                continue
            res.raise_for_status()
            return res.content
        except requests.RequestException:
            if attempt == 2:
                raise
            time.sleep(3 * (attempt + 1))

def values(x):
    if x is None: return []
    return x if isinstance(x, list) else [x]

def identity(x):
    return x if isinstance(x, str) else x.get("@id") if isinstance(x, dict) else None

def is_type(node, typ):
    return typ in [identity(x) for x in values(node.get("@type"))]

def extract(html):
    blocks = []
    for m in re.finditer(rb'<script\b([^>]*)>([\s\S]*?)</script>', html, flags=re.I):
        if not re.search(rb'type\s*=\s*["\']application/ld\+json["\']', m.group(1), flags=re.I):
            continue
        blocks.append(json.loads(m.group(2)))
    return blocks

def nodes(blocks):
    return [node for block in blocks for node in values(block.get("@graph", [block]))
            if isinstance(node, dict)]

graph_bytes = read(SITE + "/graph.jsonld")
graph_json = json.loads(graph_bytes)
graph = graph_json["@graph"]
by_id = {n["@id"]: n for n in graph if isinstance(n, dict) and "@id" in n}
doctor = by_id[PERSON]
office = by_id[OFFICE]
errors = []
assert len(graph) == 1916, "Unexpected live canonical graph node count"

# A hard owner requirement: ALL canonical RDF is active in homepage HEAD ahead
# of text, not silently replaced by a partial Schema.org-only projection.
home_html = read(SITE + "/")
tag=b'<script id="canonical-entity-graph" type="application/ld+json">'
assert home_html.count(tag)==1, "Missing or duplicated full active homepage JSON-LD"
first=home_html.index(tag)+len(tag)
last=home_html.index(b"</script>", first)+len(b"</script>")
assert last<2_000_000, "Complete RDF must fit within first 2MB"
h1=home_html.index(b"<h1")
assert last<h1<2_000_000, "Full graph must precede crawlable main H1"
assert last<home_html.index(b"</head>")<home_html.index(b"<body")
assert b'<script id="schema-core-mainentity" type="application/ld+json">' not in home_html
active=json.loads(home_html[first:last-len(b"</script>")])
assert len(active["@graph"])==len(graph)==1916
assert {n["@id"] for n in active["@graph"]}=={n["@id"] for n in graph}
assert len(extract(home_html))==1, "Only full active canonical JSON-LD is permitted"
# The strengthened Entity Home must be publicly visible and crawlable without
# changing the canonical source RDF or introducing another Person identity.
proof=re.search(rb'<section class="entity-home-evidence"[\s\S]*?</section>',home_html)
assert proof and proof.end()<1_998_000, "Professional evidence is missing from first 2MB"
section=proof.group(0)
assert b'data-canonical-person="https://www.ghezelbaash.ir/#saeed-ghezelbash"' in section
for external in (
    b'membersearch.irimc.org/member/profile?',
    b'orcid.org/0009-0001-9346-8475',
    b'www.wikidata.org/entity/Q140287622',
    b'pubmed.ncbi.nlm.nih.gov/27280013/',
    b'pubmed.ncbi.nlm.nih.gov/34574943/',
    b'saeed-ghezelbash-diagnostic-philosophy',
):
    assert external in section, ('Missing public source corroboration',external)

assert "Person" in values(doctor.get("@type")) and "IndividualPhysician" in values(doctor.get("@type"))
assert identity(doctor.get("practicesAt")) == OFFICE
assert is_type(office, "PhysiciansOffice")
for key in FORBIDDEN:
    if key in office: errors.append("Canonical office has forbidden " + key)

services = [n for n in graph if is_type(n, "Service")]
assert len(services) == 124, "Canonical service count drift"
for svc in services:
    providers = [identity(x) for x in values(svc.get("provider"))]
    if providers != [PERSON]:
        errors.append(f"Canonical service {svc.get('@id')} provider={providers}")
    channels = [identity(x) for x in values(svc.get("availableChannel"))]
    if not channels:
        errors.append(f"Canonical service {svc.get('@id')} has no service channel")
    for channel in channels:
        ch = by_id.get(channel)
        if not ch:
            errors.append(f"Service {svc.get('@id')}: unresolved channel {channel}")
            continue
        if "online" in channel.lower():
            continue
        loc = [identity(x) for x in values(ch.get("serviceLocation"))]
        if OFFICE not in loc:
            errors.append(f"Service {svc.get('@id')}: in-person channel does not locate practice")
service_ids = {x["@id"] for x in services}

sitemap = read(SITE + "/sitemap.xml").decode()
urls = re.findall(r"<loc>([^<]+)</loc>", sitemap)
urls = [u for u in urls if u.startswith(SITE + "/") and not u.endswith((".webp", ".png"))]
assert len(urls) == 72 and len(urls) == len(set(urls)), f"Expected 72 distinct sitemap URLs, got {len(urls)}"

def inspect(url):
    html = read(url)
    blocks = extract(html)
    all_nodes = nodes(blocks)
    issues = []
    if not blocks:
        issues.append("Missing any JSON-LD script")
    office_nodes = [n for n in all_nodes if n.get("@id") == OFFICE]
    for n in office_nodes:
        for key in FORBIDDEN:
            if key in n: issues.append("Office has forbidden " + key)
    service_nodes = [n for n in all_nodes if is_type(n, "Service")]
    for svc in service_nodes:
        sid = svc.get("@id")
        if sid not in service_ids: issues.append(f"Page service not in canonical graph: {sid}")
        provider = [identity(x) for x in values(svc.get("provider"))]
        if provider != [PERSON]: issues.append(f"Page service {sid} provider={provider}")
        for channel in values(svc.get("availableChannel")):
            chan = identity(channel)
            local = next((n for n in all_nodes if n.get("@id") == chan), None)
            c = (channel if isinstance(channel, dict) and "serviceLocation" in channel else local or by_id.get(chan))
            if not c:
                issues.append(f"Page service {sid} unresolved channel {chan}")
                continue
            if chan and "online" in chan.lower():
                continue
            if OFFICE not in [identity(x) for x in values(c.get("serviceLocation"))]:
                issues.append(f"Page service {sid} in-person channel location mismatched")
    return {"url": url, "htmlBytes": len(html), "jsonldScripts": len(blocks),
            "services": len(service_nodes), "officeNodes": len(office_nodes), "issues": issues}

with concurrent.futures.ThreadPoolExecutor(max_workers=7) as pool:
    pages = list(pool.map(inspect, urls))
for page in pages:
    errors.extend(page["url"] + ": " + e for e in page["issues"])

result = {"status": "FAIL" if errors else "PASS", "source": SITE,
          "sourceCommit": json.loads(read(SITE + "/release-provenance.json"))["sourceCommit"],
          "graphSHA256": hashlib.sha256(graph_bytes).hexdigest(),
          "graphNodes": len(graph), "graphServices": len(services),
          "fullActiveRdfEndByte":last, "physicianEvidenceEndByte":proof.end(),
          "providerOnlyPerson": sum([identity(x) for x in values(s.get("provider"))] == [PERSON] for s in services),
          "sitemapPages": len(urls), "pagesChecked": len(pages),
          "pagesWithJSONLD": sum(x["jsonldScripts"] > 0 for x in pages),
          "serviceAppearancesInPages": sum(x["services"] for x in pages),
          "pagesWithViolations": sum(bool(x["issues"]) for x in pages),
          "violations": errors, "pageEvidence": pages, "readOnly": True}
OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({k: v for k,v in result.items() if k not in ("pageEvidence","violations")}, ensure_ascii=False))
if errors:
    print(json.dumps(errors[:35], ensure_ascii=False))
    raise SystemExit(1)
