"""Prepare a recoverable same-DOI technical correction without changing scientific data.

This module only builds local files. It has no HTTP client or publication operation.
The returned pair is (the existing 43 public filenames mapped to Paths, report).
"""
import copy
from datetime import date
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import zipfile

from archive_bundle import build_archive
from platform_bundle import DOI_POLICY, dump, load, sha

DOI = '10.5281/zenodo.23474664'
ORIGINAL_SOURCE = 'ed767f6e6726e1453196e2ec2b312fcad00677e2'
BUNDLE = 'dr-saeed-ghezelbash-dataset-1.3.4-zenodo.3.zip'
SCIENTIFIC = (
    'graph.jsonld', 'graph.ttl', 'entity-facts.csv', 'provenance.jsonld', 'shapes.ttl',
    'evidence-snapshot.json', 'clinical-passages.jsonl', 'fact-map.json', 'answers.txt',
    'llms-full.txt', 'index.md', 'knowledge.xml', 'physician-expertise.md',
    'enrichment/instruction_examples_fa_market_positioning.jsonl',
    'enrichment/instruction_examples_fa_market_positioning.csv',
    'enrichment/market-positioning-evidence.json', 'enrichment/positioning-strategy.json',
)
EXPECTED_TABLES = {'clinical_passages': 3249, 'clinical_answers': 125,
                   'entity_facts': 22235, 'query_matrix': 876, 'market_positioning': 60}
PLATFORM_DERIVED = {'enrichment/instruction_examples_fa_market_positioning.csv'}


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()


def archive_name(name):
    return 'enrichment/' + name if name.startswith((
        'instruction_examples', 'market-positioning-evidence', 'positioning-strategy')) else name


def verify_original(original_files, record):
    """Verify all downloadable bytes, safe ZIP layout and outer/nested equivalence."""
    original_files = Path(original_files)
    assert record['id'] == 23474664 and record['doi'] == DOI, 'Wrong original DOI'
    assert record['metadata']['version'] == '1.3.4+zenodo.3', 'Wrong archive version'
    names = [item['key'] for item in record['files']]
    assert len(names) == len(set(names)) == 43 and BUNDLE in names, 'Expected original 43 files'
    for item in record['files']:
        name = item['key']
        assert PurePosixPath(name).name == name, 'Unsafe original public filename'
        path = original_files / name
        assert path.is_file() and not path.is_symlink(), 'Missing original file: ' + name
        body = path.read_bytes()
        algorithm, expected = item['checksum'].split(':', 1)
        assert hashlib.new(algorithm, body).hexdigest() == expected, 'Original checksum mismatch: ' + name
        assert len(body) == item['size'], 'Original size mismatch: ' + name
    with zipfile.ZipFile(original_files / BUNDLE) as zipped:
        members = zipped.namelist()
        assert len(members) == len(set(members)), 'Duplicate original ZIP entry'
        assert all(not PurePosixPath(name).is_absolute() and '..' not in PurePosixPath(name).parts
                   and not name.endswith('/') for name in members), 'Unsafe original ZIP member'
        checksums = {}
        for line in zipped.read('checksums.sha256').decode().splitlines():
            digest, name = line.split('  ', 1)
            assert name not in checksums, 'Duplicate original checksum entry'
            assert hashlib.sha256(zipped.read(name)).hexdigest() == digest, 'Original ZIP checksum mismatch'
            checksums[name] = digest
        assert set(checksums) == set(members) - {'checksums.sha256'}, 'Incomplete original ZIP inventory'
        for name in names:
            if name != BUNDLE:
                assert zipped.read(archive_name(name)) == (original_files / name).read_bytes(), 'Outer/ZIP mismatch'
    return set(names)


