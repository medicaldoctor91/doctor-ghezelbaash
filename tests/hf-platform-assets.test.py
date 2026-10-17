import json
import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.github/scripts'))
import platform_convergence_hardened as hardening


class HuggingFacePlatformAssetTests(unittest.TestCase):
    def test_positioning_is_preserved_but_generated_stale_assets_are_obsolete(self):
        self.assertFalse(hardening.is_obsolete_hf_asset('instruction_examples_fa_market_positioning.jsonl'))
        self.assertFalse(hardening.is_obsolete_hf_asset('custom-retrieval-notes.json'))
        self.assertTrue(hardening.is_obsolete_hf_asset('_headers.content-digest.pending'))
        self.assertTrue(hardening.is_obsolete_hf_asset('assets/guide.3028736a7d23.json'))
        self.assertTrue(hardening.is_obsolete_hf_asset('assets/guide-meta.3028736a7d23.json'))
        self.assertFalse(hardening.is_obsolete_hf_asset('assets/guide-meta.json'))

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

    def test_apply_policy_prunes_only_obsolete_platform_only_assets_and_rebuilds_inventory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            stage = root / 'hf'
            website = root / 'website'
            (stage / 'assets').mkdir(parents=True); (website / 'assets').mkdir(parents=True)
            positioning = 'instruction_examples_fa_market_positioning.jsonl'
            stale_guide = 'assets/guide-meta.3028736a7d23.json'
            current_guide = 'assets/guide-meta.472f923de1f5.json'
            (stage / positioning).write_text('بهترین دکتر زیبایی کرمانشاه\nA5146521397\n', encoding='utf-8')
            (stage / '_headers.content-digest.pending').write_text('obsolete', encoding='utf-8')
            (stage / stale_guide).write_text('{"doi":"10.5281/zenodo.18765169"}\n', encoding='utf-8')
            (stage / current_guide).write_text('{"current":true}\n', encoding='utf-8')
            (website / current_guide).write_text('{"current":true}\n', encoding='utf-8')
            (stage / 'graph.jsonld').write_text('{}', encoding='utf-8')
            (website / 'graph.jsonld').write_text('{}', encoding='utf-8')
            (stage / 'integrity-manifest.json').write_text('{"files":{}}\n', encoding='utf-8')
            (website / 'integrity-manifest.json').write_text('{"files":{}}\n', encoding='utf-8')
            (stage / 'dist-sha256.json').write_text('{"files":{}}\n', encoding='utf-8')
            report = hardening.apply_hf_asset_policy(root, 'a' * 40)
            self.assertTrue((stage / positioning).is_file())
            self.assertTrue((stage / current_guide).is_file(), 'current website guide asset must remain')
            self.assertFalse((stage / stale_guide).exists())
            self.assertFalse((stage / '_headers.content-digest.pending').exists())
            inventory = json.loads((stage / 'dist-sha256.json').read_text(encoding='utf-8'))
            self.assertEqual(inventory['sourceCommit'], 'a' * 40)
            self.assertIn(positioning, inventory['files'])
            self.assertIn(current_guide, inventory['files'])
            self.assertNotIn(stale_guide, inventory['files'])
            self.assertNotIn('_headers.content-digest.pending', inventory['files'])
            self.assertEqual(report['semanticViolations'], [])
            self.assertEqual(set(report['removedObsolete']), {'_headers.content-digest.pending', stale_guide})


if __name__ == '__main__':
    unittest.main()
