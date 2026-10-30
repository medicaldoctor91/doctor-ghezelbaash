"""Exercise the frozen-source boundary using small local Git repositories only."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock


SPEC = importlib.util.spec_from_file_location(
    'source_freeze', Path(__file__).resolve().parents[1] / '.github/scripts/source_freeze.py')
freeze = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(freeze)


class FrozenSourceTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name) / 'source'
        self.root.mkdir()
        self.git('init', '--quiet')
        self.git('config', 'user.email', 'local-test@example.invalid')
        self.git('config', 'user.name', 'Local integrity test')
        self.write('src/main.mjs', 'export const frozen = true;\n')
        self.write('public/identity.txt', 'preserved\n')
        self.write('package.json', '{"name":"frozen-fixture"}\n')
        self.write('.gitignore', '.env\nnode_modules/\n__pycache__/\n')
        self.git('add', '.')
        self.git('commit', '--quiet', '-m', 'baseline')
        self.commit = self.git('rev-parse', 'HEAD').strip()
        self.tree = self.git('rev-parse', 'HEAD^{tree}').strip()
        self.git('tag', freeze.FROZEN_TAG)
        for key, value in [('FROZEN_COMMIT', self.commit), ('FROZEN_TREE', self.tree),
                           ('FROZEN_FILE_COUNT', 4)]:
            patcher = mock.patch.object(freeze, key, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.root), *args], text=True,
                                       stderr=subprocess.PIPE)

    def write(self, name, body):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body)
        return path

    def commit_change(self):
        self.git('add', '-A')
        self.git('commit', '--quiet', '-m', 'later main additions')
        return self.git('rev-parse', 'HEAD').strip()

    def test_clean_baseline_and_independent_notes_pass(self):
        self.assertEqual(freeze.check(self.root)['frozenFiles'], 4)
        self.write('notes/later.md', 'Independent working notes\n')
        self.write('extra.txt', 'Independent root note\n')
        self.assertEqual(freeze.check(self.root)['additionalFiles'], 2)
        revision = self.commit_change()
        self.assertEqual(freeze.check(self.root, revision)['checked'], revision)

    def test_existing_file_content_change_and_deletion_fail(self):
        source = self.root / 'src/main.mjs'
        source.write_text('changed\n')
        with self.assertRaisesRegex(freeze.FreezeError, 'changed frozen file'):
            freeze.check(self.root)
        source.unlink()
        with self.assertRaisesRegex(freeze.FreezeError, 'missing frozen file'):
            freeze.check(self.root)

    def test_staged_change_cannot_be_hidden_by_restoring_worktree_bytes(self):
        source = self.root / 'src/main.mjs'
        original = source.read_bytes()
        source.write_text('staged change\n')
        self.git('add', 'src/main.mjs')
        source.write_bytes(original)
        with self.assertRaisesRegex(freeze.FreezeError, 'index: changed frozen file'):
            freeze.check(self.root)

    def test_mode_and_symlink_replacements_fail(self):
        source = self.root / 'src/main.mjs'
        source.chmod(0o755)
        with self.assertRaisesRegex(freeze.FreezeError, 'changed frozen file'):
            freeze.check(self.root)
        source.chmod(0o644)
        source.unlink()
        source.symlink_to('../public/identity.txt')
        with self.assertRaisesRegex(freeze.FreezeError, 'changed frozen file'):
            freeze.check(self.root)

    def test_untracked_and_ignored_runtime_inputs_fail(self):
        path = self.write('src/new-route.astro', '<p>Unreviewed route</p>\n')
        with self.assertRaisesRegex(freeze.FreezeError, 'source-sensitive addition'):
            freeze.check(self.root)
        path.unlink()
        self.write('.env', 'BUILD_INPUT=unreviewed\n')
        with self.assertRaisesRegex(freeze.FreezeError, r'source-sensitive addition: \.env'):
            freeze.check(self.root)

    def test_ignored_runtime_directory_cannot_hide_new_source(self):
        self.write('.git/info/exclude', 'src/hidden/\n')
        self.write('src/hidden/route.astro', '<p>Hidden</p>\n')
        with self.assertRaisesRegex(freeze.FreezeError, 'source-sensitive ignored directory'):
            freeze.check(self.root)

    def test_generated_ignored_dependencies_and_cache_do_not_change_source(self):
        self.write('node_modules/fixture/index.js', 'generated dependency\n')
        self.write('__pycache__/local.pyc', 'generated cache\n')
        self.write('tools/old/__pycache__/local.pyc', 'generated cache\n')
        self.assertEqual(freeze.check(self.root)['status'], 'PASS')

    def test_ignored_cache_directory_cannot_hide_compilable_source(self):
        self.write('src/pages/__pycache__/evil.astro', '<p>Injected route</p>\n')
        with self.assertRaisesRegex(freeze.FreezeError, 'source-sensitive ignored directory'):
            freeze.check(self.root)

    def test_new_workflow_and_root_build_configuration_fail(self):
        workflow = self.write('.github/workflows/unreviewed.yml', 'on: push\n')
        with self.assertRaisesRegex(freeze.FreezeError, 'source-sensitive addition'):
            freeze.check(self.root)
        workflow.unlink()
        self.write('vite.config.mjs', 'export default {};\n')
        with self.assertRaisesRegex(freeze.FreezeError, 'source-sensitive addition'):
            freeze.check(self.root)

    def test_exact_management_additions_are_allowed_as_regular_files(self):
        for name in freeze.MANAGEMENT_ADDITIONS:
            self.write(name, 'management fixture\n')
        self.assertEqual(freeze.check(self.root)['additionalFiles'], 4)

    def test_later_checkpoint_keeps_management_separate_and_still_rejects_source_changes(self):
        for name in freeze.MANAGEMENT_ADDITIONS:
            self.write(name, 'management fixture\n')
        revision = self.commit_change()
        tree = self.git('rev-parse', 'HEAD^{tree}').strip()
        self.git('tag', '-f', freeze.FROZEN_TAG, revision)
        with mock.patch.object(freeze, 'FROZEN_COMMIT', revision), mock.patch.object(freeze, 'FROZEN_TREE', tree):
            self.assertEqual(freeze.check(self.root)['frozenFiles'], 4)
            self.write('src/main.mjs', 'unreviewed source change\n')
            with self.assertRaisesRegex(freeze.FreezeError, 'changed frozen file'):
                freeze.check(self.root)

    def test_changed_commit_and_moved_tag_fail(self):
        self.write('src/main.mjs', 'later source\n')
        revision = self.commit_change()
        with self.assertRaisesRegex(freeze.FreezeError, 'commit: changed frozen file'):
            freeze.check(self.root, revision)
        self.git('tag', '-f', freeze.FROZEN_TAG, revision)
        with self.assertRaisesRegex(freeze.FreezeError, 'tag was moved'):
            freeze.check(self.root, self.commit)

    def test_missing_tag_still_uses_exact_commit_and_tree_pins(self):
        self.git('tag', '-d', freeze.FROZEN_TAG)
        self.assertEqual(freeze.check(self.root)['status'], 'PASS')
        with mock.patch.object(freeze, 'FROZEN_TREE', '0' * 40):
            with self.assertRaisesRegex(freeze.FreezeError, 'pinned source tree'):
                freeze.check(self.root)

    def test_materialize_uses_exact_clean_detached_source_without_later_files(self):
        self.write('notes/later.md', 'Later main note\n')
        self.commit_change()
        destination = Path(self.folder.name) / 'frozen'
        result = freeze.materialize(destination, self.root)
        self.assertTrue(result['detached'])
        self.assertEqual(subprocess.check_output(
            ['git', '-C', str(destination), 'rev-parse', 'HEAD'], text=True).strip(), self.commit)
        self.assertNotEqual(self.git('rev-parse', 'HEAD').strip(), self.commit)
        self.assertFalse((destination / 'notes/later.md').exists())
        self.assertEqual((destination / 'src/main.mjs').read_text(), 'export const frozen = true;\n')
        self.assertEqual(subprocess.check_output(
            ['git', '-C', str(destination), 'status', '--porcelain'], text=True), '')
        self.assertNotEqual(subprocess.run(
            ['git', '-C', str(destination), 'symbolic-ref', '-q', 'HEAD'],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE).returncode, 0)

    def test_materialize_refuses_existing_and_in_repository_destinations(self):
        with self.assertRaisesRegex(freeze.FreezeError, 'already exists'):
            freeze.materialize(self.root, self.root)
        with self.assertRaisesRegex(freeze.FreezeError, 'outside'):
            freeze.materialize(self.root / 'new-checkout', self.root)
        destination = Path(self.folder.name) / 'existing'
        destination.mkdir()
        sentinel = destination / 'keep.txt'
        sentinel.write_text('keep\n')
        with self.assertRaisesRegex(freeze.FreezeError, 'already exists'):
            freeze.materialize(destination, self.root)
        self.assertEqual(sentinel.read_text(), 'keep\n')

    def test_materialize_rejects_ignored_environment_injected_by_checkout_hook(self):
        hook = self.write('.git/hooks/post-checkout',
                          "#!/bin/sh\nprintf 'INJECTED=1\\n' > .env\n")
        hook.chmod(0o755)
        destination = Path(self.folder.name) / 'hook-injected'
        with self.assertRaisesRegex(freeze.FreezeError, r'source-sensitive addition: \.env'):
            freeze.materialize(destination, self.root)
        self.assertTrue((destination / '.env').is_file())
        self.assertFalse((self.root / '.env').exists())

    def test_revision_must_be_a_full_commit_sha(self):
        for value in ['HEAD', self.commit[:12], 'main', '--all']:
            with self.subTest(value=value), self.assertRaisesRegex(freeze.FreezeError, 'complete'):
                freeze.check(self.root, value)


if __name__ == '__main__':
    unittest.main()
