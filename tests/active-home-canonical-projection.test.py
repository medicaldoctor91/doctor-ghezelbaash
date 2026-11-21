"""Regression checks for the active full canonical graph in the homepage HEAD."""
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".github/scripts"))
from browser_projection import require_current_active_head_jsonld

graph_path = ROOT / "dist/graph.jsonld"
html = (ROOT / "dist/index.html").read_bytes()

proof = require_current_active_head_jsonld(graph_path, html)
assert proof["status"] == "PASS"
assert proof["canonicalGraphStorage"] == "application/ld+json#canonical-entity-graph"
assert proof["nodes"] >= 1900
assert proof["criticalReserveBytes"] > 4_096  # Hard 2 MB window with explicit 4 KB byte reserve

# The validator must fail closed if the purported canonical external graph
# differs in even one node from the embedded schema.
graph = json.loads(graph_path.read_text())
modified = json.loads(json.dumps(graph))
modified["@graph"].pop()
with tempfile.TemporaryDirectory() as d:
    wrong = Path(d) / "graph.jsonld"
    wrong.write_text(json.dumps(modified))
    try:
        require_current_active_head_jsonld(wrong, html)
    except AssertionError:
        pass
    else:
        raise AssertionError("Validator accepted a graph with an omitted node")

# A second JSON-LD script makes the visible page semantically ambiguous.
extra = b'<script type="application/ld+json">{"@context":"https://schema.org","@type":"Person"}</script>'
tampered = html.replace(b"</head>", extra + b"</head>", 1)
assert tampered != html
try:
    require_current_active_head_jsonld(graph_path, tampered)
except AssertionError:
    pass
else:
    raise AssertionError("Validator accepted a duplicate JSON-LD script")

# Reject a regression to inert JSON even if the graph contents are unchanged.
# Do not let the generic historical compatibility validator weaken this gate.
legacy = html.replace(
    b'<script id="canonical-entity-graph" type="application/ld+json">',
    b'<script id="canonical-entity-graph" type="application/json">',
    1,
)
assert legacy != html, "Expected the current active script marker in the homepage"
try:
    require_current_active_head_jsonld(graph_path, legacy)
except AssertionError:
    pass
else:
    raise AssertionError("Current release accepted an inert/legacy canonical graph")

# Test must exceed the actual measured byte budget. A hardcoded 20 KB
# padding can remain below the crawl limit after unrelated metadata shrinks.
# This test adapts to the built file and is therefore not a false negative.
padding_bytes = max(20_000, 2_000_000 - proof["canonicalGraphEndByte"] + 16_001)
oversized = html.replace(
    b'<script id="canonical-entity-graph" type="application/ld+json">',
    b' ' * padding_bytes + b'<script id="canonical-entity-graph" type="application/ld+json">',
    1,
)
assert oversized != html

try:
    require_current_active_head_jsonld(graph_path, oversized)
except AssertionError:
    pass
else:
    raise AssertionError("Current release accepted a graph beyond the strict HTML budget")

print(json.dumps(proof, ensure_ascii=False, indent=2))
