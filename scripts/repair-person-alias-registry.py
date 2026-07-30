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
    (ROOT / path).write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def by_id(data: dict, identifier: str) -> dict:
    for node in data.get("@graph", []):
        if isinstance(node, dict) and node.get("@id") == identifier:
            return node
    raise RuntimeError(f"missing node: {identifier}")


full = load("public/graph.jsonld")
head = load("src/data/semantic/head-graph.min.jsonld")
for graph in (full, head):
    by_id(graph, DOCTOR)["alternateName"] = list(ALIASES)
dump("public/graph.jsonld", full)
dump("src/data/semantic/head-graph.min.jsonld", head)

llms_path = ROOT / "public/llms.txt"
llms = llms_path.read_text(encoding="utf-8")
alias_line = "- Canonical ordered aliases: " + " | ".join(ALIASES)
if re.search(r"^- Canonical ordered aliases:.*$", llms, flags=re.M):
    llms = re.sub(r"^- Canonical ordered aliases:.*$", alias_line, llms, flags=re.M)
else:
    marker = "- Google Knowledge Graph ID: `/g/11nqdfk76c` — current entity identifier for Mohammad Saeed Ghezelbash."
    if marker not in llms:
        raise RuntimeError("llms physician identity marker is missing")
    llms = llms.replace(marker, marker + "\n" + alias_line, 1)
llms_path.write_text(llms, encoding="utf-8")

validator_path = ROOT / ".github/scripts/validate_source.py"
validator = validator_path.read_text(encoding="utf-8")
constant = "PERSON_ALIASES = " + repr(ALIASES) + "\n"
if "PERSON_ALIASES = " not in validator:
    marker = 'KNOWLEDGE_PANEL_NAME = "Mohammad Saeed Ghezelbash"\n'
    if marker not in validator:
        raise RuntimeError("validator Knowledge Panel constant is missing")
    validator = validator.replace(marker, marker + constant, 1)
else:
    validator, count = re.subn(r"PERSON_ALIASES = \[[^\n]*\]\n", constant, validator, count=1)
    if count != 1:
        raise RuntimeError("existing alias registry constant could not be replaced")
full_check = 'require(isinstance(doctor.get("alternateName"), list) and doctor["alternateName"] and doctor["alternateName"][0] == KNOWLEDGE_PANEL_NAME, "Full Graph Person.alternateName must begin with the current Google Knowledge Panel name")'
head_check = 'require(isinstance(head_doctor.get("alternateName"), list) and head_doctor["alternateName"] and head_doctor["alternateName"][0] == KNOWLEDGE_PANEL_NAME, "Head Graph Person.alternateName must begin with the current Google Knowledge Panel name")'
if full_check not in validator or head_check not in validator:
    raise RuntimeError("legacy first-item alias checks are missing")
validator = validator.replace(
    full_check,
    'require(doctor.get("alternateName") == PERSON_ALIASES, "Full Graph Person.alternateName differs from the canonical ordered registry")',
    1,
)
validator = validator.replace(
    head_check,
    'require(head_doctor.get("alternateName") == PERSON_ALIASES, "Head Graph Person.alternateName differs from the canonical ordered registry")',
    1,
)
validator_path.write_text(validator, encoding="utf-8")

from rdflib import Graph

rdf = Graph().parse(str(ROOT / "public/graph.jsonld"), format="json-ld")
nt = rdf.serialize(format="nt")
lines = sorted(line.strip() for line in nt.splitlines() if line.strip())
(ROOT / "public/graph.ttl").write_text("\n".join(lines) + "\n", encoding="utf-8")


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
