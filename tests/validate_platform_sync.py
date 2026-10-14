"""Validate complete machine-readable contracts in staged platform packages.

This validates the real companion files and table reconstructions, rather than
assuming that a successful upload or a working Dataset Viewer makes them valid.
Kaggle's selected payload can use --canonical-root for omitted website files.
"""
import argparse
import csv
import hashlib
import importlib.util
import json
import re
import subprocess
from decimal import Decimal
from email.headerregistry import Address
from pathlib import Path
from urllib.parse import urlparse

import mlcroissant
import pyarrow.parquet as pq
import rdflib
from pyshacl import validate as shacl_validate
from rdflib.compare import isomorphic
from rdflib.namespace import RDF, SH, XSD

from validate_platform_bundle import validate as validate_bundle

REPOSITORY = Path(__file__).resolve().parents[1]
ORIGIN = 'https://www.ghezelbaash.ir'
DATASET = ORIGIN + '/graph.jsonld/dataset'
PERSON = ORIGIN + '/#saeed-ghezelbash'
DCAT = rdflib.Namespace('http://www.w3.org/ns/dcat#')
SPDX = rdflib.Namespace('http://spdx.org/rdf/terms#')
EXPECTED_ROWS = {'clinical_passages': 3248, 'clinical_answers': 125,
                 'entity_facts': 22142, 'query_matrix': 876}
DEFERRED_DCAT = {'/dcat.ttl', '/datapackage.json', '/croissant.json'}
ATTESTED_RESOURCES = {
    'graph.jsonld', 'graph.ttl', 'provenance.jsonld', 'query-matrix.jsonl',
    'fact-map.json', 'croissant.json', 'shapes.ttl', 'doctor.vcf', 'clinic.vcf',
    'dcat.ttl', 'void.ttl', 'datapackage.json',
}


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def measure(path):
    body = Path(path).read_bytes()
    return len(body), hashlib.sha256(body).hexdigest()


def local_path(root, name):
    """Reject descriptor/inventory paths that escape the staged package."""
    root = Path(root).resolve()
    path = (root / name.lstrip('/')).resolve()
    assert path.is_relative_to(root), 'Unsafe package path: ' + name
    return path


