"""Build an immutable, record-bound Zenodo payload from the canonical release."""
import hashlib
import json
import shutil
import zipfile
from pathlib import Path
from urllib.parse import quote, urlparse

from platform_bundle import DOI_POLICY, dump, load, sha, render_doi_text

DESCRIPTORS = {'croissant.json', 'datapackage.json', 'dcat.ttl', 'void.ttl', 'entity-facts.csv-metadata.json'}
ORIGIN = 'https://www.ghezelbaash.ir/'


def file_key(path):
    return Path(path).name


def public_url(path):
    return DOI_POLICY['downloadBindings']['publicPrefix'] + quote(file_key(path), safe='')


def build_archive(hf, previous_archive, output, source_commit):
    import rdflib
    import yaml
    from rdflib.namespace import DCAT, XSD
    from doi_validation import validate_archive, validate_policy

    hf, previous_archive, output = map(Path, [hf, previous_archive, output])
    if output.exists():
        assert output.name == 'archive' and output.parent != output
        shutil.rmtree(output)
    output.mkdir(parents=True, exist_ok=True)
    names = ['graph.jsonld', 'graph.ttl', 'entity-facts.csv', 'entity-facts.csv-metadata.json',
             'provenance.jsonld', 'shapes.ttl', 'evidence-snapshot.json', 'clinical-passages.jsonl', 'fact-map.json',
             'answers.txt', 'llms.txt', 'llms-full.txt', 'index.md', 'index.html', 'knowledge.xml', 'physician-expertise.md',
             'croissant.json', 'datapackage.json', 'dcat.ttl', 'void.ttl', 'linkset.json', 'doctor.vcf', 'clinic.vcf',
             'sitemap.xml', 'robots.txt', 'site.webmanifest', 'query-matrix.jsonl', 'query-matrix.json-seq',
             'doi-policy.json', 'current-release-matrix.json', 'release-attestation.json', 'release-provenance.json']
    names += ['enrichment/' + name for name in ['instruction_examples_fa_market_positioning.jsonl',
              'instruction_examples_fa_market_positioning.csv', 'market-positioning-evidence.json', 'positioning-strategy.json']]
    names += [path.relative_to(hf).as_posix() for path in (hf / 'viewer').glob('*') if path.is_file()]
    for name in names:
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(hf / name, target)
    upstream = output / 'upstream'
    upstream.mkdir(exist_ok=True)
    # These are exact, explicitly historical inputs from the previous published archive.
    # No DOI or download URL inside these preserved receipts is rewritten.
    if (previous_archive / 'upstream').is_dir():
        shutil.copytree(previous_archive / 'upstream', upstream, dirs_exist_ok=True)
    parent_provenance=load(previous_archive/'archive-provenance.json')
    parent_record=parent_provenance['zenodoDOI'].rsplit('.',1)[-1]
    shutil.copyfile(previous_archive / 'archive-provenance.json', upstream / ('zenodo-'+parent_record+'-archive-provenance.json'))
    current = DOI_POLICY['currentArchive']
    text = '# Dr. Saeed Ghezelbash — DOI-policy aligned Dataset archive\n\n'
    text += 'Public collection and latest version: '+DOI_POLICY['concept']['url']+'\n\n'
    text += 'Exact immutable snapshot: '+current['url']+'; packaging version **'+current['packagingVersion']+'**; content baseline **'+current['contentBaseline']+'**.\n\n'
    text += 'Canonical Dataset IRI: '+DOI_POLICY['canonicalDatasetIri']+'. The physician, clinic, canonical dataset, Concept DOI and exact archive are distinct resources.\n\n'
    text += 'Source commit: `'+source_commit+'`. Every current archive descriptor binds file downloads to this record and its own measured files. `upstream/` preserves historical input descriptors and receipts without modifications. Historical training messages retain their labelled historical DOI references.\n\n'
    text += 'Hugging Face: https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data\n\nKaggle: https://www.kaggle.com/datasets/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data\n\nNotebook: https://www.kaggle.com/code/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter\n'
    (output / 'README.md').write_text(text)
    standalone = {name: public_url(name) for name in names if not name.startswith('viewer/')}
    assert len({file_key(name) for name in standalone}) == len(standalone), 'Standalone filenames collide'
    def rebind(value):
        if isinstance(value, dict):return {key: rebind(child) for key, child in value.items()}
        if isinstance(value, list):return [rebind(child) for child in value]
        if isinstance(value, str) and value.startswith(ORIGIN):
            name = value[len(ORIGIN):]
            if name in standalone:return public_url(name)
        return value
    csvw = rebind(load(output / 'entity-facts.csv-metadata.json'))
    dump(output / 'entity-facts.csv-metadata.json', csvw)
    for name in ['void.ttl', 'dcat.ttl']:
        graph = rdflib.Graph().parse(output / name, format='turtle')
        for subject, predicate, obj in list(graph):
            if isinstance(obj, rdflib.URIRef) and str(obj).startswith(ORIGIN) and str(obj)[len(ORIGIN):] in standalone:
                graph.remove((subject, predicate, obj))
                graph.add((subject, predicate, rdflib.URIRef(public_url(str(obj)[len(ORIGIN):]))))
        # Archive distributions are distinct from mutable website distributions.
        # Keep canonical Person/Clinic/Dataset identities unchanged.
        from rdflib.namespace import RDF
        replacements={subject:rdflib.URIRef('https://zenodo.org/records/'+str(DOI_POLICY['currentArchive']['recordId'])+'#distribution-'+hashlib.sha256(str(subject).encode()).hexdigest()[:20])
                      for subject in graph.subjects(RDF.type,DCAT.Distribution)}
        for subject,predicate,obj in list(graph):
            if subject in replacements or obj in replacements:
                graph.remove((subject,predicate,obj));graph.add((replacements.get(subject,subject),predicate,replacements.get(obj,obj)))
        from rdflib.namespace import DCTERMS
        schema=rdflib.Namespace('https://schema.org/')
        for subject in replacements.values():
            if not any(graph.objects(subject,DCTERMS.title)):
                download=next(graph.objects(subject,DCAT.downloadURL),None)
                title=next(graph.objects(subject,schema.name),rdflib.Literal(Path(urlparse(str(download)).path).name if download else 'Archived distribution'))
                graph.add((subject,DCTERMS.title,title))
            graph.add((subject,DCTERMS.license,rdflib.URIRef('https://creativecommons.org/licenses/by/4.0/')))
            graph.add((subject,DCAT.isDistributionOf,rdflib.URIRef(DOI_POLICY['canonicalDatasetIri'])))
            if not any(graph.objects(subject,DCAT.accessURL)):
                target=next(graph.objects(subject,DCAT.downloadURL),rdflib.URIRef(DOI_POLICY['currentArchive']['url']))
                graph.add((subject,DCAT.accessURL,target))
        if name == 'dcat.ttl':
            spdx = rdflib.Namespace('http://spdx.org/rdf/terms#')
            for subject, url in list(graph.subject_objects(DCAT.downloadURL)):
                local = next((output / path for path, target in standalone.items() if target == str(url)), None)
                if local is None or not local.is_file() or local.name in {'dcat.ttl', 'datapackage.json', 'croissant.json'}:
                    continue
                for checksum in graph.objects(subject, spdx.checksum):
                    graph.set((checksum, spdx.checksumValue, rdflib.Literal(sha(local), datatype=XSD.hexBinary)))
                if any(graph.objects(subject, DCAT.byteSize)):
                    graph.set((subject, DCAT.byteSize, rdflib.Literal(str(local.stat().st_size), datatype=XSD.decimal)))
        from rdflib.compare import to_canonical_graph
        canonical=to_canonical_graph(graph).serialize(format='nt')
        (output/name).write_text('\n'.join(sorted(line for line in canonical.splitlines() if line.strip()))+'\n')
    package = rebind(load(output / 'datapackage.json'))
    for resource in package['resources']:
        name = next(name for name, url in standalone.items() if url == resource['path'])
        if name in {'datapackage.json', 'croissant.json'}:
            resource.pop('hash', None);resource.pop('bytes', None)
        elif 'hash' in resource:
            resource.update(hash='sha256:' + sha(output / name), bytes=(output / name).stat().st_size)
    dump(output / 'datapackage.json', package)
    croissant = load(output / 'croissant.json')
    croissant['citeAs'] = current['url']
    croissant['dct:references'] = rebind(croissant['dct:references'])
    for item in croissant['distribution']:
        name = item['name']
        assert name in standalone, ('Missing standalone resource', name)
        item.update(contentUrl=public_url(name), sha256=sha(output / name), contentSize=str((output / name).stat().st_size)+' B')
    dump(output / 'croissant.json', croissant)
    attestation=load(output/'release-attestation.json')
    attestation['publicationScope']=['zenodo_dataset']
    attestation['verifiedResources']={name:sha(output/name) for name in attestation['verifiedResources'] if (output/name).is_file()}
    dump(output/'release-attestation.json',attestation)
    matrix=load(output/'current-release-matrix.json')
    matrix['publicationScope']=['zenodo_dataset']
    matrix['distributions'].update(zenodo_dataset=current['url'],zenodo_collection=DOI_POLICY['concept']['url'])
    dump(output/'current-release-matrix.json',matrix)
    preservation = {path.relative_to(output).as_posix(): sha(path) for path in upstream.rglob('*') if path.is_file()}
    dump(output / 'archive-provenance.json', {'archiveVersion': current['packagingVersion'], 'zenodoDOI': current['doi'],
         'conceptDOI': DOI_POLICY['concept']['doi'], 'sourceCommit': source_commit, 'contentBaseline': current['contentBaseline'],
         'doiPolicy': DOI_POLICY, 'archiveSpecificDescriptors': sorted(DESCRIPTORS), 'downloadBindings': standalone,
         'preservedUpstreamFiles': preservation,
         'checksumScope': 'checksums.sha256 covers all other ZIP members; the ZIP itself is verified using the published Zenodo file checksum and the post-publication workflow SHA256 receipt.'})
    result = validate_archive(output)
    result['onlineValidation'] = 'Performed after publication and recorded in the external release receipt'
    dump(output / 'archive-validation.json', result)
    dump(output / 'doi-role-inventory.json', validate_policy(output, archive=True))
    inventory = {path.relative_to(output).as_posix(): {'bytes': path.stat().st_size, 'sha256': sha(path)}
                 for path in sorted(output.rglob('*')) if path.is_file() and path.name not in {'dist-sha256.json', 'checksums.sha256'}}
    dump(output / 'dist-sha256.json', {'algorithm': 'sha256', 'conceptDoi': DOI_POLICY['concept']['doi'],
         'versionDoi': current['doi'], 'sourceCommit': source_commit, 'files': inventory})
    names = sorted(path.relative_to(output).as_posix() for path in output.rglob('*') if path.is_file() and path.name != 'checksums.sha256')
    (output / 'checksums.sha256').write_text(''.join(sha(output / name)+'  '+name+'\n' for name in names))
    zip_path = output.parent / Path(DOI_POLICY['downloadBindings']['bundle']).name
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zipped:
        for name in sorted(names + ['checksums.sha256']):
            item=zipfile.ZipInfo(name,date_time=(2026,10,19,0,0,0));item.compress_type=zipfile.ZIP_DEFLATED;item.external_attr=0o100644 << 16
            zipped.writestr(item,(output/name).read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
    standalone_paths=[path for path in output.rglob('*') if path.is_file() and not path.relative_to(output).as_posix().startswith(('viewer/', 'upstream/'))]
    assert len(standalone_paths)==len({file_key(path.relative_to(output)) for path in standalone_paths}), 'Standalone output collision'
    files = {file_key(path.relative_to(output)): path for path in standalone_paths}
    files[zip_path.name] = zip_path
    return files, result
