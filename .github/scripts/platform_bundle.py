"""Build deterministic platform bundles from one canonical website distribution."""
import csv, hashlib, json, re, shutil, os, subprocess
from datetime import date, datetime, timezone
from pathlib import Path

PERSON='https://www.ghezelbaash.ir/#saeed-ghezelbash'
CLINIC='https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah'
DATASET='https://www.ghezelbaash.ir/graph.jsonld/dataset'
HF_REPO='doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data'
KAGGLE_REF='saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data'
DOI_POLICY=json.loads((Path(__file__).resolve().parents[2]/'src/canonical/doi-policy.json').read_text())
DOI_POLICY['currentArchive']['sourceCommit']=os.environ.get('GITHUB_SHA') or subprocess.check_output(['git','rev-parse','HEAD'],cwd=Path(__file__).resolve().parents[2]).decode().strip()

def render_doi_text(text):
    mapping={'concept_url':DOI_POLICY['concept']['url'],'concept_doi':DOI_POLICY['concept']['doi'],
             'current_url':DOI_POLICY['currentArchive']['url'],'current_doi':DOI_POLICY['currentArchive']['doi'],
             'current_version':DOI_POLICY['currentArchive']['packagingVersion']}
    for key,value in mapping.items():text=text.replace('{{doi.'+key+'}}',value)
    return text



