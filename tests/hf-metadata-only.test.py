import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("hf_metadata_only", ROOT / ".github/scripts/hf_metadata_only.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MetadataOnlyTests(unittest.TestCase):
    def setUp(self):
        header = {"pretty_name": "Dr. Saeed Ghezelbash Public Knowledge Graph",
            "language": ["fa", "en", "ar", "ckb"], "license": "cc-by-4.0",
            "tags": ["provenance"], "configs": [{"config_name": str(i)} for i in range(5)]}
        body = "\n# Dr. Saeed Ghezelbash Public Knowledge Graph\n\n## Retrieval-ready clinical information\n\nAll configurations use string-typed Parquet.\n\n## Machine-readable package maintenance — 2026-10-18\nHistorical receipt.\n"
        self.readme = ("---\n" + module.yaml.safe_dump(header) + "---" + body).encode()
        self.inventory = {"sourceCommit": module.SOURCE, "files": {
            "README.md": module.digest(self.readme), "graph.ttl": {"bytes": 123, "sha256": "unchanged"}}}

    def test_only_card_and_its_checksum_change(self):
        original = copy.deepcopy(self.inventory)
        updates = module.build_updates(self.readme, self.inventory)
        self.assertEqual(set(updates), module.ALLOWED)
        self.assertEqual(self.inventory, original)
        after = json.loads(updates["dist-sha256.json"])
        self.assertEqual(after["files"]["graph.ttl"], original["files"]["graph.ttl"])
        self.assertEqual(after["files"]["README.md"], module.digest(updates["README.md"]))
        text = updates["README.md"].decode()
        self.assertLess(text.index("## Dataset scope"), text.index("## Machine-readable package maintenance"))
        self.assertIn("Historical receipt.", text)

    def test_rejects_stale_checksum(self):
        with self.assertRaises(AssertionError):
            module.build_updates(self.readme + b"stale", self.inventory)

    def test_rejects_wrong_provenance(self):
        self.inventory["sourceCommit"] = "unexpected"
        with self.assertRaises(AssertionError):
            module.build_updates(self.readme, self.inventory)

    def test_refuses_duplicate_publication(self):
        updates = module.build_updates(self.readme, self.inventory)
        with self.assertRaises(AssertionError):
            module.build_updates(updates["README.md"], json.loads(updates["dist-sha256.json"]))


if __name__ == "__main__":
    unittest.main()
