"""Acceptance checks on real published files, not mocked API responses."""
import csv, hashlib, json, re, sys
from pathlib import Path

def definitions(value):
    out=set()
    def visit(x):
        if isinstance(x,dict):
            if x.get('@id') and len(x)>1:out.add(x['@id'])
            for v in x.values():visit(v)
        elif isinstance(x,list):
            for v in x:visit(v)
    visit(value);return out

def validate(root, *, query=True, reader=True, rdf=False):
    root=Path(root);graph=json.loads((root/'graph.jsonld').read_text());ids=definitions(graph)
    assert 'https://www.ghezelbaash.ir/#saeed-ghezelbash' in ids
    assert 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah' in ids
    assert 'https://www.ghezelbaash.ir/graph.jsonld/dataset' in ids
    assert not any('A5064828898' in p.read_text(errors='ignore') for p in root.rglob('*') if p.is_file() and p.suffix in {'.json','.jsonld','.jsonl','.ttl','.csv','.html','.md','.txt'})
    assert 'A5146521397' in json.dumps(graph)
    if reader:
        html=(root/'index.html').read_text()
        assets=set(re.findall(r'(?:/)?assets/guide(?:-meta)?\.[a-z0-9]+\.json',html))
        assets|={k.lstrip('/') for k in json.loads((root/'integrity-manifest.json').read_text())['files'] if re.match(r'/assets/guide(?:-meta)?\.',k)}
        assert assets
        missing=[p for p in assets if not (root/p.lstrip('/')).is_file()]
        assert not missing, 'Missing reader files: '+repr(sorted(missing))
        for p in assets:json.loads((root/p.lstrip('/')).read_text())
    if query:
        provenance=json.loads((root/'provenance.jsonld').read_text());allids=ids|definitions(provenance)
        answers=json.loads((root/'fact-map.json').read_text());answerids={r['answerId'] for r in answers['records']}
        lines=[json.loads(s) for s in (root/'query-matrix.jsonl').read_text().splitlines() if s.strip()]
        assert len(lines)==876
        for row in lines:
            assert row['dataset_iri'] in ids, row['dataset_iri']
            for k in ['stable_evidence_refs','service_ids']:
                assert set(row.get(k,[]))<=ids,(k,sorted(set(row.get(k,[]))-ids))
            if row.get('answer_id'):assert row['answer_id'] in answerids and row['answer_id'] in ids,row['answer_id']
            if row.get('passage_id'):assert row['passage_id'] in allids,row['passage_id']
    if rdf:
        import rdflib
        from rdflib.compare import isomorphic
        from pyshacl import validate as shacl_validate
        g=rdflib.Graph().parse(root/'graph.jsonld',format='json-ld')
        ttl=rdflib.Graph().parse(root/'graph.ttl',format='turtle')
        assert isomorphic(g,ttl)
        g.parse(root/'provenance.jsonld',format='json-ld')
        shapes=rdflib.Graph().parse(root/'shapes.ttl',format='turtle')
        conforms,_,report=shacl_validate(g,shacl_graph=shapes,inference='none')
        assert conforms,report
    if (root/'starter.ipynb').is_file():
        # Execute the actual published user flow, including CSV/Parquet round trips.
        import os
        notebook=json.loads((root/'starter.ipynb').read_text());namespace={}
        previous=Path.cwd()
        try:
            os.chdir(root.resolve())
            for index,cell in enumerate(notebook['cells']):
                if cell['cell_type']=='code':
                    exec(compile(''.join(cell['source']),f'starter.ipynb:cell{index}','exec'),namespace)
        finally:os.chdir(previous)
    return {'graph_nodes':len(graph['@graph']),'reader':reader,'query':query,'rdf_union':rdf}

if __name__=='__main__':print(json.dumps(validate(sys.argv[1],query='--no-query' not in sys.argv,reader='--no-reader' not in sys.argv,rdf='--rdf' in sys.argv)))