def import_bundle_builder():
    spec = importlib.util.spec_from_file_location(
        'platform_bundle', REPOSITORY / '.github/scripts/platform_bundle.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def resources():
    return json.loads(subprocess.check_output([
        'node', '--input-type=module', '-e',
        "import {SOURCE} from './src/canonical/source.mjs';"
        "console.log(JSON.stringify(SOURCE.machineResources));",
    ], cwd=REPOSITORY))


def shape_closure(graph, roots):
    """Include constraint definitions and RDF lists without copying targets."""
    links = {SH[term] for term in (
        'property', 'node', 'not', 'and', 'or', 'xone', 'in',
        'qualifiedValueShape', 'sparql', 'prefixes', 'declare', 'path',
        'alternativePath', 'inversePath', 'zeroOrMorePath', 'oneOrMorePath',
        'zeroOrOnePath', 'ignoredProperties', 'rule', 'condition', 'expression',
        'filterShape', 'nodes', 'js', 'jsLibrary')}
    selected = set(roots)
    queue = list(roots)
    output = rdflib.Graph()
    for subject in queue:
        for triple in graph.triples((subject, None, None)):
            output.add(triple)
            _, predicate, obj = triple
            if isinstance(obj, rdflib.Literal) or obj in selected:
                continue
            definitions = list(graph.triples((obj, None, None)))
            if not definitions:
                continue
            constraint_or_list = any(
                str(p).startswith(str(SH)) or p in {RDF.first, RDF.rest}
                for _, p, _ in definitions)
            if (isinstance(obj, rdflib.BNode) or predicate in links or
                    predicate in {RDF.first, RDF.rest} and constraint_or_list):
                selected.add(obj)
                queue.append(obj)
    return output


def validate_shapes_and_dcat(root, registry, lookup):
    graph = rdflib.Graph().parse(root / 'graph.jsonld', format='json-ld')
    assert isomorphic(graph, rdflib.Graph().parse(root / 'graph.ttl', format='turtle')), \
        'JSON-LD and Turtle changed graph semantics'
    graph_triples = len(graph)
    assert graph_triples == EXPECTED_ROWS['entity_facts'], ('Canonical RDF triple count', graph_triples)
    shapes = rdflib.Graph().parse(root / 'shapes.ttl', format='turtle')
    authored = set(graph.subjects(RDF.type, SH.NodeShape))
    published = set(shapes.subjects(RDF.type, SH.NodeShape))
    assert len(authored) == 38, ('Unexpected authored contract', len(authored))
    assert authored <= published, ('Standalone SHACL omitted authored shapes',
                                   sorted(map(str, authored - published)))
    assert len(published) == 65, ('Incomplete standalone SHACL', len(published))
    assert isomorphic(shape_closure(graph, authored), shape_closure(shapes, authored)), \
        'Standalone SHACL changed or omitted authored constraints'

    dcat = rdflib.Graph().parse(root / 'dcat.ttl', format='turtle')
    measured = 0
    for resource in registry:
        if not resource.get('distributionIri'):
            continue
        subject = rdflib.URIRef(resource['distributionIri'])
        path = resource['path']
        media_type = resource['mediaType'].split(';', 1)[0].strip().lower()
        assert list(dcat.objects(subject, DCAT.mediaType)) == [rdflib.URIRef(
            'https://www.iana.org/assignments/media-types/' + media_type)], path
        assert list(dcat.objects(subject, DCAT.downloadURL)) == [
            rdflib.URIRef(ORIGIN + path)], path
        sizes = list(dcat.objects(subject, DCAT.byteSize))
        checksums = list(dcat.objects(subject, SPDX.checksum))
        if path in DEFERRED_DCAT:
            assert not sizes and not checksums, 'Cyclic catalog checksum: ' + path
            continue
        size, sha = measure(lookup(path))
        assert len(sizes) == 1 and sizes[0].datatype == XSD.decimal, path
        assert Decimal(str(sizes[0])) == size, ('DCAT byte size', path)
        assert len(checksums) == 1, ('DCAT checksum missing', path)
        checksum = checksums[0]
        assert (checksum, RDF.type, SPDX.Checksum) in dcat, path
        assert list(dcat.objects(checksum, SPDX.algorithm)) == [SPDX.checksumAlgorithm_sha256], path
        assert list(dcat.objects(checksum, SPDX.checksumValue)) == [
            rdflib.Literal(sha, datatype=XSD.hexBinary)], ('DCAT checksum', path)
        measured += 1
    assert measured > 0, 'No measured DCAT distributions'
    assert (rdflib.URIRef(ORIGIN + '/DcatDistributionShape'), SH.targetSubjectsOf, DCAT.byteSize) in shapes, \
        'DCAT size validation has no active target'
    assert (rdflib.URIRef(ORIGIN + '/DistributionChecksumShape'), SH.targetObjectsOf, SPDX.checksum) in shapes, \
        'Distribution checksum validation has no active target'
    graph.parse(root / 'provenance.jsonld', format='json-ld')
    graph += dcat
    conforms, _, report = shacl_validate(graph, shacl_graph=shapes, inference='none')
    assert conforms, report
    return {'graph_triples': graph_triples, 'node_shapes': len(published), 'authored_shapes': len(authored),
            'dcat_measured_distributions': measured}


def validate_croissant(root, lookup, registry=None):
    croissant = load(root / 'croissant.json')
    assert croissant['@id'] == DATASET
    registry = resources() if registry is None else registry
    registry_by_path = {item['path']: item for item in registry}
    expected_paths = {item['path'] for item in registry
                      if item['path'] not in {'/index.html', '/croissant.json'}}
    declared_paths = [urlparse(item['contentUrl']).path for item in croissant['distribution']]
    assert len(declared_paths) == len(set(declared_paths)) == len(expected_paths) == 24, \
        'Croissant must declare all 24 distinct companion files'
    assert set(declared_paths) == expected_paths, 'Croissant companion inventory differs from canonical registry'
    mapping = {}
    for item in croissant['distribution']:
        parsed = urlparse(item['contentUrl'])
        assert parsed.scheme == 'https' and parsed.netloc == urlparse(ORIGIN).netloc, item['contentUrl']
        assert item['name'] == item['@id'] == parsed.path.lstrip('/'), item['name']
        assert item['encodingFormat'] == registry_by_path[parsed.path]['mediaType'], item['name']
        path = lookup(parsed.path)
        size, sha = measure(path)
        assert (item['contentSize'], item['sha256']) == (f'{size} B', sha), item['name']
        assert item['name'] not in mapping, 'Duplicate Croissant FileObject name'
        mapping[item['name']] = path
    dataset = mlcroissant.Dataset(jsonld=root / 'croissant.json', mapping=mapping)
    records = list(dataset.records('entity-facts'))
    with (root / 'entity-facts.csv').open(newline='', encoding='utf-8') as stream:
        expected = list(csv.DictReader(stream))
    assert len(records) == len(expected) == EXPECTED_ROWS['entity_facts']
    for actual, row in zip(records, expected):
        for field, value in row.items():
            cell = actual['entity-facts/' + field]
            if isinstance(cell, bytes):
                cell = cell.decode('utf-8')
            if value:
                assert cell == value, ('Croissant source fidelity', row['row_id'], field)
            else:
                assert cell in {None, '', 'None'}, ('Croissant empty field', row['row_id'], field, cell)
    return {'croissant_files': len(mapping), 'croissant_rows_read': len(records)}


def validate_vcards(root):
    graph = load(root / 'graph.jsonld')
    physician = next(node for node in graph['@graph'] if node['@id'] == PERSON)
    emails = physician['email']
    if not isinstance(emails, list):
        emails = [emails]
    for name in ['doctor.vcf', 'clinic.vcf']:
        body = (root / name).read_bytes()
        assert body.endswith(b'\r\n') and b'\n' not in body.replace(b'\r\n', b''), name
        for physical in body.split(b'\r\n'):
            assert len(physical) <= 75, ('vCard line exceeds 75 octets', name)
            physical.decode('utf-8')  # Folding must not split a UTF-8 code point.
        text = re.sub(r'\r\n[ \t]', '', body.decode('utf-8'))
        lines = text.split('\r\n')
        assert lines[0] == 'BEGIN:VCARD' and lines[-2:] == ['END:VCARD', ''], name
        assert lines.count('VERSION:4.0') == 1, name
        names = [line.removeprefix('FN:') for line in lines if line.startswith('FN:')]
        assert len(names) == 1 and names[0].strip(), ('vCard requires one nonempty FN', name)
        expected_uid = PERSON if name == 'doctor.vcf' else \
            ORIGIN + '/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah'
        assert [line.removeprefix('UID:') for line in lines if line.startswith('UID:')] == [expected_uid], \
            ('vCard canonical entity identity', name)
        if name == 'doctor.vcf':
            actual = [line.removeprefix('EMAIL:') for line in lines if line.startswith('EMAIL:')]
            assert actual == [email.removeprefix('mailto:') for email in emails], actual
            for email in actual:
                assert Address(addr_spec=email).addr_spec == email, email
        else:
            assert lines.count('KIND:org') == 1, name
    return {'valid_vcards': 2}


def validate_tables(root, source_commit):
    bundle = import_bundle_builder()
    packaging = load(root / 'viewer/packaging.json')
    assert packaging['sourceCommit'] == source_commit
    assert packaging['canonicalDatasetIri'] == DATASET
    assert set(packaging['tables']) == set(EXPECTED_ROWS)
    results = {}
    for name, spec in packaging['tables'].items():
        table_file = local_path(root, spec['file'])
        source_file = local_path(root, spec['source'])
        assert measure(table_file)[1] == spec['sha256'], ('Parquet hash', name)
        assert measure(source_file)[1] == spec['sourceSha256'], ('Parquet source hash', name)
        table = pq.read_table(table_file)
        assert table.column_names == spec['fields'], ('Parquet fields', name)
        assert spec['sourceFields'] == [field for field in spec['fields'] if field != '_source_omitted_fields'], name
        decoded = [bundle.reconstruct(row, set(spec.get('jsonEncodedFields', [])))
                   for row in table.to_pylist()]
        expected = bundle.rows(root, spec)
        assert len(expected) == len(decoded) == spec['rows'] == EXPECTED_ROWS[name], name
        assert decoded == expected, ('Parquet changed source semantics', name)
        results[name] = len(decoded)
    if (root / 'query-matrix.csv').is_file():
        spec = packaging['tables']['query_matrix']
        with (root / 'query-matrix.csv').open(newline='', encoding='utf-8') as stream:
            csv_rows = [bundle.reconstruct(row, set(spec['jsonEncodedFields']))
                        for row in csv.DictReader(stream)]
        assert csv_rows == bundle.rows(root, spec), 'Kaggle CSV query round trip changed rows'
    return {'parquet_rows': results}


def payload_files(root, exclude):
    return {path.relative_to(root).as_posix() for path in root.rglob('*')
            if path.is_file() and '.git' not in path.parts and
            path.relative_to(root).as_posix() not in exclude}


def validate_inventories(root, platform, source_commit):
    if platform == 'hf':
        inventory = load(root / 'dist-sha256.json')
        assert inventory['algorithm'] == 'sha256'
        assert inventory['sourceCommit'] == source_commit
        assert inventory['canonicalDatasetIri'] == DATASET
        assert set(inventory['files']) == payload_files(root, {'dist-sha256.json'}), \
            'HF package inventory must cover every staged payload file'
        for name, metadata in inventory['files'].items():
            assert measure(local_path(root, name)) == (metadata['bytes'], metadata['sha256']), name
        manifest = load(root / 'integrity-manifest.json')
        assert inventory['websiteIntegrityManifestSha256'] == measure(root / 'integrity-manifest.json')[1]
        for name, metadata in manifest['files'].items():
            assert measure(local_path(root, name)) == (metadata['bytes'], metadata['sha256']), name
        return {'inventory_files': len(inventory['files']), 'website_integrity_files': len(manifest['files'])}
    manifest = load(root / 'kaggle-manifest.json')
    assert manifest['website_source_commit'] == source_commit
    assert manifest['canonical_dataset_iri'] == DATASET
    assert manifest['packaging_revision'] == manifest['desired_kaggle_version']
    assert manifest['tables'] == EXPECTED_ROWS
    names = [item['path'] for item in manifest['original_files']]
    assert len(names) == len(set(names)), 'Kaggle original-files inventory repeats a path'
    for item in manifest['original_files']:
        assert measure(local_path(root, item['path'])) == (item['bytes'], item['sha256']), item['path']
    checksums = {}
    for line in (root / 'checksums.sha256').read_text().splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})  (.+)', line)
        assert match, 'Malformed Kaggle checksum line'
        sha, name = match.groups()
        assert name not in checksums, 'Kaggle checksums repeat a path'
        assert measure(local_path(root, name))[1] == sha, name
        checksums[name] = sha
    controls = {'dataset-metadata.json', 'kernel-metadata.json', 'checksums.sha256'}
    assert set(checksums) == payload_files(root, controls), \
        'Kaggle checksums must cover every downloadable payload file'
    return {'inventory_files': len(checksums), 'original_files': len(names)}


