from pathlib import Path
from hashlib import sha256
from importlib.metadata import version as package_version
import json

from pyld import jsonld
from rdflib import Graph

root = Path(__file__).resolve().parents[1]
source = root / 'src/data/semantic/knowledge-graph.jsonld'
target = root / 'src/data/semantic/knowledge-graph.ttl'
lock_path = root / 'src/data/semantic/rdf-lock.json'
release = json.loads((root / 'src/data/release.json').read_text(encoding='utf-8'))

g = Graph()
g.parse(source, format='json-ld')

# Serialize the RDF graph to an arbitrary blank-node-labelled N-Triples stream,
# then apply a dataset canonicalization algorithm that deterministically assigns
# blank-node identifiers.  Sorting canonical lines is an additional stable byte
# ordering guard.  Because this project uses the default graph only, canonical
# N-Quads output is also valid N-Triples and therefore valid Turtle syntax.
raw_ntriples = g.serialize(format='nt')
canonical_nquads = jsonld.normalize(
    raw_ntriples,
    {
        'algorithm': 'URDNA2015',
        'inputFormat': 'application/n-quads',
        'format': 'application/n-quads',
    },
)
lines = sorted(line for line in canonical_nquads.splitlines() if line.strip())
text = '\n'.join(lines) + '\n'
target.write_text(text, encoding='utf-8')

# Parse the emitted distribution again.  A broken canonicalizer/output or an
# accidental named-graph introduction must never ship as the .ttl distribution.
check = Graph()
check.parse(target, format='nt')
if len(check) != len(g):
    raise SystemExit(f'RDF round-trip mismatch: source={len(g)} ttl={len(check)}')

lock = {
    'release': release['release'],
    'source': 'src/data/semantic/knowledge-graph.jsonld',
    'distribution': 'src/data/semantic/knowledge-graph.ttl',
    'triples': len(g),
    'jsonldSha256': sha256(source.read_bytes()).hexdigest(),
    'ttlSha256': sha256(target.read_bytes()).hexdigest(),
    'canonicalizedBlankNodes': True,
    'canonicalizationAlgorithm': 'URDNA2015',
    'canonicalizationLibrary': 'PyLD',
    'canonicalizationLibraryVersion': package_version('PyLD'),
    'canonicalSyntax': 'canonical-default-graph-nquads-as-ntriples-compatible-turtle',
    'generated': release['dateModified'],
}
lock_path.write_text(json.dumps(lock, indent=2) + '\n', encoding='utf-8')
print(json.dumps(lock, indent=2))
