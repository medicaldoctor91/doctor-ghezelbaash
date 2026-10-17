from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / '.github/scripts/platform_convergence_hardened.py'
WORKFLOW = ROOT / '.github/workflows/platform-convergence.yml'

class WebsiteOriginBindingTests(unittest.TestCase):
    def test_expected_live_site_binding_present(self):
        self.assertTrue(SCRIPT.is_file())
        text = SCRIPT.read_text(encoding='utf-8')
        self.assertIn('EXPECTED_' + 'WEBSITE_COMMIT', text)
        self.assertIn('release-provenance.json', text)
        self.assertIn('integrity-manifest.json', text)
        self.assertIn('Website changed during snapshot download', text)
        workflow = WORKFLOW.read_text(encoding='utf-8')
        self.assertIn('platform_convergence_hardened.py', workflow)
        self.assertNotIn('run: python .github/scripts/platform_publish.py', workflow)

if __name__ == '__main__':
    unittest.main()
