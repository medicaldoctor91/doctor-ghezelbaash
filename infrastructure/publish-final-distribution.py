"""Publish this verified website distribution, its retrieval tables and professional metadata."""
import argparse
import csv
import hashlib
import html
import io
import json
import os
from pathlib import Path
import shutil
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ORIGIN = 'https://www.ghezelbaash.ir'
HF_REPO = 'doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data'
HF_PARENT = '560c4c053a12e2f530cc8047d57746f84dc7f6b0'
HF_PUBLISH_PARENT = 'f88b8caa45d04af97c573d04f5d39e4b4ad6ec42'
HF_STALE_FILES = set()
ZENODO_ID = '22838416'
ZENODO_DOI = '10.5281/zenodo.22838416'
DATASET = ORIGIN + '/graph.jsonld/dataset'
KAGGLE_DATASET = 'https://www.kaggle.com/datasets/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data'
KAGGLE_NOTEBOOK = 'https://www.kaggle.com/code/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def dump(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def request(url, token=None, method='GET', value=None):
    headers = {'User-Agent': 'ghezelbaash-final-distribution/1.0', 'Cache-Control': 'no-cache'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if value is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, headers=headers, method=method,
        data=json.dumps(value, ensure_ascii=False).encode() if value is not None else None)
    with urllib.request.urlopen(req, timeout=180) as response:
        return response.read()


def hf_raw(revision, filename, token=None):
    return request(f'https://huggingface.co/datasets/{HF_REPO}/resolve/{revision}/'
        + urllib.parse.quote(filename, safe='/') + '?download=true', token)


