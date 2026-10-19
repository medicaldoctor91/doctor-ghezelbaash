"""Compare every staged Git path with final logical payload bytes, including LFS."""
import hashlib
import re
import subprocess
from pathlib import Path


def validate_index(repo, stage):
    repo, stage = Path(repo), Path(stage)
    entries = subprocess.check_output(['git', 'ls-files', '--stage', '-z'], cwd=repo).split(b'\0')
    expected = {p.relative_to(stage).as_posix(): p for p in stage.rglob('*') if p.is_file()}
    actual = {}
    for entry in filter(None, entries):
        info, name = entry.split(b'\t', 1)
        mode, oid, index_stage = info.decode().split()
        name = name.decode()
        assert index_stage == '0' and mode in {'100644', '100755'}, ('Invalid index entry', name)
        blob = subprocess.check_output(['git', 'cat-file', 'blob', oid], cwd=repo)
        transport = 'git'
        if blob.startswith(b'version https://git-lfs.github.com/spec/v1\n'):
            pointer = re.fullmatch(rb'version https://git-lfs.github.com/spec/v1\noid sha256:([0-9a-f]{64})\nsize ([0-9]+)\n', blob)
            assert pointer, ('Invalid LFS pointer', name)
            digest, size = pointer[1].decode(), int(pointer[2])
            location = subprocess.check_output(['git', 'rev-parse', '--git-path', 'lfs/objects'], cwd=repo, text=True).strip()
            objects = Path(location)
            if not objects.is_absolute(): objects = repo / objects
            blob = (objects / digest[:2] / digest[2:4] / digest).read_bytes()
            assert len(blob) == size and hashlib.sha256(blob).hexdigest() == digest, ('Invalid LFS object', name)
            transport = 'lfs'
        assert name in expected, ('Extra Git path', name)
        assert blob == expected[name].read_bytes(), ('Git logical bytes differ from stage', name)
        actual[name] = {'sha256': hashlib.sha256(blob).hexdigest(), 'transport': transport, 'bytes': len(blob)}
    assert set(actual) == set(expected), ('Git path coverage mismatch', sorted(set(expected)-set(actual)))
    return {'status': 'PASS', 'files': len(actual), 'objects': actual}