def verify_inputs(original_files, website, hf_stage, plan):
    source = plan['sourceCommit']
    assert re.fullmatch('[0-9a-f]{40}', source), 'Invalid delivery source commit'
    assert plan['originalArchiveSourceCommit'] == ORIGINAL_SOURCE, 'Wrong scientific origin'
    assert plan.get('doi', DOI) == DOI, 'Wrong target DOI'
    assert re.fullmatch('[0-9a-f]{40}', plan['hfRevision']), 'Invalid pinned HF revision'
    assert type(plan['kaggleVersion']) is int and plan['kaggleVersion'] > 0
    assert type(plan['notebookVersion']) is int and plan['notebookVersion'] > 0
    date.fromisoformat(plan['technicalCorrectionDate'])
    assert load(website / 'release-provenance.json')['sourceCommit'] == source, 'Website source mismatch'
    assert load(hf_stage / 'release-provenance.json')['sourceCommit'] == source, 'HF source mismatch'
    assert load(hf_stage / 'doi-policy.json')['currentArchive']['doi'] == DOI, 'HF DOI mismatch'
    assert load(website / 'doi-policy.json')['currentArchive']['doi'] == DOI, 'Website DOI mismatch'
    for name in SCIENTIFIC:
        original = original_files / Path(name).name
        # The native JSONL is published on the website; its lossless CSV export
        # belongs to the dataset packages and was never a website resource.
        if name not in PLATFORM_DERIVED:
            assert original.read_bytes() == (website / name).read_bytes(), 'Scientific website content changed: ' + name
        assert original.read_bytes() == (hf_stage / name).read_bytes(), 'Scientific HF content changed: ' + name
    files = sorted(path for path in website.rglob('*') if path.is_file())
    assert not any(path.is_symlink() for path in website.rglob('*')), 'Website symlink is not a frozen byte snapshot'
    assert len(files) == 188, 'Incomplete website snapshot; expected 188 files'
    authored, articles = 0, 0
    for path in website.glob('*.html'):
        match = re.search(r'<script id="schema-core-mainentity" type="application/ld\+json">(.*?)</script>',
                          path.read_text(), re.S)
        if not match:
            continue
        document = json.loads(match.group(1))
        assert document['@context'] == 'https://schema.org', 'Legacy recognized JSON-LD context'
        authored += 1
        articles += any(node.get('@type') == 'Article' for node in document['@graph'])
    assert authored == 72 and articles == 63, 'Incomplete authored Article/schema snapshot'
    assert (website / 'index.html').read_bytes() == (hf_stage / 'index.html').read_bytes(), 'HF homepage differs'
    def authored_body(path):
        body = re.search(r'<body\b[^>]*>(.*)</body>', path.read_text(), re.S).group(1)
        return re.sub(r'<script\b[^>]*>.*?</script>', '', body, flags=re.S)
    assert authored_body(original_files / 'index.html') == authored_body(website / 'index.html'), 'Authored clinical homepage changed'
    packaging = load(hf_stage / 'viewer/packaging.json')
    assert packaging['sourceCommit'] == source
    assert {name: item['rows'] for name, item in packaging['tables'].items()} == EXPECTED_TABLES
    for name, item in packaging['tables'].items():
        assert sha(hf_stage / item['file']) == item['sha256'], 'Viewer checksum mismatch: ' + name
        assert sha(hf_stage / item['source']) == item['sourceSha256'], 'Viewer source checksum mismatch: ' + name
    rows = [json.loads(line) for line in (hf_stage / 'query-matrix.jsonl').read_text().splitlines() if line]
    original_rows = [json.loads(line) for line in (original_files / 'query-matrix.jsonl').read_text().splitlines() if line]
    assert len(rows) == len(original_rows) == 876
    for original, current in zip(original_rows, rows):
        assert current['source_commit'] == source
        assert {k: v for k, v in original.items() if k != 'source_commit'} == {
            k: v for k, v in current.items() if k != 'source_commit'}, 'Scientific query content changed'
    return {path.relative_to(website).as_posix(): sha(path) for path in files}