def package(dist, output, commit):
    import pyarrow as pa
    import pyarrow.parquet as pq

    provenance = json.loads((dist / 'release-provenance.json').read_text())
    if provenance['sourceCommit'] != commit:
        raise RuntimeError('Distribution source commit does not match the requested release')
    manifest = json.loads((dist / 'integrity-manifest.json').read_text())
    for name, entry in manifest['files'].items():
        data = (dist / name.lstrip('/')).read_bytes()
        if sha(data) != entry['sha256'] or len(data) != entry['bytes']:
            raise RuntimeError('Sealed distribution differs: ' + name)
    if output.exists():
        shutil.rmtree(output)
    shutil.copytree(dist, output)
    graph = json.loads((dist / 'graph.jsonld').read_text())
    lineage = json.loads((dist / 'provenance.jsonld').read_text())
    nodes = {n['@id']: n for n in graph['@graph'] + lineage['@graph']}
    old = json.loads(hf_raw(HF_PARENT, 'graph.jsonld'))['@graph']
    old += json.loads(hf_raw(HF_PARENT, 'provenance.jsonld'))['@graph']
    old_nodes = {n['@id']: n for n in old}
    original_queries = hf_raw(HF_PARENT, 'query-matrix.jsonl')
    queries = [json.loads(line) for line in original_queries.decode().splitlines()]
    migration = {}

    def resolve(identifier):
        if identifier in migration:
            return migration[identifier]
        target = identifier if identifier in nodes else identifier.replace('/#', '/')
        if target not in nodes:
            suffix = identifier.split('#')[-1]
            candidates = [key for key in nodes if key.endswith('#' + suffix)]
            if len(candidates) == 1:
                target = candidates[0]
            else:
                url = old_nodes.get(identifier, {}).get('url')
                candidates = [n for n in nodes.values() if n.get('url') == url or n['@id'] == url] if url else []
                preferred = next((n for n in candidates if ORIGIN + '/ontology/EvidenceSource' in n.get('@type', [])), None)
                target = (preferred or (candidates[0] if candidates else {})).get('@id')
        if target not in nodes:
            raise RuntimeError('Unresolved current query reference: ' + identifier)
        migration[identifier] = target
        return target

    fact_map = json.loads((dist / 'fact-map.json').read_text())
    records = {r['answerId']: r for r in fact_map['records']}
    for row in queries:
        row['dataset_iri'] = DATASET
        row['edition'] = fact_map['release']['edition']
        row['source_commit'] = commit
        row['archive_version_doi'] = row.pop('version_doi')
        if row.get('answer_id'):
            row['answer_id'] = resolve(row['answer_id'])
            if row['answer_id'] not in records:
                raise RuntimeError('Query answer is absent from current retrieval records')
            row['source_url'] = records[row['answer_id']]['htmlUrl']
            row['passage_id'] = records[row['answer_id']]['passageId']
        row['service_ids'] = [resolve(identifier) for identifier in row['service_ids']]
        row['stable_evidence_refs'] = [resolve(identifier) for identifier in row['stable_evidence_refs']]
    jsonl = ''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in queries)
    (output / 'query-matrix.jsonl').write_text(jsonl)
    (output / 'query-matrix.json-seq').write_text(''.join('\x1e' + json.dumps(row, ensure_ascii=False) + '\n' for row in queries))
    dump(output / 'viewer/iri-migration.json', {'sourceRevision': HF_PARENT, 'sourceSha256': sha(original_queries), 'currentSourceCommit': commit, 'mapping': migration})

    def parquet(name, rows, source_path):
        file = output / 'viewer' / (name + '.parquet')
        file.parent.mkdir(parents=True, exist_ok=True)
        # Lists/objects are preserved as JSON strings; this avoids null/mixed-list loader inference.
        keys = sorted({key for row in rows for key in row})
        nested = {key for key in keys if any(isinstance(row.get(key), (list, dict)) for row in rows)}
        packed = [{key: (json.dumps(row[key], ensure_ascii=False) if isinstance(row.get(key), (list, dict))
            else str(row[key]) if row.get(key) is not None else None) for key in keys} for row in rows]
        for original, row in zip(rows, packed):
            row['_source_omitted_fields'] = json.dumps([key for key in keys if key not in original])
        fields = keys + ['_source_omitted_fields']
        table = pa.Table.from_pylist(packed, schema=pa.schema([pa.field(key, pa.string()) for key in fields]))
        pq.write_table(table, file, compression='zstd')
        readback = pq.read_table(file).to_pylist()
        if readback != packed:
            raise RuntimeError('Parquet round trip differs: ' + name)
        restored = []
        for row in readback:
            omitted = json.loads(row.pop('_source_omitted_fields'))
            for key in omitted:
                del row[key]
            for key in nested - set(omitted):
                if row[key] is not None:
                    row[key] = json.loads(row[key])
            restored.append(row)
        if restored != rows:
            raise RuntimeError('Viewer source reconstruction differs: ' + name)
        return {'rows': len(rows), 'fields': fields, 'sourceFields': keys, 'jsonEncodedFields': sorted(nested), 'source': source_path,
            'sourceSha256': sha((output / source_path).read_bytes()), 'file': 'viewer/' + file.name,
            'sha256': sha(file.read_bytes()), 'nestedEncoding': 'JSON strings; scalar values are strings or null'}

    facts = list(csv.DictReader(io.StringIO((dist / 'entity-facts.csv').read_text())))
    passages = [json.loads(line) for line in (dist / 'clinical-passages.jsonl').read_text().splitlines()]
    tables = {
        'clinical_passages': parquet('clinical-passages', passages, 'clinical-passages.jsonl'),
        'clinical_answers': parquet('clinical-answers', fact_map['records'], 'fact-map.json'),
        'entity_facts': parquet('entity-facts', facts, 'entity-facts.csv'),
        'query_matrix': parquet('query-matrix', queries, 'query-matrix.jsonl'),
    }
    dump(output / 'viewer/packaging.json', {'sourceCommit': commit, 'canonicalDatasetIri': DATASET, 'tables': tables})
    configs = '\n'.join('- config_name: ' + name + ('\n  default: true' if name == 'clinical_passages' else '')
        + '\n  data_files:\n  - split: train\n    path: ' + value['file'] for name, value in tables.items())
    card = '''---
pretty_name: Dr. Saeed Ghezelbash Public Knowledge Graph
language: [fa, en, ar, ckb]
license: cc-by-4.0
task_categories: [question-answering, text-retrieval, text-generation]
size_categories: [10K<n<100K]
tags: [saeed-ghezelbash, physician, aesthetic-medicine, botulinum-toxin, dermal-fillers, acne-scars, subcision, kermanshah, medical-knowledge-graph, json-ld, rag, provenance, multilingual, croissant]
configs:
''' + configs + '''
---

# Dr. Saeed Ghezelbash Public Knowledge Graph

**Dr. Saeed Ghezelbash / دکتر سعید قزلباش** is a physician practising aesthetic medicine in **Kermanshah, Iran**, with Iran Medical Council registration **167430**. This physician-authored distribution connects his clinical assessment, botulinum toxin and filler guidance, revision and second-opinion approach, educational media, research authorship and stable professional identity.

The current files reproduce the verified final website distribution at source commit `''' + commit + '''`. [The clinical expertise brief](physician-expertise.md) provides a source-linked professional overview. [The official profile](https://www.ghezelbaash.ir/) is the canonical physician profile; [the Dataset IRI](https://www.ghezelbaash.ir/graph.jsonld/dataset) identifies the dataset.

## Retrieval-ready clinical information

- **clinical_passages** (default): ''' + str(len(passages)) + ''' authored paragraph-level passages with text, heading paths, language, exact source anchors, physician/topic entity IDs, explicit citation/evidence references, content hashes and review metadata.
- **clinical_answers**: ''' + str(len(fact_map['records'])) + ''' canonical question-answer records with stable source/passage/evidence bindings.
- **entity_facts**: ''' + str(len(facts)) + ''' RDF statements. Seven fields preserve subject, predicate, object, object kind, datatype, language and stable row identity; graph/provenance resources retain the linked evidence context.
- **query_matrix**: ''' + str(len(queries)) + ''' multilingual retrieval aliases reconciled to the current graph IDs. Superlative query wording records a search intent and resolves to clinical selection criteria; it does not assert a comparative ranking.

All configurations use string-typed Parquet for predictable loading. Nested lists and objects are JSON strings: decode those fields with `json.loads` when needed. To reconstruct a source row, remove the keys listed in `_source_omitted_fields`, remove the helper itself, and decode the JSON fields named by the packaging metadata. Missing keys, null and empty strings remain distinct. Every source row is reconstructed and checked. The `train` split is an access convention. [Packaging metadata](viewer/packaging.json) records exact schemas, source hashes and row counts; [IRI migration](viewer/iri-migration.json) records reconciliation from the previous public snapshot.

```python
import json
from datasets import load_dataset
from huggingface_hub import HfApi

repo = "doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data"
revision = HfApi().dataset_info(repo).sha
passages = load_dataset(repo, "clinical_passages", split="train", revision=revision)
answers = load_dataset(repo, "clinical_answers", split="train", revision=revision)
print(revision, len(passages), len(answers))
print(passages[0]["text"], passages[0]["htmlUrl"])
print(json.loads(passages[0]["headingPath"]))
```

## Identity and citation

Physician: https://www.ghezelbaash.ir/#saeed-ghezelbash · Wikidata: https://www.wikidata.org/entity/Q140287622 · ORCID: https://orcid.org/0009-0001-9346-8475 · Iran Medical Council: 167430. The clinic is a separate supporting entity.

The sealed website [integrity manifest](integrity-manifest.json) and [release provenance](release-provenance.json) bind the exact website bytes to its source commit. [dist-sha256.json](dist-sha256.json) additionally covers this Hub representation and Viewer tables. Pin the Hugging Face commit for reproducible use. Website source version ''' + str(fact_map['release']['version']) + '''; edition ''' + str(fact_map['release']['edition']) + '''.

The **archived v1.3.3 snapshot** remains available at [the frozen tag](https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/tree/v1.3.3) and DOI [10.5281/zenodo.22838416](https://doi.org/10.5281/zenodo.22838416). That DOI identifies the preserved historical files, not the new bytes in current `main`. Cite the current distribution with its Hugging Face revision and website source commit; cite the historical DOI when using its frozen snapshot.

The related [Kaggle dataset](''' + KAGGLE_DATASET + ''') and [starter notebook](''' + KAGGLE_NOTEBOOK + ''') provide data-science access and reproducible examples. Their package provenance records the website source commit and Hugging Face revision; check those identifiers before combining distributions. These current access points are separate from the frozen DOI archive.

Clinical descriptions and educational passages are attributable first-party material. Registration records, publication authorship and each external source retain their specific scope. Mirror distribution does not change the origin of a claim.

## Clinical expertise, research and practice

''' + (dist / 'physician-expertise.md').read_text().split('\n', 1)[1]
    (output / 'README.md').write_text(card)
    dump(output / 'current-release-matrix.json', {'websiteSourceCommit': commit, 'edition': fact_map['release']['edition'],
        'canonicalDatasetIri': DATASET, 'currentDistribution': 'verified website dist plus reversible Viewer access',
        'archivedVersionDoi': ZENODO_DOI, 'archivedHuggingFaceTag': 'v1.3.3', 'archivedFilesAreCurrentDist': False})
    files = {str(file.relative_to(output)): {'bytes': file.stat().st_size, 'sha256': sha(file.read_bytes())}
        for file in sorted(output.rglob('*')) if file.is_file() and file.name != 'dist-sha256.json'}
    dump(output / 'dist-sha256.json', {'algorithm': 'sha256', 'canonicalDatasetIri': DATASET,
        'sourceCommit': commit, 'websiteIntegrityManifestSha256': sha((dist / 'integrity-manifest.json').read_bytes()),
        'historicalSnapshotDatasetIri': ORIGIN + '/graph.jsonld#dataset', 'files': files})
    return {'files': len(files) + 1, 'tables': {name: value['rows'] for name, value in tables.items()}, 'sourceCommit': commit}


