"""Regression contract for preserving and reconciling positioning enrichment."""
import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("platform_publish_positioning", ROOT / ".github/scripts/platform_publish_positioning.py")
positioning = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(positioning)

SYNC_SPEC = importlib.util.spec_from_file_location("sync_platform_validator_contract", ROOT / ".github/scripts/sync_platform_validator_contract.py")
validator_sync = importlib.util.module_from_spec(SYNC_SPEC)
SYNC_SPEC.loader.exec_module(validator_sync)

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

    def test_kaggle_version_lock_fails_before_any_publish_on_drift(self):
        self.assertEqual(positioning.assert_kaggle_version_lock({"currentVersionNumber": 13}, "13"), 13)
        with self.assertRaises(AssertionError):
            positioning.assert_kaggle_version_lock({"currentVersionNumber": 14}, "13")

    def test_source_zip_uses_current_records_draft_file_api(self):
        calls = []
        def fake_request(method, url, payload=None, raw=None, token=None, **kwargs):
            calls.append((method, url, payload, raw, token))
            return 200, {}
        positioning.publish_source_via_record_draft(
            "23289009", {"source.zip": b"abc"}, "secret", request_fn=fake_request
        )
        suffixes = [(method, url.removeprefix(positioning.publisher.BASE)) for method, url, *_ in calls]
        self.assertEqual(suffixes, [
            ("DELETE", "/records/23289009/draft/files/source.zip"),
            ("POST", "/records/23289009/draft/files"),
            ("PUT", "/records/23289009/draft/files/source.zip/content"),
            ("POST", "/records/23289009/draft/files/source.zip/commit"),
            ("POST", "/records/23289009/draft/actions/publish"),
        ])
        self.assertEqual(calls[1][2], [{"key": "source.zip"}])
        self.assertEqual(calls[2][3], b"abc")
        self.assertEqual(calls[2][4], "secret")

    def test_platform_validator_row_contract_is_measured_from_canonical_dist(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "clinical-passages.jsonl").write_text("{}\n{}\n", encoding="utf-8")
            (root / "query-matrix.jsonl").write_text("{}\n", encoding="utf-8")
            (root / "fact-map.json").write_text(json.dumps({"records": [{}, {}, {}]}), encoding="utf-8")
            with (root / "entity-facts.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=["subject", "predicate", "object"])
                writer.writeheader(); writer.writerows([
                    {"subject": "s1", "predicate": "p", "object": "o"},
                    {"subject": "s2", "predicate": "p", "object": "o"},
                    {"subject": "s3", "predicate": "p", "object": "o"},
                    {"subject": "s4", "predicate": "p", "object": "o"},
                ])
            contract = validator_sync.canonical_row_contract(root)
            self.assertEqual(contract, {
                "clinical_passages": 2,
                "clinical_answers": 3,
                "entity_facts": 4,
                "query_matrix": 1,
            })
            validator = root / "validator.py"
            validator.write_text("EXPECTED_ROWS = {'clinical_passages': 1, 'clinical_answers': 1,\n                 'entity_facts': 9, 'query_matrix': 1}\n", encoding="utf-8")
            validator_sync.patch_validator(validator, contract)
            patched = validator.read_text(encoding="utf-8")
            self.assertIn("'entity_facts': 4", patched)
            self.assertNotIn("'entity_facts': 9", patched)


if __name__ == "__main__":
    unittest.main()
