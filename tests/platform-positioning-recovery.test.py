"""Regression contract for preserving and reconciling positioning enrichment."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("platform_bundle", ROOT / ".github/scripts/platform_bundle.py")
bundle = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bundle)

OLD_DATASET = "https://www.ghezelbaash.ir/graph.jsonld#dataset"
HISTORICAL_DOI = "10.5281/zenodo.21910785"


class PositioningRecoveryTests(unittest.TestCase):
    def test_reconcile_positioning_assets_updates_only_current_identity_anchors(self):
        self.assertTrue(hasattr(bundle, "reconcile_positioning_assets"), "positioning reconciliation helper is missing")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            enrichment = root / "enrichment"
            enrichment.mkdir()
            row = {
                "canonical_dataset_iri": OLD_DATASET,
                "release_version_doi": HISTORICAL_DOI,
                "messages": [{"role": "system", "content": "Current dataset: " + OLD_DATASET + "; historical release DOI: https://doi.org/" + HISTORICAL_DOI}],
            }
            (enrichment / "instruction_examples_fa_market_positioning.jsonl").write_text(json.dumps(row, ensure_ascii=False) + "\n", encoding="utf-8")
            (enrichment / "positioning-strategy.json").write_text(json.dumps({
                "canonical_dataset_iri": OLD_DATASET,
                "release_version_doi": "10.5281/zenodo.22131441",
            }, ensure_ascii=False), encoding="utf-8")
            bundle.reconcile_positioning_assets(root)
            body = (enrichment / "instruction_examples_fa_market_positioning.jsonl").read_text(encoding="utf-8")
            strategy = json.loads((enrichment / "positioning-strategy.json").read_text(encoding="utf-8"))
            self.assertNotIn(OLD_DATASET, body)
            self.assertIn(bundle.DATASET, body)
            self.assertIn(HISTORICAL_DOI, body, "historical release DOI provenance must be preserved")
            self.assertEqual(strategy["canonical_dataset_iri"], bundle.DATASET)
            self.assertEqual(strategy["release_version_doi"], "10.5281/zenodo.22131441")

    def test_positioning_asset_contract_is_explicit_and_complete(self):
        self.assertTrue(hasattr(bundle, "POSITIONING_ENRICHMENT_FILES"), "positioning asset allowlist is missing")
        expected = {
            "enrichment/instruction_examples_fa_market_positioning.jsonl",
            "enrichment/instruction_examples_fa_market_positioning.csv",
            "enrichment/market-positioning-evidence.json",
            "enrichment/positioning-strategy.json",
        }
        self.assertEqual(set(bundle.POSITIONING_ENRICHMENT_FILES), expected)


if __name__ == "__main__":
    unittest.main()
