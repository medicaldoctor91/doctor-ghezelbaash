"""Publish the reviewed knowledge.xml correction to the three mutable distributions."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from xml.etree import ElementTree
from urllib.parse import quote

import requests
import yaml

from platform_bundle import (
    DOI_POLICY, HF_REPO, KAGGLE_REF, build_hf, build_kaggle, context, dump, load, sha,
)
from sync_platform_machine_resources import download_kaggle, guard_kaggle_version, kaggle_client, relative_path
from coordinated_doi_release import inventory, owner_state, retry, verify_kaggle, verify_site

SOURCE = '3853f71d8d49cbbba00eabaafd7b4a76093caac1'
BASE_SOURCE = 'eafb138d596a91504ed0af66e2557f52848e36b6'
BASE_HF = '63b71242a5f2e91a90537d51c4542b071a26be3a'
BASE_KAGGLE = 37
TARGET_KAGGLE = 38
ORIGIN = 'https://www.ghezelbaash.ir/'
HUB = 'https://huggingface.co/datasets/' + HF_REPO
KAGGLE = 'https://api.kaggle.com/v1/datasets/view/' + KAGGLE_REF
OLD_XML = 'c7cff1cb83f39644d1d4c3f3c48fc95cc5749cc14b0683c47b2cfd8aebc5eccf'
NEW_XML = '41c619afa0513701a5659c09fbff17d2cd36ac841a4186703504c2abadf8590b'
RESOURCES = ('knowledge.xml', 'graph.jsonld', 'entity-facts.csv', 'release-provenance.json')
ARCHIVE = DOI_POLICY['currentArchive']
ARCHIVE_NOTE = (
    f"Zenodo DOI {ARCHIVE['doi']} identifies the preserved archive from source {BASE_SOURCE}. "
    f"The mutable XML correction is distributed from source {SOURCE}."
)
MAINTENANCE_DATE = '2026-11-20'

def get(url, **kwargs):
    response = requests.get(url, headers={'Cache-Control': 'no-cache', 'Pragma': 'no-cache',
                                         'Accept-Encoding': 'identity', **kwargs.pop('headers', {})},
                            timeout=90, **kwargs)
    response.raise_for_status()
    return response

def fresh(path):
    return get(ORIGIN + path, params={'verify_xml': time.time_ns()}).content

def hub_file(revision, path):
    return get(f'{HUB}/resolve/{revision}/{quote(path, safe="/")}').content

def hub_revision():
    return get('https://huggingface.co/api/datasets/' + HF_REPO).json()['sha']

def write_bytes(path, body):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)

def review(dist, baseline):
    manifest = load(dist/'integrity-manifest.json')
    assert manifest['files'].keys() == baseline['files'].keys()
    unchanged = {'/doi-policy.json', '/sbom.cdx.json'}
    changes = {'/knowledge.xml', '/croissant.json', '/datapackage.json',
               '/dcat.ttl', '/release-provenance.json'}
    for path, entry in manifest['files'].items():
        file = dist/path.lstrip('/')
        assert sha(file) == entry['sha256'] and file.stat().st_size == entry['bytes'], path
        if path not in changes | unchanged:
            assert entry == baseline['files'][path], ('Unexpected website change', path)
    assert sha(dist/'knowledge.xml') == NEW_XML
    assert load(dist/'doi-policy.json') == DOI_POLICY
    assert ARCHIVE['sourceCommit'] == BASE_SOURCE
    provenance = load(dist/'release-provenance.json')
    assert provenance['sourceCommit'] == SOURCE and provenance['doiPolicy'] == DOI_POLICY
    assert load(dist/'datapackage.json')['version'] == '1.3.6'
    graph = {item['@id']: item for item in load(dist/'graph.jsonld')['@graph'] if '@id' in item}
    xml = ElementTree.parse(dist/'knowledge.xml')
    services = xml.findall('./services/service')
    assert len(services) == len({item.attrib['id'] for item in services}) == 124
    doctor = xml.find('./physician').attrib['id']
    clinic = xml.find('./clinic').attrib['id']
    physical = 0
    for item in services:
        service = graph[item.attrib['id']]
        assert item.attrib['provider'] == service['provider']['@id'] == doctor
        channel, = item.findall('availableChannel')
        assert channel.attrib['id'] == service['availableChannel']['@id']
        location = graph[channel.attrib['id']].get('serviceLocation', {}).get('@id')
        assert channel.get('serviceLocation') == location
        if location:
            assert location == clinic
            physical += 1
    assert physical == 123
    return manifest

def scope_package(directory, platform):
    for filename in ('current-release-matrix.json', 'release-attestation.json'):
        value = load(directory/filename)
        value.update(archiveBindingStatus=ARCHIVE_NOTE, archiveSourceCommit=BASE_SOURCE,
                     currentArchiveIncludedInRelease=False, archivedSnapshotsUpdated=False)
        dump(directory/filename, value)

    readme = (directory/'README.md').read_text()
    for passage in (
        'Use the assigned exact DOI to cite this coordinated archive.',
        'The exact Dataset archive belongs to this coordinated release; the website source archive remains historical.',
        'The exact Dataset archive belongs to this coordinated release; the software source archive remains historical.',
        'the exact release DOI identifies this coordinated snapshot; historical records retain their own provenance.',
    ):
        readme = readme.replace(passage, ARCHIVE_NOTE)
    (directory/'README.md').write_text(readme.rstrip() + '\n\n' + ARCHIVE_NOTE + '\n')

    path = directory/'CITATION.cff'
    if not path.is_file():
        return
    citation = path.read_text()
    values = yaml.safe_load(citation)
    assert values['doi'] == ARCHIVE['doi']
    del values['doi']
    values.update(version='1.3.6+xml.' + SOURCE[:7], message=ARCHIVE_NOTE,
                  url=HUB if platform == 'hf' else
                  'https://www.kaggle.com/datasets/'+KAGGLE_REF+'/versions/'+str(TARGET_KAGGLE))
    path.write_text(yaml.safe_dump(values, allow_unicode=True, sort_keys=False))

def package_inputs(work, dist, revision_info):
    baseline_hf = work/'hf-before'
    def download(item):
        name = relative_path(item['rfilename'])
        write_bytes(baseline_hf/name, hub_file(BASE_HF, name))
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        list(pool.map(download, revision_info['siblings']))
    before = load(baseline_hf/'dist-sha256.json')
    assert set(inventory(baseline_hf)) == set(before['files']) | {'dist-sha256.json'}
    assert before['sourceCommit'] == BASE_SOURCE
    for name, entry in before['files'].items():
        assert sha(baseline_hf/name) == entry['sha256'], name
    download_kaggle(BASE_KAGGLE, work/'kaggle-before', work/'kaggle-before.zip')
    assert load(work/'kaggle-before/kaggle-manifest.json')['upstream_revision'] == BASE_HF
    for folder in (baseline_hf, work/'kaggle-before'):
        assert sha(folder/'knowledge.xml') == OLD_XML
    assert (baseline_hf/'release-provenance.json').read_bytes() == (
        work/'kaggle-before/release-provenance.json').read_bytes()

    ctx = context(SOURCE, os.environ['GITHUB_RUN_ID'], MAINTENANCE_DATE)
    ctx.update(publication_scope=['website','hf','kaggle'], coordinated_release=True,
               run_url='https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/'+SOURCE)
    hf = work/'hf-stage'
    build_hf(dist, baseline_hf, hf, ctx)
    scope_package(hf, 'hf')
    inv = load(hf/'dist-sha256.json')
    inv['files'] = {name:{'bytes':(hf/name).stat().st_size,'sha256':digest}
                    for name,digest in inventory(hf).items() if name != 'dist-sha256.json'}
    dump(hf/'dist-sha256.json', inv)

    # Compute the immutable HF revision before any publication, so Kaggle can pin it.
    git = work/'hf-git'
    env = {**os.environ, 'GIT_LFS_SKIP_SMUDGE':'1'}
    git.mkdir()
    subprocess.run(['git','init','--quiet'], cwd=git, check=True)
    subprocess.run(['git','remote','add','origin',HUB], cwd=git, check=True)
    subprocess.run(['git','fetch','--no-tags','--depth=1','origin',BASE_HF], cwd=git, env=env, check=True)
    subprocess.run(['git','checkout','--detach',BASE_HF], cwd=git, env=env, check=True)
    subprocess.run(['git','lfs','install','--local'], cwd=git, check=True)
    assert inventory(hf).keys() == inventory(baseline_hf).keys(), 'HF file set changed'
    # Only copy changed files. Unchanged LFS objects stay referenced by the parent.
    for name,digest in inventory(hf).items():
        if sha(baseline_hf/name) != digest:
            shutil.copyfile(hf/name, git/name)
            subprocess.run(['git','add','--',name], cwd=git, check=True)
    stamp = MAINTENANCE_DATE+'T00:00:00Z'
    env.update(GIT_AUTHOR_NAME='Dataset Release Automation',
               GIT_AUTHOR_EMAIL='medicaldoctor91@users.noreply.github.com',
               GIT_COMMITTER_NAME='Dataset Release Automation',
               GIT_COMMITTER_EMAIL='medicaldoctor91@users.noreply.github.com',
               GIT_AUTHOR_DATE=stamp, GIT_COMMITTER_DATE=stamp)
    subprocess.run(['git','commit','-m','Publish the validated 1.3.6 knowledge XML correction'], cwd=git, env=env, check=True)
    revision = subprocess.check_output(['git','rev-parse','HEAD'], cwd=git, text=True).strip()
    kg = work/'kaggle'
    build_kaggle(hf, work/'kaggle-before', kg, ctx, TARGET_KAGGLE, revision)
    scope_package(kg, 'kaggle')
    # The data descriptor and source attestation are identical to the Hub copies.
    for name in ('current-release-matrix.json','release-attestation.json'):
        shutil.copyfile(hf/name, kg/name)
    manifest = load(kg/'kaggle-manifest.json')
    manifest.update(archive_source_commit=BASE_SOURCE, archived_files_are_current_dist=False)
    for item in manifest['original_files']:
        path = kg/item['path']
        item.update(bytes=path.stat().st_size, sha256=sha(path))
    dump(kg/'kaggle-manifest.json', manifest)
    (kg/'checksums.sha256').write_text(''.join(
        digest+'  '+name+'\n' for name,digest in inventory(kg).items() if name != 'checksums.sha256'))
    for name in RESOURCES:
        assert (dist/name).read_bytes() == (hf/name).read_bytes() == (kg/name).read_bytes(), name
    for path in baseline_hf.glob('viewer/*.parquet'):
        if path.name != 'query-matrix.parquet':
            assert sha(hf/path.relative_to(baseline_hf)) == sha(path), ('Viewer data changed', path.name)
    prior_queries = (baseline_hf/'query-matrix.jsonl').read_text().splitlines()
    new_queries = (hf/'query-matrix.jsonl').read_text().splitlines()
    assert len(prior_queries) == len(new_queries)
    for old, new in zip(prior_queries, new_queries):
        before, after = json.loads(old), json.loads(new)
        if 'source_commit' in before:
            assert before['source_commit'] == BASE_SOURCE
            before['source_commit'] = SOURCE
        assert before == after, 'Query data changed outside its source reference'
    for folder, platform in [(hf,'hf'),(kg,'kaggle')]:
        subprocess.run([sys.executable, str(Path(__file__).resolve().parents[2]/'tests/validate_platform_sync.py'),
                        str(folder), '--platform', platform, '--source-commit', SOURCE,
                        '--report', str(work/(platform+'-validation.json'))], check=True)
    return revision

def provision_kaggle(work, client, revision):
    folder = work/'kaggle-owner'
    folder.mkdir(exist_ok=True)
    client.dataset_metadata(KAGGLE_REF, str(folder))
    metadata = load(folder/'dataset-metadata.json')
    metadata = dict(metadata.get('info') or metadata)
    text = metadata['userSpecifiedSources']
    # Preserve the source list and replace the mutable links with the verified cohort.
    text = text.replace(BASE_HF, revision).replace(BASE_SOURCE, SOURCE)
    text = text.split(' ; DOI policy: ', 1)[0] + ' ; DOI policy: ' + ARCHIVE_NOTE
    assert revision in text and SOURCE in text
    metadata.update(id=KAGGLE_REF, description=(work/'kaggle/README.md').read_text(),
                    userSpecifiedSources=text)
    assert metadata.get('subtitle')
    dump(work/'kaggle/dataset-metadata.json', metadata)
    return metadata

def verify_then_update_metadata(work, client, expected):
    state = owner_state(client)
    assert state == {'version': TARGET_KAGGLE, 'status': 'ready'}, state
    folder = work/'kaggle-metadata-after'
    folder.mkdir(exist_ok=True)
    client.dataset_metadata(KAGGLE_REF,str(folder))
    metadata = load(folder/'dataset-metadata.json')
    current = dict(metadata.get('info') or metadata)
    fields = ['description','subtitle','userSpecifiedSources']
    if any(current.get(key) != expected[key] for key in fields):
        assert not (work/'metadata-write-attempted.json').exists(), 'Check Kaggle metadata write outcome'
        dump(work/'metadata-write-attempted.json', {'fields':fields})
        current.update({key:expected[key] for key in fields})
        dump(folder/'dataset-metadata.json',current)
        client.dataset_metadata_update(KAGGLE_REF,str(folder))
    return state

def main(dist, work, mode):
    site = load(dist/'release-provenance.json')
    website = load(dist/'integrity-manifest.json')
    assert site['sourceCommit'] == SOURCE and website['files']['/knowledge.xml']['sha256'] == NEW_XML
    assert ARCHIVE['sourceCommit'] == BASE_SOURCE and ARCHIVE['packagingVersion'] == '1.3.6+zenodo.1'
    work.mkdir(exist_ok=True,parents=True)
    live = fresh('release-provenance.json')
    assert load_from_bytes(live)['sourceCommit'] in {BASE_SOURCE,SOURCE}
    hf_info = get('https://huggingface.co/api/datasets/'+HF_REPO+'/revision/'+BASE_HF).json()
    assert hf_info['sha'] == BASE_HF
    before = load_from_bytes(hub_file(BASE_HF,'integrity-manifest.json'))
    if load_from_bytes(live)['sourceCommit'] == BASE_SOURCE:
        assert load_from_bytes(fresh('integrity-manifest.json')) == before, 'Live starting bytes changed'
    assert before['files']['/knowledge.xml']['sha256'] == OLD_XML
    shutil.copytree(dist,work/'website')
    # A different runner's npm inventory or JSON key order is orthogonal to this fix.
    for name in ('sbom.cdx.json','doi-policy.json'):
        candidate = work/'website'/name
        baseline = hub_file(BASE_HF,name)
        assert hashlib.sha256(baseline).hexdigest() == before['files']['/'+name]['sha256']
        if name == 'doi-policy.json':
            assert load_from_bytes(baseline) == load(candidate)
        write_bytes(candidate,baseline)
        website['files']['/'+name] = before['files']['/'+name]
    package_path = work/'website/datapackage.json'
    package = load(package_path)
    policy = website['files']['/doi-policy.json']
    for resource in package['resources']:
        if resource['path'].endswith('/doi-policy.json'):
            resource.update(bytes=policy['bytes'],hash='sha256:'+policy['sha256'])
    package_path.write_text(json.dumps(package,ensure_ascii=False,separators=(',',':'))+'\n')
    # Update the measured DCAT policy entry to match the preserved policy bytes.
    dcat_path=work/'website/dcat.ttl'
    from rdflib import Graph, URIRef
    dcat=Graph().parse(dcat_path,format='turtle')
    distribution=URIRef(ORIGIN+'doi-policy.json/distribution')
    dcat_ns='http://www.w3.org/ns/dcat#'
    spdx_ns='http://spdx.org/rdf/terms#'
    import re
    checksum=dcat.value(distribution,URIRef(spdx_ns+'checksum'))
    old_sha=dcat.value(checksum,URIRef(spdx_ns+'checksumValue')) if checksum else None
    old_size=dcat.value(distribution,URIRef(dcat_ns+'byteSize'))
    if old_sha and str(old_sha) != policy['sha256']:
        line=next(line for line in dcat_path.read_text().splitlines()
                  if line.startswith('<'+str(distribution)+'> '))
        updated=line.replace(str(old_sha),policy['sha256'])
        if old_size is not None:
            updated=re.sub(r'(byteSize> ")\d+',lambda m:m[1]+str(policy['bytes']),updated)
        dcat_path.write_text(dcat_path.read_text().replace(line,updated))
    for name in ('datapackage.json','dcat.ttl'):
        path=work/'website'/name
        website['files']['/'+name].update(bytes=path.stat().st_size,sha256=sha(path))
    dump(work/'website/integrity-manifest.json',website)
    review(work/'website',before)
    revision = package_inputs(work,work/'website',hf_info)
    plan={'sourceCommit':SOURCE,'hfParent':BASE_HF,'hfRevision':revision,
          'kaggleVersion':TARGET_KAGGLE, 'kagglePreviousVersion':BASE_KAGGLE}
    dump(work/'release-plan.json',plan)
    if mode == 'check':
        print('VALIDATED CANDIDATE',plan,flush=True)
        return
    client = kaggle_client()
    control = provision_kaggle(work,client,revision)
    owner = owner_state(client)
    assert owner['version'] in {BASE_KAGGLE,TARGET_KAGGLE}, owner
    if owner['version'] == BASE_KAGGLE:
        guard_kaggle_version(get(KAGGLE).json(),BASE_KAGGLE)
    assert hub_revision() in {BASE_HF,revision}, 'Unexpected Hugging Face revision'
    cf = get('https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']
             +'/pages/projects/doctor-ghezelbaash', headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN']})
    assert cf.json()['success']
    get('https://huggingface.co/api/whoami-v2',headers={'Authorization':'Bearer '+os.environ['HF_TOKEN']})
    print('Validated all three payloads before publication',plan,flush=True)
    if hub_revision() == BASE_HF:
        askpass = work/'hf-askpass'
        askpass.write_text('#!/bin/sh\ncase "$1" in *Username*) printf "%s\\n" dataset-release ;; *) printf "%s\\n" "$HF_TOKEN" ;; esac\n')
        askpass.chmod(0o700)
        subprocess.run(['git','push','origin','HEAD:main'],cwd=work/'hf-git',check=True,
                       env={**os.environ,'GIT_ASKPASS':str(askpass),'GIT_TERMINAL_PROMPT':'0'})
    assert hub_revision() == revision
    assert all(hub_file(revision,name) == (work/'website'/name).read_bytes() for name in RESOURCES)
    if load_from_bytes(fresh('release-provenance.json'))['sourceCommit'] == BASE_SOURCE:
        subprocess.run(['npx','--yes','wrangler@4','pages','deploy',str(work/'website'),
                        '--project-name=doctor-ghezelbaash','--branch=main','--commit-hash='+SOURCE,
                        '--commit-message=Publish validated knowledge XML correction','--commit-dirty=false'],check=True)
    retry(work,'site',lambda:verify_site(work),attempts=18)
    assert sha(work/'website/knowledge.xml') == hashlib.sha256(fresh('knowledge.xml')).hexdigest()
    if owner_state(client)['version'] == BASE_KAGGLE:
        response = client.dataset_create_version(
            str(work/'kaggle'),version_notes='1.3.6 XML correction from website source '+SOURCE,
            quiet=True,convert_to_csv=False,delete_old_versions=False,dir_mode='zip')
        dump(work/'kaggle-submit.json',{'target':TARGET_KAGGLE,'status':str(response.status)})
    retry(work,'owner-ready',lambda:verify_then_update_metadata(work,client,control),attempts=60)
    kaggle = retry(work,'kaggle',lambda:verify_kaggle(work),attempts=80)
    assert hub_revision() == revision and get(KAGGLE).json()['currentVersionNumber'] == TARGET_KAGGLE
    assert fresh('release-provenance.json') == (work/'website/release-provenance.json').read_bytes()
    assert fresh('knowledge.xml') == hub_file(revision,'knowledge.xml') == (work/'kaggle-live/knowledge.xml').read_bytes()
    report={**plan,'status':'PASS','xmlSHA256':NEW_XML,'kaggle':kaggle,
            'archiveDOI':ARCHIVE['doi'],'archiveSourceCommit':BASE_SOURCE}
    dump(work/'publication-report.json',report)
    print('ALL THREE PUBLIC DISTRIBUTIONS VERIFIED',report,flush=True)

def load_from_bytes(value):
    return json.loads(value)

if __name__ == '__main__':
    main(Path(sys.argv[1]).resolve(),Path(sys.argv[2]).resolve(),sys.argv[3])
