import json
from pathlib import Path
from rdflib import Graph

src = Path('knowledge-graph/runtime/graph.current.jsonld')
data = json.loads(src.read_text(encoding='utf-8'))
Graph().parse(str(src), format='json-ld')
print(len(data.get('@graph', [])))
