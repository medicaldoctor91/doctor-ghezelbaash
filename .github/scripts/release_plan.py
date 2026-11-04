"""Validated, external release bindings. Importing this module never contacts a provider.

The checked-in DOI policy remains the last published edition. A new edition is
selected only by a reviewed RELEASE_PLAN_PATH, with a separately captured old
policy and real reservation receipt. Neither an old environment pin nor a merge
commit may silently become the source of that edition.
"""
import argparse
import copy
import hashlib
import json
import os
import re
import subprocess
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANAGEMENT = {
    '.github/scripts/source_freeze.py', '.github/workflows/source-integrity.yml',
    'tests/source-freeze.test.py', 'docs/source-freeze.md',
}
SHA = re.compile(r'[a-f0-9]{40}')
HASH = re.compile(r'[a-f0-9]{64}')


def canonical_sha(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                    separators=(',', ':')).encode()).hexdigest()


def _commit(value):
    assert isinstance(value, str) and SHA.fullmatch(value), 'Expected exact 40-character commit'
    return value


def _archive(policy):
    concept, archive, binding = policy['concept'], policy['currentArchive'], policy['downloadBindings']
    for item in (concept, archive):
        assert type(item['recordId']) is int and item['recordId'] > 0
        assert item['doi'] == '10.5281/zenodo.' + str(item['recordId']), 'Record/DOI mismatch'
        assert item['url'] == 'https://doi.org/' + item['doi'], 'DOI URL mismatch'
    record = archive['recordId']
    assert record != concept['recordId'], 'Concept is not an exact snapshot'
    assert binding['recordId'] == record
    assert binding['publicPrefix'] == f'https://zenodo.org/records/{record}/files/'
    assert binding['apiPrefix'] == f'https://zenodo.org/api/records/{record}/files/'
    assert binding['bundle'].startswith(binding['publicPrefix']) and binding['bundle'].endswith('.zip')
    assert '/' not in binding['bundle'].removeprefix(binding['publicPrefix']), 'Unexpected bundle path'
    return archive


