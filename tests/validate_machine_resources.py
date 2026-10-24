"""Validate the built representations with RDF, SHACL and the Croissant reader."""
import csv
import hashlib
import json
import re
import subprocess
import sys
import urllib.request
from email.headerregistry import Address
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

import mlcroissant
import rdflib
from pyshacl import validate as shacl_validate
from rdflib.compare import isomorphic
from rdflib.namespace import RDF, SH, XSD
from pyld import jsonld


class HtmlDocument(HTMLParser):
    def __init__(self, body):
        super().__init__(convert_charrefs=True)
        self.ids, self.references, self.canonicals, self.links, self.scripts = [], [], [], set(), []
        self.h1 = 0
        self.video = self.script = None
        self.feed(body)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        for name in ['aria-labelledby', 'aria-describedby', 'itemref', 'for']:
            self.references.extend(attrs.get(name, '').split())
        if tag == 'h1':
            self.h1 += 1
        if tag == 'a' and attrs.get('href'):
            self.links.add(attrs['href'])
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonicals.append(attrs['href'])
        if tag in {'video', 'audio'}:
            self.video = 0
        if tag == 'track' and 'default' in attrs:
            self.video += 1
            assert self.video <= 1, 'Multiple default media tracks'
        assert not (tag == 'section' and 'footer-machine-resources-supplement' in attrs.get('class', '').split())
        if attrs.get('id') == 'image-saeed-ghezelbash-portrait-master':
            assert 'itemprop' not in attrs and 'itemscope' in attrs
        if attrs.get('id') == 'google-maps-clinic-reputation-current':
            assert '۵ از ۵' in attrs.get('aria-label', ''), 'Rating missing from link accessible name'
        if 'hero-rating-seal__stars' in attrs.get('class', '').split():
            assert attrs.get('aria-hidden') == 'true', 'Decorative stars must not duplicate the rating name'
        if tag == 'script' and attrs.get('type') == 'application/ld+json':
            self.script = ''

    def handle_data(self, value):
        if self.script is not None:
            self.script += value

    def handle_endtag(self, tag):
        if tag in {'video', 'audio'}:
            self.video = None
        if tag == 'script' and self.script is not None:
            self.scripts.append(json.loads(self.script))
            self.script = None


def validate_html(root, origin, graph):
    documents = {}
    context = None
    def document_loader(url, options=None):
        nonlocal context
        assert url.rstrip('/') in {'https://schema.org', 'http://schema.org'}, url
        if context is None:
            with urllib.request.urlopen('https://schema.org/docs/jsonldcontext.json', timeout=30) as response:
                context = json.load(response)
        return {'contextUrl': None, 'documentUrl': url, 'document': context}
    schema = rdflib.Namespace('https://schema.org/')
    selected = {schema[key] for key in ['url', 'sameAs', 'dayOfWeek', 'additionalType', 'procedureType', 'eventAttendanceMode']}
    checked = 0
    for file in root.glob('*.html'):
        if file.name == '404.html':
            continue
        body = file.read_text()
        document = HtmlDocument(body)
        expected = origin + '/' + ('' if file.name == 'index.html' else file.stem)
        assert document.h1 == 1 and document.canonicals == [expected], file.name
        assert len(document.ids) == len(set(document.ids)), ('Duplicate DOM ID', file.name)
        assert set(document.references) <= set(document.ids), ('Broken DOM IDREF', file.name)
        assert '</a>ِ' not in body, ('Detached Persian combining character', file.name)
        for script in document.scripts:
            expanded = jsonld.expand(script, {'base': expected, 'documentLoader': document_loader})
            projection = rdflib.Graph().parse(data=json.dumps(expanded), format='json-ld')
            for subject, predicate, obj in projection:
                # Schema.org's published context expands its vocabulary with
                # http IRIs; the canonical scientific graph uses https IRIs.
                # Match the two published forms of the same vocabulary term.
                if str(predicate).startswith('http://schema.org/'):
                    predicate = rdflib.URIRef('https://schema.org/' + str(predicate)[len('http://schema.org/'):])
                if predicate in selected and (subject, predicate, None) in graph:
                    # Search markup uses Schema.org's ordinary URL-valued
                    # strings. Coercing url/sameAs to @id can make a node's own
                    # public URL a self-reference during consumer expansion.
                    # Preserve the exact authored URL claim while allowing
                    # that browser representation; canonical RDF still has
                    # its independent JSON-LD/Turtle/CSV isomorphism checks.
                    same_url = (
                        isinstance(obj, rdflib.Literal)
                        and obj.language is None
                        and obj.datatype in {None, XSD.string, XSD.anyURI}
                        and str(obj).startswith(('https://', 'http://'))
                        and any(isinstance(expected, rdflib.URIRef) and str(expected) == str(obj)
                                for expected in graph.objects(subject, predicate))
                    )
                    assert (subject, predicate, obj) in graph or same_url, ('Browser RDF term drift', file.name, subject, predicate, obj)
                    checked += 1
        documents[file.stem] = document
    license_page = documents['media-license']
    images = set(graph.subjects(schema.acquireLicensePage, rdflib.URIRef(origin + '/media-license')))
    assert len(images) == 5
    assert {str(url) for image in images for url in graph.objects(image, schema.contentUrl)} <= license_page.links
    assert checked > 0
    return {'html_documents': len(documents), 'browser_rdf_terms_checked': checked, 'license_images': len(images)}


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
    html_result = validate_html(root, origin, graph)
    shapes = rdflib.Graph().parse(root / 'shapes.ttl', format='turtle')
    authored = set(graph.subjects(RDF.type, SH.NodeShape))
    published = set(shapes.subjects(RDF.type, SH.NodeShape))
    assert authored <= published, 'Standalone SHACL omitted authored shapes'
    assert len(published) == 67, len(published)

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
    schema = rdflib.Namespace('https://schema.org/')
    dataset_id = rdflib.URIRef(origin + '/graph.jsonld/dataset')
    assert set(graph.objects(dataset_id, schema.url)) == {rdflib.URIRef(origin + '/')}, 'Dataset URL must be one canonical IRI'
    assert set(graph.objects(dataset_id, schema.license)) == {rdflib.URIRef('https://creativecommons.org/licenses/by/4.0/')}, 'Dataset license term drift'
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
    assert not dataset.metadata.ctx.issues.errors and not dataset.metadata.ctx.issues.warnings
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
    return {**html_result, 'node_shapes': len(published), 'dcat_measured_distributions': measured,
            'data_package_hashes': package_hashes, 'croissant_rows_read': len(records),
            'integrity_files': len(manifest['files']), 'catalog_route': 200}


if __name__ == '__main__':
    print(json.dumps(validate(sys.argv[1]), sort_keys=True))