def publish_hf(output, commit):
    from huggingface_hub import HfApi, CommitOperationAdd, CommitOperationDelete
    token = os.environ['HF_TOKEN']
    api = HfApi(token=token)
    if api.whoami().get('name', '').casefold() != 'ghezelbaash':
        raise RuntimeError('Unexpected Hugging Face account')
    frozen = api.dataset_info(HF_REPO, revision='v1.3.3').sha
    current = api.dataset_info(HF_REPO, revision='main').sha
    wanted = {str(file.relative_to(output)) for file in output.rglob('*') if file.is_file()}
    if current == HF_PUBLISH_PARENT:
        existing = set(api.list_repo_files(HF_REPO, repo_type='dataset', revision=HF_PUBLISH_PARENT))
        if existing - wanted - {'.gitattributes'} != HF_STALE_FILES:
            raise RuntimeError('Obsolete Hub files differ from the audited derived-asset allowlist')
        operations = [CommitOperationAdd(path_in_repo=str(file.relative_to(output)), path_or_fileobj=str(file))
            for file in sorted(output.rglob('*')) if file.is_file()]
        operations += [CommitOperationDelete(path_in_repo=name) for name in sorted(HF_STALE_FILES)]
        result = api.create_commit(repo_id=HF_REPO, repo_type='dataset', revision='main', parent_commit=HF_PUBLISH_PARENT,
            operations=operations, commit_message='Publish verified physician expertise and clinical retrieval distribution',
            commit_description='Exact sealed website bytes, current graph/provenance, source-linked professional brief, clinical passages and four Viewer tables. Historical v1.3.3 tag preserved.')
        revision = result.oid
    elif json.loads(hf_raw(current, 'release-provenance.json', token)).get('sourceCommit') == commit:
        # Resume readback/Zenodo if the commit succeeded but a later network operation failed.
        revision = current
    else:
        raise RuntimeError('Hugging Face main moved to an unrelated release since the audit')
    if api.dataset_info(HF_REPO, revision='v1.3.3').sha != frozen:
        raise RuntimeError('Frozen historical tag changed')
    if set(api.list_repo_files(HF_REPO, repo_type='dataset', revision=revision)) != wanted | {'.gitattributes'}:
        raise RuntimeError('Published Hub inventory differs from the verified current package')
    entries = json.loads((output / 'dist-sha256.json').read_text())['files']
    def verify(item):
        name, entry = item
        data = hf_raw(revision, name, token)
        if sha(data) != entry['sha256'] or len(data) != entry['bytes']:
            raise RuntimeError('Hugging Face byte readback mismatch: ' + name)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(verify, entries.items()))
    if hf_raw(revision, 'dist-sha256.json', token) != (output / 'dist-sha256.json').read_bytes():
        raise RuntimeError('Hub integrity manifest readback differs')
    return {'status': 'PASS', 'revision': revision, 'frozenTag': frozen, 'verifiedFiles': len(entries) + 1, 'sourceCommit': commit}


