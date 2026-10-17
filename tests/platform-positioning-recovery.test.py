"""Regression contract for preserving and reconciling positioning enrichment."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("platform_publish_positioning", ROOT / ".github/scripts/platform_publish_positioning.py")
positioning = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(positioning)

OLD_DATASET = "https://www.ghezelbaash.ir/graph.jsonld#dataset"
HISTORICAL_DOI = "10.5281/zenodo.21910785"


class PositioningRecoveryTests(unittest.TestCase):
    def test_reconcile_positioning_assets_updates_only_current_identity_anchors(self):
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
            (enrichment / "instruction_examples_fa_market_positioning.csv").write_text("canonical_dataset_iri,release_version_doi\n" + OLD_DATASET + "," + HISTORICAL_DOI + "\n", encoding="utf-8")
            (enrichment / "market-positioning-evidence.json").write_text(json.dumps({"canonical_dataset_iri": OLD_DATASET, "zenodo_version_doi": HISTORICAL_DOI}), encoding="utf-8")
            (enrichment / "positioning-strategy.json").write_text(json.dumps({
                "canonical_dataset_iri": OLD_DATASET,
                "release_version_doi": "10.5281/zenodo.22131441",
            }, ensure_ascii=False), encoding="utf-8")
            positioning.reconcile_positioning_assets(root)
            body = (enrichment / "instruction_examples_fa_market_positioning.jsonl").read_text(encoding="utf-8")
            strategy = json.loads((enrichment / "positioning-strategy.json").read_text(encoding="utf-8"))
            self.assertNotIn(OLD_DATASET, body)
            self.assertIn(positioning.DATASET, body)
            self.assertIn(HISTORICAL_DOI, body, "historical release DOI provenance must be preserved")
            self.assertEqual(strategy["canonical_dataset_iri"], positioning.DATASET)
            self.assertEqual(strategy["release_version_doi"], "10.5281/zenodo.22131441")

    def test_positioning_asset_contract_is_explicit_and_complete(self):
        expected = {
            "enrichment/instruction_examples_fa_market_positioning.jsonl",
            "enrichment/instruction_examples_fa_market_positioning.csv",
            "enrichment/market-positioning-evidence.json",
            "enrichment/positioning-strategy.json",
        }
        self.assertEqual(set(positioning.POSITIONING_ENRICHMENT_FILES), expected)
        self.assertEqual(positioning.POSITIONING_SOURCE_REVISION, "e9f45a0fbb55b23847d53f9bc070418670cddbdb")


if __name__ == "__main__":
    unittest.main()
