"""Read-only provider audit and one durably journalled pre-C/M DOI operation.

The default command only performs GETs. Reservation requires a reviewed tag,
successful authenticated baselines and an authenticated GitHub intent artifact
uploaded before the operation. It never edits source or publishes a record.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
import time
import zipfile

import requests

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = '.github/workflows/inspect-media-delivery.yml'
STEP = 'Execute real DOI reservation'
INTENT_ARTIFACT = 'release-bootstrap-intent'
EVIDENCE_ARTIFACT = 'release-bootstrap-evidence'
HF = 'doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data'
KG = 'saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data'
NB = 'saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter'
ACCOUNT = '884d1d90bd1fb6ecca14992c6c60d677'
MAX_ARTIFACT = 8 * 1024 * 1024
SHA = re.compile(r'[a-f0-9]{40}')


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':')).encode()).hexdigest()


def dump(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    with temporary.open('w') as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write('\n'); handle.flush(); os.fsync(handle.fileno())
    temporary.replace(path)


def policy():
    assert not os.environ.get('RELEASE_PLAN_PATH'), 'Bootstrap precedes the finalized release plan'
    return json.loads((ROOT / 'src/canonical/doi-policy.json').read_text())


def context(env=None):
    env = os.environ if env is None else env
    source = env['GITHUB_SHA']
    assert SHA.fullmatch(source) and source == env['REVIEWED_COMMIT'], 'Exact reviewed bootstrap commit required'
    repository = env['GITHUB_REPOSITORY']
    assert re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository)
    assert env['GITHUB_WORKFLOW_REF'].startswith(repository + '/' + WORKFLOW + '@'), 'Unexpected bootstrap workflow'
    p = policy()
    return {'schemaVersion': 1, 'repository': repository, 'workflowPath': WORKFLOW,
            'sourceCommit': source, 'toolSHA256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'canonicalPolicySHA256': digest(p), 'previousRecord': p['currentArchive']['recordId'],
            'conceptDoi': p['concept']['doi'], 'runId': int(env['GITHUB_RUN_ID']),
            'runAttempt': int(env.get('GITHUB_RUN_ATTEMPT', '1')), 'reviewedRef': env['GITHUB_REF']}


def session(token):
    result = requests.Session()
    if token:
        result.headers.update(Authorization='Bearer ' + token)
    result.headers.update({'Accept': 'application/json', 'Cache-Control': 'no-cache'})
    return result


def get(client, url, **kwargs):
    response = client.get(url, timeout=60, **kwargs)
    response.raise_for_status()
    return response.json()


def doi(value):
    return (value.get('doi') or value.get('metadata', {}).get('prereserve_doi', {}).get('doi')
            or (value.get('pids', {}).get('doi') or {}).get('identifier'))


def zenodo_state(client, p):
    previous, concept = p['currentArchive'], p['concept']
    parent = get(client, 'https://zenodo.org/api/records/' + str(previous['recordId']))
    assert parent['id'] == previous['recordId'] and parent['doi'] == previous['doi'], 'Previous archive differs'
    assert parent['conceptdoi'] == concept['doi'], 'Previous collection differs'
    latest = get(client, 'https://zenodo.org/api/records/' + str(previous['recordId']) + '/versions/latest')
    assert latest['id'] == previous['recordId'] and latest['conceptdoi'] == concept['doi'], 'A newer or unrelated published archive exists'
    assert latest['doi'] == previous['doi'], 'Latest published archive DOI differs'
    files = {item['key']: item['checksum'] for item in parent['files']}
    assert files and len(files) == len(parent['files']), 'Invalid previous archive inventory'
    published = get(client, 'https://zenodo.org/api/deposit/depositions/' + str(previous['recordId']))
    assert published['id'] == parent['id'] and published.get('submitted') is True, 'Previous owner record is not published'
    assert str(published['conceptrecid']) == str(concept['recordId']), 'Owner collection differs'
    entries = get(client, 'https://zenodo.org/api/deposit/depositions',
                  params={'q': 'conceptrecid:' + str(concept['recordId']), 'size': 100})
    assert isinstance(entries, list) and len(entries) < 100, 'Complete bounded draft inventory required'
    pending = [entry for entry in entries if str(entry.get('conceptrecid')) == str(concept['recordId'])
               and not entry.get('submitted')]
    assert len(pending) <= 1, 'Multiple family drafts require owner-side inspection'
    if pending:
        draft = pending[0]
        assert draft['id'] != parent['id'], 'Published record cannot be the new draft'
        for key in ('title', 'description'):
            assert draft['metadata'].get(key) == parent['metadata'].get(key), 'Existing draft has independent metadata changes'
        if doi(draft):
            assert doi(draft) == '10.5281/zenodo.' + str(draft['id']), 'Draft DOI/record mismatch'
    return {'parent': parent, 'draft': pending[0] if pending else None,
            'publicFileChecksums': files, 'previousArchiveInventorySHA256': digest(files),
            'parentMetadataSHA256': digest(parent['metadata']), 'familyCount': len(entries)}


def published_controls(client, state, p):
    """Download only three known public controls and verify their record checksums."""
    result = {}; checksums = state['publicFileChecksums']
    record = p['currentArchive']['recordId']
    for name in ('doi-policy.json', 'release-provenance.json', 'archive-provenance.json'):
        checksum = checksums[name]
        algorithm, expected = checksum.split(':', 1)
        assert algorithm in {'md5', 'sha256'}, 'Unsupported public archive checksum'
        response = client.get(f'https://zenodo.org/api/records/{record}/files/{name}/content', timeout=60)
        response.raise_for_status()
        assert len(response.content) <= 4 * 1024 * 1024, 'Published archive control exceeds bound'
        assert hashlib.new(algorithm, response.content).hexdigest() == expected, 'Published archive control checksum differs'
        result[name] = json.loads(response.content)
    previous = result['doi-policy.json']; source = previous['currentArchive']['sourceCommit']
    assert previous['currentArchive']['recordId'] == record and previous['concept'] == p['concept'], 'Published archive policy identity differs'
    assert SHA.fullmatch(source), 'Published scientific source is not exact'
    delivery = previous['currentArchive'].get('deliverySourceCommit', source)
    assert SHA.fullmatch(delivery), 'Published delivery source is not exact'
    for name in ('release-provenance.json', 'archive-provenance.json'):
        control = result[name]
        assert control['sourceCommit'] == delivery, 'Published delivery source controls disagree'
        assert control.get('deliverySourceCommit', delivery) == delivery, 'Published explicit delivery source differs'
        assert control.get('originalScientificSourceCommit', source) == source, 'Published scientific source controls disagree'
        if 'doiPolicy' in control:
            assert control['doiPolicy'] == previous, 'Published provenance policy differs from published policy'
    assert previous['currentArchive'].get('originalScientificSourceCommit', source) == source, 'Published original scientific source differs'
    return result


def safe_zenodo(state):
    draft = state['draft']
    return {'authenticated': True, 'publishedRecord': state['parent']['id'],
            'publishedDoi': state['parent']['doi'], 'conceptDoi': state['parent']['conceptdoi'],
            'familyInventoryCount': state['familyCount'],
            'publicFileChecksums': state['publicFileChecksums'],
            'previousArchiveInventorySHA256': state['previousArchiveInventorySHA256'],
            'parentMetadataSHA256': state['parentMetadataSHA256'],
            'draft': None if draft is None else {'record': draft['id'], 'doi': doi(draft),
                    'metadataSHA256': digest(draft['metadata']), 'submitted': draft.get('submitted', False)}}


def audit(root, env=None, clients=None, kaggle=None):
    """Independent GET-only outcomes; errors never include response bodies or tokens."""
    env = os.environ if env is None else env
    clients = {} if clients is None else clients
    root = Path(root); root.mkdir(parents=True, exist_ok=True)
    p = policy(); marker = context(env)
    dump(root / 'bootstrap-context.json', marker)
    dump(root / 'canonical-policy-before.json', p)
    report = {'schemaVersion': 1, 'observedUTC': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'context': marker, 'providerWrites': False,
              'writePermissionProven': False, 'providers': {}}

    def check(name, token_name, callback):
        if not env.get(token_name):
            report['providers'][name] = {'authenticated': False, 'status': 'MISSING_CREDENTIAL'}
            return
        try:
            report['providers'][name] = callback(clients.get(name) or session(env[token_name]))
        except Exception as error:
            response = getattr(error, 'response', None)
            report['providers'][name] = {'authenticated': False, 'status': 'FAILED',
                                        'errorType': type(error).__name__,
                                        'httpStatus': getattr(response, 'status_code', None)}
            if isinstance(error, ModuleNotFoundError):
                missing = error.name
                if isinstance(missing, str) and re.fullmatch(r'[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*', missing) and len(missing) <= 120:
                    report['providers'][name]['missingModule'] = missing

    def zn(client):
        state = zenodo_state(client, p)
        controls = published_controls(client, state, p)
        dump(root / 'previous-policy.json', controls['doi-policy.json'])
        dump(root / 'previous-release-provenance.json', controls['release-provenance.json'])
        dump(root / 'previous-archive-provenance.json', controls['archive-provenance.json'])
        result = safe_zenodo(state)
        result.update(previousPolicySHA256=digest(controls['doi-policy.json']),
                      previousArchiveSourceCommit=controls['doi-policy.json']['currentArchive']['sourceCommit'],
                      previousArchiveDeliverySourceCommit=controls['release-provenance.json']['sourceCommit'],
                      publicControlsChecksumVerified=True)
        return result
    check('zenodo', 'ZENODO_TOKEN', zn)

    def hf(client):
        identity = get(client, 'https://huggingface.co/api/whoami-v2')
        repo = get(client, 'https://huggingface.co/api/datasets/' + HF)
        assert SHA.fullmatch(repo['sha']), 'HF revision is not exact'
        return {'authenticated': True, 'account': identity['name'], 'repository': HF,
                'revision': repo['sha'], 'tokenRole': (identity.get('auth', {}).get('accessToken') or {}).get('role'),
                'writePermissionProven': False}
    check('hf', 'HF_TOKEN', hf)

    def kg(client):
        if kaggle is None:
            from kaggle.api.kaggle_api_extended import KaggleApi
            owner = KaggleApi(); owner.authenticate()
        else:
            owner = kaggle
        state = json.loads(owner.dataset_status(KG, format='json(status,current_version_number)'))
        public = get(client, 'https://api.kaggle.com/v1/datasets/view/' + KG)
        notebook = get(client, 'https://www.kaggle.com/api/v1/kernels/pull/' + NB)
        return {'authenticated': True, 'dataset': KG, 'ownerVersion': state['current_version_number'],
                'ownerStatus': state['status'].lower(), 'publicDefaultVersion': public['currentVersionNumber'],
                'notebook': NB, 'notebookVersion': notebook['metadata']['currentVersionNumber'],
                'notebookStatus': str(owner.kernels_status(NB).status).lower(), 'writePermissionProven': False}
    # The SDK authenticates the owner read; do not send its token to public endpoints.
    check('kaggle', 'KAGGLE_API_TOKEN', lambda unused: kg(clients.get('public') or session(None)))

    def cf(client):
        assert env.get('CLOUDFLARE_ACCOUNT_ID', ACCOUNT) == ACCOUNT, 'Unexpected Cloudflare account'
        result = get(client, 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT + '/pages/projects/doctor-ghezelbaash')
        assert result['success'], 'Cloudflare project inaccessible'
        project = result['result']; config = (project.get('source') or {}).get('config') or {}
        deployment = project.get('canonical_deployment') or {}
        return {'authenticated': True, 'project': project['name'], 'deploymentId': deployment.get('id'),
                'deploymentSourceCommit': ((deployment.get('deployment_trigger') or {}).get('metadata') or {}).get('commit_hash'),
                'deploymentsEnabled': config.get('deployments_enabled'),
                'productionBranch': config.get('production_branch'),
                'productionDeploymentsEnabled': config.get('production_deployments_enabled'),
                'previewDeploymentSetting': config.get('preview_deployment_setting'),
                'writePermissionProven': False}
    check('cloudflare', 'CLOUDFLARE_API_TOKEN', cf)
    try:
        provenance = get(clients.get('public') or session(None), 'https://www.ghezelbaash.ir/release-provenance.json')
        assert SHA.fullmatch(provenance['sourceCommit'])
        report['website'] = {'sourceCommit': provenance['sourceCommit']}
    except Exception as error:
        report['website'] = {'status': 'FAILED', 'errorType': type(error).__name__}
    report['allAuthenticatedReadsPassed'] = all(report['providers'][name].get('authenticated')
                                               for name in ('zenodo', 'hf', 'kaggle', 'cloudflare'))
    dump(root / 'access-audit.json', report)
    return report


def require_baselines(report):
    assert report['allAuthenticatedReadsPassed'], 'Authenticated provider baseline checks are incomplete'
    providers = report['providers']; kg = providers['kaggle']; cf = providers['cloudflare']
    assert kg['ownerStatus'] == 'ready' and kg['ownerVersion'] == kg['publicDefaultVersion'], 'Kaggle baseline is pending or divergent'
    assert kg['ownerVersion'] > 0 and kg['notebookVersion'] > 0 and 'complete' in kg['notebookStatus'], 'Notebook baseline is incomplete'
    assert cf['deploymentId'] and cf['productionDeploymentsEnabled'] is False, 'Automatic production deployment must be disabled'
    assert cf['deploymentsEnabled'] is False, 'Automatic Git deployments must be disabled'
    assert cf['previewDeploymentSetting'] == 'none', 'Automatic preview deployment must be disabled'
    assert SHA.fullmatch(report['website'].get('sourceCommit', '')), 'Website source baseline missing'
    assert cf['deploymentSourceCommit'] == report['website']['sourceCommit'], 'Cloudflare deployment and public website source differ'


def archive_controls(content):
    assert len(content) <= MAX_ARTIFACT, 'Bootstrap evidence exceeds bound'
    selected = {}; names = set()
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        assert len(archive.infolist()) <= 100, 'Bootstrap evidence has too many entries'
        for entry in archive.infolist():
            path = Path(entry.filename)
            assert not path.is_absolute() and '..' not in path.parts, 'Unsafe bootstrap evidence name'
            assert path.parts not in names and (entry.external_attr >> 16) & 0o170000 != 0o120000, 'Duplicate or symbolic bootstrap evidence'
            names.add(path.parts)
            if path.name in {'bootstrap-intent.json', 'reservation.json', 'reservation-outcome.json'}:
                assert path.name not in selected and entry.file_size <= 1024 * 1024, 'Ambiguous or oversized bootstrap control'
                selected[path.name] = json.loads(archive.read(entry))
    return selected


class History:
    """Only authenticated Actions GETs; never accepts caller-provided artifact URLs."""
    def __init__(self, env, client=None):
        self.env = env; self.client = client or session(env['GITHUB_TOKEN'])
        self.base = 'https://api.github.com/repos/' + env['GITHUB_REPOSITORY']

    def read(self, path, **kwargs):
        return get(self.client, self.base + path, **kwargs)

    def artifacts(self, run):
        result = self.read('/actions/runs/' + str(run) + '/artifacts', params={'per_page': 100})
        assert result['total_count'] <= 100, 'Incomplete artifact inventory'
        return result['artifacts']

    def controls(self, item):
        assert not item['expired'] and item['size_in_bytes'] <= MAX_ARTIFACT, 'Bootstrap artifact unavailable'
        response = self.client.get(self.base + '/actions/artifacts/' + str(item['id']) + '/zip', timeout=60)
        response.raise_for_status()
        return archive_controls(response.content)

    def validate_intent(self, intent, marker, run):
        old = intent['context']
        assert old['runId'] == run['id'] and old['runAttempt'] == run['run_attempt'], 'Intent run binding differs'
        assert run['head_sha'] == old['sourceCommit'], 'Intent source differs from authenticated run'
        for key in ('schemaVersion', 'repository', 'workflowPath', 'sourceCommit', 'toolSHA256',
                    'canonicalPolicySHA256', 'previousRecord', 'conceptDoi', 'reviewedRef'):
            assert old[key] == marker[key], 'Previous reservation belongs to another reviewed bootstrap binding: ' + key
        assert intent['action'] in {'new-version', 'reserve-doi', 'recover-existing'}, 'Unexpected reservation action'

    def prior(self, marker):
        runs = []
        for page in range(1, 101):
            value = self.read('/actions/workflows/inspect-media-delivery.yml/runs',
                              params={'event': 'workflow_dispatch', 'per_page': 100, 'page': page})
            batch = value['workflow_runs']
            runs.extend(run for run in batch if run['id'] < marker['runId'])
            if len(batch) < 100:
                break
        else:
            raise AssertionError('Bootstrap workflow history exceeds recovery bound')
        recovered = []
        for run in sorted(runs, key=lambda item: item['id']):
            assert run['event'] == 'workflow_dispatch' and run['path'].split('@')[0] == WORKFLOW
            assert run['status'] == 'completed', 'A prior bootstrap run is still active'
            artifacts = self.artifacts(run['id'])
            intents = [item for item in artifacts if item['name'] == INTENT_ARTIFACT]
            if not intents:
                jobs = self.read('/actions/runs/' + str(run['id']) + '/jobs', params={'per_page': 100})
                assert jobs['total_count'] <= 100, 'Incomplete prior jobs inventory'
                executed = [step for job in jobs['jobs'] for step in job.get('steps', [])
                            if step['name'] == STEP and step.get('conclusion') != 'skipped']
                assert not executed, 'Prior reservation execution has no durable intent; inspect owner state'
                continue
            assert len(intents) == 1, 'Ambiguous prior reservation intents'
            controls = self.controls(intents[0]); intent = controls['bootstrap-intent.json']
            self.validate_intent(intent, marker, run)
            recovered.append(intent)
        return recovered

    def current(self, intent):
        marker = intent['context']; run = self.read('/actions/runs/' + str(marker['runId']))
        assert run['event'] == 'workflow_dispatch' and run['path'].split('@')[0] == WORKFLOW
        assert run['status'] == 'in_progress', 'Reservation must execute in its original active run'
        self.validate_intent(intent, marker, run)
        selected = [item for item in self.artifacts(run['id']) if item['name'] == INTENT_ARTIFACT]
        assert len(selected) == 1, 'Durable current reservation intent is unavailable'
        assert self.controls(selected[0])['bootstrap-intent.json'] == intent, 'Durable intent differs from local intent'


def choose_action(state, prior):
    draft = state['draft']
    if draft and doi(draft):
        return 'recover-existing'
    attempted_doi = [item for item in prior if item['action'] == 'reserve-doi']
    assert not attempted_doi, 'A prior DOI reservation remains unresolved; do not repeat its POST'
    if draft:
        return 'reserve-doi'
    assert not any(item['action'] == 'new-version' for item in prior), 'A prior new-version outcome remains unresolved; do not repeat its POST'
    return 'new-version'


def prepare(root, env=None, history=None, auditor=None, zenodo=None):
    env = os.environ if env is None else env
    root = Path(root); marker = context(env)
    assert marker['runAttempt'] == 1, 'Start a new workflow run; never rerun a reservation attempt'
    assert marker['reviewedRef'].startswith('refs/tags/'), 'Reservation requires an immutable reviewed bootstrap tag'
    report = (auditor or audit)(root, env)
    require_baselines(report)
    history = history or History(env)
    prior = history.prior(marker)
    state = zenodo_state(zenodo or session(env['ZENODO_TOKEN']), policy())
    intent = {'schemaVersion': 1, 'context': marker, 'action': choose_action(state, prior),
              'zenodoBaseline': safe_zenodo(state), 'auditSHA256': digest(report),
              'priorReservationRuns': [item['context']['runId'] for item in prior]}
    target = root / 'bootstrap-intent.json'
    assert not target.exists(), 'A bootstrap intent already exists in this work directory'
    dump(target, intent)
    return intent


def receipt(state, p):
    draft = state['draft']; assert draft and doi(draft), 'Real reserved DOI is not yet observable'
    return {'previousRecord': p['currentArchive']['recordId'], 'reservedRecord': draft['id'],
            'reservedDoi': doi(draft), 'conceptDoi': p['concept']['doi'], 'published': False}


def reserve(root, env=None, history=None, zenodo=None):
    env = os.environ if env is None else env
    root = Path(root); marker = context(env)
    assert marker['runAttempt'] == 1 and marker['reviewedRef'].startswith('refs/tags/'), 'Original reviewed tag run required'
    intent = json.loads((root / 'bootstrap-intent.json').read_text())
    assert intent['context'] == marker, 'Local intent belongs to another run/source'
    report = json.loads((root / 'access-audit.json').read_text())
    assert digest(report) == intent['auditSHA256'], 'Access audit changed after durable intent'
    require_baselines(report)
    history = history or History(env); history.current(intent)
    prior = history.prior(marker)
    client = zenodo or session(env['ZENODO_TOKEN']); p = policy()
    state = zenodo_state(client, p)
    assert choose_action(state, prior) == intent['action'], 'Zenodo state changed after durable intent'
    baseline = safe_zenodo(state)
    assert baseline == intent['zenodoBaseline'], 'Zenodo baseline changed after durable intent'
    action = intent['action']
    if action != 'recover-existing':
        from release_recovery import begin_attempt
        begin_attempt(root / 'zenodo-bootstrap-attempt.json', {'context': marker, 'action': action,
                      'record': state['draft']['id'] if state['draft'] else p['currentArchive']['recordId']})
        if action == 'new-version':
            endpoint = 'records/' + str(p['currentArchive']['recordId']) + '/versions'
        else:
            endpoint = 'records/' + str(state['draft']['id']) + '/draft/pids/doi'
        response = client.post('https://zenodo.org/api/' + endpoint, json={}, timeout=90)
        response.raise_for_status()
        # Exactly one POST per run. All subsequent work is owner/public GET.
        state = zenodo_state(client, p)
        assert state['draft'], 'Reservation outcome is not yet observable; retain durable intent'
    result = {'status': 'RESERVED' if doi(state['draft']) else 'NEEDS_DOI_RESERVATION',
              'action': action, 'record': state['draft']['id'], 'providerWrites': action != 'recover-existing',
              'published': False, 'context': marker}
    dump(root / 'reservation-outcome.json', result)
    if doi(state['draft']):
        dump(root / 'reservation.json', receipt(state, p))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', nargs='?', default='access-audit',
                        choices=['access-audit', 'prepare-reservation', 'reserve'])
    parser.add_argument('--root', type=Path, default=Path('/tmp/release-bootstrap'))
    args = parser.parse_args()
    try:
        result = {'access-audit': audit, 'prepare-reservation': prepare, 'reserve': reserve}[args.operation](args.root)
        # Reports are whitelisted; never print credentials, headers or raw provider responses.
        print(json.dumps(result, ensure_ascii=False), flush=True)
    except Exception as error:
        failure = {'status': 'BLOCKED', 'operation': args.operation, 'errorType': type(error).__name__}
        # Assertion text is authored here; HTTP/provider exceptions can contain sensitive bodies/URLs.
        if isinstance(error, AssertionError):
            failure['reason'] = str(error)
        dump(args.root / 'bootstrap-failure.json', failure)
        print(json.dumps(failure), flush=True)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
