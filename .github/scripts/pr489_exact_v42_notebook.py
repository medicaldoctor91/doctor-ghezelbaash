"""Complete the frozen PR489 Kaggle Notebook v22 against exact public Dataset v42.

This operation does not upload another dataset version, redeploy the website,
alter Hugging Face, or mutate Zenodo. Both artifact and exact Kaggle bytes are
checked before a single possible Notebook push.
"""
import json
import os
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mutable_platform_release as release
import coordinated_doi_release as gates
from kaggle_baseline import verify_exact_public_files
from sync_platform_machine_resources import kaggle_client
from doi_validation import validate_policy

WORK = Path('/tmp/mutable-release')
DATASET = 'saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data'
FROZEN = '886727638ebf2c914825d9577225f7e91a3d39fc8bdfb7647eed1e4794a49710'
SOURCE = 'bc19dddf05b81d1cccd0cf1050b6af17d8b99943'
HF = '11f2af63dab81e3d717726ed1305bdc252bdf3e2'
GRAPH = '25440dbc062dc69131341744562da86e30037f00af681d8e8fc55ad078cb2f50'

def json_get(url):
    return release.read(url).json()

def current_kaggle():
    info = json_get('https://api.kaggle.com/v1/datasets/view/' + DATASET)
    latest = info['currentVersionNumber']
    versions = {v['versionNumber']: v.get('status') for v in info['versions']}
    assert latest in (41, 42) and versions.get(42, '').lower() == 'ready', (latest, versions.get(42))
    assert not any(v > 42 for v in versions), 'Newer unexpected dataset version exists'
    return latest

def notebook_version():
    return json_get('https://www.kaggle.com/api/v1/kernels/pull/' + gates.NB)['metadata']['currentVersionNumber']

def main():
    assert release.sha(WORK / 'frozen-sha256.json') == FROZEN, 'Wrong release candidate'
    release.guard_frozen(WORK)
    plan = release.load(WORK / 'release-plan.json')
    assert plan['candidateSchema'] == 'mutable-distributions-4'
    assert plan['sourceCommit'] == SOURCE and plan['hfRevision'] == HF
    assert plan['archiveWrites'] is False and plan['kagglePreviousVersion'] == 41
    assert plan['kaggleVersion'] == 42 and plan['notebookPreviousVersion'] == 21 and plan['notebookVersion'] == 22
    assert plan['archiveSourceCommit'] == os.environ['ARCHIVE_SOURCE_COMMIT']
    assert release.sha(WORK / 'website/graph.jsonld') == GRAPH
    assert release.sha(WORK / 'kaggle/graph.jsonld') == GRAPH
    assert release.sha(WORK / 'hf-stage/graph.jsonld') == GRAPH
    assert release.load(WORK / 'preflight-report.json')['status'] == 'PASS'
    assert release.read(release.SITE + 'release-provenance.json').content == (WORK / 'website/release-provenance.json').read_bytes()
    assert json_get('https://huggingface.co/api/datasets/' + gates.HF)['sha'] == HF
    site_graph = release.read(release.SITE + 'graph.jsonld').content
    hf_graph = release.read('https://huggingface.co/datasets/' + gates.HF + '/resolve/' + HF + '/graph.jsonld').content
    assert site_graph == hf_graph == (WORK / 'website/graph.jsonld').read_bytes(), 'Site/HF frozen graph byte mismatch'
    owner = kaggle_client()
    gates.guard_owner(owner, 42)
    old_default = current_kaggle()
    exact = verify_exact_public_files(WORK / 'exact-v42-public', DATASET, 42, WORK / 'kaggle', release.read)
    assert exact['filesSha256Matched'] == 48 and exact['packageChecksumsVerified'] == 47
    assert exact['sourceCommit'] == SOURCE and exact['hfRevision'] == HF
    validate_policy(WORK / 'exact-v42-public')
    assert release.sha(WORK / 'exact-v42-public/graph.jsonld') == GRAPH
    release.guard_frozen(WORK)

    before = notebook_version()
    assert before in (21, 22), 'Notebook version changed unexpectedly'
    now_default = current_kaggle()
    # The original four-way publisher is concurrently verifying default v42.
    # If default already converged, it can complete Notebook publication itself.
    # Do not race two independent Notebook writers.
    original = requests.get('https://api.github.com/repos/medicaldoctor91/doctor-ghezelbaash/actions/runs/44970743590', timeout=30).json()
    original_active = original.get('status') in ('in_progress', 'queued', 'waiting', 'pending')
    if now_default == 42 and original_active and before == 21:
        decision = {'status':'DEFER_TO_ORIGINAL_WORKFLOW','publicDefaultVersion':now_default,
                    'originalStatus':original['status'], 'notebookVersion':before,
                    'exactVersion42FilesVerified':48, 'providerWrites':0}
        release.dump(WORK / 'exact-v42-notebook-outcome.json', decision)
        print(json.dumps(decision), flush=True)
        return

    proof = gates.publish_notebook(WORK, owner)
    release.guard_frozen(WORK)
    gates.guard_owner(owner, 42)
    after = notebook_version()
    assert after == 22, 'Notebook did not publish v22'
    outcome = {'status':'NOTEBOOK_V22_VERIFIED','sourceCommit':SOURCE,'hfRevision':HF,
               'kaggleDatasetVersion':42,'publicDefaultBefore':old_default,
               'publicDefaultAtWrite':now_default,'notebookVersionBefore':before,
               'notebookVersionAfter':after,'exactVersion42FilesVerified':48,
               'packageChecksumsVerified':47,
               'notebookExecution':proof,'archiveWrites':False,
               'fullPublicationVerified':False,
               'defaultPointerParity': 'DEFERRED_TO_ORIGINAL_PUBLICATION_GATE'}
    release.dump(WORK / 'exact-v42-notebook-outcome.json',outcome)
    print(json.dumps({'status':outcome['status'],'notebookVersion':after,
                      'kaggleDatasetVersion':42,'graphSHA256':GRAPH},flush=True))

if __name__ == '__main__':
    main()
