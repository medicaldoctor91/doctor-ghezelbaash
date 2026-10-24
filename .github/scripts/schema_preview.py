"""Freeze a reviewed website and deploy only its fixed Pages preview branch.

Cloudflare REST calls are GET-only. The sole remote mutation is Wrangler's
explicit preview upload; project settings and production are never changed.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request


ACCOUNT = '884d1d90bd1fb6ecca14992c6c60d677'
PROJECT = 'doctor-ghezelbaash'
BRANCH = 'schema-validation-20261023'
PRODUCTION_SOURCE = '94611168bacf7630022499204c493f6e4af64f70'
PRODUCTION_DEPLOYMENT = '51fc7680-1235-4556-b6f2-4bb8d764556c'
PRODUCTION_URL = 'https://www.ghezelbaash.ir'
ARCHIVE_SOURCE = 'ed767f6e6726e1453196e2ec2b312fcad00677e2'
ROOT = Path(__file__).resolve().parents[2]
OUT = Path('/tmp/schema-preview-evidence')
ARCHIVE = Path('/tmp/schema-preview-website.tar.gz')
WRANGLER = '/tmp/schema-preview-tools/node_modules/.bin/wrangler'


class PreviewError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise PreviewError(message)


def dump(name, value):
    OUT.mkdir(exist_ok=True)
    (OUT / (name + '.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def read(name):
    return json.loads((OUT / (name + '.json')).read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def reviewed_source():
    source = os.environ.get('REVIEWED_COMMIT', '')
    require(bool(re.fullmatch(r'[0-9a-f]{40}', source)), 'Invalid reviewed commit')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    require(source == os.environ.get('GITHUB_SHA') == head, 'Reviewed commit differs from checkout')
    require(subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--'], cwd=ROOT).returncode == 0, 'Tracked source changed')
    return source


def api(suffix=''):
    token = os.environ.get('CLOUDFLARE_API_TOKEN', '')
    require(bool(token), 'Cloudflare token binding missing')
    url = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT + '/pages/projects/' + PROJECT + suffix
    request = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/json'}, method='GET')
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        raise PreviewError('Pages read API HTTP ' + str(error.code)) from None
    require(data.get('success') is True, 'Pages read API rejected request')
    return data['result']  # Raw API results may contain env vars: never print or persist them.


def production_state(project):
    deployment = project.get('canonical_deployment') or {}
    metadata = deployment.get('deployment_trigger', {}).get('metadata', {})
    config = project.get('source', {}).get('config', {})
    return {
        'project': project.get('name'), 'productionBranch': project.get('production_branch'),
        'deploymentId': deployment.get('id'), 'sourceCommit': metadata.get('commit_hash'),
        'deploymentBranch': metadata.get('branch'), 'stage': deployment.get('latest_stage', {}).get('status'),
        'globalGitDeploymentsEnabled': config.get('deployments_enabled'),
        'automaticProductionDeployments': config.get('production_deployments_enabled'),
        'automaticPreviewSetting': config.get('preview_deployment_setting'),
    }


def require_production(state, baseline=None):
    require(state['project'] == PROJECT and state['productionBranch'] == 'main', 'Unexpected production project or branch')
    require(state['deploymentBranch'] == 'main' and state['sourceCommit'] == PRODUCTION_SOURCE, 'Production source differs from dispatch baseline')
    require(state['deploymentId'] == PRODUCTION_DEPLOYMENT and state['stage'] == 'success', 'Production deployment differs from dispatch baseline')
    require(state['globalGitDeploymentsEnabled'] is False, 'Global Git auto-deployment must remain disabled')
    require(state['automaticProductionDeployments'] is False and state['automaticPreviewSetting'] == 'none', 'Granular Git auto-deployments must remain disabled')
    if baseline is not None:
        require(state == baseline, 'Production deployment or Git controls changed during preview work')


def observe_production(label, baseline=None):
    state = production_state(api())
    body, _ = public_bytes(PRODUCTION_URL + '/release-provenance.json?schema_preview=' + str(time.time_ns()))
    require(json.loads(body).get('sourceCommit') == PRODUCTION_SOURCE, 'Public production source differs from dispatch baseline')
    state['publicSourceCommit'] = PRODUCTION_SOURCE
    state['publicProvenanceSha256'] = hashlib.sha256(body).hexdigest()
    dump(label, state)
    require_production(state, baseline)
    return state


def inventory(dist):
    require(dist.is_dir(), 'Built website directory missing')
    paths = sorted(dist.rglob('*'))
    require(not any(path.is_symlink() for path in paths), 'Built website contains a symbolic link')
    return {path.relative_to(dist).as_posix(): sha(path) for path in paths if path.is_file()}


def freeze(source):
    dist = ROOT / 'dist'
    provenance = json.loads((dist / 'release-provenance.json').read_text())
    require(provenance.get('sourceCommit') == source, 'Built provenance differs from reviewed commit')
    policy = json.loads((dist / 'doi-policy.json').read_text())
    require(policy['currentArchive']['sourceCommit'] == ARCHIVE_SOURCE, 'Immutable archive source changed')
    files = inventory(dist)
    require('index.html' in files and 'graph.jsonld' in files, 'Built website is incomplete')
    with tarfile.open(ARCHIVE, 'w:gz') as archive:
        archive.add(dist, arcname='website')
    dump('frozen-website', {'sourceCommit': source, 'files': files, 'fileCount': len(files), 'archiveSha256': sha(ARCHIVE)})


def check_frozen(source):
    frozen = read('frozen-website')
    require(frozen['sourceCommit'] == source, 'Frozen website has a different source')
    require(inventory(ROOT / 'dist') == frozen['files'], 'Frozen website bytes changed')
    require(sha(ARCHIVE) == frozen['archiveSha256'], 'Frozen website archive changed')


def preview_deployments():
    # Pages rejects per_page=100 although its OpenAPI schema omits the bound.
    # The serialized preview upload only needs the newest deployments; fail
    # closed if its exact source/branch cannot be found in this valid window.
    return api('/deployments?env=preview&per_page=10')


def public_bytes(url):
    request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache, no-store, max-age=0', 'Pragma': 'no-cache', 'Accept-Encoding': 'identity'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            require(response.status == 200, 'Preview response must be HTTP 200')
            requested = urllib.parse.urlsplit(url)
            actual = urllib.parse.urlsplit(response.url)
            require((actual.scheme, actual.netloc, actual.path) == (requested.scheme, requested.netloc, requested.path),
                    'Public verification redirected to a different resource')
            return response.read(), {'mediaType': response.headers.get_content_type(),
                                     'xRobotsTag': response.headers.get('X-Robots-Tag', '')}
    except urllib.error.HTTPError as error:
        raise PreviewError('Public verification HTTP ' + str(error.code)) from None


def deploy(source):
    baseline = read('production-before')
    observe_production('production-before-upload', baseline)
    check_frozen(source)
    previous_ids = {deployment['id'] for deployment in preview_deployments()}
    command = [WRANGLER, 'pages', 'deploy', str(ROOT / 'dist'), '--project-name=' + PROJECT,
               '--branch=' + BRANCH, '--commit-hash=' + source, '--commit-message=Reviewed schema validation preview',
               '--commit-dirty=false', '--no-bundle']
    # Capture CLI output privately. Never upload or print CLI logs or raw project config.
    completed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=480)
    require(completed.returncode == 0, 'Preview-only Wrangler upload failed')
    check_frozen(source)
    candidate = None
    for attempt in range(6):
        candidates = [item for item in preview_deployments()
                      if item.get('id') not in previous_ids and item.get('environment') == 'preview'
                      and item.get('deployment_trigger', {}).get('metadata', {}).get('branch') == BRANCH
                      and item.get('deployment_trigger', {}).get('metadata', {}).get('commit_hash') == source]
        require(len(candidates) <= 1, 'Ambiguous preview deployment identity')
        if candidates and candidates[0].get('latest_stage', {}).get('status') == 'success':
            candidate = candidates[0]
            break
        if attempt < 5:
            time.sleep(5)
    require(candidate is not None, 'Successful preview deployment was not observed')
    url = candidate.get('url', '').rstrip('/')
    require(bool(re.fullmatch(r'https://[a-f0-9]{8}\.doctor-ghezelbaash\.pages\.dev', url)), 'Unexpected immutable preview hostname')
    evidence = {'project': PROJECT, 'branch': BRANCH, 'deploymentId': candidate['id'], 'previewUrl': url, 'sourceCommit': source}
    dump('preview', evidence)
    for attempt in range(12):
        suffix = '?schema_preview=' + str(time.time_ns())
        body, headers = public_bytes(url + '/' + suffix)
        provenance, _ = public_bytes(url + '/release-provenance.json' + suffix)
        if headers['mediaType'] == 'text/html' and hashlib.sha256(body).hexdigest() == sha(ROOT / 'dist/index.html') and json.loads(provenance).get('sourceCommit') == source:
            require('noindex' in {value.strip() for value in headers['xRobotsTag'].lower().split(',')}, 'Preview must retain its noindex header')
            treatment, treatment_headers = public_bytes(url + '/botox' + suffix)
            require(treatment_headers['mediaType'] == 'text/html' and hashlib.sha256(treatment).hexdigest() == sha(ROOT / 'dist/botox.html'),
                    'Preview treatment HTML differs from frozen candidate')
            evidence.update(htmlHTTP=200, htmlSha256=hashlib.sha256(body).hexdigest(), provenanceHTTP=200,
                            provenanceSha256=hashlib.sha256(provenance).hexdigest(), previewBytesVerified=True,
                            treatmentHTTP=200, treatmentSha256=hashlib.sha256(treatment).hexdigest(),
                            xRobotsTag=headers['xRobotsTag'])
            require(provenance == (ROOT / 'dist/release-provenance.json').read_bytes(), 'Preview provenance bytes differ')
            dump('preview', evidence)
            return
        if attempt < 11:
            time.sleep(5)
    raise PreviewError('Fresh preview HTML and candidate provenance did not converge')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['before', 'freeze', 'deploy', 'after'])
    args = parser.parse_args()
    try:
        source = reviewed_source()
        if args.operation == 'before':
            observe_production('production-before')
        elif args.operation == 'freeze':
            freeze(source)
        elif args.operation == 'deploy':
            deploy(source)
        else:
            observe_production('production-after', read('production-before'))
            dump('production-unchanged', {'productionUnchanged': True, 'sourceCommit': PRODUCTION_SOURCE})
        print(json.dumps({'operation': args.operation, 'status': 'PASS', 'sourceCommit': source}))
    except Exception as error:
        # Fixed local error messages only; no API response, token, CLI output or HTTP traceback.
        detail = str(error) if isinstance(error, PreviewError) else type(error).__name__
        dump('failure-' + args.operation, {'operation': args.operation, 'status': 'FAIL', 'reason': detail})
        print(json.dumps({'operation': args.operation, 'status': 'FAIL', 'reason': detail}))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
