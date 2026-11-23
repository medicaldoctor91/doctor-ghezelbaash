"""Fail-closed regression: the complete canonical RDF is active in HEAD, before text."""
import json
import sys
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.github/scripts'))
from browser_projection import require_current_full_semantic_jsonld

graph_path=ROOT/'dist/graph.jsonld'
html=(ROOT/'dist/index.html').read_bytes()
proof=require_current_full_semantic_jsonld(graph_path,html)
assert proof['status']=='PASS' and proof['nodes']==1916
assert proof['canonicalGraphStorage']=='application/ld+json#canonical-entity-graph'
assert proof['criticalReserveBytes']>0

original=json.loads(graph_path.read_text())
modified=json.loads(json.dumps(original))
modified['@graph'].pop()
with tempfile.TemporaryDirectory() as tmp:
    wrong=Path(tmp)/'graph.jsonld'
    wrong.write_text(json.dumps(modified))
    try:
        require_current_full_semantic_jsonld(wrong,html)
    except AssertionError:
        pass
    else:
        raise AssertionError('Validator accepted omitted canonical RDF entity')

extra=b'<script type="application/ld+json">{"@context":"https://schema.org","@type":"Person"}</script>'
try:
    require_current_full_semantic_jsonld(graph_path,html.replace(b'</head>',extra+b'</head>',1))
except AssertionError:
    pass
else:
    raise AssertionError('Validator accepted duplicate active JSON-LD scripts')

inert=html.replace(b'<script id="canonical-entity-graph" type="application/ld+json">',
                   b'<script id="canonical-entity-graph" type="application/json">',1)
assert inert!=html
try:
    require_current_full_semantic_jsonld(graph_path,inert)
except AssertionError:
    pass
else:
    raise AssertionError('Validator accepted RDF moved outside active JSON-LD')

print(json.dumps(proof))
