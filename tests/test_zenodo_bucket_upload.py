import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path('.github/scripts/zenodo_source_recovery.py')


def load_module(testcase):
    testcase.assertTrue(SCRIPT.is_file())
    spec = importlib.util.spec_from_file_location('zenodo_source_recovery', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ZenodoBucketUploadTests(unittest.TestCase):
    def test_bucket_upload_target_uses_draft_bucket_and_preserves_exact_key(self):
        m = load_module(self)
        draft = {'links': {'bucket': 'https://zenodo.org/api/files/abc-123'}}
        self.assertEqual(
            m.bucket_upload_target(draft, m.SOURCE_KEY),
            'https://zenodo.org/api/files/abc-123/' + m.urllib.parse.quote(m.SOURCE_KEY, safe=''),
        )

    def test_bucket_upload_target_rejects_missing_or_non_zenodo_bucket(self):
        m = load_module(self)
        with self.assertRaises(RuntimeError):
            m.bucket_upload_target({'links': {}}, m.SOURCE_KEY)
        with self.assertRaises(RuntimeError):
            m.bucket_upload_target({'links': {'bucket': 'https://example.com/api/files/x'}}, m.SOURCE_KEY)


if __name__ == '__main__':
    unittest.main()
