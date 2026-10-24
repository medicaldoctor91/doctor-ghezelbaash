"""Check the frozen source and materialize it independently of later main files.

This is an integrity check, not a substitute for GitHub server-side protection.
It never builds, publishes, edits, removes, or resets the current source tree.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys


FROZEN_COMMIT = 'fd4c523bbbc4103f10be89cec152dfdd436655aa'
FROZEN_TREE = '98c37613e7349f9f9070cbf3fe93f259a229183f'
FROZEN_FILE_COUNT = 182
FROZEN_TAG = 'source-frozen-2026-10-24'
ROOT = Path(__file__).resolve().parents[2]
MANAGEMENT_ADDITIONS = frozenset({
    '.github/scripts/source_freeze.py',
    '.github/workflows/source-integrity.yml',
    'tests/source-freeze.test.py',
    'docs/source-freeze.md',
})
SOURCE_DIRECTORIES = frozenset({'src', 'public', 'build', '.github', 'tests'})
NOTE_SUFFIXES = frozenset({'.md', '.txt', '.rst'})


class FreezeError(RuntimeError):
    pass


def git(root: Path, *args: str, input_bytes: bytes | None = None) -> bytes:
    result = subprocess.run(
        ['git', '-C', str(root), *args], input=input_bytes,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    if result.returncode:
        # Do not echo arbitrary Git diagnostics, environment, or remote URLs.
        raise FreezeError('Git operation failed: ' + args[0])
    return result.stdout


def _tree(root: Path, revision: str) -> dict[str, tuple[str, str]]:
    result = {}
    for record in git(root, 'ls-tree', '-rz', '--full-tree', revision).split(b'\0'):
        if not record:
            continue
        metadata, name = record.split(b'\t', 1)
        mode, kind, oid = metadata.decode('ascii').split()
        if kind != 'blob':
            raise FreezeError('Unsupported source entry: ' + os.fsdecode(name))
        result[os.fsdecode(name)] = (mode, oid)
    return result


def _baseline(root: Path) -> dict[str, tuple[str, str]]:
    actual_tree = git(root, 'rev-parse', FROZEN_COMMIT + '^{tree}').decode().strip()
    if actual_tree != FROZEN_TREE:
        raise FreezeError('Frozen commit does not have the pinned source tree')
    baseline = _tree(root, FROZEN_COMMIT)
    if len(baseline) != FROZEN_FILE_COUNT:
        raise FreezeError('Frozen source file count differs')
    present = subprocess.run(
        ['git', '-C', str(root), 'show-ref', '--verify', '--quiet',
         'refs/tags/' + FROZEN_TAG], check=False,
    ).returncode
    if present == 0:
        tag_commit = git(root, 'rev-parse', 'refs/tags/' + FROZEN_TAG + '^{commit}').decode().strip()
        if tag_commit != FROZEN_COMMIT:
            raise FreezeError('Frozen source tag was moved')
    elif present != 1:
        raise FreezeError('Unable to inspect frozen source tag')
    return baseline


def _allowed_addition(name: str, mode: str) -> bool:
    if name in MANAGEMENT_ADDITIONS:
        return mode == '100644'
    path = Path(name)
    if not path.parts or path.parts[0] in SOURCE_DIRECTORIES:
        return False
    # New code, environment files and configuration are not independent notes.
    if any(part.startswith('.') for part in path.parts):
        return False
    return (mode == '100644' and path.suffix.lower() in NOTE_SUFFIXES and
            (len(path.parts) == 1 or path.parts[0] in {'docs', 'notes'}))


def _compare(baseline: dict[str, tuple[str, str]],
             current: dict[str, tuple[str, str]], scope: str) -> list[str]:
    errors = []
    for name, expected in baseline.items():
        if name not in current:
            errors.append(scope + ': missing frozen file: ' + name)
        elif current[name] != expected:
            errors.append(scope + ': changed frozen file: ' + name)
    for name in sorted(set(current) - set(baseline)):
        if not _allowed_addition(name, current[name][0]):
            errors.append(scope + ': source-sensitive addition: ' + name)
    return errors


def _index(root: Path) -> dict[str, tuple[str, str]]:
    result = {}
    for record in git(root, 'ls-files', '--stage', '-z').split(b'\0'):
        if not record:
            continue
        metadata, name = record.split(b'\t', 1)
        mode, oid, stage = metadata.decode('ascii').split()
        if stage != '0':
            raise FreezeError('Unmerged index entry: ' + os.fsdecode(name))
        result[os.fsdecode(name)] = (mode, oid)
    return result


def _snapshot(root: Path, name: str) -> tuple[str, str] | None:
    path = root / name
    for parent in path.parents:
        if parent == root:
            break
        if parent.is_symlink():
            raise FreezeError('Source directory replaced by symlink: ' + name)
    try:
        mode = path.lstat().st_mode
    except FileNotFoundError:
        return None
    if stat.S_ISLNK(mode):
        body, git_mode = os.fsencode(os.readlink(path)), '120000'
    elif stat.S_ISREG(mode):
        body = path.read_bytes()
        git_mode = '100755' if mode & stat.S_IXUSR else '100644'
    else:
        raise FreezeError('Unsupported source file type: ' + name)
    oid = hashlib.sha1(b'blob ' + str(len(body)).encode('ascii') + b'\0' + body).hexdigest()
    return git_mode, oid


def _ignored_generated(root: Path, name: str) -> bool:
    parts = Path(name.rstrip('/')).parts
    if not parts:
        return False
    path = root / name
    if path.is_symlink():
        return False
    generated_root = root / parts[0]
    if (parts[0] in {'node_modules', 'dist', '.astro'} and
            generated_root.is_dir() and not generated_root.is_symlink()):
        return True
    if path.is_file() and (parts[-1] == '.DS_Store' or
                           ('__pycache__' in parts and path.suffix == '.pyc')):
        return True
    # Git can collapse an otherwise empty parent such as tools/ around an old
    # ignored __pycache__. A cache directory must contain only real cache files;
    # arbitrary .astro/.py files there are still source-sensitive additions.
    if name.endswith('/') and path.is_dir() and not path.is_symlink():
        return all(_ignored_generated(root, item.relative_to(root).as_posix())
                   for item in path.rglob('*') if not item.is_dir() or item.is_symlink())
    return False


def check(root: Path = ROOT, revision: str | None = None) -> dict:
    root = Path(root).resolve()
    baseline = _baseline(root)
    if revision is not None:
        if re.fullmatch(r'[a-f0-9]{40}', revision) is None:
            raise FreezeError('Revision must be a complete 40-character commit SHA')
        actual = git(root, 'rev-parse', revision + '^{commit}').decode().strip()
        if actual != revision:
            raise FreezeError('Revision does not identify the exact requested commit')
        current = _tree(root, revision)
        errors = _compare(baseline, current, 'commit')
        scope = revision
    else:
        index = _index(root)
        errors = _compare(baseline, index, 'index')
        current = {}
        # Include ignored source inputs too: .env must not be concealed by ignore rules.
        others = git(root, 'ls-files', '--others', '--exclude-standard', '-z')
        ignored = git(root, 'ls-files', '--others', '--ignored',
                      '--exclude-standard', '--directory', '-z')
        names = set(baseline) | set(index)
        names.update(os.fsdecode(value) for value in others.split(b'\0') if value)
        names.update(os.fsdecode(value) for value in ignored.split(b'\0')
                     if value and not _ignored_generated(root, os.fsdecode(value)))
        for name in sorted(names):
            if name.endswith('/'):
                errors.append('worktree: source-sensitive ignored directory: ' + name)
                continue
            value = _snapshot(root, name)
            if value is not None:
                current[name] = value
        errors.extend(_compare(baseline, current, 'worktree'))
        scope = 'index and working tree'
    if errors:
        raise FreezeError('\n'.join(errors))
    return {'status': 'PASS', 'frozenCommit': FROZEN_COMMIT,
            'frozenTree': FROZEN_TREE, 'frozenFiles': len(baseline),
            'checked': scope, 'additionalFiles': len(set(current) - set(baseline)),
            'serverSideProtection': 'Not established by this local integrity check'}


def materialize(destination: Path, root: Path = ROOT) -> dict:
    root = Path(root).resolve()
    _baseline(root)
    destination = Path(destination).absolute()
    # lexists catches broken symlinks; resolve catches an outside path through a root symlink.
    if os.path.lexists(destination):
        raise FreezeError('Destination already exists')
    destination = destination.resolve()
    if destination == root or root in destination.parents:
        raise FreezeError('Destination must be outside the current source tree')
    git(root, 'worktree', 'add', '--detach', str(destination), FROZEN_COMMIT)
    if git(destination, 'rev-parse', 'HEAD').decode().strip() != FROZEN_COMMIT:
        raise FreezeError('Materialized checkout has the wrong source identity')
    if _tree(destination, 'HEAD') != _baseline(root):
        raise FreezeError('Materialized checkout differs from the frozen source')
    if git(destination, 'status', '--porcelain', '--untracked-files=all'):
        raise FreezeError('Materialized checkout is not clean')
    # A clean Git status alone omits ignored inputs such as .env. Check physical
    # source bytes and all ignored/untracked inputs before calling this isolated.
    check(destination)
    return {'status': 'PASS', 'destination': str(destination),
            'frozenCommit': FROZEN_COMMIT, 'frozenTree': FROZEN_TREE,
            'detached': True, 'buildExecuted': False, 'platformWrites': False}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    check_parser = commands.add_parser('check', help='Verify the frozen files without building')
    check_parser.add_argument('--revision', help='Complete commit SHA; otherwise check index and worktree')
    materialize_parser = commands.add_parser('materialize', help='Create a clean, detached frozen checkout')
    materialize_parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    try:
        result = check(revision=args.revision) if args.command == 'check' else materialize(args.destination)
    except (FreezeError, OSError) as error:
        print(json.dumps({'status': 'FAIL', 'reason': str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
