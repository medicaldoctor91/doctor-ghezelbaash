"""Isolated full-graph-first experiment from the exact published website.

No production deploy or cross-platform write exists in this controller. The
only mutation is one explicit upload to a fixed, non-production Pages branch.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import time

import requests

import schema_preview as pages

BASE_SOURCE = '0f72c5e6ef832adef66d003069e3e3c189cf5079'
BASE_DEPLOYMENT = 'a86aa67c-5d7d-426d-87b2-b11ce8bdef7f'
BASE_HOME = '4f8cb1cc228a620110bc45fb01decf7446c0e8f06dba80878e0ceb204bda863b'
BASE_GRAPH = 'aa8776aab907ab2abed459127a50f18d5e431b7f4d2dfb6d3382564da5fed4a7'
FROZEN_SHA = 'c9216eb110408a5872ad4aef97eda7b39b34553d17eeb29016e852ad5493103d'
BRANCH = 'full-graph-first-20261024'
ROOT = Path(__file__).resolve().parents[2]
WORK = Path('/tmp/full-graph-first-preview')
EVIDENCE = WORK / 'evidence'
SCRIPT = re.compile(rb'<script\b(?P<attrs>[^>]*)>(?P<body>.*?)</script\s*>', re.S | re.I)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(body):
    return hashlib.sha256(body).hexdigest()


def dump(name, value):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / (name + '.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def load(name):
    return json.loads((EVIDENCE / (name + '.json')).read_text())


class Anonymous(requests.auth.AuthBase):
    def __call__(self, request):
        request.headers.pop('Authorization', None)
        return request


def public(url):
    with requests.Session() as session:
        session.auth = Anonymous()
        response = session.get(url, timeout=(15, 45), allow_redirects=False)
    require(response.status_code == 200, 'Ordinary public read stopped: HTTP ' + str(response.status_code))
    return response


def reviewed():
    expected = os.environ.get('REVIEWED_COMMIT', '')
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    require(re.fullmatch('[a-f0-9]{40}', expected) and expected == actual == os.environ.get('GITHUB_SHA'),
            'Reviewed controller commit differs from checkout')
    return actual


def require_baseline(state, before=None):
    expected = {'project': pages.PROJECT, 'productionBranch': 'main',
                'deploymentId': BASE_DEPLOYMENT, 'sourceCommit': BASE_SOURCE,
                'deploymentBranch': 'main', 'stage': 'success',
                'globalGitDeploymentsEnabled': False,
                'automaticProductionDeployments': False, 'automaticPreviewSetting': 'none'}
    require(all(state.get(key) == value for key, value in expected.items()),
            'Production identity or disabled automatic-deployment controls differ')
    if before is not None:
        require(state == before, 'Production bytes or deployment changed during experiment')


def observe(name, before=None):
    state = pages.production_state(pages.api())  # This helper returns sanitized fields only.
    require_baseline(state)
    home = public(pages.PRODUCTION_URL + '/')
    provenance = public(pages.PRODUCTION_URL + '/release-provenance.json')
    require(sha(home.content) == BASE_HOME, 'Published homepage differs from frozen rollback baseline')
    require(provenance.json()['sourceCommit'] == BASE_SOURCE, 'Published provenance differs')
    state.update(publicHomeSHA256=sha(home.content), publicProvenanceSHA256=sha(provenance.content))
    require_baseline(state, before)
    dump(name, state)
    return state


def named_script(html, identifier, media_type):
    matches = [match for match in SCRIPT.finditer(html)
               if ('id="' + identifier + '"').encode() in match['attrs']]
    require(len(matches) == 1, 'Expected exactly one ' + identifier + ' script')
    match = matches[0]
    require(('type="' + media_type + '"').encode() in match['attrs'], 'Unexpected graph script media type')
    return match


def graph_first(home, graph):
    """Use the complete graph alone, so a successful 85-node control cannot mask failure."""
    require(sha(home) == BASE_HOME and sha(graph) == BASE_GRAPH, 'Unexpected baseline website bytes')
    core = named_script(home, 'schema-core-mainentity', 'application/ld+json')
    full = named_script(home, 'canonical-entity-graph', 'application/json')
    document = json.loads(full['body'])
    require(document == json.loads(graph), 'Preserved homepage graph differs from canonical download')
    require(len(document['@graph']) == 1600, 'Incomplete canonical graph')
    require(len(json.loads(core['body'])['@graph']) == 85, 'Unexpected published search control')
    require(not re.search(rb'</script|<!--', full['body'], re.I), 'Unsafe JSON script content')
    require(core.start() < home.index(b'</head>') < home.index(b'<body') < full.start(),
            'Unexpected original graph placement')
    # Reuse the active script ID; do not make canonical-entity-graph active.
    # The reader otherwise captures the same script twice during navigation.
    active = b'<script id="schema-core-mainentity" type="application/ld+json">' + full['body'] + b'</script>'
    without = home[:core.start()] + home[core.end():full.start()] + home[full.end():]
    candidate = without.replace(b'</head>', active + b'</head>', 1)
    selected = named_script(candidate, 'schema-core-mainentity', 'application/ld+json')
    require(len([m for m in SCRIPT.finditer(candidate) if b'type="application/ld+json"' in m['attrs']]) == 1,
            'A smaller active graph would confound the full-graph experiment')
    require(b'id="canonical-entity-graph"' not in candidate, 'Duplicate canonical graph container remains')
    require(json.loads(selected['body']) == document, 'The complete graph changed')
    require(selected.end() <= candidate.index(b'</head>') < candidate.index(b'<body'), 'Full graph is not in head')
    require(selected.end() + 8192 < 2_000_000, 'Complete graph exceeds fetch budget including header reserve')
    original_body = home[home.index(b'<body'):]
    original_body = original_body.replace(full[0], b'', 1)
    require(original_body == candidate[candidate.index(b'<body'):], 'Authored body or application scripts changed')
    require(SCRIPT.sub(b'', home[:home.index(b'</head>')]) ==
            SCRIPT.sub(b'', candidate[:candidate.index(b'</head>')]), 'Non-script head metadata changed')
    return candidate, {'completeActiveGraphNodes': 1600, 'activeDocuments': 1,
                       'completeGraphEndByte': selected.end(), 'endIncludingHeaderReserve': selected.end() + 8192,
                       'homeBodyStartsAtByte': candidate.index(b'<body'),
                       'fullGraphJSONUnchanged': True, 'authoredBodyAndApplicationScriptsUnchanged': True,
                       'metadataAndCanonicalUnchanged': True,
                       'scope': 'Initial full-document Google recognition experiment; lazy internal-to-home metadata still uses the existing published fallback. Not a production-ready navigation change.'}


def inventory(folder):
    paths = sorted(folder.rglob('*'))
    require(not any(path.is_symlink() for path in paths), 'Symbolic link in frozen input')
    return {path.relative_to(folder).as_posix(): sha(path.read_bytes()) for path in paths if path.is_file()}


def prepare(frozen, mode):
    require(mode in {'experiment', 'restore'}, 'Unknown experiment operation')
    require(sha((frozen / 'frozen-sha256.json').read_bytes()) == FROZEN_SHA, 'Frozen manifest differs')
    manifest = json.loads((frozen / 'frozen-sha256.json').read_text())
    baseline = frozen / 'website'
    expected = manifest['website']
    require(len(expected) == 188 and inventory(baseline) == expected, 'Website differs from exact reviewed production')
    require(sha((baseline / 'index.html').read_bytes()) == BASE_HOME, 'Rollback homepage differs')
    output = WORK / 'website'
    require(not output.exists(), 'Do not overwrite an earlier prepared experiment')
    shutil.copytree(baseline, output)
    details = {'mode': mode, 'baselineSource': BASE_SOURCE, 'baselineDeployment': BASE_DEPLOYMENT,
               'baselineHomeSHA256': BASE_HOME, 'baselineGraphSHA256': BASE_GRAPH,
               'frozenManifestSHA256': FROZEN_SHA, 'productionWrites': False,
               'otherPlatformWrites': False, 'googleRecognition': 'NOT_TESTED'}
    if mode == 'experiment':
        home, checks = graph_first((baseline / 'index.html').read_bytes(), (baseline / 'graph.jsonld').read_bytes())
        (output / 'index.html').write_bytes(home)
        (output / 'control').mkdir()
        (output / 'control/index.html').write_bytes((baseline / 'index.html').read_bytes())
        details.update(checks)
    actual = inventory(output)
    changed = [name for name, digest in expected.items() if actual.get(name) != digest]
    require(changed == (['index.html'] if mode == 'experiment' else []), 'Unexpected production-payload file changes')
    require(set(actual) - set(expected) == ({'control/index.html'} if mode == 'experiment' else set()),
            'Unexpected experimental files')
    details.update(files=actual, fileCount=len(actual), changedBaselineFiles=changed,
                   unchangedOtherWebsiteFiles=187 if mode == 'experiment' else 188,
                   candidateHomeSHA256=actual['index.html'])
    with tarfile.open(WORK / 'preview.tar.gz', 'w:gz') as archive:
        archive.add(output, arcname='website')
    details['archiveSHA256'] = sha((WORK / 'preview.tar.gz').read_bytes())
    dump('candidate', details)


def deploy():
    before = load('production-before')
    observe('production-before-upload', before)
    candidate = load('candidate')
    output = WORK / 'website'
    require(inventory(output) == candidate['files'], 'Prepared preview changed')
    previous = {item['id'] for item in pages.api('/deployments?env=preview&per_page=10')}
    attempt = EVIDENCE / 'upload-attempt.json'
    require(not attempt.exists(), 'A previous preview upload must be inspected before any retry')
    controller = reviewed()
    dump('upload-attempt', {'attemptedUTC': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                            'branch': BRANCH, 'controller': controller, 'state': 'attempted'})
    command = ['/tmp/full-graph-preview-tools/node_modules/.bin/wrangler', 'pages', 'deploy', str(output),
               '--project-name=' + pages.PROJECT, '--branch=' + BRANCH, '--commit-hash=' + controller,
               '--commit-message=Isolated full graph first Google experiment', '--commit-dirty=false', '--no-bundle']
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=480)
    require(result.returncode == 0, 'Preview upload failed; inspect deployment identity before retry')
    matches = []
    for attempt_number in range(6):
        matches = [item for item in pages.api('/deployments?env=preview&per_page=10')
                   if item['id'] not in previous and item.get('environment') == 'preview'
                   and item.get('deployment_trigger', {}).get('metadata', {}).get('branch') == BRANCH
                   and item.get('deployment_trigger', {}).get('metadata', {}).get('commit_hash') == controller]
        require(len(matches) <= 1, 'Ambiguous preview upload')
        if matches and matches[0].get('latest_stage', {}).get('status') == 'success':
            break
        if attempt_number < 5:
            time.sleep(5)
    require(len(matches) == 1 and matches[0].get('latest_stage', {}).get('status') == 'success',
            'Successful preview not observed')
    entry = matches[0]
    url = entry.get('url', '').rstrip('/')
    require(re.fullmatch(r'https://[a-f0-9]{8}\.doctor-ghezelbaash\.pages\.dev', url), 'Unexpected preview URL')
    evidence = {'previewUrl': url, 'controlUrl': url + '/control/' if candidate['mode'] == 'experiment' else url + '/',
                'deploymentId': entry['id'], 'branch': BRANCH, 'environment': 'preview',
                'controllerCommit': controller, 'baselineSource': BASE_SOURCE,
                'candidateHomeSHA256': candidate['candidateHomeSHA256'], 'mode': candidate['mode'],
                'googleRecognition': 'NOT_TESTED', 'productionWrites': False}
    dump('preview', evidence)  # Keep a usable test URL even if ordinary verification is denied.
    response = public(url + '/')  # Once only: no cache-bypass or access-denial retry.
    require(sha(response.content) == candidate['candidateHomeSHA256'], 'Public preview bytes differ')
    require('noindex' in response.headers.get('X-Robots-Tag', '').lower(), 'Preview must be noindex')
    graph = public(url + '/graph.jsonld')
    require(sha(graph.content) == BASE_GRAPH, 'Preview canonical graph differs')
    if candidate['mode'] == 'experiment':
        control = public(url + '/control/')
        require(sha(control.content) == BASE_HOME, 'Control homepage differs from current production')
    evidence.update(ordinaryPublicBytesVerified=True, previewXRobotsTag=response.headers.get('X-Robots-Tag'),
                    canonicalGraphSHA256=sha(graph.content))
    dump('preview', evidence)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['before', 'prepare', 'deploy', 'after'])
    parser.add_argument('--mode', choices=['experiment', 'restore'], default='experiment')
    parser.add_argument('--frozen', type=Path, default=Path('/tmp/schema-distribution-correction'))
    args = parser.parse_args()
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    try:
        reviewed()
        if args.operation == 'before':
            observe('production-before')
        elif args.operation == 'prepare':
            prepare(args.frozen, args.mode)
        elif args.operation == 'deploy':
            deploy()
        else:
            observe('production-after', load('production-before'))
        print(json.dumps({'operation': args.operation, 'status': 'PASS'}))
    except Exception as error:
        dump('failure-' + args.operation, {'status': 'FAIL', 'reason': str(error) if isinstance(error, RuntimeError) else type(error).__name__})
        print(json.dumps({'operation': args.operation, 'status': 'FAIL', 'reason': type(error).__name__}))
        raise SystemExit(1)
