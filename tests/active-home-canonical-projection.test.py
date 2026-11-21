"""Regression checks for the active full canonical graph in the homepage HEAD."""
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".github/scripts"))
from browser_projection import validate_home_html

graph_path = ROOT / "dist/graph.jsonld"
html = (ROOT / "dist/index.html").read_bytes()

proof = validate_home_html(graph_path, html)
assert proof["status"] == "PASS"
assert proof["canonicalGraphStorage"] == "application/ld+json#canonical-entity-graph"
assert proof["nodes"] >= 1900
assert proof["criticalReserveBytes"] > 16_000

# The validator must fail closed if the purported canonical external graph
# differs in even one node from the embedded schema.
graph = json.loads(graph_path.read_text())
modified = json.loads(json.dumps(graph))
modified["@graph"].pop()
with tempfile.TemporaryDirectory() as d:
    wrong = Path(d) / "graph.jsonld"
    wrong.write_text(json.dumps(modified))
    try:
        validate_home_html(wrong, html)
    except AssertionError:
        pass
    else:
        raise AssertionError("Validator accepted a graph with an omitted node")

# A second JSON-LD script makes the visible page semantically ambiguous.
extra = b'<script type="application/ld+json">{"@context":"https://schema.org","@type":"Person"}</script>'
tampered = html.replace(b"</head>", extra + b"</head>", 1)
assert tampered != html
try:
    validate_home_html(graph_path, tampered)
except AssertionError:
    pass
else:
    raise AssertionError("Validator accepted a duplicate JSON-LD script")
print(json.dumps(proof, ensure_ascii=False, indent=2))
