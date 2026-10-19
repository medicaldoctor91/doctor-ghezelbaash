"""Maintain fetched public distributions without rebuilding clinical content."""
import argparse
import hashlib
import io
import json
import os
import re
import shutil
import time
import zipfile
from pathlib import Path

import requests

HF = 'doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data'
KG = 'saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data'
NOTEBOOK = 'saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter'
SITE = 'https://www.ghezelbaash.ir/'
HUB = 'https://huggingface.co/datasets/' + HF
KAGGLE = 'https://www.kaggle.com/datasets/' + KG
LINKS = {'Website': SITE, 'Hugging Face': HUB, 'Kaggle dataset': KAGGLE,
         'Kaggle notebook': 'https://www.kaggle.com/code/' + NOTEBOOK,
         'Zenodo collection': 'https://doi.org/10.5281/zenodo.18765168',
         'Zenodo dataset archive': 'https://doi.org/10.5281/zenodo.22838416',
         'Wikidata': 'https://www.wikidata.org/wiki/Q140287622'}


def get(url):
    response = requests.get(url, timeout=90, headers={'Cache-Control': 'no-cache'})
    response.raise_for_status()
    return response.content


def load(path):
    return json.loads(Path(path).read_text())


def dump(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def repair_viewer(root):
    import pyarrow as pa
    import pyarrow.parquet as pq
    packaging = load(root / 'viewer/packaging.json')
    spec = packaging['tables']['market_positioning']
    dest = root / spec['file']
    table = pq.read_table(dest)
    original = table.to_pylist()
    if not pa.types.is_string(table.schema.field('messages').type):
        values = [json.dumps(row['messages'], ensure_ascii=False, separators=(',', ':')) for row in original]
        table = table.set_column(table.schema.get_field_index('messages'), 'messages', pa.array(values, type=pa.string()))
        pq.write_table(table, dest, compression='zstd')
        decoded = pq.read_table(dest).to_pylist()
        for row in decoded:
            row['messages'] = json.loads(row['messages'])
        assert decoded == original, 'Viewer encoding changed source rows'
    spec['jsonEncodedFields'] = sorted(set(spec.get('jsonEncodedFields', [])) | {'messages'})
    spec['sha256'] = sha(dest)
    spec['nestedEncoding'] = 'Native string lists and nullable scalars; messages are lossless JSON strings for viewer statistics compatibility'
    dump(root / 'viewer/packaging.json', packaging)


def connected_text(text):
    text = text.replace('all four tables', 'all five tables')
    text = text.replace('Reference resolution checks linkage, not the clinical validity of a claim.',
                        'Reference resolution connects each query to its published clinical content and graph definitions.')
    text = text.replace('Distribution on Kaggle and Hugging Face does not make the mirrors independent sources.',
                        'Kaggle and Hugging Face provide complementary, linked distributions of the physician-authored knowledge graph.')
    text = text.replace('It uses native list fields, nullable integer `source_list_order` and nullable timestamp strings; it round-trips directly to the canonical JSONL.',
                        'It uses native string-list fields, nullable integer `source_list_order` and nullable timestamp strings. The `messages` column uses lossless JSON strings for viewer compatibility; decoding the fields recorded in `viewer/packaging.json` reconstructs the canonical JSONL exactly.')
    heading = '\n\n## Connected publications\n\n'
    if heading not in text:
        text += heading + '\n'.join('- [' + label + '](' + url + ')' for label, url in LINKS.items()) + '\n'
        text += '\nThe website, dataset distributions, executable notebook, DOI archives and Wikidata profile share stable entity identifiers and explicit edition links. '
        text += 'Parquet stores `messages` as lossless JSON strings for viewer compatibility; the JSONL and CSV exports retain every original message, with decoding specified in `viewer/packaging.json`.\n'
    return text


def repair_notebook(notebook):
    for cell in notebook['cells']:
        if cell['cell_type'] == 'markdown':
            text = ''.join(cell['source'])
            # Shared links belong in the introduction, rather than every cell.
            text = connected_text(text) if text.startswith('# ') else connected_text(text).split('\n\n## Connected publications')[0]
            cell['source'] = text.splitlines(keepends=True)
        else:
            cell['execution_count'] = None
            cell['outputs'] = []
    return notebook


def execute_notebook(root):
    current = Path.cwd()
    namespace = {}
    os.chdir(root)
    try:
        for index, cell in enumerate(load(root / 'starter.ipynb')['cells']):
            if cell['cell_type'] == 'code':
                exec(compile(''.join(cell['source']), 'published-notebook-cell-' + str(index), 'exec'), namespace)
    finally:
        os.chdir(current)


def seal_kaggle(root):
    excluded = {'checksums.sha256', 'dataset-metadata.json', 'kernel-metadata.json'}
    files = sorted(p for p in root.rglob('*') if p.is_file() and p.relative_to(root).as_posix() not in excluded)
    (root / 'checksums.sha256').write_text(''.join(sha(p) + '  ' + p.relative_to(root).as_posix() + '\n' for p in files))


def zenodo_metadata(record, revision, token):
    """Update only live descriptions/links; keep every DOI, version and file."""
    base = 'https://zenodo.org/api/'
    original = json.loads(get(base + 'records/' + str(record)))
    before_files = {f['key']: f['checksum'] for f in original['files']}
    session = requests.Session()
    session.headers['Authorization'] = 'Bearer ' + token
    dep = base + 'deposit/depositions/' + str(record)
    response = session.get(dep, timeout=60)
    response.raise_for_status()
    draft = response.json()
    assert draft.get('state') != 'inprogress', 'Existing Zenodo draft must not be overwritten'
    metadata = draft['metadata']
    description = metadata['description']
    description = re.sub(r'<p><strong>Connected publications — .*?</p>', '', description, flags=re.S)
    description += '<p><strong>Connected publications — 2026-10-19:</strong> '
    description += 'Dr. Saeed Ghezelbash; Wikidata Q140287622; ORCID 0009-0001-9346-8475; OpenAlex A5146521397. '
    description += 'Content baseline v1.3.4; canonical dataset https://www.ghezelbaash.ir/graph.jsonld/dataset. '
    description += ' '.join('<a href="' + url + '">' + label + '</a>.' for label, url in LINKS.items())
    description += ' Current Hugging Face package: <a href="' + HUB + '/tree/' + revision + '">' + revision + '</a>. '
    description += 'The DOI and recorded archive edition provide persistent citation and complement the current linked distributions.</p>'
    metadata['description'] = description
    related = metadata.setdefault('related_identifiers', [])
    known = {r['identifier'] for r in related}
    for url in [*LINKS.values(), HUB + '/tree/' + revision]:
        if url not in known and url != 'https://doi.org/' + original['doi']:
            related.append({'identifier': url, 'relation': 'isSupplementTo', 'scheme': 'url'})
    for method, url, payload in [('POST', dep + '/actions/edit', None), ('PUT', dep, {'metadata': metadata}), ('POST', dep + '/actions/publish', None)]:
        response = session.request(method, url, json=payload, timeout=90)
        response.raise_for_status()
    final = json.loads(get(base + 'records/' + str(record)))
    assert final['doi'] == original['doi'] and final['metadata']['version'] == original['metadata']['version']
    assert {f['key']: f['checksum'] for f in final['files']} == before_files
    assert LINKS['Kaggle notebook'] in final['metadata']['description']
    return {'record': record, 'metadataVerified': True, 'archiveFilesUnchanged': True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path('/tmp/live-platform-maintenance'))
    parser.add_argument('--hf-revision', required=True)
    parser.add_argument('--kaggle-version', type=int, required=True)
    parser.add_argument('--website-commit', required=True)
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--zenodo-only', action='store_true')
    args = parser.parse_args()
    root = args.root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    hf_info = json.loads(get('https://huggingface.co/api/datasets/' + HF))
    if args.zenodo_only:
        assert hf_info['sha'] == args.hf_revision, 'HF changed since live review'
        report = {'scope': 'Zenodo metadata only', 'hfRevision': args.hf_revision, 'zenodo': []}
        for record in [22838416, 23289009]:
            report['zenodo'].append(zenodo_metadata(record, args.hf_revision, os.environ['ZENODO_TOKEN']))
            dump(root / 'report.json', report)
        print(json.dumps(report), flush=True)
        return
    kg_info = json.loads(get('https://api.kaggle.com/v1/datasets/view/' + KG))
    assert hf_info['sha'] == args.hf_revision, 'HF changed since live review'
    assert kg_info['currentVersionNumber'] == args.kaggle_version, 'Kaggle changed since live review'
    assert json.loads(get(SITE + 'release-provenance.json'))['sourceCommit'] == args.website_commit
    archive = get('https://www.kaggle.com/api/v1/datasets/download/' + KG + '?datasetVersionNumber=' + str(args.kaggle_version))
    stage = root / 'kaggle'
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        assert zipped.testzip() is None
        for name in zipped.namelist():
            assert '..' not in Path(name).parts and not Path(name).is_absolute()
        zipped.extractall(stage)
    baseline_notebook = get('https://www.kaggle.com/api/v1/kernels/pull/' + NOTEBOOK)
    dump(root / 'notebook-before.json', json.loads(baseline_notebook))
    for line in (stage / 'checksums.sha256').read_text().splitlines():
        digest, name = line.split('  ', 1)
        assert sha(stage / name) == digest, name
    hf_stage = root / 'hf'
    for name in ['viewer/positioning-examples.parquet', 'viewer/packaging.json', 'README.md', 'dist-sha256.json']:
        dest = hf_stage / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(get(HUB + '/resolve/' + args.hf_revision + '/' + name))
        if (stage / name).exists() and name != 'README.md':
            assert dest.read_bytes() == (stage / name).read_bytes(), 'Live distributions differ: ' + name
    repair_viewer(hf_stage)
    (hf_stage / 'README.md').write_text(connected_text((hf_stage / 'README.md').read_text()))
    inventory = load(hf_stage / 'dist-sha256.json')
    for name in ['viewer/positioning-examples.parquet', 'viewer/packaging.json', 'README.md']:
        inventory['files'][name] = {'bytes': (hf_stage / name).stat().st_size, 'sha256': sha(hf_stage / name)}
    dump(hf_stage / 'dist-sha256.json', inventory)
    for name in ['viewer/positioning-examples.parquet', 'viewer/packaging.json']:
        shutil.copyfile(hf_stage / name, stage / name)
    dump(stage / 'starter.ipynb', repair_notebook(load(stage / 'starter.ipynb')))
    (stage / 'README.md').write_text(connected_text((stage / 'README.md').read_text()))
    manifest = load(stage / 'kaggle-manifest.json')
    next_version = args.kaggle_version + 1
    manifest.update(packaging_revision=next_version, desired_kaggle_version=next_version)
    for item in manifest['original_files']:
        item.update(bytes=(stage / item['path']).stat().st_size, sha256=sha(stage / item['path']))
    dump(stage / 'kaggle-manifest.json', manifest)
    seal_kaggle(stage)
    execute_notebook(stage)
    if not args.publish:
        print('Fetched live packages transformed and all notebook cells passed; no publication requested.')
        return
    from huggingface_hub import HfApi, CommitOperationAdd
    from sync_platform_machine_resources import kaggle_client
    report = {'websiteSourceCommit': args.website_commit, 'baselineHfRevision': args.hf_revision, 'baselineKaggleVersion': args.kaggle_version}
    dump(root / 'report.json', report)
    api = HfApi(token=os.environ['HF_TOKEN'])
    result = api.create_commit(repo_id=HF, repo_type='dataset', parent_commit=args.hf_revision,
                               commit_message='Repair viewer statistics compatibility and connect all publications',
                               operations=[CommitOperationAdd(path_in_repo=p.relative_to(hf_stage).as_posix(), path_or_fileobj=str(p)) for p in hf_stage.rglob('*') if p.is_file()])
    revision = result.oid
    report['hfRevision'] = revision
    dump(root / 'report.json', report)
    previous_upstream = manifest['upstream_revision']
    manifest['upstream_revision'] = revision
    dump(stage / 'kaggle-manifest.json', manifest)
    readme = (stage / 'README.md').read_text().replace(args.hf_revision, revision).replace(previous_upstream, revision)
    readme = re.sub(r'Kaggle packaging revision and dataset version \*\*\d+\*\*', 'Kaggle packaging revision and dataset version **' + str(next_version) + '**', readme)
    (stage / 'README.md').write_text(readme)
    citation = (stage / 'CITATION.cff').read_text()
    citation = citation.replace(previous_upstream, revision)
    citation = re.sub(r'(?m)^version:.*$', 'version: "2026-10-19-kaggle-packaging-' + str(next_version) + '"', citation)
    (stage / 'CITATION.cff').write_text(citation)
    seal_kaggle(stage)
    execute_notebook(stage)
    client = kaggle_client()
    control_dir = root / 'metadata'
    control_dir.mkdir(exist_ok=True)
    client.dataset_metadata(KG, str(control_dir))
    control = load(control_dir / 'dataset-metadata.json')
    control = dict(control.get('info') or control)
    control.update(id=KG, description=readme)
    if isinstance(control.get('userSpecifiedSources'), str):
        control['userSpecifiedSources'] = re.sub(re.escape(HUB) + r'/tree/[0-9a-f]{40}', HUB + '/tree/' + revision, control['userSpecifiedSources'])
    dump(stage / 'dataset-metadata.json', control)
    assert json.loads(get('https://api.kaggle.com/v1/datasets/view/' + KG))['currentVersionNumber'] == args.kaggle_version
    # A version submission is never retried; ambiguous results are resolved by live fetches.
    response = client.dataset_create_version(str(stage), version_notes='Connect all publications, refresh starter notebook and repair lossless training-message viewer statistics', quiet=True, convert_to_csv=False, delete_old_versions=False, dir_mode='zip')
    report['kaggleSubmissionStatus'] = str(getattr(response, 'status', 'submitted'))
    dump(root / 'report.json', report)
    notebook_dir = root / 'notebook'
    notebook_dir.mkdir(exist_ok=True)
    client.kernels_pull(NOTEBOOK, str(notebook_dir), metadata=True, quiet=True)
    kernel_meta = load(notebook_dir / 'kernel-metadata.json')
    kernel_meta.update(id=NOTEBOOK, code_file='starter.ipynb', dataset_sources=[KG], enable_internet=True)
    dump(notebook_dir / 'kernel-metadata.json', kernel_meta)
    shutil.copyfile(stage / 'starter.ipynb', notebook_dir / 'starter.ipynb')
    client.kernels_push(str(notebook_dir))
    report['notebookSubmitted'] = True
    dump(root / 'report.json', report)
    for attempt in range(90):
        info = json.loads(get('https://api.kaggle.com/v1/datasets/view/' + KG))
        if info['currentVersionNumber'] == next_version:
            public = get('https://www.kaggle.com/api/v1/datasets/download/' + KG + '?datasetVersionNumber=' + str(next_version) + '&verify=' + str(attempt))
            with zipfile.ZipFile(io.BytesIO(public)) as zipped:
                if zipped.read('checksums.sha256') == (stage / 'checksums.sha256').read_bytes():
                    for line in (stage / 'checksums.sha256').read_text().splitlines():
                        digest, name = line.split('  ', 1)
                        assert hashlib.sha256(zipped.read(name)).hexdigest() == digest, name
                    break
        time.sleep(10)
    else:
        raise RuntimeError('Kaggle submission remains unconfirmed; inspect live version before retrying')
    report['kaggleVersion'] = next_version
    dump(root / 'report.json', report)
    report['zenodo'] = []
    if os.environ.get('ZENODO_TOKEN'):
        for record in [22838416, 23289009]:
            report['zenodo'].append(zenodo_metadata(record, revision, os.environ['ZENODO_TOKEN']))
            dump(root / 'report.json', report)
    for attempt in range(60):
        status = client.kernels_status(NOTEBOOK)
        value = str(getattr(status, 'status', status)).lower()
        report['notebookStatus'] = value
        dump(root / 'report.json', report)
        if 'complete' in value:
            break
        assert not any(word in value for word in ['error', 'cancel', 'fail']), value
        time.sleep(10)
    final = json.loads(get('https://www.kaggle.com/api/v1/kernels/pull/' + NOTEBOOK))
    source = final['blob'].get('source') or final['blob']['sourceNullable']
    assert json.loads(source)['cells'] == load(stage / 'starter.ipynb')['cells']
    report['notebookVersion'] = final['metadata']['currentVersionNumber']
    report['notebookSourceVerified'] = True
    dump(root / 'report.json', report)
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