def validate_source_commit(root, platform, source_commit):
    assert re.fullmatch(r'[0-9a-f]{40}', source_commit), 'Expected full canonical source commit'
    provenance = load(root / 'release-provenance.json')
    matrix = load(root / 'current-release-matrix.json')
    migration = load(root / 'viewer/iri-migration.json')
    assert provenance['sourceCommit'] == matrix['websiteSourceCommit'] == migration['currentSourceCommit'] == source_commit
    assert matrix['canonicalDatasetIri'] == DATASET and matrix['canonicalPersonIri'] == PERSON
    for row in [json.loads(line) for line in (root / 'query-matrix.jsonl').read_text().splitlines() if line.strip()]:
        if 'source_commit' in row:
            assert row['source_commit'] == source_commit, 'Stale query source commit'
    assert matrix['sourceVersion'] == '1.3.3' and matrix['edition'] == '2026-10-10'
    attestation = load(root / 'release-attestation.json')
    assert attestation['sourceCommit'] == source_commit
    assert attestation['canonicalDatasetIri'] == DATASET
    assert attestation['version'] == matrix['sourceVersion']
    assert set(attestation['verifiedResources']) == ATTESTED_RESOURCES, \
        'Release attestation must cover the exact maintained resource set'
    for name, sha in attestation['verifiedResources'].items():
        assert measure(local_path(root, name))[1] == sha, ('Release attestation', name)
    assert re.fullmatch(r'\d{4}-\d{2}-\d{2}', attestation['maintenanceDate'])
    assert matrix['publicationMaintenanceDate'] == attestation['maintenanceDate']
    if platform == 'kaggle':
        assert load(root / 'kaggle-manifest.json')['packaging_date'] == attestation['maintenanceDate']
    if (root / 'query-matrix.json-seq').is_file():
        sequence = [json.loads(value) for value in (root / 'query-matrix.json-seq').read_bytes().split(b'\x1e') if value.strip()]
        jsonl = [json.loads(line) for line in (root / 'query-matrix.jsonl').read_text().splitlines() if line.strip()]
        assert sequence == jsonl, 'JSON Text Sequence changed query rows'
    return {'canonical_source_commit': source_commit}