def remeasure_descriptors(root):
    """Measure dependency order without inventing hashes for self-referential files."""
    import rdflib
    from rdflib.compare import to_canonical_graph
    from rdflib.namespace import DCAT, XSD
    prefix = DOI_POLICY['downloadBindings']['publicPrefix']
    catalog = rdflib.Graph().parse(root / 'dcat.ttl', format='turtle')
    spdx = rdflib.Namespace('http://spdx.org/rdf/terms#')
    for subject, url in list(catalog.subject_objects(DCAT.downloadURL)):
        assert str(url).startswith(prefix), 'Archive download escaped current record'
        key = str(url)[len(prefix):]
        local = next((p for p in root.rglob('*') if p.is_file() and p.name == key
                      and not p.relative_to(root).as_posix().startswith(('upstream/', 'website/'))), None)
        if local is None or local.name in {'dcat.ttl', 'datapackage.json', 'croissant.json'}:
            continue
        for checksum in list(catalog.objects(subject, spdx.checksum)):
            catalog.set((checksum, spdx.checksumValue, rdflib.Literal(sha(local), datatype=XSD.hexBinary)))
        if any(catalog.objects(subject, DCAT.byteSize)):
            catalog.set((subject, DCAT.byteSize, rdflib.Literal(str(local.stat().st_size), datatype=XSD.decimal)))
    serialized = to_canonical_graph(catalog).serialize(format='nt')
    (root / 'dcat.ttl').write_text('\n'.join(sorted(line for line in serialized.splitlines() if line.strip())) + '\n')
    package = load(root / 'datapackage.json')
    for resource in package['resources']:
        assert resource['path'].startswith(prefix), 'Package download escaped current record'
        key = resource['path'][len(prefix):]
        local = next((p for p in root.rglob('*') if p.is_file() and p.name == key
                      and not p.relative_to(root).as_posix().startswith(('upstream/', 'website/'))), None)
        assert local is not None, 'Missing archive resource: ' + key
        if key in {'datapackage.json', 'croissant.json'}:
            resource.pop('hash', None)
            resource.pop('bytes', None)
        elif 'hash' in resource:
            resource.update(hash='sha256:' + sha(local), bytes=local.stat().st_size)
    dump(root / 'datapackage.json', package)
    croissant = load(root / 'croissant.json')
    for resource in croissant['distribution']:
        local = root / resource['name']
        assert resource['contentUrl'] == prefix + Path(resource['name']).name
        resource.update(sha256=sha(local), contentSize=str(local.stat().st_size) + ' B')
    dump(root / 'croissant.json', croissant)