def validate_plan(plan):
    assert plan['schemaVersion'] == 1, 'Unsupported approved release plan'
    assert plan['context'] in {'new-reserved', 'published-maintenance'}
    p, old = plan['policy'], plan['previousPolicy']
    assert len(plan['approvedPublicationScope']) == 5 and set(plan['approvedPublicationScope']) == {'website', 'hf', 'kaggle', 'notebook', 'zenodo_dataset'}
    assert p['canonicalDatasetIri'] == 'https://www.ghezelbaash.ir/graph.jsonld/dataset', 'Canonical Dataset identity changed'
    assert plan['identity'] == {
        'personIri': 'https://www.ghezelbaash.ir/#saeed-ghezelbash',
        'clinicIri': 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah',
        'datasetIri': p['canonicalDatasetIri'],
    }, 'Canonical identity changed'
    assert plan['expectedPrimaryRoutes'] == 72
    assert type(plan['expectedSourceFiles']) is int and plan['expectedSourceFiles'] > 0
    for key in ('backupManifestSHA256', 'previousArchiveInventorySHA256'):
        assert HASH.fullmatch(plan[key]), ('Missing verified backup fingerprint', key)
    assert re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', plan['websitePreviousDeploymentId']), 'Missing previous deployment'
    archive, previous = _archive(p), _archive(old)
    assert plan['previousPolicySHA256'] == canonical_sha(old), 'Previous policy fingerprint differs'
    assert p['concept'] == old['concept'], 'Collection identity changed'
    assert p['canonicalDatasetIri'] == old['canonicalDatasetIri'], 'Dataset identity changed'
    assert archive['recordId'] != previous['recordId'], 'A new edition cannot overwrite the previous record'
    assert archive['packagingVersion'] != previous['packagingVersion'], 'New packaging version required'
    # Preserve every old historical value and the exact former current archive.
    for item in old['historical']:
        assert item in p['historical'], 'Old archive history changed'
    historical = next((item for item in p['historical'] if item.get('doi') == previous['doi']), None)
    assert historical and historical['role'] == 'historical', 'Previous archive must have an explicit historical role'
    for key in ('doi', 'url', 'packagingVersion', 'contentBaseline', 'edition'):
        assert historical.get(key) == previous[key], ('Previous archive field changed', key)
    assert historical['sourceCommit'] == plan['previousArchiveSourceCommit']
    _commit(plan['previousArchiveSourceCommit'])
    if previous.get('sourceCommit'):
        assert previous['sourceCommit'] == plan['previousArchiveSourceCommit']
    reservation = plan['reservation']
    assert reservation['published'] is False
    assert reservation['previousRecord'] == previous['recordId']
    assert reservation['reservedRecord'] == archive['recordId']
    assert reservation['reservedDoi'] == archive['doi']
    assert reservation['conceptDoi'] == p['concept']['doi']
    refs = plan['refs']
    for key in ('applicationCheckpoint', 'buildSource', 'publicationToolCommit'):
        _commit(refs[key])
    assert refs['applicationCheckpoint'] != refs['buildSource'], 'Checkpoint C and management build M are distinct'
    assert refs['publicationToolCommit'] == refs['buildSource'], 'This controller supports exact reviewed M only'
    assert archive.get('sourceCommitMode') == 'build-source', 'Approved edition must derive its source from the reviewed build'
    assert archive.get('sourceCommit', refs['buildSource']) == refs['buildSource'], 'Preset archive source differs from M'
    assert isinstance(refs['reviewedRef'], str) and refs['reviewedRef'].startswith('refs/tags/')
    assert re.fullmatch(r'refs/tags/[A-Za-z0-9][A-Za-z0-9._/-]*', refs['reviewedRef'])
    assert not any(x in refs['reviewedRef'] for x in ('..', '//', '@{'))
    inventory = refs['toolInventory']
    assert inventory and all(name.startswith(('.github/scripts/', '.github/workflows/')) and
                             '..' not in Path(name).parts and HASH.fullmatch(value)
                             for name, value in inventory.items()), 'Invalid reviewed tool inventory'
    cohort = p['coordinatedRelease']
    assert cohort['previousZenodoRecord'] == previous['recordId']
    assert cohort['hfParent'] == archive['inputBaselineHfRevision']
    _commit(cohort['hfParent']); _commit(cohort['websiteBaselineCommit'])
    for prefix in ('kaggle', 'notebook'):
        assert type(cohort[prefix + 'BaselineVersion']) is int and cohort[prefix + 'BaselineVersion'] > 0
        assert cohort[prefix + 'TargetVersion'] == cohort[prefix + 'BaselineVersion'] + 1
    for key in ('expectedGraphNodes', 'expectedGraphTriples'):
        assert type(cohort[key]) is int and cohort[key] > 0
    assert plan['reviewedTables'] and all(type(v) is int and v > 0 for v in plan['reviewedTables'].values())
    assert plan['positioningCorpusRelease'] == '1.3.4', 'Frozen scientific subcorpus must retain its release'
    assert plan['requireHfSearchFilter'] is True, 'Required runtime acceptance cannot be silently deferred'
    for key in ('publicationDate', 'maintenanceDate'):
        assert re.fullmatch(r'\d{4}-\d{2}-\d{2}', plan[key]), 'Date must use ISO calendar precision'
        date.fromisoformat(plan[key])
    timestamp = datetime.fromisoformat(plan['hfCommitTimestamp'].replace('Z', '+00:00'))
    assert timestamp.tzinfo is not None, 'HF Git timestamp must include timezone'
    assert archive['edition'] == plan['contentEdition']
    assert re.fullmatch(r'\d{4}-\d{2}-\d{2}', plan['contentEdition'])
    date.fromisoformat(plan['contentEdition'])
    return plan


def load_plan(path=None):
    path = path or os.environ.get('RELEASE_PLAN_PATH')
    return validate_plan(json.loads(Path(path).read_text())) if path else None


def policy_template():
    plan = load_plan()
    canonical = json.loads((ROOT / 'src/canonical/doi-policy.json').read_text())
    if plan:
        assert 'sourceCommit' not in canonical['currentArchive'], 'Build-source policy must not store its own future commit'
        selected = copy.deepcopy(plan['policy'])
        selected['currentArchive'].pop('sourceCommit', None)
        assert selected == canonical, 'Approved plan policy differs from the canonical policy bound before C'
    return copy.deepcopy(plan['policy'] if plan else canonical)


def resolve_policy(policy, env=None, head=None, plan=None):
    env = os.environ if env is None else env
    if plan:
        validate_plan(plan)
        assert policy == plan['policy'], 'Resolved policy differs from the approved release binding'
    p = copy.deepcopy(policy)
    a = p['currentArchive']
    if a.get('sourceCommitMode') != 'build-source':
        return p
    pinned, preparing = env.get('ARCHIVE_SOURCE_COMMIT'), env.get('PREPARE_RESERVED_DOI')
    if plan:
        expected = plan['refs']['buildSource']
        if plan['context'] == 'new-reserved':
            assert not pinned, 'Old archive source pin is forbidden for a new reserved edition'
            assert preparing == str(a['recordId']), 'Preparing mode must select the actual reserved record'
            actual = head or subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
            assert actual == expected and env.get('GITHUB_SHA', actual) == actual, 'Build source is not actual reviewed M'
            source = actual
        else:
            assert not preparing, 'Published maintenance cannot prepare an archive'
            assert pinned == expected, 'Maintenance must pin the newly published archive source M'
            source = pinned
    else:
        if not pinned and preparing != str(a['recordId']):
            raise RuntimeError('ARCHIVE_SOURCE_COMMIT must pin the published archive; use an approved release plan for a new edition')
        source = pinned or env.get('GITHUB_SHA') or head or subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    a['sourceCommit'] = _commit(source)
    return p