def validate(root, *, platform, source_commit, canonical_root=None):
    root = Path(root).resolve()
    canonical_root = Path(canonical_root).resolve() if canonical_root else None

    def lookup(name):
        local = local_path(root, name)
        if local.is_file():
            return local
        if platform == 'kaggle' and canonical_root:
            fallback = local_path(canonical_root, name)
            assert fallback.is_file(), 'Missing canonical companion: ' + name
            return fallback
        raise AssertionError('Missing package companion: ' + name)

    result = {'platform': platform}
    # Check the missing contract first, so old packages fail on the actual defect.
    registry = resources()
    result.update(validate_shapes_and_dcat(root, registry, lookup))
    result['bundle'] = validate_bundle(root, query=True, reader=platform == 'hf', rdf=True)
    result.update(validate_croissant(root, lookup, registry))
    result.update(validate_vcards(root))
    result.update(validate_tables(root, source_commit))
    result.update(validate_inventories(root, platform, source_commit))
    result.update(validate_source_commit(root, platform, source_commit))
    if platform == 'hf' or (root / 'datapackage.json').is_file():
        package = load(root / 'datapackage.json')
        assert package['id'] == DATASET and package['profile'] == 'data-package'
        registry_by_path = {item['path']: item for item in registry}
        declared = {urlparse(item['path']).path for item in package['resources']}
        assert len(package['resources']) == len(declared), 'Data Package repeats a resource'
        assert declared == {item['path'] for item in registry if item['path'] != '/index.html'}
        for item in package['resources']:
            parsed = urlparse(item['path'])
            assert parsed.scheme == 'https' and parsed.netloc == urlparse(ORIGIN).netloc, item['path']
            path = parsed.path
            assert item['mediatype'] == registry_by_path[path]['mediaType'], path
            if path in {'/datapackage.json', '/croissant.json'}:
                assert 'hash' not in item and 'bytes' not in item, path
                continue
            size, sha = measure(lookup(path))
            assert (item['bytes'], item['hash']) == (size, 'sha256:' + sha), path
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--platform', required=True, choices=['hf', 'kaggle'])
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--canonical-root', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    result = validate(args.root, platform=args.platform, source_commit=args.source_commit,
                      canonical_root=args.canonical_root)
    encoded = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + '\n'
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(encoded, encoding='utf-8')
    print(encoded, end='')
