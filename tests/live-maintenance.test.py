import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

SCRIPT = Path(__file__).resolve().parents[1] / '.github/scripts/live_platform_maintenance.py'


class ViewerCompatibility(unittest.TestCase):
    def test_messages_remain_lossless_without_short_range_list_histogram(self):
        self.assertTrue(SCRIPT.exists(), 'Live viewer compatibility repair is missing')
        spec = importlib.util.spec_from_file_location('maintenance', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        original = [{'messages': [{'role': 'user', 'content': 'پرسش'}, {'role': 'assistant', 'content': 'پاسخ'}]},
                    {'messages': [{'role': 'system', 'content': 'راهنما'}, {'role': 'user', 'content': 'پرسش'}, {'role': 'assistant', 'content': 'پاسخ'}]}]
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'viewer').mkdir()
            pq.write_table(pa.Table.from_pylist(original), root / 'viewer/positioning-examples.parquet')
            packaging = {'tables': {'market_positioning': {'file': 'viewer/positioning-examples.parquet', 'jsonEncodedFields': []}}}
            (root / 'viewer/packaging.json').write_text(json.dumps(packaging))
            module.repair_viewer(root)
            result = pq.read_table(root / 'viewer/positioning-examples.parquet')
            self.assertEqual(result.schema.field('messages').type, pa.string())
            self.assertEqual([{'messages': json.loads(row['messages'])} for row in result.to_pylist()], original)
            self.assertEqual(json.loads((root / 'viewer/packaging.json').read_text())['tables']['market_positioning']['jsonEncodedFields'], ['messages'])


if __name__ == '__main__':
    unittest.main()