def effective_policy():
    return resolve_policy(policy_template(), plan=load_plan())


def validate_checkout(plan, root=ROOT):
    """Validate exact C/M lineage and every release tool byte before any write."""
    validate_plan(plan)
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=root, text=True).strip()
    refs = plan['refs']; source = refs['buildSource']; checkpoint = refs['applicationCheckpoint']
    assert git('rev-parse', 'HEAD') == source == os.environ.get('GITHUB_SHA', source), 'Checkout/HEAD/GITHUB_SHA differs from M'
    assert git('rev-parse', refs['reviewedRef'] + '^{commit}') == source, 'Reviewed immutable ref differs from M'
    assert git('rev-parse', source + '^') == checkpoint, 'M must be the management child of C'
    names = set(git('ls-tree', '-r', '--name-only', checkpoint).splitlines())
    assert not names & MANAGEMENT, 'Application checkpoint C contains management files'
    assert len(names) == plan['expectedSourceFiles'], 'Reviewed application source count differs'
    assert set(git('diff', '--name-only', checkpoint, source).splitlines()) == MANAGEMENT, 'C/M difference is not exactly management additions'
    assert set(git('diff', '--diff-filter=A', '--name-only', checkpoint, source).splitlines()) == MANAGEMENT
    expected_names = {name for name in git('ls-tree', '-r', '--name-only', source).splitlines()
                      if name.startswith(('.github/scripts/', '.github/workflows/'))}
    assert set(refs['toolInventory']) == expected_names, 'Tool inventory does not cover the exact release tool tree'
    for name, digest in refs['toolInventory'].items():
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, ('Tool bytes differ', name)
    assert not git('status', '--porcelain', '--untracked-files=all'), 'Reviewed checkout has uncommitted or untracked inputs'
    return {'status': 'PASS', 'applicationCheckpoint': checkpoint, 'sourceCommit': source,
            'publicationToolCommit': source, 'reviewedRef': refs['reviewedRef'], 'tools': len(expected_names)}


def obsolete_reader_asset(name):
    return re.fullmatch(r'assets/(?:(?:guide|guide-meta)\.[a-f0-9]{12}\.(?:html|json)|guide-search\.[a-f0-9]{12}\.json)', name) is not None


def validate_dataset_baseline(graph, policy):
    """A release label must identify the canonical Dataset actually packaged."""
    dataset = next((node for node in graph['@graph'] if node.get('@id') == policy['canonicalDatasetIri']), None)
    assert dataset and dataset.get('version') == policy['currentArchive']['contentBaseline'], 'Canonical Dataset version differs from selected archive content baseline'
    return dataset['version']


def validate_candidate_binding(work):
    """Bind DOI operations to frozen controls, source and the selected real draft."""
    plan = load_plan()
    if not plan:
        return
    validate_checkout(plan)
    work = Path(work)
    controls = json.loads((work / 'frozen-sha256.json').read_text())['controls']
    for name in ('approved-release-plan.json', 'release-plan.json', 'zenodo-metadata.json', 'payload.json'):
        assert hashlib.sha256((work / name).read_bytes()).hexdigest() == controls[name], ('Frozen release control changed', name)
    assert json.loads((work / 'approved-release-plan.json').read_text()) == plan
    candidate = json.loads((work / 'release-plan.json').read_text())
    assert candidate['approvedReleasePlanSHA256'] == canonical_sha(plan)
    assert candidate['sourceCommit'] == plan['refs']['buildSource']
    payload = json.loads((work / 'payload.json').read_text())
    assert payload['sourceCommit'] == plan['refs']['buildSource']
    assert payload['record'] == plan['policy']['currentArchive']['recordId']
    assert payload['doi'] == plan['policy']['currentArchive']['doi']
    assert canonical_sha(payload['upstreamParentChecksums']) == plan['previousArchiveInventorySHA256']
    for name, spec in payload['files'].items():
        path = Path(spec['path'])
        assert path.is_file() and path.stat().st_size == spec['bytes'], ('Frozen upload missing/size differs', name)
        assert hashlib.sha256(path.read_bytes()).hexdigest() == spec['sha256'], ('Frozen upload bytes changed', name)
        assert hashlib.md5(path.read_bytes()).hexdigest() == spec['md5'], ('Frozen upload MD5 changed', name)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check-checkout', action='store_true')
    args = parser.parse_args()
    plan = load_plan()
    assert plan, 'RELEASE_PLAN_PATH is required'
    result = validate_checkout(plan) if args.check_checkout else {'status': 'PASS', 'context': plan['context']}
    print(json.dumps(result))
