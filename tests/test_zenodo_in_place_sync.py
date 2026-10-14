import hashlib
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path('.github/scripts/zenodo_in_place_sync.py')


def load_module(testcase):
    testcase.assertTrue(SCRIPT.is_file(), 'Zenodo in-place sync implementation is missing')
    spec = importlib.util.spec_from_file_location('zenodo_in_place_sync', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ZenodoInPlaceSyncTests(unittest.TestCase):
    def test_record_snapshot_guards_doi_version_and_file_keys(self):
        module = load_module(self)
        record = {
            'id': 22838416,
            'doi': '10.5281/zenodo.22838416',
            'metadata': {'version': '1.3.3'},
            'files': [{'key': 'graph.jsonld'}, {'key': 'croissant.json'}],
        }
        before = module.record_snapshot(record)
        module.assert_same_record(before, module.record_snapshot(record))
        changed = dict(record)
        changed['doi'] = '10.5281/zenodo.99999999'
        with self.assertRaises(AssertionError):
            module.assert_same_record(before, module.record_snapshot(changed))
        changed = dict(record)
        changed['metadata'] = {'version': '1.3.4'}
        with self.assertRaises(AssertionError):
            module.assert_same_record(before, module.record_snapshot(changed))
        changed = dict(record)
        changed['files'] = record['files'] + [{'key': 'new-file.json'}]
        with self.assertRaises(AssertionError):
            module.assert_same_record(before, module.record_snapshot(changed))

    def test_merge_matching_files_preserves_exact_zenodo_key_set(self):
        module = load_module(self)
        existing = {'graph.jsonld': b'old-graph', 'README.md': b'keep-me', 'croissant.json': b'old-croissant'}
        live = {'graph.jsonld': b'new-graph', 'croissant.json': b'new-croissant', 'not-in-zenodo.json': b'ignore'}
        merged = module.merge_matching_files(existing, live)
        self.assertEqual(set(merged), set(existing))
        self.assertEqual(merged['graph.jsonld'], b'new-graph')
        self.assertEqual(merged['croissant.json'], b'new-croissant')
        self.assertEqual(merged['README.md'], b'keep-me')

    def test_inventory_hashes_final_bytes_without_self_reference(self):
        module = load_module(self)
        files = {'graph.jsonld': b'graph', 'croissant.json': b'croissant', 'dist-sha256.json': b'old'}
        inventory = module.build_dist_inventory(files, 'abc123')
        self.assertEqual(inventory['algorithm'], 'sha256')
        self.assertEqual(inventory['canonicalDatasetIri'], module.DATASET)
        self.assertEqual(inventory['sourceCommit'], 'abc123')
        self.assertNotIn('dist-sha256.json', inventory['files'])
        self.assertEqual(inventory['files']['graph.jsonld']['bytes'], 5)
        self.assertEqual(inventory['files']['graph.jsonld']['sha256'], hashlib.sha256(b'graph').hexdigest())

    def test_changed_names_requires_same_keys(self):
        module = load_module(self)
        self.assertEqual(module.changed_names({'a': b'1', 'b': b'2'}, {'a': b'1', 'b': b'3'}), ['b'])
        with self.assertRaises(AssertionError):
            module.changed_names({'a': b'1'}, {'a': b'1', 'b': b'2'})


if __name__ == '__main__':
    unittest.main()
