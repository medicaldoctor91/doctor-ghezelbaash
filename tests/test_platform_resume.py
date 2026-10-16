import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE = ROOT / '.github' / 'scripts' / 'platform_resume.py'


class PlatformResumeContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('platform_resume', MODULE)
        cls.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.mod)

    def test_bucket_upload_command_is_streaming_and_retry_guarded(self):
        cmd = self.mod.bucket_upload_command('/tmp/source.zip', 'https://zenodo.org/api/files/bucket/key', 'TOKEN')
        self.assertIn('--upload-file', cmd)
        self.assertIn('--retry-all-errors', cmd)
        self.assertIn('--max-time', cmd)
        self.assertIn('600', cmd)
        self.assertIn('--http1.1', cmd)
        self.assertNotIn('https://huggingface.co', ' '.join(cmd))

    def test_resume_requires_existing_hf_revision_for_target_source_commit(self):
        info = {'sha': 'hf-revision'}
        matrix = {'websiteSourceCommit': 'source-commit', 'canonicalDatasetIri': 'https://www.ghezelbaash.ir/graph.jsonld/dataset'}
        revision = self.mod.verify_existing_hf(info, matrix, 'source-commit')
        self.assertEqual(revision, 'hf-revision')
        with self.assertRaises(AssertionError):
            self.mod.verify_existing_hf(info, matrix, 'other-source')


if __name__ == '__main__':
    unittest.main()
