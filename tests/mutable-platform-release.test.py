"""Guards for the non-archival maintenance path; no platform requests."""
import ast,importlib.util,json,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.github/scripts'))
import mutable_platform_release as release
class Tests(unittest.TestCase):
 def test_reserved_archive_not_claimed_published(self):
  text='Use the assigned exact DOI to cite this coordinated archive.'
  self.assertIn('reserved',release.archive_scope(text));self.assertNotIn('cite this coordinated archive',release.archive_scope(text))
 def test_positioning_text_is_untouched(self):
  original=(ROOT/'src/canonical/enrichment/instruction_examples_fa_market_positioning.jsonl').read_text()
  self.assertEqual(release.archive_scope(original),original)
 def test_no_zenodo_mutation_calls(self):
  source=(ROOT/'.github/scripts/mutable_platform_release.py').read_text();tree=ast.parse(source)
  for node in ast.walk(tree):
   if isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute) and node.func.attr in {'post','put','delete','patch'}:
    self.fail('Unexpected direct HTTP mutation')
  self.assertNotIn('publish_zenodo',source);self.assertNotIn('mint',source.replace('No Zenodo write or mint operation.',''))
 def test_frozen_validation_and_full_viewer_gate_retained(self):
  source=(ROOT/'.github/scripts/mutable_platform_release.py').read_text()
  self.assertIn('gates.verify_hf(w)',source);self.assertIn('guard_frozen(w)',source)
  workflow=(ROOT/'.github/workflows/mutable-platform-release.yml').read_text()
  self.assertIn('Restore exact validated bytes without rebuild',workflow)
  self.assertNotIn('zenodo-only',workflow)
if __name__=='__main__':unittest.main()
