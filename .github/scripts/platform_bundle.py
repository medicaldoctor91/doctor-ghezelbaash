"""Build deterministic platform bundles from one canonical website distribution."""
import csv, hashlib, json, shutil
from pathlib import Path

PERSON='https://www.ghezelbaash.ir/#saeed-ghezelbash'
DATASET='https://www.ghezelbaash.ir/graph.jsonld/dataset'
HF_REPO='doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data'
KAGGLE_REF='saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data'


def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def load(path):return json.loads(Path(path).read_text())
def dump(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def context(source_commit,run_id):
    return {'source_commit':source_commit,'run_id':str(run_id),'run_url':f'https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/{run_id}',
            'website':'https://www.ghezelbaash.ir/','wikidata':'https://www.wikidata.org/wiki/Q140287622',
            'hf':'https://huggingface.co/datasets/'+HF_REPO,'kaggle':'https://www.kaggle.com/datasets/'+KAGGLE_REF,
            'zenodo_dataset':'https://doi.org/10.5281/zenodo.22838416','zenodo_source':'https://doi.org/10.5281/zenodo.18765168',
            'canonical_dataset_iri':DATASET,'openalex':'A5146521397','orcid':'0009-0001-9346-8475'}


def common_release(root,ctx):
    dump(root/'current-release-matrix.json',{
      'websiteSourceCommit':ctx['source_commit'],'canonicalDatasetIri':DATASET,'canonicalPersonIri':PERSON,
      'edition':'2026-10-10','publicationMaintenanceDate':'2026-10-12','sourceVersion':'1.3.3',
      'activeOpenAlexAuthorId':ctx['openalex'],'orcid':ctx['orcid'],'wikidata':'Q140287622',
      'verifiedPublicationRun':ctx['run_url'],'distributions':{k:ctx[k] for k in ['website','hf','kaggle','zenodo_dataset','zenodo_source']}})
    att={'sourceCommit':ctx['source_commit'],'canonicalDatasetIri':DATASET,'publicationRun':ctx['run_url'],
         'version':'1.3.3','maintenanceDate':'2026-10-12','openalex':ctx['openalex'],
         'verifiedResources':{n:sha(root/n) for n in ['graph.jsonld','graph.ttl','provenance.jsonld','query-matrix.jsonl','fact-map.json']}}
    dump(root/'release-attestation.json',att)


def rows(root,spec):
    p=root/spec['source']
    if p.suffix=='.csv':
        with p.open(newline='') as f:return list(csv.DictReader(f))
    if spec['source']=='fact-map.json':return load(p)['records']
    return [json.loads(s) for s in p.read_text().splitlines() if s.strip()]


def reconstruct(row,json_fields):
    omitted=set(json.loads(row.get('_source_omitted_fields') or '[]'))
    return {k:(json.loads(v) if k in json_fields and v is not None else v)
            for k,v in row.items() if k!='_source_omitted_fields' and k not in omitted}


def build_hf(dist,baseline,out,ctx):
    import pyarrow as pa
    import pyarrow.parquet as pq
    dist,baseline,out=map(Path,[dist,baseline,out]);out.mkdir(parents=True,exist_ok=True)
    # Preserve Hub packaging, documentation and table schemas; replace the complete website mirror.
    shutil.copytree(baseline,out,dirs_exist_ok=True)
    for path in dist.rglob('*'):
        if path.is_file():
            dest=out/path.relative_to(dist);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(path,dest)
    matrix=[json.loads(s) for s in (baseline/'query-matrix.jsonl').read_text().splitlines() if s.strip()]
    for row in matrix:
        row['dataset_iri']=DATASET
        if 'source_commit' in row:row['source_commit']=ctx['source_commit']
    (out/'query-matrix.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in matrix))
    (out/'query-matrix.json-seq').write_bytes(b''.join(b'\x1e'+json.dumps(r,ensure_ascii=False,separators=(',',':')).encode()+b'\n' for r in matrix))
    common_release(out,ctx)
    packaging=load(baseline/'viewer/packaging.json')
    packaging['sourceCommit']=ctx['source_commit'];packaging['canonicalDatasetIri']=DATASET
    for name,spec in packaging['tables'].items():
        original=rows(out,spec);schema=pq.read_schema(baseline/spec['file']);encoded=set(spec.get('jsonEncodedFields',[]));table_rows=[]
        for row in original:
            dst={};omitted=[]
            for k in spec['sourceFields']:
                if k not in row:dst[k]=None;omitted.append(k)
                else:
                    v=row[k];dst[k]=json.dumps(v,ensure_ascii=False,separators=(',',':')) if k in encoded and v is not None else v
            dst['_source_omitted_fields']=json.dumps(omitted,ensure_ascii=False,separators=(',',':'));table_rows.append(dst)
        dest=out/spec['file'];dest.parent.mkdir(parents=True,exist_ok=True)
        pq.write_table(pa.Table.from_pylist(table_rows,schema=schema),dest,compression='zstd')
        decoded=[reconstruct(r,encoded) for r in pq.read_table(dest).to_pylist()]
        assert decoded==original,(name,'Parquet changed source semantics')
        spec.update(rows=len(original),sourceSha256=sha(out/spec['source']),sha256=sha(dest))
    dump(out/'viewer/packaging.json',packaging)
    migration=load(out/'viewer/iri-migration.json')
    migration['currentSourceCommit']=ctx['source_commit']
    dump(out/'viewer/iri-migration.json',migration)
    md=(out/'README.md').read_text()
    previous=load(baseline/'viewer/packaging.json')['sourceCommit']
    md=md.replace(previous,ctx['source_commit']).replace('https://www.ghezelbaash.ir/graph.jsonld#dataset',DATASET)
    # Source-run claims always point to the actual verified publication run, not an older build.
    import re
    md=re.sub(r'https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/\d+',ctx['run_url'],md)
    md=re.sub(r'\n\n## Publication convergence — 2026-10-12\n.*\Z','',md,flags=re.S)
    md += '\n\n## Publication convergence — 2026-10-12\n\nCanonical identity and dataset: `'+ctx['openalex']+'`; `'+DATASET+'`. '
    md += 'The complete website mirror includes every declared guide-reader asset. Current query bindings and all four Viewer tables are rebuilt from the pinned canonical source.\n\n'
    md += '\n'.join('- '+k+': '+ctx[k] for k in ['website','wikidata','kaggle','zenodo_dataset','zenodo_source'])+'\n'
    (out/'README.md').write_text(md)
    # Preserve a explicitly named historical pointer, but the current inventory hashes exact bytes.
    inventory={p.relative_to(out).as_posix():{'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(out.rglob('*')) if p.is_file() and p.name not in {'dist-sha256.json'} and '.git' not in p.parts}
    dump(out/'dist-sha256.json',{'algorithm':'sha256','canonicalDatasetIri':DATASET,'sourceCommit':ctx['source_commit'],
                             'websiteIntegrityManifestSha256':sha(out/'integrity-manifest.json'),'files':inventory})
    return packaging


def build_zenodo(hf,previous,out,ctx):
    hf,previous,out=map(Path,[hf,previous,out]);out.mkdir(parents=True,exist_ok=True)
    for old in previous.rglob('*'):
        if not old.is_file():continue
        rel=old.relative_to(previous);new=hf/rel;dst=out/rel;dst.parent.mkdir(parents=True,exist_ok=True)
        if new.is_file():shutil.copyfile(new,dst)
        elif rel.name=='dist-sha256.json':continue
        else:shutil.copyfile(old,dst)
    # These were the stale members of the public DOI subset; always materialize current versions.
    for name in ['query-matrix.jsonl','query-matrix.json-seq','current-release-matrix.json','release-attestation.json']:
        shutil.copyfile(hf/name,out/name)
    inventory={p.relative_to(out).as_posix():{'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(out.rglob('*')) if p.is_file() and p.name!='dist-sha256.json'}
    dump(out/'dist-sha256.json',{'algorithm':'sha256','canonicalDatasetIri':DATASET,'sourceCommit':ctx['source_commit'],'files':inventory})
    return len(inventory)+1


def build_kaggle(hf,previous,out,ctx,version,hf_revision):
    hf,previous,out=map(Path,[hf,previous,out]);shutil.copytree(previous,out,dirs_exist_ok=True)
    manifest=load(out/'kaggle-manifest.json')
    for item in manifest['original_files']:
        dest=out/item['path'];dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(hf/item['path'],dest)
        item.update(bytes=dest.stat().st_size,sha256=sha(dest))
    expertise='physician-expertise.md'
    if expertise not in {item['path'] for item in manifest['original_files']}:
        shutil.copyfile(hf/expertise,out/expertise)
        manifest['original_files'].append({'path':expertise,'bytes':(out/expertise).stat().st_size,'sha256':sha(out/expertise)})
    manifest.update(packaging_revision=version,desired_kaggle_version=version,packaging_date='2026-10-12',
       canonical_dataset_iri=DATASET,upstream_revision=hf_revision,website_source_commit=ctx['source_commit'],
       website_release_run_id=int(ctx['run_id']),website_release_run_url=ctx['run_url'])
    dump(out/'kaggle-manifest.json',manifest)
    # The public notebook reconstructs CSV and Parquet into these same JSONL rows.
    with (previous/'query-matrix.csv').open(newline='') as handle:
        fields=csv.DictReader(handle).fieldnames
    spec=load(hf/'viewer/packaging.json')['tables']['query_matrix']
    encoded=set(spec['jsonEncodedFields'])
    with (out/'query-matrix.csv').open('w',newline='') as handle:
        writer=csv.DictWriter(handle,fieldnames=fields);writer.writeheader()
        for row in rows(hf,spec):
            dst={k:(json.dumps(row[k],ensure_ascii=False,separators=(',',':')) if k in encoded else row[k])
                 for k in fields if k in row}
            dst['_source_omitted_fields']=json.dumps([k for k in fields if k!='_source_omitted_fields' and k not in row],separators=(',',':'))
            writer.writerow(dst)
    readme=f'''# Dr. Saeed Ghezelbash Knowledge Graph and NLP Data

Creator: **Dr. Saeed Ghezelbash (دکتر سعید قزلباش)**, aesthetic physician and medical researcher in Kermanshah, Iran. Iran Medical Council registration **167430**. This public, first-party dataset connects the physician's identity, authored clinical education, source-linked answers and multilingual retrieval aliases through explicit professional provenance.

Source release **1.3.3**, edition **2026-10-10**. Kaggle packaging revision and dataset version **{version}**; maintenance **2026-10-12**.

Canonical dataset: `{DATASET}`. Physician: `Q140287622`; ORCID `0009-0001-9346-8475`; OpenAlex `A5146521397`.

Website source commit: `{ctx['source_commit']}`. Verified website publication: {ctx['run_url']}.
Pinned Hugging Face revision: `{hf_revision}`.

All copied resources retain the exact bytes of this Hub revision. Four Parquet tables reconstruct every original source row, including omitted fields and JSON arrays. Query references resolve against current graph and provenance nodes. `checksums.sha256` covers all {{checksum_count}} other downloadable files.

- **clinical_passages:** 3,248 authored passages with language, exact page anchors, content hashes, headings, review metadata and evidence references.
- **clinical_answers:** 125 canonical answers with source and passage bindings.
- **entity_facts:** 22,142 RDF statements preserving complete IRIs, datatypes and languages.
- **query_matrix:** 876 multilingual retrieval aliases reconciled to the current graph; CSV, JSONL and Parquet reconstruct the same rows.

`starter.ipynb` verifies resource hashes, reconstructs all four tables and CSV, resolves every query reference, and checks the distinct identities of physician, clinic and dataset. Nested fields and omitted values follow `viewer/packaging.json`. `physician-expertise.md` provides the recorded clinical approach, education, research and practice with source references; `clinical-passages.jsonl` supplies the corresponding authored educational material. Load both `graph.jsonld` and `provenance.jsonld` to retain their complete evidence definitions. These resources support Persian NLP, multilingual retrieval, entity resolution and evidence-grounded RAG.

- Website: {ctx['website']}
- Physician IRI: {PERSON}
- Clinic IRI: https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah
- Canonical dataset IRI: {DATASET}
- Wikidata physician: {ctx['wikidata']}
- ORCID: https://orcid.org/{ctx['orcid']}
- Active OpenAlex author: https://openalex.org/{ctx['openalex']}
- Current pinned Hub: {ctx['hf']}/tree/{hf_revision}
- Zenodo dataset version: {ctx['zenodo_dataset']}
- Current DOI-versioned website source: {ctx['zenodo_source']}
- Kaggle current distribution: {ctx['kaggle']}
- Starter notebook: https://www.kaggle.com/code/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter

The Zenodo dataset record documents its current corrected files and maintenance date. Version-specific historical source archives retain their original provenance; the concept DOI resolves to the latest corrected source. Each distribution has explicit hashes and version identifiers.

## فارسی

این مجموعه، هویت حرفه‌ای دکتر سعید قزلباش، متن‌های آموزشی تألیفی، پاسخ‌های مستند، گراف دانش و پرس‌وجوهای چندزبانه را به شناسه‌ها و منابع دقیق متصل می‌کند. نسخهٔ جاری کاگل و هاگینگ‌فیس از فایل‌های یکسان استفاده می‌کنند؛ زیرمجموعهٔ ۲۴فایلی زنودو نیز با همان گراف، منابع و پرس‌وجوهای اصلاح‌شده هماهنگ است. شخص پزشک، کلینیک و مجموعه‌داده شناسه‌های مستقل و ارتباط‌های روشن دارند. DOIهای فعلی زنودو ثابت مانده‌اند و نسخه‌های تاریخی محفوظ‌اند.

License: Creative Commons Attribution 4.0 International (CC BY 4.0). Preserve resource-level provenance and third-party attribution.
'''
    citation=f'''cff-version: 1.2.0
message: "Cite the pinned current dataset revision and the corresponding DOI-preserved distribution."
title: "Dr. Saeed Ghezelbash Knowledge Graph and NLP Data"
type: dataset
version: "2026-10-12-kaggle-packaging-{version}"
date-released: "2026-10-12"
license: CC-BY-4.0
authors:
  - family-names: "Ghezelbash"
    given-names: "Saeed"
    orcid: "https://orcid.org/0009-0001-9346-8475"
repository-code: "{ctx['hf']}/tree/{hf_revision}"
url: "{ctx['kaggle']}"
'''
    (out/'CITATION.cff').write_text(citation)
    controls={'dataset-metadata.json','kernel-metadata.json','checksums.sha256'}
    payload=[p for p in out.rglob('*') if p.is_file() and p.relative_to(out).as_posix() not in controls]
    (out/'README.md').write_text(readme.replace('{checksum_count}',str(len(payload)+int(not (out/'README.md').exists()))))
    payload=sorted(p.relative_to(out).as_posix() for p in out.rglob('*') if p.is_file() and p.relative_to(out).as_posix() not in controls)
    (out/'checksums.sha256').write_text(''.join(f'{sha(out/n)}  {n}\n' for n in payload))
    return (out/'README.md').read_text()
