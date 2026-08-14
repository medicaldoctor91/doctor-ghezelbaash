from pathlib import Path
from hashlib import sha256
import json, subprocess
from rdflib import Graph
root=Path(__file__).resolve().parents[1]
source=root/'src/data/semantic/knowledge-graph.jsonld'; target=root/'src/data/semantic/knowledge-graph.ttl'; lock_path=root/'src/data/semantic/rdf-lock.json'
release=json.loads((root/'src/data/release.json').read_text(encoding='utf-8'))
g=Graph(); g.parse(source,format='json-ld'); raw=g.serialize(format='nt')
p=subprocess.run(['node',str(root/'scripts/canonicalize-rdf.mjs')],input=raw,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
if p.returncode: raise SystemExit('RDFC-1.0 canonicalization failed:\n'+p.stderr)
text=p.stdout if p.stdout.endswith('\n') else p.stdout+'\n'; target.write_text(text,encoding='utf-8')
check=Graph(); check.parse(target,format='nt')
if len(check)!=len(g): raise SystemExit(f'RDF round-trip mismatch: source={len(g)} ttl={len(check)}')
lock={'release':release['release'],'source':'src/data/semantic/knowledge-graph.jsonld','distribution':'src/data/semantic/knowledge-graph.ttl','triples':len(g),'jsonldSha256':sha256(source.read_bytes()).hexdigest(),'ttlSha256':sha256(target.read_bytes()).hexdigest(),'canonicalizedBlankNodes':True,'canonicalizationAlgorithm':'RDFC-1.0','canonicalizationLibrary':'rdf-canonize','canonicalizationLibraryVersion':'5.0.0','canonicalSyntax':'canonical-n-quads-default-graph-as-ntriples-compatible-turtle','generated':release['dateModified']}
lock_path.write_text(json.dumps(lock,indent=2)+'\n',encoding='utf-8'); print(json.dumps(lock,indent=2))
