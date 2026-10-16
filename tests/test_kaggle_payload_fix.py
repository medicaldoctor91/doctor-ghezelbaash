import importlib.util
import hashlib
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE = ROOT / '.github' / 'scripts' / 'kaggle_payload_fix.py'


class KagglePayloadFixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        scripts = str(MODULE.parent)
        import sys
        sys.path.insert(0, scripts)
        spec = importlib.util.spec_from_file_location('kaggle_payload_fix', MODULE)
        cls.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.mod)

    def test_reserved_datapackage_is_replaced_by_downloadable_frictionless_alias(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / 'graph.jsonld').write_text('{"ok":true}\n')
            (root / 'checksums.sha256').write_text('deadbeef  datapackage.json\n')
            (root / 'kaggle-manifest.json').write_text(json.dumps({
                'original_files': [
                    {'path': 'graph.jsonld', 'bytes': 12, 'sha256': 'old'},
                    {'path': 'datapackage.json', 'bytes': 10, 'sha256': 'old'},
                ]
            }) + '\n')
            descriptor = b'{"name":"canonical-package","resources":[]}\n'

            result = self.mod.normalize_kaggle_payload(root, descriptor)

            alias = root / 'frictionless-datapackage.json'
            self.assertTrue(alias.is_file())
            self.assertEqual(alias.read_bytes(), descriptor)
            self.assertFalse((root / 'datapackage.json').exists())
            manifest = json.loads((root / 'kaggle-manifest.json').read_text())
            paths = [item['path'] for item in manifest['original_files']]
            self.assertNotIn('datapackage.json', paths)
            self.assertIn('frictionless-datapackage.json', paths)
            alias_item = next(item for item in manifest['original_files'] if item['path'] == 'frictionless-datapackage.json')
            self.assertEqual(alias_item['bytes'], len(descriptor))
            self.assertEqual(alias_item['sha256'], hashlib.sha256(descriptor).hexdigest())
            checks = (root / 'checksums.sha256').read_text()
            self.assertNotIn('  datapackage.json', checks)
            self.assertIn('  frictionless-datapackage.json', checks)
            self.assertNotIn('  checksums.sha256', checks)
            self.assertEqual(result['alias'], 'frictionless-datapackage.json')


if __name__ == '__main__':
    unittest.main()
