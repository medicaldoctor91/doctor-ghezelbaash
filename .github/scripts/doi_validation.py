"""Role-aware validation and occurrence inventory for current DOI outputs."""
import csv
import hashlib
import json
import re
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POLICY = json.loads((ROOT / 'src/canonical/doi-policy.json').read_text())
PATTERN = re.compile(r'10\.5281/zenodo\.\d+')


def validate_policy(root, *, archive=False):
    root = Path(root)
    concept = POLICY['concept']['doi']
    exact = POLICY['currentArchive']['doi']
    history = {item['doi'] for item in POLICY['historical']}
    allowed = history | {concept, exact}
    inventory = []

    def walk(value, path, file):
        if isinstance(value, dict):
            for key in ['archive_version_doi', 'zenodo_version_doi']:
                if key in value:
                    assert value[key] == exact, (file, path + '/' + key, 'historical DOI used as current')
            if 'currentArchive' in value:
                assert value['currentArchive']['doi'] == exact, (file, path, 'stale currentArchive')
            if 'zenodo_concept_doi' in value:
                assert value['zenodo_concept_doi'] == concept, (file, path, 'incorrect concept DOI')
            for key, child in value.items():
                walk(child, path + '/' + key, file)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                walk(child, path + '/' + str(index), file)
        elif isinstance(value, str):
            for match in PATTERN.finditer(value):
                doi = match.group()
                assert doi in allowed, (file, path, 'DOI missing from central role registry', doi)
                role = 'general' if doi == concept else 'current_exact' if doi == exact else 'historical'
                inventory.append({'file': file, 'pointer': path, 'doi': doi, 'role': role})

    eligible = {'graph.jsonld', 'graph.ttl', 'entity-facts.csv', 'index.html', 'index.md', 'llms.txt', 'llms-full.txt',
                'dcat.ttl', 'void.ttl', 'croissant.json', 'datapackage.json', 'frictionless-datapackage.json',
                'entity-facts.csv-metadata.json', 'linkset.json', 'doi-policy.json', 'README.md', 'CITATION.cff',
                'starter.ipynb', 'current-release-matrix.json', 'release-attestation.json', 'release-provenance.json'}
    suffixes = {'.json', '.jsonld', '.jsonl', '.json-seq', '.ttl', '.csv', '.md', '.txt', '.xml', '.html', '.cff', '.ipynb'}
    for file in sorted(root.rglob('*')):
        if not file.is_file() or file.suffix not in suffixes:
            continue
        relative = file.relative_to(root).as_posix()
        if relative.startswith('upstream/'):
            inventory.append({'file': relative, 'role': 'historical_upstream_receipt', 'preserved': True})
            continue
        text = file.read_text()
        assert '{{doi.' not in text, (relative, 'unrendered DOI policy template')
        if relative in eligible:
            assert concept in text, (relative, 'missing public Concept DOI')
        if file.suffix in {'.json', '.jsonld', '.ipynb'}:
            walk(json.loads(text), '', relative)
        elif file.suffix in {'.jsonl', '.json-seq'}:
            for index, line in enumerate(text.replace('\x1e', '').splitlines()):
                if line.strip():walk(json.loads(line), '/' + str(index), relative)
        else:
            for match in PATTERN.finditer(text):
                doi = match.group()
                assert doi in allowed, (relative, 'unknown DOI', doi)
                inventory.append({'file': relative, 'offset': match.start(), 'doi': doi,
                                  'role': 'general' if doi == concept else 'current_exact' if doi == exact else 'historical'})
            if file.suffix in {'.md', '.txt', '.cff'}:
                for line in text.splitlines():
                    if re.match(r'(?i)^(public collection|zenodo collection|latest DOI|current DOI|current archive DOI)', line):
                        assert not (set(PATTERN.findall(line)) & history), (relative, 'historical DOI introduced as general/current')
    graph = json.loads((root / 'graph.jsonld').read_text())
    nodes = {node['@id']: node for node in graph['@graph']}
    concept_url, exact_url = POLICY['concept']['url'], POLICY['currentArchive']['url']
    assert nodes[concept_url]['dcat:hasCurrentVersion']['@id'] == exact_url
    assert nodes[exact_url]['dcterms:isVersionOf']['@id'] == concept_url
    assert nodes[exact_url]['version'] == POLICY['currentArchive']['packagingVersion']
    for entity in [POLICY['canonicalDatasetIri'], 'https://www.ghezelbaash.ir/#saeed-ghezelbash', 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah']:
        assert 'doi.org/10.5281/zenodo.' not in json.dumps(nodes[entity].get('sameAs', [])), ('DOI identity conflation', entity)
    return {'status': 'PASS', 'conceptDOI': concept, 'currentExactDOI': exact, 'occurrences': inventory,
            'archiveBindingMode': archive}


def validate_archive(root, *, online=False):
    import mlcroissant
    import pyarrow.parquet as pq
    import rdflib
    from rdflib.compare import isomorphic
    from pyshacl import validate
    from rdflib.namespace import RDF, XSD

    root = Path(root)
    g = rdflib.Graph().parse(root / 'graph.jsonld', format='json-ld')
    ttl = rdflib.Graph().parse(root / 'graph.ttl', format='turtle')
    assert isomorphic(g, ttl), 'JSON-LD and Turtle differ'
    with (root / 'entity-facts.csv').open(newline='') as stream:
        facts = list(csv.DictReader(stream))
    csv_graph = rdflib.Graph()
    def identifier(value):
        return rdflib.BNode(value[2:]) if value.startswith('_:') else rdflib.URIRef(value)
    for row in facts:
        obj = identifier(row['object']) if row['object_kind'] != 'literal' else rdflib.Literal(row['object'], lang=row['language'] or None, datatype=rdflib.URIRef(row['datatype']) if row['datatype'] and not row['language'] else None)
        csv_graph.add((identifier(row['subject']), rdflib.URIRef(row['predicate']), obj))
    assert isomorphic(g, csv_graph), 'CSV and JSON-LD differ'
    if (root / 'index.html').exists():
        from html.parser import HTMLParser
        class Inline(HTMLParser):
            def __init__(self):super().__init__();self.capture=False;self.text=[];self.blocks=[]
            def handle_starttag(self, tag, attrs):
                if tag == 'script' and dict(attrs).get('type') == 'application/ld+json':self.capture=True;self.text=[]
            def handle_data(self, text):
                if self.capture:self.text.append(text)
            def handle_endtag(self, tag):
                if tag == 'script' and self.capture:self.blocks.append(json.loads(''.join(self.text)));self.capture=False
        inline=Inline();inline.feed((root/'index.html').read_text())
        assert any(isomorphic(g,rdflib.Graph().parse(data=json.dumps(block),format='json-ld')) for block in inline.blocks), 'Inline JSON-LD differs from graph.jsonld'
    triples = len(g)
    g.parse(root / 'provenance.jsonld', format='json-ld')
    conforms, results, text = validate(g, shacl_graph=rdflib.Graph().parse(root / 'shapes.ttl', format='turtle'), inference='none')
    assert conforms, text
    prefix = POLICY['downloadBindings']['publicPrefix']
    croissant = json.loads((root / 'croissant.json').read_text())
    mapping = {}
    for file in croissant['distribution']:
        assert file['contentUrl'].startswith(prefix), file['contentUrl']
        local = root / file['name']
        assert local.is_file(), file['name']
        assert hashlib.sha256(local.read_bytes()).hexdigest() == file['sha256']
        assert file['contentSize'] == str(local.stat().st_size) + ' B'
        mapping[file['name']] = local
    urls = {item['contentUrl']: root/item['name'] for item in croissant['distribution']}
    package=json.loads((root/'datapackage.json').read_text())
    for resource in package['resources']:
        assert resource['path'].startswith(prefix), resource['path']
        if resource.get('hash'):
            local=urls[resource['path']]
            assert resource['hash']=='sha256:'+hashlib.sha256(local.read_bytes()).hexdigest()
            assert resource['bytes']==local.stat().st_size
    csvw=json.loads((root/'entity-facts.csv-metadata.json').read_text())
    assert csvw['url']==prefix+'entity-facts.csv'
    catalog=rdflib.Graph().parse(root/'dcat.ttl',format='turtle')
    dcat=rdflib.Namespace('http://www.w3.org/ns/dcat#');spdx=rdflib.Namespace('http://spdx.org/rdf/terms#')
    for subject,url in catalog.subject_objects(dcat.downloadURL):
        assert str(url).startswith(prefix), url
        local=urls.get(str(url))
        if local:
            for checksum in catalog.objects(subject,spdx.checksum):
                assert str(catalog.value(checksum,spdx.checksumValue)).lower()==hashlib.sha256(local.read_bytes()).hexdigest()
            size=catalog.value(subject,dcat.byteSize)
            if size is not None:assert Decimal(str(size))==local.stat().st_size
    dataset = mlcroissant.Dataset(jsonld=root / 'croissant.json', **({} if online else {'mapping': mapping}))
    records = list(dataset.records('entity-facts'))
    assert not dataset.metadata.ctx.issues.errors and not dataset.metadata.ctx.issues.warnings, str(dataset.metadata.ctx.issues)
    assert len(records) == len(facts)
    for actual, expected in zip(records, facts):
        for field, value in expected.items():
            cell = actual['entity-facts/' + field]
            if isinstance(cell, bytes):cell = cell.decode()
            assert cell == value or (not value and cell in {None, '', 'None'}), (field, value, cell)
    packaging = json.loads((root / 'viewer/packaging.json').read_text())
    table_counts = {}
    for name, spec in packaging['tables'].items():
        source = root / spec['source']
        if name == 'clinical_answers':expected = json.loads(source.read_text())['records']
        elif source.suffix == '.csv':
            with source.open(newline='') as stream:expected = list(csv.DictReader(stream))
        else:expected = [json.loads(line) for line in source.read_text().splitlines() if line.strip()]
        decoded = []
        for row in pq.read_table(root / spec['file']).to_pylist():
            omitted = set(json.loads(row.get('_source_omitted_fields') or '[]'))
            decoded.append({key: json.loads(value) if key in spec['jsonEncodedFields'] and value is not None else value
                            for key, value in row.items() if key not in omitted and key != '_source_omitted_fields'})
        assert decoded == expected and len(decoded) == spec['rows'], name
        assert hashlib.sha256(source.read_bytes()).hexdigest() == spec['sourceSha256'], name
        assert hashlib.sha256((root / spec['file']).read_bytes()).hexdigest() == spec['sha256'], name
        table_counts[name] = len(decoded)
    validate_policy(root, archive=True)
    return {'status': 'PASS', 'rdfTriples': triples, 'rdfTurtleCsvIsomorphic': True, 'SHACLConforms': bool(conforms),
            'croissantRows': len(records), 'croissantDistributionFiles': len(mapping), 'croissantOnlineURLExtraction': online,
            'fiveParquetExactRoundtrips': table_counts}
