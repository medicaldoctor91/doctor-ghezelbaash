#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://www.ghezelbaash.ir/"
DOCTOR = BASE + "#saeed-ghezelbash"
GRAPH_DATASET = BASE + "graph.jsonld#dataset"
VERSION = "1.2.2"
ALIASES = [
    "Mohammad Saeed Ghezelbash",
    "Dr. Mohammad Saeed Ghezelbash",
    "Mohammad Saeed Ghezelbaash",
    "Dr. Mohammad Saeed Ghezelbaash",
    "Saeed Ghezelbash",
    "Dr. Saeed Ghezelbash",
    "Saeed Ghezelbaash",
    "Dr. Saeed Ghezelbaash",
    "دکتر محمدسعید قزلباش",
    "دکتر محمد سعید قزلباش",
    "محمدسعید قزلباش",
    "محمد سعید قزلباش",
    "دکتر سعید قزلباش",
    "سعید قزلباش",
    "MohammadSaeed Ghezelbash",
    "Mohamadsaeed Ghezelbash",
    "Mohammadssaeed Ghezelbash",
    "Mohammadssaeed Ghezelbaash",
    "Mohammad Saeed Ghazlbash",
    "Dr. Mohammad Saeed Ghazlbash",
    "Doctor Ghezelbaash",
    "Ghezelbash MS",
]


def load(path: str) -> dict:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def dump(path: str, data: dict) -> None:
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def by_id(data: dict, identifier: str) -> dict:
    for node in data.get("@graph", []):
        if isinstance(node, dict) and node.get("@id") == identifier:
            return node
    raise RuntimeError(f"missing node: {identifier}")


full = load("public/graph.jsonld")
head = load("src/data/semantic/head-graph.min.jsonld")
for graph in (full, head):
    by_id(graph, DOCTOR)["alternateName"] = list(ALIASES)
    by_id(graph, GRAPH_DATASET)["version"] = VERSION

dump("public/graph.jsonld", full)
dump("src/data/semantic/head-graph.min.jsonld", head)

llms_path = ROOT / "public/llms.txt"
llms = llms_path.read_text(encoding="utf-8")
alias_line = "Canonical aliases, ordered: " + " | ".join(ALIASES)
if re.search(r"^Canonical aliases, ordered:.*$", llms, flags=re.M):
    llms = re.sub(r"^Canonical aliases, ordered:.*$", alias_line, llms, flags=re.M)
else:
    marker = "Current Google Knowledge Panel name: Mohammad Saeed Ghezelbash"
    if marker not in llms:
        raise RuntimeError("llms identity marker is missing")
    llms = llms.replace(marker, marker + "\n" + alias_line, 1)
llms_path.write_text(llms, encoding="utf-8")

page_path = ROOT / "src/pages/index.md"
page = page_path.read_text(encoding="utf-8")n
page, count = re.subn(
    r"(Current live graph version</strong></dt>\s*<dd><a href=\"/graph\.jsonld\" type=\"application/ld\+json\">Version )1\.2\.1",
    r"\g<1>1.2.2",
    page,
    count=1,
)
if count != 1:
    raise RuntimeError("visible current graph version was not updated")
page_path.write_text(page, encoding="utf-8")

validator_path = ROOT / ".github/scripts/validate_source.py"
validator = validator_path.read_text(encoding="utf-8")
validator, count = re.subn(r'GRAPH_VERSION = "1\.2\.1"', 'GRAPH_VERSION = "1.2.2"', validator, count=1)
if count != 1:
    raise RuntimeError("validator graph version was not updated")
constant = "PERSON_ALIASES = " + repr(ALIASES) + "\n"
if "PERSON_ALIASES = " not in validator:
    validator = validator.replace(
        'KNOWLEDGE_PANEL_NAME = "Mohammad Saeed Ghezelbash"\n',
        'KNOWLEDGE_PANEL_NAME = "Mohammad Saeed Ghezelbash"\n' + constant,
        1,
    )
else:
    validator = re.sub(r"PERSON_ALIASES = \[[^\n]*\]\n", constant, validator, count=1)
validator = validator.replace(
    'require(isinstance(doctor.get("alternateName"), list) and doctor["alternateName"] and doctor["alternateName"][0] == KNOWLEDGE_PANEL_NAME, "Full Graph Person.alternateName must begin with the current Google Knowledge Panel name")',
    'require(doctor.get("alternateName") == PERSON_ALIASES, "Full Graph Person.alternateName differs from the canonical ordered registry")',
    1,
)
validator = validator.replace(
    'require(isinstance(head_doctor.get("alternateName"), list) and head_doctor["alternateName"] and head_doctor["alternateName"][0] == KNOWLEDGE_PANEL_NAME, "Head Graph Person.alternateName must begin with the current Google Knowledge Panel name")',
    'require(head_doctor.get("alternateName") == PERSON_ALIASES, "Head Graph Person.alternateName differs from the canonical ordered registry")',
    1,
)
validator_path.write_text(validator, encoding="utf-8")

from rdflib import Graph

rdf = Graph().parse(str(ROOT / "public/graph.jsonld"), format="json-ld")
ttl = rdf.serialize(format="longturtle")
(ROOT / "public/graph.ttl").write_text(ttl.rstrip() + "\n", encoding="utf-8")

source = page_path.read_text(encoding="utf-8")
body = re.sub(r"\A---\r?\n[\s\S]*?\r?\n---\r?\n?", "", source, count=1)
body = re.sub(r"<script\b[^>]*>[\s\S]*?</script>", "", body, flags=re.I)
body = re.sub(r"<style\b[^>]*>[\s\S]*?</style>", "", body, flags=re.I)
body = re.sub(r"<script\b[^>]*/\s*>", "", body, flags=re.I)
body = re.sub(r"\s+type=[\"']application/ld\+json[\"']", "", body, flags=re.I)
body = re.sub(r"\n{3,}", "\n\n", body).strip()
projection = (
    "# Dr. Saeed Ghezelbash — Full canonical page export\n\n"
    f"Canonical: {BASE}\nAbout: {DOCTOR}\nSource: {BASE}\nLanguage: fa-IR\n"
    "Indexing: noindex, follow\nPurpose: deterministic machine-readable projection of the complete canonical page content\n\n---\n\n"
    + body
    + "\n"
)
(ROOT / "public/llms-full.txt").write_text(projection, encoding="utf-8")


def run(*args: str) -> None:
    subprocess.run(args, cwd=ROOT, check=True)


run("npm", "ci", "--no-audit", "--no-fund")
run("npm", "run", "build")
html = (ROOT / "dist/index.html").read_text(encoding="utf-8")
scripts = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>", html, flags=re.I)
if len(scripts) != 1:
    raise RuntimeError(f"expected one inline script, found {len(scripts)}")
digest = base64.b64encode(hashlib.sha256(scripts[0].encode()).digest()).decode()
headers_path = ROOT / "public/_headers"
headers = headers_path.read_text(encoding="utf-8")
headers, count = re.subn(r"'sha256-[A-Za-z0-9+/=]+'", f"'sha256-{digest}'", headers, count=1)
if count != 1:
    raise RuntimeError("CSP script hash replacement failed")
headers_path.write_text(headers, encoding="utf-8")
run("npm", "run", "build")
run("python3", ".github/scripts/validate_source.py")

for path in ("public/graph.jsonld", "src/data/semantic/head-graph.min.jsonld"):
    assert by_id(load(path), DOCTOR)["alternateName"] == ALIASES
print("Alias registry repair complete:", len(ALIASES), "ordered aliases")
