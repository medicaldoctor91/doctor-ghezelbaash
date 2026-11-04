"""Recover mutation journals across Actions runners before any repeated POST.

Only authenticated evidence for this exact workflow, reviewed source, approved
plan and frozen manifest is accepted. Missing evidence after an executed
operation requires owner-side inspection; a fresh runner is not a fresh release.
Importing this module never contacts GitHub or a publication provider.
"""
import argparse
import hashlib
import io
import json
import os
import re
from pathlib import Path
import tarfile
import zipfile

import requests

JOURNALS = {
    'kaggle-submission-attempt.json', 'notebook-submission-attempt.json',
    'site-deployment-attempt.json', 'zenodo-publish-attempt.json',
}
JOURNAL_ACTIONS = {'kaggle-submission-attempt.json':'create-dataset-version',
                   'notebook-submission-attempt.json':'push-notebook',
                   'site-deployment-attempt.json':'deploy-website',
                   'zenodo-publish-attempt.json':'publish'}
MAX_EVIDENCE_BYTES = 64 * 1024 * 1024
MUTATIONS = {'stage-draft', 'publish-frozen'}
OPERATIONS = MUTATIONS | {'inspect', 'preflight', 'verify-runtime', 'verify-publication'}


def begin_attempt(path, value):
    """Atomically persist an attempt before invoking a non-idempotent API."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open('x') as handle:
            json.dump(value, handle, ensure_ascii=False, sort_keys=True)
            handle.write('\n'); handle.flush(); os.fsync(handle.fileno())
    except FileExistsError as error:
        raise AssertionError('Publication POST already attempted; recover using owner/public reads: ' + path.name) from error


def write_context(work, operation, env=None):
    from release_plan import load_plan, canonical_sha
    env = os.environ if env is None else env
    approved = load_plan(); assert approved, 'Approved release plan is required'
    assert operation in OPERATIONS
    work = Path(work); work.mkdir(parents=True, exist_ok=True)
    frozen = work / 'frozen-sha256.json'
    context = {'schemaVersion': 1, 'operation': operation,
               'runId': int(env['GITHUB_RUN_ID']), 'runAttempt': int(env.get('GITHUB_RUN_ATTEMPT', '1')),
               'sourceCommit': env['GITHUB_SHA'], 'approvedReleasePlanSHA256': canonical_sha(approved),
               'frozenManifestSHA256': hashlib.sha256(frozen.read_bytes()).hexdigest() if frozen.exists() else None}
    assert context['sourceCommit'] == approved['refs']['buildSource']
    (work / 'release-workflow-context.json').write_text(json.dumps(context, indent=2) + '\n')
    return context


def restore_candidate(work, archive, env=None, session=None):
    """Authenticate the producing run and validate every tar header before extraction."""
    from release_plan import load_plan, canonical_sha
    env = os.environ if env is None else env
    approved = load_plan(); assert approved
    source = approved['refs']['buildSource']; work = Path(work)
    assert work.name == 'coordinated-release' and not work.exists() and not work.is_symlink(), 'Restore requires a fresh candidate directory'
    repository = env['GITHUB_REPOSITORY']; candidate_run = int(env['CANDIDATE_RUN'])
    assert re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository)
    assert candidate_run < int(env['GITHUB_RUN_ID']) and env['GITHUB_SHA'] == source
    if session is None:
        session = requests.Session()
        session.headers.update(Authorization='Bearer ' + env['GITHUB_TOKEN'], Accept='application/vnd.github+json')
    base = 'https://api.github.com/repos/' + repository
    def get(path):
        response = session.get(base + path, timeout=60); response.raise_for_status(); return response.json()
    run = get('/actions/runs/' + str(candidate_run))
    assert run['id'] == candidate_run and run['head_sha'] == source and run['event'] == 'workflow_dispatch'
    assert run['status'] == 'completed' and run['conclusion'] == 'success', 'Candidate producer did not complete successfully'
    assert run['path'].split('@')[0] == '.github/workflows/coordinated-doi-release.yml', 'Candidate belongs to another workflow'
    artifacts = get('/actions/runs/' + str(candidate_run) + '/artifacts?per_page=100')
    assert artifacts['total_count'] <= 100
    selected = [item for item in artifacts['artifacts'] if item['name'] == 'frozen-coordinated-candidate' and not item['expired']]
    assert len(selected) == 1, 'Frozen candidate artifact is unavailable or ambiguous'
    with tarfile.open(archive, 'r:gz') as packed:
        members = packed.getmembers(); assert len(members) <= 100000, 'Candidate has too many members'
        assert sum(member.size for member in members) <= 4 * 1024**3, 'Candidate exceeds its reviewed unpacked size bound'
        names = set()
        for member in members:
            path = Path(member.name)
            assert path.parts and not path.is_absolute() and '..' not in path.parts and path.parts[0] == 'coordinated-release', 'Unsafe candidate archive name'
            # Tar names with redundant separators or dot segments address the
            # same destination. Reject aliases before extracting any member.
            destination = path.parts
            assert destination not in names and (member.isfile() or member.isdir()) and not member.mode & 0o7000, 'Unsupported or duplicate candidate archive member'
            names.add(destination)
        marker = packed.getmember('coordinated-release/release-workflow-context.json')
        assert marker.isfile() and marker.size <= 1024 * 1024
        context = json.load(packed.extractfile(marker))
        assert context['schemaVersion'] == 1 and context['operation'] == 'preflight' and context['runId'] == candidate_run
        assert context['runAttempt'] == run['run_attempt'] and context['sourceCommit'] == source
        assert context['approvedReleasePlanSHA256'] == canonical_sha(approved), 'Candidate belongs to another approved plan'
        # All names/types were checked before creating any destination file;
        # links, device files and traversal cannot overwrite checkout or controls.
        packed.extractall(work.parent, members=members, filter='data')
    return {'status':'PASS','candidateRun':candidate_run,'artifactId':selected[0]['id'],'sourceCommit':source,'members':len(members)}


def recover_attempts(work, env=None, session=None):
    """GET-only history recovery; refuses incomplete or mismatched evidence."""
    from release_plan import load_plan, canonical_sha
    env = os.environ if env is None else env
    approved = load_plan(); assert approved
    assert env.get('GITHUB_RUN_ATTEMPT', '1') == '1', 'Start a new workflow run for recovery; do not rerun a publication attempt'
    repository = env['GITHUB_REPOSITORY']
    assert re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository)
    current = int(env['GITHUB_RUN_ID']); source = approved['refs']['buildSource']
    assert env['GITHUB_SHA'] == source
    work = Path(work); frozen = hashlib.sha256((work / 'frozen-sha256.json').read_bytes()).hexdigest()
    plan_hash = canonical_sha(approved)
    if session is None:
        session = requests.Session()
        session.headers.update(Authorization='Bearer ' + env['GITHUB_TOKEN'], Accept='application/vnd.github+json')
    base = 'https://api.github.com/repos/' + repository
    def get(path, **kwargs):
        response = session.get(base + path, timeout=60, **kwargs)
        response.raise_for_status(); return response
    runs = []
    for page in range(1, 1001):
        values = get('/actions/workflows/coordinated-doi-release.yml/runs', params={
            'head_sha': source, 'event': 'workflow_dispatch', 'per_page': 100, 'page': page}).json()['workflow_runs']
        runs.extend(run for run in values if run['id'] < current and run['head_sha'] == source)
        if len(values) < 100: break
    else:
        raise AssertionError('Workflow history exceeds the reviewed recovery bound')
    recovered = []; checked = []
    for run in sorted(runs, key=lambda item: item['id']):
        assert run['status'] == 'completed', ('A prior release run is still pending; wait for its evidence', run['id'])
        artifacts = get('/actions/runs/' + str(run['id']) + '/artifacts', params={'per_page': 100}).json()
        assert artifacts['total_count'] <= 100, 'Artifact inventory is incomplete'
        evidence = [item for item in artifacts['artifacts'] if item['name'] == 'coordinated-release-evidence' and not item['expired']]
        if not evidence:
            jobs = get('/actions/runs/' + str(run['id']) + '/jobs', params={'per_page': 100}).json()
            assert jobs['total_count'] <= 100, 'Job inventory is incomplete'
            executed = [step for job in jobs['jobs'] for step in job.get('steps', [])
                        if step['name'] == 'Execute validated release operation' and step.get('conclusion') != 'skipped']
            assert not executed, ('Prior executed release has no recoverable evidence; inspect provider state before another write', run['id'])
            checked.append({'runId': run['id'], 'operationExecuted': False}); continue
        assert len(evidence) == 1, 'Prior release evidence is ambiguous or incomplete'
        assert type(evidence[0]['size_in_bytes']) is int and evidence[0]['size_in_bytes'] <= MAX_EVIDENCE_BYTES, 'Recovery evidence exceeds the reviewed size bound'
        archive = get('/actions/artifacts/' + str(evidence[0]['id']) + '/zip').content
        assert len(archive) <= MAX_EVIDENCE_BYTES, 'Downloaded recovery evidence exceeds its size bound'
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            assert len(zipped.infolist()) <= 2000, 'Recovery evidence has too many entries'
            selected = {}
            names = set()
            for entry in zipped.infolist():
                name = entry.filename
                path = Path(name)
                assert not path.is_absolute() and '..' not in path.parts, 'Unsafe evidence archive name'
                assert name not in names and (entry.external_attr >> 16) & 0o170000 != 0o120000, 'Duplicate or symbolic evidence entry'
                names.add(name)
                if path.name in JOURNALS | {'release-workflow-context.json'}:
                    assert path.name not in selected, 'Duplicate recovery control'
                    assert entry.file_size <= 1024 * 1024, 'Recovery control exceeds its reviewed size bound'
                    selected[path.name] = zipped.read(name)
            assert 'release-workflow-context.json' in selected, 'Prior operation context is unavailable'
            context = json.loads(selected['release-workflow-context.json'])
            assert context['schemaVersion'] == 1 and context['runId'] == run['id'] and context['sourceCommit'] == source
            assert context['runAttempt'] == run['run_attempt'], 'Recovery evidence belongs to another workflow attempt'
            assert context['operation'] in OPERATIONS
            if context['operation'] not in MUTATIONS:
                assert not (set(selected) & JOURNALS), 'Unexpected attempt journal in a read-only run'
                checked.append({'runId': run['id'], 'operation': context['operation']}); continue
            assert context['approvedReleasePlanSHA256'] == plan_hash and context['frozenManifestSHA256'] == frozen, 'Prior mutation belongs to a different approved/frozen candidate'
            for name in sorted(set(selected) & JOURNALS):
                value = json.loads(selected[name])
                assert value['sourceCommit'] == source and value['action'] == JOURNAL_ACTIONS[name], 'Attempt journal source/action differs'
                if name == 'kaggle-submission-attempt.json': assert value['version'] == approved['policy']['coordinatedRelease']['kaggleTargetVersion']
                if name == 'notebook-submission-attempt.json': assert value['version'] == approved['policy']['coordinatedRelease']['notebookTargetVersion']
                if name == 'zenodo-publish-attempt.json': assert value['record'] == approved['policy']['currentArchive']['recordId']
                if name == 'site-deployment-attempt.json': assert value['frozenManifestSHA256'] == frozen
                target = work / name
                if target.exists(): assert json.loads(target.read_text()) == value, 'Attempt journal changed between runs'
                else: target.write_bytes(selected[name])
                recovered.append({'runId': run['id'], 'journal': name})
            checked.append({'runId': run['id'], 'operation': context['operation'], 'artifactId': evidence[0]['id']})
    report = {'status': 'PASS', 'sourceCommit': source, 'frozenManifestSHA256': frozen,
              'approvedReleasePlanSHA256': plan_hash, 'checked': checked, 'recovered': recovered, 'providerWrites': False}
    (work / 'cross-run-recovery.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('operation', choices=sorted(OPERATIONS | {'restore-candidate'}))
    parser.add_argument('--root', type=Path, default=Path('/tmp/coordinated-release')); args = parser.parse_args()
    if args.operation == 'restore-candidate':
        restore_candidate(args.root, '/tmp/frozen-artifact/candidate.tar.gz')
    else:
        write_context(args.root, args.operation)
        if args.operation == 'publish-frozen': recover_attempts(args.root)