def build_correction(original_files: Path, website: Path, hf_stage: Path,
                     output: Path, plan: dict) -> tuple[dict[str, Path], dict]:
    from doi_validation import validate_archive, validate_policy
    original_files, website, hf_stage, output = map(Path, (original_files, website, hf_stage, output))
    record_path = Path(plan.get('originalPublicRecordPath', original_files / 'public-record.json'))
    record = load(record_path)
    names = verify_original(original_files, record)
    snapshot = verify_inputs(original_files, website, hf_stage, plan)
    assert not output.exists() or not any(output.iterdir()), 'Correction output must be empty'
    output.mkdir(parents=True, exist_ok=True)
    previous = output / 'original'
    with zipfile.ZipFile(original_files / BUNDLE) as zipped:
        zipped.extractall(previous)  # verify_original already rejected unsafe and duplicate names.
    files, _ = build_archive(hf_stage, previous, output / 'archive', plan['sourceCommit'])
    assert set(files) == names, 'Archive standalone layout changed'
    root = output / 'archive'
    upstream = root / 'upstream'
    original_zip = upstream / ('pre-correction-' + plan['technicalCorrectionDate'] + '-original.zip')
    original_record = upstream / ('pre-correction-' + plan['technicalCorrectionDate'] + '-public-record.json')
    shutil.copyfile(original_files / BUNDLE, original_zip)
    shutil.copyfile(record_path, original_record)
    shutil.copytree(website, root / 'website')
    # This is an exact delivered-site snapshot, including machine policies as they
    # were actually published. Archive-root metadata describes the correction.
    assert {name: sha(root / 'website' / name) for name in snapshot} == snapshot
    policy = copy.deepcopy(load(root / 'doi-policy.json'))
    policy['currentArchive'].update(
        sourceCommit=ORIGINAL_SOURCE, sourceCommitReference='release-provenance.json#/originalScientificSourceCommit',
        originalScientificSourceCommit=ORIGINAL_SOURCE, deliverySourceCommit=plan['sourceCommit'],
        meaning='Same DOI and scientific edition; minor technical schema/delivery correction with preserved prior bytes in upstream/.')
    policy['archiveMutationPolicy'] = (
        'Scientific contents, DOI and edition remain unchanged. This explicitly recorded minor technical correction '
        'preserves the prior archive ZIP and public record in upstream/ and repairs schema delivery, distribution '
        'bindings and complete website preservation. Future scientific changes require a new version.')
    dump(root / 'doi-policy.json', policy)
    provenance = load(website / 'release-provenance.json')
    provenance.update(originalScientificSourceCommit=ORIGINAL_SOURCE, deliverySourceCommit=plan['sourceCommit'], doiPolicy=policy)
    dump(root / 'release-provenance.json', provenance)
    pinned_hf = 'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/tree/' + plan['hfRevision']
    pinned_kg = 'https://www.kaggle.com/datasets/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data/versions/' + str(plan['kaggleVersion'])
    # A notebook's sequential version number is not Kaggle's global scriptVersionId.
    # Keep the real public page URL and record the version as a separate field.
    pinned_nb = 'https://www.kaggle.com/code/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter'
    correction = {
        'kind': 'same-doi-minor-technical-correction', 'doi': DOI, 'date': plan['technicalCorrectionDate'],
        'originalScientificSourceCommit': ORIGINAL_SOURCE, 'deliverySourceCommit': plan['sourceCommit'],
        'scientificContentChanged': False, 'priorPublishedFileBytesPreservedIn': str(original_zip.relative_to(root)),
        'priorZipSHA256': sha(original_zip), 'priorPublicRecordSHA256': sha(original_record),
        'currentBindings': {'hfRevision': plan['hfRevision'], 'kaggleVersion': plan['kaggleVersion'],
                            'notebookVersion': plan['notebookVersion']},
        'websiteSnapshot': {'directory': 'website/', 'files': snapshot, 'fileCount': 188,
                            'authoredHTMLPages': 72, 'articlePages': 63},
        'preservedScientificFiles': {name: sha(root / name) for name in SCIENTIFIC},
        'scope': 'Technical JSON-LD delivery, indexing guidance, provenance/pins and complete delivered website preservation; no clinical text, graph facts, training messages or DOI changes.',
    }
    dump(root / 'technical-correction.json', correction)
    (root / 'README.md').write_text(
        '# Dr. Saeed Ghezelbash — same-DOI technical correction\n\n'
        'Public collection and latest version: ' + policy['concept']['url'] + '\n\n'
        'Dataset DOI: https://doi.org/' + DOI + '; packaging 1.3.4+zenodo.3; scientific baseline 1.3.4.\n\n'
        'Minor technical schema/delivery correction dated ' + plan['technicalCorrectionDate'] + '. '
        'Clinical text, graph facts, identities and original scientific edition are unchanged. '
        'Original scientific source: `' + ORIGINAL_SOURCE + '`. Current delivery source: `' + plan['sourceCommit'] + '`.\n\n'
        'This correction replaces technical delivery and package-binding files; it does not claim that all prior '
        'published bytes are unchanged. The entire prior ZIP and its public record are preserved byte for byte '
        'under `upstream/`. All earlier upstream receipts are retained.\n\n'
        'The `website/` subtree preserves all 188 files of the delivered website, including its 72 authored pages '
        'and 63 Article schemas. Root `index.html` is the same corrected homepage; the full 1600-entity scientific '
        'graph remains unchanged. Download descriptors bind this record and measured corrected files.\n\n'
        'Current coordinated distributions (publication availability is verified externally):\n\n'
        '- Website: https://www.ghezelbaash.ir/\n'
        '- Hugging Face: ' + pinned_hf + '\n'
        '- Kaggle version ' + str(plan['kaggleVersion']) + ': ' + pinned_kg + '\n'
        '- Notebook version ' + str(plan['notebookVersion']) + ': ' + pinned_nb + '\n\n'
        'The notebook version above is the platform version number; use the public notebook page and its version '
        'history. `technical-correction.json` records the exact pins and preservation inventory.\n')
    for filename in ['current-release-matrix.json', 'release-attestation.json']:
        item = load(root / filename)
        item.update(doiPolicy=policy, originalScientificSourceCommit=ORIGINAL_SOURCE,
                    deliverySourceCommit=plan['sourceCommit'], artifactScope=['zenodo_dataset'],
                    publicationScope=['website', 'hf', 'kaggle', 'notebook', 'zenodo_dataset'],
                    archiveBindingStatus='same-DOI minor technical correction; original scientific content preserved',
                    currentArchiveIncludedInRelease=True, archivedSnapshotsUpdated=True,
                    currentHFRevision=plan['hfRevision'], currentKaggleVersion=plan['kaggleVersion'],
                    currentNotebookVersion=plan['notebookVersion'], technicalCorrection='technical-correction.json')
        if 'distributions' in item:
            item['distributions'].update(hf=pinned_hf, kaggle=pinned_kg, notebook=pinned_nb,
                                         zenodo_dataset='https://doi.org/' + DOI)
        dump(root / filename, item)
    remeasure_descriptors(root)
    attestation = load(root / 'release-attestation.json')
    attestation['verifiedResources'] = {name: sha(root / name) for name in attestation['verifiedResources']}
    attestation['verifiedResources']['technical-correction.json'] = sha(root / 'technical-correction.json')
    dump(root / 'release-attestation.json', attestation)
    archive_provenance = load(root / 'archive-provenance.json')
    archive_provenance.update(
        doiPolicy=policy, originalScientificSourceCommit=ORIGINAL_SOURCE, deliverySourceCommit=plan['sourceCommit'],
        technicalCorrection='technical-correction.json',
        preservedUpstreamFiles={p.relative_to(root).as_posix(): sha(p) for p in sorted(upstream.rglob('*')) if p.is_file()},
        websiteSnapshot={'directory': 'website/', 'files': snapshot, 'fileCount': len(snapshot)})
    dump(root / 'archive-provenance.json', archive_provenance)
    validation = validate_archive(root)
    dump(root / 'archive-validation.json', {**validation, 'onlineValidation': 'Verify corrected public files after publication'})
    dump(root / 'doi-role-inventory.json', validate_policy(root, archive=True))
    inventory = {p.relative_to(root).as_posix(): {'bytes': p.stat().st_size, 'sha256': sha(p)}
                 for p in sorted(root.rglob('*')) if p.is_file()
                 and p.relative_to(root).as_posix() not in {'dist-sha256.json', 'checksums.sha256'}}
    dump(root / 'dist-sha256.json', {'algorithm': 'sha256', 'conceptDoi': policy['concept']['doi'],
                                  'versionDoi': DOI, 'sourceCommit': plan['sourceCommit'],
                                  'originalScientificSourceCommit': ORIGINAL_SOURCE, 'files': inventory})
    members = sorted(p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()
                     and p.relative_to(root).as_posix() != 'checksums.sha256')
    (root / 'checksums.sha256').write_text(''.join(sha(root / name) + '  ' + name + '\n' for name in members))
    with zipfile.ZipFile(output / BUNDLE, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zipped:
        for name in sorted(members + ['checksums.sha256']):
            info = zipfile.ZipInfo(name, date_time=(2026, 10, 24, 0, 0, 0))
            info.compress_type, info.external_attr = zipfile.ZIP_DEFLATED, 0o100644 << 16
            zipped.writestr(info, (root / name).read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    files[BUNDLE] = output / BUNDLE
    assert set(files) == names and len(files) == 43
    for name, expected in snapshot.items():
        assert sha(root / 'website' / name) == expected, 'Website preservation differs'
    for name in SCIENTIFIC:
        assert (root / name).read_bytes() == (original_files / Path(name).name).read_bytes()
    for item in load(hf_stage / 'viewer/packaging.json')['tables'].values():
        assert (root / item['file']).read_bytes() == (hf_stage / item['file']).read_bytes()
    report = {'status': 'PASS', 'doi': DOI, 'fileCount': len(files),
              'originalScientificSourceCommit': ORIGINAL_SOURCE, 'deliverySourceCommit': plan['sourceCommit'],
              'scientificFilesExact': len(SCIENTIFIC), 'websiteFilesExact': len(snapshot),
              'authoredHTMLPages': 72, 'articlePages': 63, 'fiveTables': EXPECTED_TABLES,
              'preservedOriginalZipSHA256': sha(original_zip), 'preservedOriginalPublicRecordSHA256': sha(original_record),
              'validation': validation,
              'files': {name: {'bytes': path.stat().st_size, 'sha256': sha(path)} for name, path in files.items()}}
    dump(output / 'correction-build-report.json', report)
    return files, report
