"""TDD guards for external-platform convergence hardening."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / '.github/workflows/platform-convergence.yml'


class PlatformHardeningTests(unittest.TestCase):
    def test_external_platform_workflow_never_deploys_the_website(self):
        text = WORKFLOW.read_text(encoding='utf-8')
        self.assertNotIn('wrangler@4 pages deploy', text)
        self.assertNotIn('pages deploy dist', text)


if __name__ == '__main__':
    unittest.main()
