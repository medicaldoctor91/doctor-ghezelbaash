import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "schema_correction_prose", ROOT / ".github/scripts/schema_correction_prose.py"
)
prose = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prose)


class SchemaCorrectionProseTests(unittest.TestCase):
    def boundary(self):
        return (
            "The published immutable archive " + prose.DOI + " preserves source "
            + prose.ORIGINAL_SOURCE + ". Cite these updated distribution bytes by "
            "their own platform revision and website source; the archive files are unchanged."
        )

    def test_current_claims_are_replaced_with_dual_source_notice_once(self):
        text = "Published immutable archive: https://doi.org/" + prose.DOI + ".\n\n"
        text += self.boundary() + "\n\n" + self.boundary()
        result = prose.correct_prose(text)
        self.assertNotIn("archive files are unchanged", result)
        self.assertNotIn("Published immutable archive", result)
        self.assertEqual(result.count(prose.correction_notice()), 1)
        self.assertIn(prose.ORIGINAL_SOURCE, result)
        self.assertIn(prose.DELIVERY_SOURCE, result)
        self.assertIn("pinned platform revisions", result)
        self.assertEqual(prose.correct_prose(result), result)

    def test_other_historical_dois_and_clinical_prose_are_verbatim(self):
        clinical = "Chronic migraine treatment follows clinical assessment. All 47 original message arrays unchanged."
        historical = "Published immutable archive: https://doi.org/10.5281/zenodo.22838416. Historical archives remain unchanged."
        text = clinical + "\n" + historical + "\n" + self.boundary()
        result = prose.correct_prose(text)
        self.assertIn(clinical, result)
        self.assertIn(historical, result)
        self.assertIn("10.5281/zenodo.22838416", result)
        self.assertEqual(prose.correct_prose(clinical + "\n" + historical), clinical + "\n" + historical)

    def test_unknown_unqualified_unchanged_claim_is_rejected(self):
        text = "Dataset DOI " + prose.DOI + ". The archive files remain unchanged despite this correction."
        with self.assertRaisesRegex(ValueError, "stale"):
            prose.correct_prose(text)

    def test_unknown_target_historical_only_claim_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "stale"):
            prose.correct_prose("DOI " + prose.DOI + " contains only old files.")

    def test_standard_builder_scope_keeps_historical_software_record_separate(self):
        historical = "https://doi.org/10.5281/zenodo.23289009"
        text = (
            "The publication scope includes the existing Zenodo distributions at "
            "https://doi.org/" + prose.DOI + " and " + historical + ". "
            "Their DOI identifiers are retained; consult per-platform receipts for final files and provenance."
        )
        result = prose.correct_prose(text)
        self.assertIn("Historical software source: " + historical, result)
        self.assertNotIn("includes the existing Zenodo distributions", result)
        self.assertEqual(prose.correct_prose(result), result)

    def test_reviewed_english_and_persian_template_claims(self):
        text = (
            "https://doi.org/" + prose.DOI + "\n"
            "Use the assigned exact DOI to cite this coordinated archive.\n"
            "The exact Dataset archive belongs to this coordinated release; the website source archive remains historical.\n"
            "the exact release DOI identifies this coordinated snapshot; historical records retain their own provenance.\n"
            "نسخهٔ جاری کاگل و هاگینگ‌فیس از فایل‌های یکسان استفاده می‌کنند؛ شناسهٔ دقیق این انتشار در بخش DOI آمده است؛ آرشیوهای تاریخی با فایل‌ها و سوابق اصلی خود محفوظ می‌مانند.\n"
            "DOI مجموعه، پیوند پایدار مجموعه است و DOI دقیق، شناسهٔ همین انتشار است."
        )
        result = prose.correct_prose(text)
        self.assertNotIn("this coordinated snapshot", result)
        self.assertNotIn("شناسهٔ همین انتشار", result)
        self.assertIn("منبع علمی اولیه", result)
        self.assertIn("اصلاحات جزئی اسکیما", result)
        self.assertEqual(result.count(prose.correction_notice()), 1)
        self.assertEqual(prose.correct_prose(result), result)

    def test_notebook_preserves_executable_cells_outputs_metadata_and_raw_cells(self):
        code = {
            "cell_type": "code", "execution_count": 4,
            "metadata": {"tags": ["pin"]},
            "source": ["TARGET_KAGGLE_VERSION = 32\n", "HF_REVISION = 'reviewed-new-pin'\n"],
            "outputs": [{"output_type": "stream", "name": "stdout", "text": ["PASS\n"]}],
        }
        doc = {
            "nbformat": 4, "nbformat_minor": 5, "metadata": {"keep": "exact"},
            "cells": [
                {"cell_type": "markdown", "metadata": {"keep": True}, "source": [self.boundary()]},
                code,
                {"cell_type": "markdown", "metadata": {}, "source": "The archived Zenodo DOI stays attached to its own historical files."},
                {"cell_type": "raw", "metadata": {}, "source": [self.boundary()]},
            ],
        }
        before = copy.deepcopy(doc)
        with tempfile.TemporaryDirectory() as work:
            path = Path(work) / "starter.ipynb"
            path.write_text(json.dumps(doc))
            self.assertTrue(prose.scope_notebook(path))
            actual = json.loads(path.read_text())
            self.assertEqual(actual["cells"][1], before["cells"][1])
            self.assertEqual(actual["cells"][3], before["cells"][3])
            self.assertEqual(actual["metadata"], before["metadata"])
            self.assertIsInstance(actual["cells"][0]["source"], list)
            self.assertIsInstance(actual["cells"][2]["source"], str)
            sealed = path.read_bytes()
            self.assertFalse(prose.scope_notebook(path))
            self.assertEqual(path.read_bytes(), sealed)

    def test_notebook_rejects_before_writing_when_a_markdown_claim_is_unknown(self):
        doc = {"cells": [
            {"cell_type": "markdown", "source": [self.boundary()]},
            {"cell_type": "markdown", "source": ["The archive files stay unchanged forever."]},
        ]}
        with tempfile.TemporaryDirectory() as work:
            path = Path(work) / "starter.ipynb"
            path.write_text(json.dumps(doc))
            before = path.read_bytes()
            with self.assertRaisesRegex(ValueError, "stale"):
                prose.scope_notebook(path)
            self.assertEqual(path.read_bytes(), before)

    def test_invalid_provenance_is_rejected(self):
        with self.assertRaises(ValueError):
            prose.correct_prose(self.boundary(), delivery_source="current")
        with self.assertRaises(ValueError):
            prose.correct_prose(self.boundary(), doi="10.1234/other")


if __name__ == "__main__":
    unittest.main()