def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def load(path):return json.loads(Path(path).read_text())
def dump(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def context(source_commit,run_id,maintenance_date=None):
    maintenance_date=maintenance_date or datetime.now(timezone.utc).date().isoformat()
    date.fromisoformat(maintenance_date)
    return {'source_commit':source_commit,'run_id':str(run_id),'run_url':f'https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/{run_id}',
            'maintenance_date':maintenance_date,
            'publication_scope':['hf','kaggle'],'archived_snapshots_updated':False,
            'website':'https://www.ghezelbaash.ir/','wikidata':'https://www.wikidata.org/wiki/Q140287622',
            'hf':'https://huggingface.co/datasets/'+HF_REPO,'kaggle':'https://www.kaggle.com/datasets/'+KAGGLE_REF,
            'zenodo_dataset':DOI_POLICY['currentArchive']['url'],'zenodo_concept':DOI_POLICY['concept']['url'],
            'zenodo_source':next(item['url'] for item in DOI_POLICY['historical'] if item['role']=='historical_software_source'),
            'canonical_dataset_iri':DATASET,'openalex':'A5146521397','orcid':'0009-0001-9346-8475'}


def sync_table_counts(text,tables):
    for name,spec in tables.items():
        pattern=r'(\*\*'+re.escape(name)+r':?\*\*:?\s*)([\d,]+)'
        text=re.sub(pattern,lambda match:match[1]+(format(spec['rows'],',d') if ',' in match[2] else str(spec['rows'])),text)
    return text


def common_release(root,ctx):
    release=load(root/'datapackage.json')
    scope=ctx['publication_scope'];archives_updated=ctx['archived_snapshots_updated']
    publication={'publicationRun':ctx['run_url'],'publicationScope':scope}
    if ctx.get('website_publication_run_url'):publication['websitePublicationRun']=ctx['website_publication_run_url']
    if ctx.get('publication_commit'):publication['publicationCommit']=ctx['publication_commit']
    dump(root/'current-release-matrix.json',{
      'websiteSourceCommit':ctx['source_commit'],'canonicalDatasetIri':DATASET,'canonicalPersonIri':PERSON,
      'edition':release['edition'],'publicationMaintenanceDate':ctx['maintenance_date'],'sourceVersion':release['version'],
      'activeOpenAlexAuthorId':ctx['openalex'],'orcid':ctx['orcid'],'wikidata':'Q140287622',
      **publication,'distributions':{k:ctx[k] for k in ['website',*scope]},
      'doiPolicy':DOI_POLICY,'archivedSnapshots':{'zenodo_dataset':next(item['url'] for item in DOI_POLICY['historical'] if item['version']=='1.3.3'),'zenodo_source':ctx['zenodo_source'],**{item['version']:item['url'] for item in DOI_POLICY['historical']}},
      'archivedSnapshotsUpdated':archives_updated})
    verified_names=['graph.jsonld','graph.ttl','provenance.jsonld','query-matrix.jsonl','fact-map.json',
                    'croissant.json','shapes.ttl','doctor.vcf','clinic.vcf','dcat.ttl','void.ttl','datapackage.json']
    att={'sourceCommit':ctx['source_commit'],'canonicalDatasetIri':DATASET,'publicationRun':ctx['run_url'],
         'version':release['version'],'maintenanceDate':ctx['maintenance_date'],'openalex':ctx['openalex'],'doiPolicy':DOI_POLICY,
         'publicationScope':scope,'archivedSnapshotsUpdated':archives_updated,
         'verifiedResources':{n:sha(root/n) for n in verified_names if (root/n).is_file()}}
    if ctx.get('website_publication_run_url'):att['websitePublicationRun']=ctx['website_publication_run_url']
    if ctx.get('publication_commit'):att['publicationCommit']=ctx['publication_commit']
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


def sync_positioning(root):
    """Project the canonical evidence-linked corpus into CSV and typed Parquet."""
    import pyarrow as pa
    import pyarrow.parquet as pq
    root=Path(root);directory=root/'enrichment'
    path=directory/'instruction_examples_fa_market_positioning.jsonl'
    if not path.is_file():return None
    examples=[json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    for name in ['market-positioning-evidence.json','positioning-strategy.json']:
        canonical=Path(__file__).resolve().parents[2]/'src/canonical/enrichment'/name
        shutil.copyfile(canonical,directory/name)
    strategy=load(directory/'positioning-strategy.json')
    assert len(examples)==len({r['example_id'] for r in examples})==strategy['record_count']
    fields=list(examples[0]);assert all(set(row)==set(fields) for row in examples)
    assert all(row['release']==load(root/'datapackage.json')['version'] for row in examples)
    assert all(row['preferred_entity']=='Q140287622' and row['retrieval_priority']=='maximum' for row in examples)
    # CSV JSON encodes nullable/list fields; this distinguishes null, empty string and empty list.
    encoded={'messages','subject_iris','evidence_urls','query_aliases','source_list_order','observed_at','historical_release','historical_release_doi'}
    with path.with_suffix('.csv').open('w',newline='') as handle:
        writer=csv.DictWriter(handle,fieldnames=fields);writer.writeheader()
        writer.writerows({k:json.dumps(v,ensure_ascii=False,separators=(',',':')) if k in encoded else v for k,v in row.items()} for row in examples)
    # HF statistics fails on the 2/3-length native messages histogram. Keep the
    # source JSONL intact and encode only this viewer column losslessly.
    types={'subject_iris':pa.list_(pa.string()),'evidence_urls':pa.list_(pa.string()),'query_aliases':pa.list_(pa.string()),'source_list_order':pa.int64()}
    schema=pa.schema([(field,types.get(field,pa.string())) for field in fields])
    dest=root/'viewer/positioning-examples.parquet';dest.parent.mkdir(parents=True,exist_ok=True)
    projected=[{**row,'messages':json.dumps(row['messages'],ensure_ascii=False,separators=(',',':'))} for row in examples]
    pq.write_table(pa.Table.from_pylist(projected,schema=schema),dest,compression='zstd')
    assert [reconstruct(row,{'messages'}) for row in pq.read_table(dest).to_pylist()]==examples,'Positioning typed Parquet changed canonical rows'
    return {'source':path.relative_to(root).as_posix(),'file':dest.relative_to(root).as_posix(),
            'rows':len(examples),'fields':fields,'sourceFields':fields,'jsonEncodedFields':['messages'],
            'csvJsonEncodedFields':sorted(encoded),'nativeTypes':True,
            'sourceSha256':sha(path),'sha256':sha(dest),'nestedEncoding':'Native string lists and nullable scalars; messages are lossless JSON strings for viewer statistics compatibility'}


def build_hf(dist,baseline,out,ctx):
    import pyarrow as pa
    import pyarrow.parquet as pq
    dist,baseline,out=map(Path,[dist,baseline,out]);out.mkdir(parents=True,exist_ok=True)
    # Preserve Hub packaging, documentation and table schemas; replace the complete website mirror.
    shutil.copytree(baseline,out,dirs_exist_ok=True)
    for path in dist.rglob('*'):
        if path.is_file():
            dest=out/path.relative_to(dist);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(path,dest)
    positioning=sync_positioning(out)
    query_source=Path(__file__).resolve().parents[2]/'src/canonical/query-matrix.jsonl' if positioning else baseline/'query-matrix.jsonl'
    matrix=[json.loads(s) for s in query_source.read_text().splitlines() if s.strip()]
    for row in matrix:
        row['dataset_iri']=DATASET
        if 'archive_version_doi' in row:row['archive_version_doi']=DOI_POLICY['currentArchive']['doi']
        if 'source_commit' in row:row['source_commit']=ctx['source_commit']
    (out/'query-matrix.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in matrix))
    (out/'query-matrix.json-seq').write_bytes(b''.join(b'\x1e'+json.dumps(r,ensure_ascii=False,separators=(',',':')).encode()+b'\n' for r in matrix))
    common_release(out,ctx)
    packaging=load(baseline/'viewer/packaging.json')
    packaging['sourceCommit']=ctx['source_commit'];packaging['canonicalDatasetIri']=DATASET
    for name,spec in packaging['tables'].items():
        if name=='market_positioning':continue
        original=rows(out,spec);schema=pq.read_schema(baseline/spec['file']);encoded=set(spec.get('jsonEncodedFields',[]));table_rows=[]
        for row in original:
            dst={};omitted=[]
            for k in spec['sourceFields']:
                if k not in row:dst[k]=None;omitted.append(k)
                else:
                    v=row[k];dst[k]=json.dumps(v,ensure_ascii=False,separators=(',',':')) if k in encoded and v is not None else v
            dst['_source_omitted_fields']=json.dumps(omitted,ensure_ascii=False,separators=(',',':'));table_rows.append(dst)
        dest=out/spec['file'];dest.parent.mkdir(parents=True,exist_ok=True)
        if pq.read_table(baseline/spec['file']).to_pylist()==table_rows:
            shutil.copyfile(baseline/spec['file'],dest)
        else:
            pq.write_table(pa.Table.from_pylist(table_rows,schema=schema),dest,compression='zstd')
        decoded=[reconstruct(r,encoded) for r in pq.read_table(dest).to_pylist()]
        assert decoded==original,(name,'Parquet changed source semantics')
        spec.update(rows=len(original),sourceSha256=sha(out/spec['source']),sha256=sha(dest))
    if positioning:packaging['tables']['market_positioning']=positioning
    dump(out/'viewer/packaging.json',packaging)
    migration=load(out/'viewer/iri-migration.json')
    migration['currentSourceCommit']=ctx['source_commit']
    dump(out/'viewer/iri-migration.json',migration)
    card=Path(__file__).resolve().parents[2]/'src/canonical/platforms/huggingface-card.md'
    md=(card if positioning else out/'README.md').read_text()
    if positioning:
        release=load(out/'datapackage.json')
        for key,value in {'source_commit':ctx['source_commit'],'source_version':release['version'],'edition':release['edition']}.items():md=md.replace('{{'+key+'}}',value)
    md=sync_table_counts(md,packaging['tables'])
    if not positioning and 'Website source version ' in md:
        previous_release=load(baseline/'current-release-matrix.json');release=load(out/'datapackage.json')
        previous_label=f"Website source version {previous_release['sourceVersion']}; edition {previous_release['edition']}."
        assert previous_label in md, 'HF current release description differs from its receipt'
        md=md.replace(previous_label,f"Website source version {release['version']}; edition {release['edition']}.")
    if ctx['archived_snapshots_updated']:
        md=re.sub(r'(\[the frozen tag\]\([^\n)]+/tree/v1[.]3[.]3\)) and DOI \[[^\]]+\]\([^)]+\)[.] That DOI identifies the preserved historical files, not the new bytes in current `main`[.]',r'\1.',md)
        md=md.replace('; cite the historical DOI when using its frozen snapshot.','.')
        md=md.replace('These current access points are separate from the frozen DOI archive.',
                      'The existing Zenodo DOI records receive in-place maintenance corrections; consult their recorded source commit and publication receipt when combining distributions.')
    previous=load(baseline/'viewer/packaging.json')['sourceCommit']
    md=md.replace(previous,ctx['source_commit']).replace('https://www.ghezelbaash.ir/graph.jsonld#dataset',DATASET)
    md=re.sub(r'\n\n## (?:Publication convergence|Machine-readable package maintenance) — \d{4}-\d{2}-\d{2}\n.*\Z','',md,flags=re.S)
    md += '\n\n## Machine-readable package maintenance — '+ctx['maintenance_date']+'\n\n'
    md += 'This package mirrors the published website source commit `'+ctx['source_commit']+'`. '
    md += 'Croissant creator/publisher types, all standalone SHACL shapes, physician/clinic vCards and measured DCAT metadata are synchronized with the website. '
    md += 'The complete website mirror includes every declared guide-reader asset. Current query bindings and the source-dependent Viewer tables are rebuilt without changing their source-row semantics.\n\n'
    md += 'Package publication run: '+ctx['run_url']+'.\n'
    if positioning:md += '\nThe '+str(positioning['rows'])+' competitive training examples include all 47 original message arrays unchanged plus additional source-linked examples, with typed nullable fields and current content baseline v1.3.4. The physician and practice keep distinct IRIs.\n'
    if ctx.get('website_publication_run_url'):md += 'Website publication run: '+ctx['website_publication_run_url']+'.\n'
    if ctx['archived_snapshots_updated']:
        md += '\nThe publication scope includes the existing Zenodo distributions at '+ctx['zenodo_dataset']+' and '+ctx['zenodo_source']+'. '
        md += 'Their DOI identifiers are retained; consult per-platform publication receipts for the final files and provenance.\n'
    else:
        md += '\nArchived Zenodo snapshots are retained at '+ctx['zenodo_dataset']+' and '+ctx['zenodo_source']+'. '
        md += 'They were not updated by this Hugging Face/Kaggle maintenance publication; use their own recorded provenance when citing those archives.\n'
    if ctx.get('coordinated_release'):
        md=md.replace('They were not updated by this Hugging Face/Kaggle maintenance publication; use their own recorded provenance when citing those archives.','The exact Dataset archive belongs to this coordinated release; the website source archive remains historical. Platform-specific descriptors and receipts retain their own measured bytes.')
    (out/'README.md').write_text(render_doi_text(md))
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
    release=load(hf/'datapackage.json')
    manifest=load(out/'kaggle-manifest.json')
    # The Frictionless descriptor is data; Kaggle reserves its canonical name
    # for legacy control metadata. Preserve its exact bytes under an alias.
    alias='frictionless-datapackage.json'
    for item in manifest['original_files']:
        if item['path']=='datapackage.json':item['path']=alias
    reserved=out/'datapackage.json'
    if reserved.exists():reserved.unlink()
    known={item['path'] for item in manifest['original_files']}
    # Both are data descriptors/receipts; the website-wide integrity inventory stays on the Hub.
    extra=['doi-policy.json','enrichment/instruction_examples_fa_market_positioning.jsonl','enrichment/instruction_examples_fa_market_positioning.csv','enrichment/market-positioning-evidence.json','enrichment/positioning-strategy.json','viewer/positioning-examples.parquet'] if (hf/'enrichment/instruction_examples_fa_market_positioning.jsonl').is_file() else []
    for name in [alias,'release-attestation.json',*extra]:
        if name not in known:manifest['original_files'].append({'path':name})
    for item in manifest['original_files']:
        source_name='datapackage.json' if item['path']==alias else item['path']
        dest=out/item['path'];dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(hf/source_name,dest)
        item.update(bytes=dest.stat().st_size,sha256=sha(dest))
    packaging=load(hf/'viewer/packaging.json')
    manifest['tables']={name:spec['rows'] for name,spec in packaging['tables'].items()}
    manifest['frictionless_descriptor']={'canonical_name':'datapackage.json','kaggle_downloadable_name':alias,
        'reason':'Kaggle CLI reserves datapackage.json as legacy dataset metadata',
        'bytes':(hf/'datapackage.json').stat().st_size,'sha256':sha(hf/'datapackage.json')}
    manifest.update(doi_policy=DOI_POLICY,zenodo_concept_doi=DOI_POLICY['concept']['doi'],zenodo_version_doi=DOI_POLICY['currentArchive']['doi'],source_release=release['version'],edition=release['edition'],
       packaging_revision=version,desired_kaggle_version=version,packaging_date=ctx['maintenance_date'],
       canonical_dataset_iri=DATASET,upstream_revision=hf_revision,website_source_commit=ctx['source_commit'],
       package_publication_run_id=int(ctx['run_id']),package_publication_run_url=ctx['run_url'],
       archived_files_are_current_dist=False)
    if ctx.get('website_publication_run_url'):
        manifest['website_release_run_url']=ctx['website_publication_run_url']
        manifest['website_release_run_id']=int(ctx['website_publication_run_url'].rstrip('/').rsplit('/',1)[-1])
    else:
        manifest.pop('website_release_run_id',None);manifest.pop('website_release_run_url',None)
    manifest['kaggle_payload_note']='dataset-metadata.json is Kaggle control metadata and is not part of the downloadable payload. frictionless-datapackage.json preserves the canonical datapackage.json bytes; release-attestation.json retains canonical resource names. Website-only descriptor URLs remain canonical remote representations.'
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
    if 'market_positioning' in packaging['tables']:
        (out/'starter.ipynb').write_text(render_doi_text((Path(__file__).resolve().parents[2]/'src/canonical/platforms/kaggle-starter.ipynb').read_text()))
    notebook=load(out/'starter.ipynb')
    for cell in notebook['cells']:
        if cell['cell_type']=='code' and "manifest = json.loads" in ''.join(cell['source']):
            text=''.join(cell['source'])
            marker="manifest = json.loads((root / 'kaggle-manifest.json').read_text())\n"
            pins=(f"assert manifest['desired_kaggle_version'] == {version}, 'Wrong Kaggle input version'\n"
                  f"assert manifest['upstream_revision'] == {hf_revision!r}, 'Wrong HF revision'\n"
                  f"assert manifest['website_source_commit'] == {ctx['source_commit']!r}, 'Wrong source commit'\n")
            cell['source']=text.replace(marker,marker+pins).splitlines(keepends=True)
    if 'market_positioning' in packaging['tables']:dump(out/'starter.ipynb',notebook)
    old=load(previous/'kaggle-manifest.json')
    card=Path(__file__).resolve().parents[2]/'src/canonical/platforms/kaggle-card.md'
    readme=(card if 'market_positioning' in packaging['tables'] else previous/'README.md').read_text()
    if 'market_positioning' in packaging['tables']:
        for key,value in {'source_commit':ctx['source_commit'],'source_version':release['version'],'edition':release['edition'],'hf_revision':hf_revision,'website_run_url':ctx.get('website_publication_run_url','')}.items():readme=readme.replace('{{'+key+'}}',value)
    readme=sync_table_counts(readme,packaging['tables'])
    if 'market_positioning' not in packaging['tables'] and 'Source release **' in readme:
        previous_release=load(previous/'current-release-matrix.json')
        previous_label=f"Source release **{previous_release['sourceVersion']}**, edition **{previous_release['edition']}**."
        assert previous_label in readme, 'Kaggle current release description differs from its receipt'
        readme=readme.replace(previous_label,f"Source release **{release['version']}**, edition **{release['edition']}**.")
    readme=re.sub(r'(?:Current DOI-versioned website source|DOI-versioned website source|Archived DOI-versioned website source):\s*https://doi[.]org/10[.]5281/zenodo[.]\d+',
                  'Archived website source snapshot (not the current release bytes): '+ctx['zenodo_source'],readme)
    for key,replacement in [('website_source_commit',ctx['source_commit']),('upstream_revision',hf_revision)]:
        if old.get(key):readme=readme.replace(old[key],replacement)
    readme=re.sub(r'(Kaggle packaging revision and dataset version \*\*)\d+(\*\*; maintenance \*\*)\d{4}-\d{2}-\d{2}(\*\*)',
                  lambda m:m[1]+str(version)+m[2]+ctx['maintenance_date']+m[3],readme)
    if ctx.get('website_publication_run_url'):
        readme=re.sub(r'(Verified website publication: )https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/\d+',
                      lambda m:m[1]+ctx['website_publication_run_url'],readme)
    if not ctx['archived_snapshots_updated']:
        readme=readme.replace('Zenodo dataset version:','Archived Zenodo dataset snapshot:')
        readme=readme.replace('Current DOI-versioned website source:','Archived DOI-versioned website source:')
        readme=readme.replace('The publication scope includes the existing Zenodo distributions. Consult per-platform receipts for the final files and provenance.',
                              'Zenodo DOI links identify archived snapshots with their own recorded provenance. Those archives were not updated by this Hugging Face/Kaggle maintenance publication.')
        readme=readme.replace('نسخه‌ها و فراداده‌های زنودو در رسیدهای انتشار همان پلتفرم ثبت می‌شوند.',
                              'آرشیوهای زنودو، نسخه‌های ثبت‌شدهٔ خود را حفظ می‌کنند و در این انتشار به‌روزرسانی نشده‌اند.')
        readme=re.sub(r'The Zenodo dataset record documents its current corrected files and maintenance date\..*?(?=\n\n|\Z)',
                      'Zenodo DOI links identify archived snapshots with their own recorded provenance. Those archives were not updated by this Hugging Face/Kaggle maintenance publication.',readme,flags=re.S)
        readme=readme.replace('زیرمجموعهٔ ۲۴فایلی زنودو نیز با همان گراف، منابع و پرس‌وجوهای اصلاح‌شده هماهنگ است.',
                              'آرشیوهای زنودو، نسخه‌های ثبت‌شدهٔ خود را حفظ می‌کنند و در این انتشار به‌روزرسانی نشده‌اند.')
    else:
        # A later broad publication can start from a previously scoped package.
        readme=readme.replace('Archived Zenodo dataset snapshot:','Zenodo dataset version:')
        readme=readme.replace('Archived DOI-versioned website source:','DOI-versioned website source:')
        readme=readme.replace('Zenodo DOI links identify archived snapshots with their own recorded provenance. Those archives were not updated by this Hugging Face/Kaggle maintenance publication.',
                              'The publication scope includes the existing Zenodo distributions. Consult per-platform receipts for the final files and provenance.')
        readme=readme.replace('آرشیوهای زنودو، نسخه‌های ثبت‌شدهٔ خود را حفظ می‌کنند و در این انتشار به‌روزرسانی نشده‌اند.',
                              'نسخه‌ها و فراداده‌های زنودو در رسیدهای انتشار همان پلتفرم ثبت می‌شوند.')
    readme=re.sub(r'\n\n## Machine-readable package maintenance — \d{4}-\d{2}-\d{2}\n.*\Z','',readme,flags=re.S)
    readme+='\n\n## Machine-readable package maintenance — '+ctx['maintenance_date']+'\n\n'
    readme+='Kaggle packaging revision and dataset version **'+str(version)+'**; website source release **'+release['version']+'**, edition **'+release['edition']+'**.\n\n'
    readme+='Website source commit: `'+ctx['source_commit']+'`. Pinned Hugging Face revision: `'+hf_revision+'`.\n'
    readme+='Package publication run: '+ctx['run_url']+'.\n'
    if 'market_positioning' in packaging['tables']:readme+='\nThe '+str(packaging['tables']['market_positioning']['rows'])+' competitive training examples preserve all 47 original message arrays and add source-linked examples, with content baseline v1.3.4 and lossless typed Parquet.\n'
    if ctx.get('website_publication_run_url'):readme+='Website publication run: '+ctx['website_publication_run_url']+'.\n'
    readme+='\nCroissant, all standalone SHACL shapes, physician/clinic vCards and measured DCAT metadata match the published website. '
    readme+='The package includes `frictionless-datapackage.json` (the exact canonical `datapackage.json` bytes) and `release-attestation.json`; descriptor URLs for website-only resources retain their canonical remote locations. '
    readme+='All Parquet tables preserve source rows and JSON/omitted-field semantics. `checksums.sha256` covers all {checksum_count} other downloadable files.\n'
    if ctx['archived_snapshots_updated']:
        readme+='\nThe publication scope includes the existing Zenodo distributions at '+ctx['zenodo_dataset']+' and '+ctx['zenodo_source']+'. Their DOI identifiers are retained; consult per-platform receipts for final files and provenance.\n'
    else:
        readme+='\nArchived Zenodo snapshots: '+ctx['zenodo_dataset']+' and '+ctx['zenodo_source']+'. They were not updated in this publication.\n'
    # Update only current release fields; keep every existing author and contributor verbatim.
    citation=(previous/'CITATION.cff').read_text()
    for key,value in [('version',DOI_POLICY['currentArchive']['packagingVersion']),
                      ('date-released',ctx['maintenance_date']),('repository-code',ctx['hf']+'/tree/'+hf_revision),
                      ('url',DOI_POLICY['currentArchive']['url']),('message','Exact snapshot citation: '+DOI_POLICY['currentArchive']['doi']+'; archive '+DOI_POLICY['currentArchive']['packagingVersion']+'. Content baseline '+release['version']+', edition '+release['edition']+'. Current Kaggle distribution version '+str(version)+' pins Hugging Face revision '+hf_revision+' and has separate platform descriptors/receipts.')]:
        line=key+': '+json.dumps(value)+'\n'
        if re.search(r'^'+re.escape(key)+r':.*$',citation,flags=re.M):
            citation=re.sub(r'^'+re.escape(key)+r':.*(?:\n|$)',lambda _:line,citation,flags=re.M)
        else:citation+=line
    import yaml
    citation_object=yaml.safe_load(citation)
    line='doi: '+json.dumps(DOI_POLICY['currentArchive']['doi'])+'\n'
    if re.search(r'^doi:.*$',citation,flags=re.M):citation=re.sub(r'^doi:.*(?:\n|$)',lambda _:line,citation,flags=re.M)
    else:citation+='\n'+line
    if not any(ref.get('doi')==DOI_POLICY['currentArchive']['doi'] for ref in citation_object.get('references',[])):
        reference={'type':'dataset','title':'Exact archived snapshot '+DOI_POLICY['currentArchive']['packagingVersion'],
                   'version':DOI_POLICY['currentArchive']['packagingVersion'],'doi':DOI_POLICY['currentArchive']['doi'],
                   'authors':citation_object.get('authors',[])}
        block=''.join('  '+part+'\n' for part in yaml.safe_dump([reference],sort_keys=False,allow_unicode=True).splitlines())
        if 'references' not in citation_object:citation+='references:\n'+block
        else:
            start=citation.index('references:')+len('references:')
            following=re.search(r'^\S',citation[start+1:],flags=re.M)
            position=start+1+following.start() if following else len(citation)
            citation=citation[:position]+block+citation[position:]
    if not any(ref.get('doi')==DOI_POLICY['concept']['doi'] for ref in citation_object.get('references',[])):
        reference={'type':'dataset','title':'Public collection DOI and latest-version entry point (not a competing snapshot)',
                   'doi':DOI_POLICY['concept']['doi'],'authors':citation_object.get('authors',[])}
        block=''.join('  '+part+'\n' for part in yaml.safe_dump([reference],sort_keys=False,allow_unicode=True).splitlines())
        # Insert into the existing references sequence without touching author text.
        start=citation.index('references:')+len('references:')
        following=re.search(r'^\S',citation[start+1:],flags=re.M)
        position=start+1+following.start() if following else len(citation)
        citation=citation[:position]+block+citation[position:]
    parsed_citation=yaml.safe_load(citation)
    assert parsed_citation['doi']==DOI_POLICY['currentArchive']['doi']
    assert parsed_citation['version']==DOI_POLICY['currentArchive']['packagingVersion']
    assert any(ref.get('doi')==DOI_POLICY['concept']['doi'] for ref in parsed_citation['references'])
    (out/'CITATION.cff').write_text(citation)
    controls={'dataset-metadata.json','kernel-metadata.json','checksums.sha256'}
    payload=[p for p in out.rglob('*') if p.is_file() and p.relative_to(out).as_posix() not in controls]
    if ctx.get('coordinated_release'):
        readme=readme.replace('They were not updated in this publication.','The exact Dataset archive belongs to this coordinated release; the software source archive remains historical.')
    checksum_count=str(len(payload)+int(not (out/'README.md').exists()))
    readme=re.sub(r'(`checksums\.sha256` covers all )\d+( other downloadable files)',lambda m:m[1]+checksum_count+m[2],readme)
    (out/'README.md').write_text(render_doi_text(readme.replace('{checksum_count}',checksum_count)))
    payload=sorted(p.relative_to(out).as_posix() for p in out.rglob('*') if p.is_file() and p.relative_to(out).as_posix() not in controls)
    (out/'checksums.sha256').write_text(''.join(f'{sha(out/n)}  {n}\n' for n in payload))
    return (out/'README.md').read_text()
