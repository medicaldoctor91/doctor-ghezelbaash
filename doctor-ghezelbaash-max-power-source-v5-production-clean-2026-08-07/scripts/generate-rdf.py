from pathlib import Path
from hashlib import sha256
import json
from rdflib import Graph
from rdflib.compare import to_canonical_graph

root=Path(__file__).resolve().parents[1]
source=root/'src/data/semantic/knowledge-graph.jsonld'
target=root/'src/data/semantic/knowledge-graph.ttl'
lock_path=root/'src/data/semantic/rdf-lock.json'

g=Graph(); g.parse(source,format='json-ld')
cg=to_canonical_graph(g)
# Canonicalize blank-node identities before Turtle serialization. The lock then makes exact bytes release-verifiable.
text=cg.serialize(format='turtle')
if not text.endswith('\n'): text+='\n'
target.write_text(text,encoding='utf-8')
# Parse the emitted distribution again; a broken serializer/output must never ship.
check=Graph(); check.parse(target,format='turtle')
if len(check)!=len(g): raise SystemExit(f'RDF round-trip mismatch: source={len(g)} ttl={len(check)}')
lock={
  'release': json.loads((root/'src/data/release.json').read_text())['release'],
  'source':'src/data/semantic/knowledge-graph.jsonld',
  'distribution':'src/data/semantic/knowledge-graph.ttl',
  'triples':len(g),
  'jsonldSha256':sha256(source.read_bytes()).hexdigest(),
  'ttlSha256':sha256(target.read_bytes()).hexdigest(),
  'canonicalizedBlankNodes':True,
  'generated':'2026-08-07'
}
lock_path.write_text(json.dumps(lock,indent=2)+'\n',encoding='utf-8')
print(json.dumps(lock,indent=2))
