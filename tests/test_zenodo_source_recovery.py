import hashlib
import importlib.util
import io
import unittest
import zipfile
from pathlib import Path

SCRIPT = Path('.github/scripts/zenodo_source_recovery.py')


def load_module(testcase):
    testcase.assertTrue(SCRIPT.is_file())
    spec = importlib.util.spec_from_file_location('zenodo_source_recovery', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ZenodoSourceRecoveryTests(unittest.TestCase):
    def test_dataset_fingerprint_tracks_size_and_checksum(self):
        m = load_module(self)
        record = {'files': [
            {'key': 'b', 'size': 2, 'checksum': 'md5:bb'},
            {'key': 'a', 'size': 1, 'checksum': 'md5:aa'},
        ]}
        self.assertEqual(m.dataset_fingerprint(record), (
            ('a', 1, 'md5:aa'), ('b', 2, 'md5:bb')
        ))
        changed = {'files': [
            {'key': 'b', 'size': 3, 'checksum': 'md5:bb'},
            {'key': 'a', 'size': 1, 'checksum': 'md5:aa'},
        ]}
        self.assertNotEqual(m.dataset_fingerprint(record), m.dataset_fingerprint(changed))

    def test_source_file_match_requires_size_and_md5(self):
        m = load_module(self)
        body = b'expected-source-archive'
        entry = {'size': len(body), 'checksum': 'md5:' + hashlib.md5(body).hexdigest()}
        self.assertTrue(m.source_file_matches(entry, body))
        self.assertFalse(m.source_file_matches({**entry, 'size': len(body) + 1}, body))
        self.assertFalse(m.source_file_matches({**entry, 'checksum': 'md5:' + '0' * 32}, body))

    def test_source_identity_preserves_existing_doi_version_and_key(self):
        m = load_module(self)
        rec = {
            'id': int(m.SOURCE_RECORD),
            'doi': m.SOURCE_DOI,
            'metadata': {'version': m.SOURCE_VERSION},
            'files': [{'key': m.SOURCE_KEY}],
        }
        m.assert_source_identity(rec)
        bad = {**rec, 'metadata': {'version': 'changed'}}
        with self.assertRaises(AssertionError):
            m.assert_source_identity(bad)

    def test_validate_source_archive_requires_current_identity_and_shacl_generator(self):
        m = load_module(self)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as z:
            z.writestr(m.SOURCE_PREFIX + 'src/canonical/source.mjs', 'const id = "A5146521397";')
            z.writestr(m.SOURCE_PREFIX + 'src/lib/shacl-output.mjs', 'export const ok = true;')
        m.validate_source_archive(buf.getvalue())

        bad = io.BytesIO()
        with zipfile.ZipFile(bad, 'w') as z:
            z.writestr(m.SOURCE_PREFIX + 'src/canonical/source.mjs', 'const id = "A5064828898";')
            z.writestr(m.SOURCE_PREFIX + 'src/lib/shacl-output.mjs', 'export const ok = true;')
        with self.assertRaises(AssertionError):
            m.validate_source_archive(bad.getvalue())


if __name__ == '__main__':
    unittest.main()
