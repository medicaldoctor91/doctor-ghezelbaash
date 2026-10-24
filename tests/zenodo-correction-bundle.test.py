"""Failure cases for same-DOI corrections; no network or platform mutations."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault('ARCHIVE_SOURCE_COMMIT', 'ed767f6e6726e1453196e2ec2b312fcad00677e2')
sys.path.insert(0, str(ROOT / '.github/scripts'))
import zenodo_correction_bundle as bundle

SOURCE = '0f72c5e6ef832adef66d003069e3e3c189cf5079'


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value if isinstance(value, bytes) else value.encode())


def body_script(document):
    return '<script id="schema-core-mainentity" type="application/ld+json">' + json.dumps(document) + '</script>'


def plan():
    return {'sourceCommit': SOURCE, 'originalArchiveSourceCommit': bundle.ORIGINAL_SOURCE,
            'hfRevision': '017269f382c41c5eb27c5cfcebaf7a365368903e',
            'kaggleVersion': 32, 'notebookVersion': 16,
            'technicalCorrectionDate': '2026-10-24', 'doi': bundle.DOI}


def input_fixture(folder):
    original, website, hf = (folder / name for name in ['original', 'website', 'hf'])
    for name in bundle.SCIENTIFIC:
        data = ('Scientific bytes: ' + name).encode()
        write(original / Path(name).name, data)
        write(hf / name, data)
        if name not in bundle.PLATFORM_DERIVED:
            write(website / name, data)
    for base in [website, hf]:
        write(base / 'release-provenance.json', json.dumps({'sourceCommit': SOURCE}))
        write(base / 'doi-policy.json', json.dumps({'currentArchive': {'doi': bundle.DOI}}))
    current = {'@context': 'https://schema.org', '@graph': [{'@type': 'WebSite'}]}
    homepage = '<body><main>Original clinical text.</main>' + body_script(current) + '</body>'
    write(website / 'index.html', homepage)
    write(hf / 'index.html', homepage)
    write(original / 'index.html', '<body><main>Original clinical text.</main>' + body_script({'old': True}) + '</body>')
    for index in range(71):
        document = {'@context': 'https://schema.org', '@graph': [
            {'@type': 'Article' if index < 63 else 'MedicalWebPage'}]}
        write(website / ('page-' + str(index) + '.html'), body_script(document))
    original_queries = [{'query': 'Clinical query ' + str(i), 'source_commit': bundle.ORIGINAL_SOURCE}
                        for i in range(876)]
    queries = [{**row, 'source_commit': SOURCE} for row in original_queries]
    write(original / 'query-matrix.jsonl', ''.join(json.dumps(row) + '\n' for row in original_queries))
    write(hf / 'query-matrix.jsonl', ''.join(json.dumps(row) + '\n' for row in queries))
    packaging = {'sourceCommit': SOURCE, 'tables': {}}
    source_names = {'clinical_passages': 'clinical-passages.jsonl', 'clinical_answers': 'fact-map.json',
                    'entity_facts': 'entity-facts.csv', 'query_matrix': 'query-matrix.jsonl',
                    'market_positioning': 'enrichment/instruction_examples_fa_market_positioning.jsonl'}
    for name, rows in bundle.EXPECTED_TABLES.items():
        file = 'viewer/' + name + '.parquet'
        write(hf / file, 'Synthetic parquet bytes: ' + name)
        packaging['tables'][name] = {'rows': rows, 'file': file, 'source': source_names[name],
            'sha256': bundle.sha(hf / file), 'sourceSha256': bundle.sha(hf / source_names[name])}
    write(hf / 'viewer/packaging.json', json.dumps(packaging))
    index = 0
    while len([p for p in website.rglob('*') if p.is_file()]) < 188:
        write(website / 'assets' / (str(index) + '.bin'), 'Existing website asset ' + str(index))
        index += 1
    return original, website, hf


def original_fixture(folder):
    folder.mkdir()
    entries = {'data-' + str(index).zfill(2) + '.txt': ('Original data ' + str(index)).encode()
               for index in range(41)}
    checksums = ''.join(hashlib.sha256(body).hexdigest() + '  ' + name + '\n'
                        for name, body in sorted(entries.items())).encode()
    entries['checksums.sha256'] = checksums
    for name, body in entries.items():
        write(folder / name, body)
    with zipfile.ZipFile(folder / bundle.BUNDLE, 'w') as archive:
        for name, body in entries.items():
            archive.writestr(name, body)
    record = {'id': 23474664, 'doi': bundle.DOI, 'metadata': {'version': '1.3.4+zenodo.3'}, 'files': []}
    for path in sorted(folder.iterdir()):
        record['files'].append({'key': path.name, 'size': path.stat().st_size,
                                'checksum': 'md5:' + hashlib.md5(path.read_bytes()).hexdigest()})
    return record


class CorrectionBundleTests(unittest.TestCase):
    def test_complete_inputs_accept_only_known_platform_derived_csv_omission(self):
        with tempfile.TemporaryDirectory() as name:
            paths = input_fixture(Path(name))
            inventory = bundle.verify_inputs(*paths, plan())
            self.assertEqual(len(inventory), 188)
            self.assertFalse((paths[1] / next(iter(bundle.PLATFORM_DERIVED))).exists())

    def test_wrong_doi_is_rejected_before_reading_any_payload(self):
        bad = {**plan(), 'doi': '10.5281/zenodo.999'}
        with self.assertRaisesRegex(AssertionError, 'Wrong target DOI'):
            bundle.verify_inputs(Path('/missing'), Path('/missing'), Path('/missing'), bad)

    def test_scientific_graph_change_is_rejected(self):
        with tempfile.TemporaryDirectory() as name:
            paths = input_fixture(Path(name))
            write(paths[2] / 'graph.jsonld', 'Altered scientific graph')
            with self.assertRaisesRegex(AssertionError, 'Scientific HF content changed: graph.jsonld'):
                bundle.verify_inputs(*paths, plan())

    def test_partial_website_is_rejected(self):
        with tempfile.TemporaryDirectory() as name:
            paths = input_fixture(Path(name))
            next((paths[1] / 'assets').iterdir()).unlink()
            with self.assertRaisesRegex(AssertionError, 'Incomplete website snapshot'):
                bundle.verify_inputs(*paths, plan())

    def test_missing_article_is_not_hidden_by_preserved_file_count(self):
        with tempfile.TemporaryDirectory() as name:
            paths = input_fixture(Path(name))
            page = paths[1] / 'page-0.html'
            page.write_text(page.read_text().replace('Article', 'MedicalWebPage'))
            with self.assertRaisesRegex(AssertionError, 'Incomplete authored Article/schema snapshot'):
                bundle.verify_inputs(*paths, plan())

    def test_query_content_change_is_rejected_after_hashes_are_resealed(self):
        with tempfile.TemporaryDirectory() as name:
            paths = input_fixture(Path(name))
            query = paths[2] / 'query-matrix.jsonl'
            text = query.read_text().replace('Clinical query 0', 'Different clinical question', 1)
            query.write_text(text)
            packaging = bundle.load(paths[2] / 'viewer/packaging.json')
            packaging['tables']['query_matrix']['sourceSha256'] = bundle.sha(query)
            bundle.dump(paths[2] / 'viewer/packaging.json', packaging)
            with self.assertRaisesRegex(AssertionError, 'Scientific query content changed'):
                bundle.verify_inputs(*paths, plan())

    def test_missing_parquet_or_mismatched_bytes_is_rejected(self):
        with tempfile.TemporaryDirectory() as name:
            paths = input_fixture(Path(name))
            write(paths[2] / 'viewer/query_matrix.parquet', 'corrupted export')
            with self.assertRaisesRegex(AssertionError, 'Viewer checksum mismatch'):
                bundle.verify_inputs(*paths, plan())

    def test_original_outer_and_zip_checksums_are_required(self):
        with tempfile.TemporaryDirectory() as name:
            folder = Path(name) / 'original'
            record = original_fixture(folder)
            self.assertEqual(len(bundle.verify_original(folder, record)), 43)
            write(folder / 'data-00.txt', 'tampered original')
            with self.assertRaisesRegex(AssertionError, 'Original checksum mismatch'):
                bundle.verify_original(folder, record)

    def test_damaged_inner_zip_is_rejected_even_with_new_outer_md5(self):
        with tempfile.TemporaryDirectory() as name:
            folder = Path(name) / 'original'
            record = original_fixture(folder)
            with zipfile.ZipFile(folder / bundle.BUNDLE) as archive:
                bodies = {key: archive.read(key) for key in archive.namelist()}
            bodies['data-00.txt'] = b'Damaged inside ZIP'
            with zipfile.ZipFile(folder / bundle.BUNDLE, 'w') as archive:
                for key, body in bodies.items():
                    archive.writestr(key, body)
            for item in record['files']:
                if item['key'] == bundle.BUNDLE:
                    item.update(size=(folder / bundle.BUNDLE).stat().st_size,
                                checksum='md5:' + hashlib.md5((folder / bundle.BUNDLE).read_bytes()).hexdigest())
            with self.assertRaisesRegex(AssertionError, 'Original ZIP checksum mismatch'):
                bundle.verify_original(folder, record)

    def test_archive_descriptors_remeasure_downloads_without_self_hashes(self):
        import rdflib
        from rdflib.namespace import DCAT, XSD
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            prefix = bundle.DOI_POLICY['downloadBindings']['publicPrefix']
            write(root / 'index.html', '<main>Corrected website</main>')
            write(root / 'doi-policy.json', json.dumps({'doi': bundle.DOI}))
            spdx = rdflib.Namespace('http://spdx.org/rdf/terms#')
            graph = rdflib.Graph()
            distribution, checksum = rdflib.URIRef('urn:download'), rdflib.BNode('checksum')
            graph.add((distribution, DCAT.downloadURL, rdflib.URIRef(prefix + 'index.html')))
            graph.add((distribution, spdx.checksum, checksum))
            graph.add((checksum, spdx.checksumValue, rdflib.Literal('00' * 32, datatype=XSD.hexBinary)))
            graph.add((distribution, DCAT.byteSize, rdflib.Literal('1', datatype=XSD.decimal)))
            graph.serialize(destination=root / 'dcat.ttl', format='turtle')
            bundle.dump(root / 'datapackage.json', {'resources': [
                {'path': prefix + 'index.html', 'hash': 'old', 'bytes': 1},
                {'path': prefix + 'croissant.json', 'hash': 'self-cycle', 'bytes': 1}]})
            bundle.dump(root / 'croissant.json', {'distribution': [
                {'name': 'index.html', 'contentUrl': prefix + 'index.html', 'sha256': 'old', 'contentSize': '1 B'}]})
            bundle.remeasure_descriptors(root)
            package = bundle.load(root / 'datapackage.json')['resources']
            self.assertEqual(package[0]['hash'], 'sha256:' + bundle.sha(root / 'index.html'))
            self.assertNotIn('hash', package[1])
            self.assertNotIn('bytes', package[1])
            croissant = bundle.load(root / 'croissant.json')['distribution'][0]
            self.assertEqual(croissant['sha256'], bundle.sha(root / 'index.html'))
            self.assertEqual(croissant['contentSize'], str((root / 'index.html').stat().st_size) + ' B')
            measured = rdflib.Graph().parse(root / 'dcat.ttl', format='turtle')
            checksum = measured.value(distribution, spdx.checksum)
            self.assertEqual(str(measured.value(checksum, spdx.checksumValue)), bundle.sha(root / 'index.html'))


if __name__ == '__main__':
    unittest.main()
