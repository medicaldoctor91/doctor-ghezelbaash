"""Read-only diagnosis of PR #489 coordinated publication prerequisites.
No version creation, metadata update, kernel push, site deploy, or archive write.
"""
import hashlib
import json
import os
import sys
from pathlib import Path
from urllib.parse import quote

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sync_platform_machine_resources import kaggle_client

REF = 'saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data'
NB = 'saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter'
HF = 'doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data'
SITE = 'https://www.ghezelbaash.ir/'
EXPECTED_SITE = 'a62e2093c65464a83cc683f7e22e8c8d1f2077b7'
EXPECTED_HF = 'e7637866157b29ce9022040dfbac93cc8ef7a406'
EXPECTED_GRAPH = '66d837c9da71e63bd534b7b54bc4b305f3dd2330d26a0ea133bad2ffb4ded0de'
TARGET_SOURCE = '96635cfd474566a1d0ff46f71036aa0f13ac7482'
EXPECTED_ARCHIVE_SOURCE = 'eafb138d596a91504ed0af66e2557f52848e36b6'

def fetch(url):
    r = requests.get(url, headers={
        'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache',
        'Accept-Encoding': 'identity'}, timeout=90)
    r.raise_for_status()
    return r.content

def official_json(url):
    return json.loads(fetch(url))

def kg_file(name, version):
    return fetch('https://www.kaggle.com/api/v1/datasets/download/' + REF
                 + '/' + quote(name, safe='') + '?datasetVersionNumber='
                 + str(version) + '&raw=true')

def zip_probe(version):
    """Inspect download readiness without fetching an archive or URL credentials."""
    query = '' if version is None else '?datasetVersionNumber=' + str(version)
    url = 'https://www.kaggle.com/api/v1/datasets/download/' + REF + query
    with requests.get(url, headers={'Cache-Control': 'no-cache, no-store',
                                    'Accept-Encoding': 'identity'},
                      timeout=45, allow_redirects=False, stream=True) as response:
        result = {'requestedVersion': 'default' if version is None else version,
                  'statusCode': response.status_code,
                  'contentType': response.headers.get('Content-Type'),
                  'contentLength': response.headers.get('Content-Length'),
                  'redirect': bool(response.headers.get('Location'))}
        if response.status_code >= 400:
            # Only retain bounded noncredential-bearing error text.
            result['failure'] = response.raw.read(250, decode_content=True).decode(
                'utf-8', errors='replace')
    return result

def run():
    owner = json.loads(kaggle_client().dataset_status(
        REF, format='json(status,current_version_number)'))
    public = official_json('https://api.kaggle.com/v1/datasets/view/' + REF)
    versions = {x['versionNumber']: x.get('status') for x in public.get('versions', [])}
    site = official_json(SITE + 'release-provenance.json')
    hub = official_json('https://huggingface.co/api/datasets/' + HF)
    nb = official_json('https://www.kaggle.com/api/v1/kernels/pull/' + NB)
    listed = official_json('https://www.kaggle.com/api/v1/datasets/list/' + REF
                           + '?datasetVersionNumber=41&pageSize=1000')
    manifest = json.loads(kg_file('kaggle-manifest.json', 41))
    checksums = kg_file('checksums.sha256', 41).decode('utf-8').splitlines()
    hash_table = dict((name, digest) for digest, name in
                      (row.split('  ', 1) for row in checksums))
    v41_graph = kg_file('graph.jsonld', 41)
    hub_graph = fetch('https://huggingface.co/datasets/' + HF +
                      '/resolve/' + EXPECTED_HF + '/graph.jsonld')
    site_graph = fetch(SITE + 'graph.jsonld')
    v41_hash = hashlib.sha256(v41_graph).hexdigest()
    assert v41_hash == hash_table['graph.jsonld'] == EXPECTED_GRAPH
    assert site_graph == hub_graph == v41_graph, 'Previously published platform graphs differ'
    assert manifest['desired_kaggle_version'] == 41
    assert manifest['upstream_revision'] == EXPECTED_HF
    assert manifest['website_source_commit'] == EXPECTED_SITE
    assert site['sourceCommit'] == EXPECTED_SITE
    assert hub['sha'] == EXPECTED_HF
    assert len(listed['datasetFiles']) == 48
    assert len(hash_table) == 47
    assert versions.get(41, '').lower() == 'ready', 'Exact Kaggle 41 is not Ready'
    assert nb['metadata']['currentVersionNumber'] == 21, 'Notebook changed unexpectedly'
    current = public['currentVersionNumber']
    owner_version = owner['current_version_number']
    owner_status = str(owner['status']).lower()
    archive_probes = [zip_probe(v) for v in (40, 41, None)]
    default_file_manifest = official_json(
        'https://www.kaggle.com/api/v1/datasets/download/' + REF +
        '/kaggle-manifest.json?raw=true')
    assert default_file_manifest['desired_kaggle_version'] in (40, 41)
    result = {
        'status': 'BLOCKED_BY_PUBLIC_DEFAULT' if current != 41 else 'READY_FOR_NEXT_COHORT_PREFLIGHT',
        'oldCohort': {'websiteSource': site['sourceCommit'], 'huggingFaceRevision': hub['sha'],
                      'kaggleOwnerVersion': owner_version, 'kaggleOwnerStatus': owner_status,
                      'kagglePublicDefaultVersion': current, 'exactVersion41Status': versions[41],
                      'exactVersion41Files': 48, 'exactVersion41ChecksumFiles': len(hash_table),
                      'publishedGraphSHA256': v41_hash,
                      'websiteHfKaggle41ByteEqual': True,
                      'archives': archive_probes,
                      'defaultRawFileManifestVersion': default_file_manifest['desired_kaggle_version'],
                      'notebookPublicVersion': nb['metadata']['currentVersionNumber']},
        'nextCandidate': {'mergedGraphSource': TARGET_SOURCE,
                          'immutableArchiveSourcePreserved': EXPECTED_ARCHIVE_SOURCE},
        'canSafelyMakeAnotherDatasetVersion': current == 41 and owner_version == 41 and owner_status == 'ready',
        'providerWrites': 0,
    }
    Path('/tmp/pr489-publication-state.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if owner_version not in (40, 41):
        raise AssertionError('Unexpected owner version: stop mutation')
    if current not in (40, 41):
        raise AssertionError('Unexpected public default: stop mutation')
    return result

if __name__ == '__main__':
    run()
