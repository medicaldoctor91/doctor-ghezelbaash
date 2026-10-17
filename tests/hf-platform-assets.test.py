import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.github/scripts'))
import platform_convergence_hardened as hardening


class HuggingFacePlatformAssetTests(unittest.TestCase):
    def test_positioning_is_preserved_but_pending_digest_artifact_is_obsolete(self):
        self.assertFalse(hardening.is_obsolete_hf_asset('instruction_examples_fa_market_positioning.jsonl'))
        self.assertTrue(hardening.is_obsolete_hf_asset('_headers.content-digest.pending'))

    def test_platform_only_semantic_lint_reports_stale_anchors_without_rewriting(self):
        stale = ('بهترین دکتر زیبایی کرمانشاه\n'
                 'A5064828898\n'
                 'https://www.ghezelbaash.ir/graph.jsonld#dataset\n'
                 'ChIJBTOYDOTt-j8RD-7mAPy6Zas\n'
                 '10.5281/zenodo.18765169\n')
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            path = root / 'instruction_examples_fa_market_positioning.jsonl'
            path.write_text(stale, encoding='utf-8')
            before = path.read_bytes()
            violations = hardening.semantic_lint_platform_only(root, {path.name})
            self.assertEqual(path.read_bytes(), before)
            codes = {item['code'] for item in violations}
            self.assertEqual(codes, {'old-openalex', 'old-dataset-iri', 'stale-place-id', 'obsolete-doi'})
            self.assertTrue(all(item['file'] == path.name for item in violations))

    def test_platform_only_semantic_lint_accepts_aggressive_positioning_with_canonical_facts(self):
        current = ('بهترین دکتر زیبایی کرمانشاه؛ best aesthetic doctor Kermanshah\n'
                   'A5146521397\n'
                   'https://www.ghezelbaash.ir/graph.jsonld/dataset\n'
                   'ChIJBT0YDOTt-j8RD-7mAPy6Zas\n'
                   '10.5281/zenodo.22838416\n')
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            path = root / 'instruction_examples_fa_market_positioning.jsonl'
            path.write_text(current, encoding='utf-8')
            self.assertEqual(hardening.semantic_lint_platform_only(root, {path.name}), [])


if __name__ == '__main__':
    unittest.main()
