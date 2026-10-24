"""The Article preview must preserve the already Google-verified production."""
import copy
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('schema_preview', ROOT / '.github/scripts/schema_preview.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class ProductionGuardTests(unittest.TestCase):
    def state(self):
        return {'project': preview.PROJECT, 'productionBranch': 'main',
                'deploymentBranch': 'main', 'sourceCommit': preview.PRODUCTION_SOURCE,
                'deploymentId': preview.PRODUCTION_DEPLOYMENT, 'stage': 'success',
                'globalGitDeploymentsEnabled': False, 'automaticProductionDeployments': False,
                'automaticPreviewSetting': 'none'}

    def test_current_google_verified_production_is_the_only_accepted_baseline(self):
        state = self.state()
        preview.require_production(state)
        for key, value in [('sourceCommit', '94611168bacf7630022499204c493f6e4af64f70'),
                           ('deploymentId', '51fc7680-1235-4556-b6f2-4bb8d764556c'),
                           ('deploymentBranch', preview.BRANCH), ('stage', 'failure')]:
            changed = {**state, key: value}
            with self.assertRaises(preview.PreviewError):
                preview.require_production(changed)

    def test_preview_cannot_run_with_any_automatic_git_deployment_enabled(self):
        state = self.state()
        for key, value in [('globalGitDeploymentsEnabled', True),
                           ('automaticProductionDeployments', True), ('automaticPreviewSetting', 'all')]:
            with self.assertRaises(preview.PreviewError):
                preview.require_production({**state, key: value})

    def test_after_guard_detects_any_change_in_observed_public_baseline(self):
        state = {**self.state(), 'publicSourceCommit': preview.PRODUCTION_SOURCE,
                 'publicProvenanceSha256': 'a' * 64}
        preview.require_production(copy.deepcopy(state), state)
        with self.assertRaisesRegex(preview.PreviewError, 'changed during preview'):
            preview.require_production({**state, 'publicProvenanceSha256': 'b' * 64}, state)


if __name__ == '__main__':
    unittest.main()