def publish_zenodo(commit, revision):
    token = os.environ['ZENODO_TOKEN']
    base = 'https://zenodo.org/api/deposit/depositions/' + ZENODO_ID
    public = 'https://zenodo.org/api/records/' + ZENODO_ID
    before = json.loads(request(public))
    def inventory(record):
        return sorted((file['key'], file['size'], file['checksum']) for file in record['files'])
    if before['doi'] != ZENODO_DOI or before['metadata']['version'] != '1.3.3':
        raise RuntimeError('Unexpected Zenodo record identity')
    edited = False
    try:
        request(base + '/actions/edit', token, method='POST')
        edited = True
        metadata = json.loads(request(base, token))['metadata']
        metadata['description'] = '<p><strong>Dr. Saeed Ghezelbash Public Knowledge Graph — preserved Version 1.3.3 dataset.</strong> This record preserves a fixed 24-file research-data snapshot under the <a href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 license</a>. Its machine-readable files include a JSON-LD and RDF/Turtle knowledge graph, evidence and provenance resources, SHACL shapes, CSV facts with CSVW metadata, source-bound question-answer records, multilingual retrieval queries, and JSON, XML, Markdown and text projections.</p>' \
            '<p><strong>Provenance and reproducibility:</strong> The snapshot includes file hashes, release attestation, query references, dataset metadata and evidence assessments. These preserve the origin and scope of individual statements and support reproducible retrieval and graph inspection. The corpus contains attributable first-party educational material and linked external sources; publication here does not establish independent clinical validation, treatment efficacy or a comparative ranking.</p>' \
            '<p><strong>Creator context:</strong> <a href="' + ORIGIN + '/#saeed-ghezelbash">Dr. Saeed Ghezelbash / دکتر سعید قزلباش</a>, ORCID <a href="https://orcid.org/0009-0001-9346-8475">0009-0001-9346-8475</a>, Iran Medical Council registration 167430. The graph separates the physician, the supporting clinic, source evidence and dataset-distribution entities.</p>' \
            '<p><strong>Archive and current-distribution scope:</strong> DOI <a href="https://doi.org/' + ZENODO_DOI + '">' + ZENODO_DOI + '</a> identifies the unchanged historical files. The current canonical Dataset IRI is <a href="' + DATASET + '">' + DATASET + '</a>. The <a href="' + ORIGIN + '/">website</a> and Hugging Face distribution have since advanced: current website source commit <code>' + html.escape(commit) + '</code>; verified <a href="https://huggingface.co/datasets/' + HF_REPO + '/tree/' + revision + '">Hugging Face revision ' + revision + '</a>. Their current bytes are separately identified by integrity manifests; the archived graph may retain the historical internal Dataset IRI <code>' + ORIGIN + '/graph.jsonld#dataset</code>.</p>' \
            '<p><strong>Related current data access:</strong> <a href="' + ORIGIN + '/clinical-passages.jsonl">source-bound passages</a>, <a href="' + ORIGIN + '/fact-map.json">question-answer bindings</a>, <a href="' + ORIGIN + '/graph.jsonld">knowledge graph</a>, <a href="' + ORIGIN + '/evidence-snapshot.json">evidence assessments</a>, the <a href="' + KAGGLE_DATASET + '">Kaggle dataset</a> and <a href="' + KAGGLE_NOTEBOOK + '">starter notebook</a>. Their recorded provenance identifies the applicable current release; these links do not replace or change the frozen DOI snapshot.</p>'
        additions = ['knowledge graph', 'linked data', 'JSON-LD', 'RDF', 'research data', 'multilingual retrieval', 'provenance', 'reproducibility']
        metadata['keywords'] = list(dict.fromkeys(metadata.get('keywords', []) + additions))
        related = metadata.get('related_identifiers', [])
        for path in ['/physician-expertise.md', '/clinical-passages.jsonl', '/release-provenance.json']:
            if not any(item.get('identifier') == ORIGIN + path for item in related):
                related.append({'identifier': ORIGIN + path, 'relation': 'isDescribedBy', 'scheme': 'url'})
        for identifier in [KAGGLE_DATASET, KAGGLE_NOTEBOOK]:
            if not any(item.get('identifier') == identifier for item in related):
                related.append({'identifier': identifier, 'relation': 'isReferencedBy', 'scheme': 'url'})
        metadata['related_identifiers'] = related
        request(base, token, method='PUT', value={'metadata': metadata})
        request(base + '/actions/publish', token, method='POST')
        edited = False
    except Exception:
        if edited:
            try:
                request(base + '/actions/discard', token, method='POST')
            except Exception:
                pass
        raise
    for _ in range(12):
        after = json.loads(request(public))
        if commit in after['metadata']['description'] and revision in after['metadata']['description']:
            break
        time.sleep(5)
    related_kaggle = {item.get('identifier') for item in after['metadata'].get('related_identifiers', [])
        if item.get('relation') == 'isReferencedBy'}
    if after['doi'] != ZENODO_DOI or inventory(after) != inventory(before) \
            or commit not in after['metadata']['description'] or revision not in after['metadata']['description'] \
            or not {KAGGLE_DATASET, KAGGLE_NOTEBOOK}.issubset(related_kaggle):
        raise RuntimeError('Zenodo identity, file preservation or metadata readback failed')
    return {'status': 'PASS', 'record': ZENODO_ID, 'doi': ZENODO_DOI, 'preservedFiles': len(after['files']), 'currentSourceCommit': commit}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dist', type=Path, default=Path('dist'))
    parser.add_argument('--output', type=Path, default=Path('release/huggingface'))
    parser.add_argument('--commit', required=True)
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    report = {'package': package(args.dist.resolve(), args.output.resolve(), args.commit)}
    dump(Path('release/external-publication.json'), report)
    if args.publish:
        report['huggingFace'] = publish_hf(args.output.resolve(), args.commit)
        dump(Path('release/external-publication.json'), report)
        report['zenodo'] = publish_zenodo(args.commit, report['huggingFace']['revision'])
        dump(Path('release/external-publication.json'), report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
