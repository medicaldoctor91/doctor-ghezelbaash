"""Validate the built representations with RDF, SHACL and the Croissant reader."""
import csv
import hashlib
import json
import re
import subprocess
import sys
from email.headerregistry import Address
from pathlib import Path
from urllib.parse import urlparse

import mlcroissant
import rdflib
from pyshacl import validate as shacl_validate
from rdflib.compare import isomorphic
from rdflib.namespace import RDF, SH, XSD


def validate(root):
    root = Path(root).resolve()
    repository = Path(__file__).resolve().parents[1]
    source = json.loads(subprocess.check_output([
        'node', '--input-type=module', '-e',
        "import {SOURCE} from './src/canonical/source.mjs';"
        "console.log(JSON.stringify({origin:SOURCE.canonicalOrigin,resources:SOURCE.machineResources}));",
    ], cwd=repository))
    resources = source['resources']
    origin = source['origin']

    def local_file(url):
        assert url.startswith(origin + '/'), url
        return root / urlparse(url).path.lstrip('/')

    def measure(file):
        body = file.read_bytes()
        return len(body), hashlib.sha256(body).hexdigest()

    graph = rdflib.Graph().parse(root / 'graph.jsonld', format='json-ld')
    assert isomorphic(graph, rdflib.Graph().parse(root / 'graph.ttl', format='turtle'))
    shapes = rdflib.Graph().parse(root / 'shapes.ttl', format='turtle')
    authored = set(graph.subjects(RDF.type, SH.NodeShape))
    published = set(shapes.subjects(RDF.type, SH.NodeShape))
    assert authored <= published, 'Standalone SHACL omitted authored shapes'
    assert len(published) == 65, len(published)

    dcat = rdflib.Graph().parse(root / 'dcat.ttl', format='turtle')
    DCAT = rdflib.Namespace('http://www.w3.org/ns/dcat#')
    SPDX = rdflib.Namespace('http://spdx.org/rdf/terms#')
    deferred = {'/dcat.ttl', '/datapackage.json', '/croissant.json'}
    measured = 0
    for resource in resources:
        path = resource['path']
        assert (root / path.lstrip('/')).is_file(), path
        if not resource.get('distributionIri'):
            continue
        subject = rdflib.URIRef(resource['distributionIri'])
        media = list(dcat.objects(subject, DCAT.mediaType))
        assert media == [rdflib.URIRef('https://www.iana.org/assignments/media-types/' + resource['mediaType'])], path
        sizes = list(dcat.objects(subject, DCAT.byteSize))
        checksums = list(dcat.objects(subject, SPDX.checksum))
        if path in deferred:
            assert not sizes and not checksums, 'Cyclic or stale catalog checksum: ' + path
            continue
        size, sha = measure(root / path.lstrip('/'))
        assert len(sizes) == 1 and sizes[0].datatype == XSD.decimal and int(sizes[0]) == size, path
        assert len(checksums) == 1, path
        checksum = checksums[0]
        assert list(dcat.objects(checksum, SPDX.algorithm)) == [SPDX.checksumAlgorithm_sha256], path
        assert list(dcat.objects(checksum, SPDX.checksumValue)) == [rdflib.Literal(sha, datatype=XSD.hexBinary)], path
        measured += 1
    assert measured > 0
    graph.parse(root / 'provenance.jsonld', format='json-ld')
    graph += dcat
    graph.parse(root / 'void.ttl', format='turtle')
    # Validate the full canonical RDF union, including Croissant's shared Dataset IRI.
    graph.parse(root / 'croissant.json', format='json-ld')
    # Shared Dataset URL must be one RDF IRI, not an IRI plus an xsd:anyURI literal.
    dataset_iri = rdflib.URIRef(origin + '/graph.jsonld/dataset')
    url_iri = rdflib.URIRef('https://schema.org/url')
    assert set(graph.objects(dataset_iri, url_iri)) == {rdflib.URIRef(origin + '/')}, 'Inconsistent Dataset URL RDF terms'
    conforms, _, report = shacl_validate(graph, shacl_graph=shapes, inference='none', advanced=True)
    assert conforms, report

    package = json.loads((root / 'datapackage.json').read_text())
    assert {urlparse(r['path']).path for r in package['resources']} == {r['path'] for r in resources if r['path'] != '/index.html'}
    package_hashes = 0
    for resource in package['resources']:
        path = urlparse(resource['path']).path
        if path in {'/datapackage.json', '/croissant.json'}:
            assert 'hash' not in resource and 'bytes' not in resource
            continue
        size, sha = measure(local_file(resource['path']))
        assert (resource['bytes'], resource['hash']) == (size, 'sha256:' + sha), path
        package_hashes += 1

    croissant = json.loads((root / 'croissant.json').read_text())
    mapping = {}
    for file in croissant['distribution']:
        local = local_file(file['contentUrl'])
        size, sha = measure(local)
        assert (file['contentSize'], file['sha256']) == (f'{size} B', sha), file['name']
        mapping[file['name']] = local
    dataset = mlcroissant.Dataset(jsonld=root / 'croissant.json', mapping=mapping)
    records = list(dataset.records('entity-facts'))
    with (root / 'entity-facts.csv').open(newline='') as stream:
        expected = list(csv.DictReader(stream))
    # The official reader exposes sc:Text as UTF-8 bytes in this release.
    def text_cell(value):
        return value.decode('utf-8') if isinstance(value, bytes) else value
    assert len(records) == len(expected)
    for actual, row in zip(records, expected):
        for field, value in row.items():
            cell = text_cell(actual['entity-facts/' + field])
            if value:
                assert cell == value, (row['row_id'], field)
            else:
                assert cell in {None, '', 'None'}, (row['row_id'], field, cell)

    physician = json.loads((root / 'graph.jsonld').read_text())['@graph']
    physician = next(node for node in physician if node['@id'] == origin + '/#saeed-ghezelbash')
    emails = physician['email'] if isinstance(physician['email'], list) else [physician['email']]
    for filename in ['doctor.vcf', 'clinic.vcf']:
        body = (root / filename).read_bytes()
        assert body.endswith(b'\r\n') and b'\n' not in body.replace(b'\r\n', b'')
        assert all(len(line) <= 75 for line in body.split(b'\r\n')), filename
        text = re.sub(r'\r\n[ \t]', '', body.decode('utf-8'))
        if filename == 'doctor.vcf':
            actual = re.findall(r'^EMAIL:(.*)\r$', text, flags=re.MULTILINE)
            assert actual == [email.removeprefix('mailto:') for email in emails], actual
            for email in actual:
                assert Address(addr_spec=email).addr_spec == email
        else:
            assert '\r\nKIND:org\r\n' in text

    assert '/data-catalog /graph.jsonld 200' in (root / '_redirects').read_text().splitlines()
    manifest = json.loads((root / 'integrity-manifest.json').read_text())
    for path, metadata in manifest['files'].items():
        assert (metadata['bytes'], metadata['sha256']) == measure(root / path.lstrip('/')), path
    return {'node_shapes': len(published), 'dcat_measured_distributions': measured,
            'data_package_hashes': package_hashes, 'croissant_rows_read': len(records),
            'integrity_files': len(manifest['files']), 'catalog_route': 200}


if __name__ == '__main__':
    print(json.dumps(validate(sys.argv[1]), sort_keys=True))
