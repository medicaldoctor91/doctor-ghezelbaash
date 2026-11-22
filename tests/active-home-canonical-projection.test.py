"""Fail-closed checks for Google's bounded homepage schema and lossless canonical RDF payload."""
import json
import re
from html.parser import HTMLParser
from pathlib import Path

root = Path(__file__).resolve().parents[1]
html = (root / "dist/index.html").read_bytes()
graph = json.loads((root / "dist/graph.jsonld").read_text())


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.items = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag != "script":
            return
        a = dict(attrs)
        self.current = {"id": a.get("id"), "type": a.get("type"), "content": ""}

    def handle_data(self, data):
        if self.current is not None:
            self.current["content"] += data

    def handle_endtag(self, tag):
        if tag == "script" and self.current is not None:
            self.items.append(self.current)
            self.current = None


def verify(payload, canonical):
    parser = Scripts()
    parser.feed(payload.decode("utf8"))
    schemas = [i for i in parser.items if i["type"] == "application/ld+json"]
    assert len(schemas) == 1 and schemas[0]["id"] == "schema-core-mainentity"
    document = json.loads(schemas[0]["content"])
    assert document["@context"] == "https://schema.org"
    homepage = next(n for n in document["@graph"] if n["@id"] == "https://www.ghezelbaash.ir/webpage")
    physician = "https://www.ghezelbaash.ir/#saeed-ghezelbash"
    assert homepage["mainEntity"]["@id"] == physician
    assert any(n["@id"] == physician for n in document["@graph"])
    full = [i for i in parser.items if i["id"] == "canonical-entity-graph"]
    assert len(full) == 1 and full[0]["type"] == "application/json"
    assert json.loads(full[0]["content"]) == canonical
    assert len(canonical["@graph"]) >= 1900
    assert payload.index(b"<main") < 1_900_000
    assert re.search(rb"<h1\\b", payload).start() < 1_900_000
    assert payload.index(b'<script id="canonical-entity-graph"') > payload.index(b"<h1")
    return {"status": "PASS", "nodes": len(canonical["@graph"]), "mainByte": payload.index(b"<main")}


proof = verify(html, graph)

# Tampering with the canonical RDF graph must fail.
modified = json.loads(json.dumps(graph))
modified["@graph"].pop()
try:
    verify(html, modified)
except AssertionError:
    pass
else:
    raise AssertionError("An omitted canonical node escaped the guard")

# Rich Results ambiguity must fail.
extra = b'<script type="application/ld+json">{"@context":"https://schema.org","@type":"Person"}</script>'
try:
    verify(html.replace(b"</head>", extra + b"</head>", 1), graph)
except AssertionError:
    pass
else:
    raise AssertionError("Duplicate JSON-LD script escaped the guard")

# A giant RDF script must not move the physician H1 beyond the crawler budget.
oversized = html.replace(b"<main", b" " * 2_000_000 + b"<main", 1)
try:
    verify(oversized, graph)
except AssertionError:
    pass
else:
    raise AssertionError("Googlebot main-content truncation escaped the guard")

print(json.dumps(proof, ensure_ascii=False))
