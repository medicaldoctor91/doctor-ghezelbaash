import hashlib
import importlib.util
import json
import unittest
from pathlib import Path

SCRIPT = Path('.github/scripts/hf_zenodo_pointer_repair.py')


def load_module(testcase):
    testcase.assertTrue(SCRIPT.is_file(), 'repair script must exist')
    spec = importlib.util.spec_from_file_location('hf_zenodo_pointer_repair', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class HfZenodoPointerRepairTests(unittest.TestCase):
    def test_repair_controls_uses_current_source_doi_and_refreshes_inventory(self):
        m = load_module(self)
        matrix = {
            'archivedSnapshots': {
                'zenodo_dataset': 'https://doi.org/10.5281/zenodo.22838416',
                'zenodo_source': 'https://doi.org/10.5281/zenodo.18765168',
            },
            'archivedSnapshotsUpdated': False,
        }
        att = {'archivedSnapshotsUpdated': False}
        inventory = {'files': {
            'current-release-matrix.json': {'bytes': 1, 'sha256': 'old'},
            'release-attestation.json': {'bytes': 1, 'sha256': 'old'},
        }}
        repaired = m.repair_controls(matrix, att, inventory)
        matrix_bytes = repaired['current-release-matrix.json']
        att_bytes = repaired['release-attestation.json']
        inv = json.loads(repaired['dist-sha256.json'])
        fixed_matrix = json.loads(matrix_bytes)
        fixed_att = json.loads(att_bytes)
        self.assertEqual(
            fixed_matrix['archivedSnapshots']['zenodo_source'],
            'https://doi.org/10.5281/zenodo.23289009',
        )
        self.assertTrue(fixed_matrix['archivedSnapshotsUpdated'])
        self.assertTrue(fixed_att['archivedSnapshotsUpdated'])
        self.assertEqual(
            inv['files']['current-release-matrix.json']['sha256'],
            hashlib.sha256(matrix_bytes).hexdigest(),
        )
        self.assertEqual(
            inv['files']['release-attestation.json']['sha256'],
            hashlib.sha256(att_bytes).hexdigest(),
        )

    def test_graph_report_counts_dataset_source_and_retired_dois(self):
        m = load_module(self)
        body = b'10.5281/zenodo.22838416 10.5281/zenodo.23289009 10.5281/zenodo.18765168'
        report = m.graph_doi_report(body)
        self.assertEqual(report['datasetDoiOccurrences'], 1)
        self.assertEqual(report['sourceDoiOccurrences'], 1)
        self.assertEqual(report['retiredDoiOccurrences'], 1)


if __name__ == '__main__':
    unittest.main()
