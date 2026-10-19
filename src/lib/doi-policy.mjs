import policyTemplate from '../canonical/doi-policy.json' with {type: 'json'};
import {execFileSync} from 'node:child_process';
const DOI_POLICY = structuredClone(policyTemplate);
DOI_POLICY.currentArchive.sourceCommit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
export {DOI_POLICY};

export function applyDoiPolicy(source) {
  const {concept, currentArchive: archive, canonicalDatasetIri: datasetIri} = DOI_POLICY;
  const graph = source.graph['@graph'];
  const byId = new Map(graph.map(node => [node['@id'], node]));
  const dataset = byId.get(datasetIri);
  const person = {'@id': source.canonicalOrigin + '/#saeed-ghezelbash'};
  const add = node => {if (byId.has(node['@id'])) Object.assign(byId.get(node['@id']), node); else {graph.push(node); byId.set(node['@id'], node);}};
  const ref = id => ({'@id': id});
  const identifiers = [
    {'@id': source.canonicalOrigin + '/identifier-dataset-zenodo-concept', '@type': 'PropertyValue', propertyID: 'Zenodo Concept DOI', name: 'Public collection DOI and latest-version entry point', value: concept.doi, url: concept.url},
    {'@id': source.canonicalOrigin + '/identifier-dataset-zenodo-current-archive', '@type': 'PropertyValue', propertyID: 'Zenodo Version DOI', name: 'Latest verified archive snapshot ' + archive.packagingVersion, value: archive.doi, url: archive.url},
  ];
  for (const node of identifiers) add(node);
  // Existing version-labelled historical identifiers and release history stay intact.
  dataset.identifier = [...dataset.identifier, ...identifiers.map(node => ref(node['@id']))];
  dataset['dcterms:identifier'] = dataset.identifier;
  dataset['dcterms:relation'] = [...(dataset['dcterms:relation'] ?? []), ref(concept.url)];
  dataset.citation = [...dataset.citation, ref(archive.url)];
  add({'@id': concept.url, '@type': ['Dataset', 'dcat:DatasetSeries', 'prov:Collection'],
       name: 'Dr. Saeed Ghezelbash — Zenodo archive collection', identifier: concept.doi, url: concept.url,
       creator: person, license: dataset.license, about: ref(datasetIri),
       'dcat:hasCurrentVersion': ref(archive.url), 'dcterms:hasVersion': ref(archive.url)});
  add({'@id': archive.url, '@type': ['Dataset', 'dcat:Dataset', 'prov:Entity'],
       name: 'Dr. Saeed Ghezelbash — exact Zenodo snapshot ' + archive.packagingVersion,
       identifier: archive.doi, version: archive.packagingVersion, url: archive.url,
       creator: person, license: dataset.license, about: ref(datasetIri),
       description: 'Immutable archive of content baseline ' + archive.contentBaseline + '; source commit ' + archive.sourceCommit + '. Current website and platform distributions record their own source revisions.',
       'dcterms:isVersionOf': ref(concept.url), 'dcat:isVersionOf': ref(concept.url),
       'prov:wasDerivedFrom': ref('https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/' + archive.sourceCommit)});
  const distribution = source.canonicalOrigin + '/project-zenodo-current-release';
  add({'@id': distribution, '@type': ['DataDownload', 'dcat:Distribution'],
       name: 'Zenodo latest verified archived snapshot ' + archive.packagingVersion,
       url: concept.url, identifier: 'DOI:' + archive.doi, version: archive.packagingVersion,
       creator: person, publisher: person, license: dataset.license,
       'dcterms:title': 'Zenodo latest verified archived snapshot ' + archive.packagingVersion,
       isPartOf: ref(datasetIri), about: ref(archive.url),
       'dcat:isDistributionOf': ref(datasetIri), 'dcat:accessURL': ref(concept.url),
       'dcat:downloadURL': ref(DOI_POLICY.downloadBindings.bundle)});
  for (const key of ['distribution', 'dcat:distribution', 'subjectOf']) dataset[key] = [...dataset[key], ref(distribution)];
  const historical = byId.get(source.canonicalOrigin + '/project-zenodo-release');
  historical.name = 'Historical Zenodo preservation distribution 1.3.3';
  historical['dcterms:title'] = historical.name;
  source.doiPolicy = DOI_POLICY;
  if (!source.machineResources.some(resource => resource.path === '/doi-policy.json')) {
    const resource = structuredClone(source.machineResources.find(resource => resource.path === '/evidence-snapshot.json'));
    Object.assign(resource, {path: '/doi-policy.json', canonicalPath: '/doi-policy.json', title: 'DOI roles and immutable archive bindings',
      distributionIri: source.canonicalOrigin + '/doi-policy.json/distribution', representation: 'doi-policy', publishInHttpHeader: false, httpHeaderPolicy: 'static-json'});
    delete resource.footerLabel;
    source.machineResources.push(resource);
    add({'@id': resource.distributionIri, '@type': ['DataDownload', 'dcat:Distribution', 'prov:Entity'],
         name: resource.title, contentUrl: source.canonicalOrigin + resource.path, encodingFormat: 'application/json',
         'dcterms:title': resource.title,
         isPartOf: ref(datasetIri), 'dcat:isDistributionOf': ref(datasetIri),
         'dcat:accessURL': ref(source.canonicalOrigin + resource.path), 'dcat:downloadURL': ref(source.canonicalOrigin + resource.path)});
    for (const key of ['distribution', 'dcat:distribution']) dataset[key].push(ref(resource.distributionIri));
  }
  source.head.headExtras = source.head.headExtras.filter(text => !text.includes('Zenodo preservation Version DOI'));
  source.head.headExtras.push(`<link href="${concept.url}" rel="related" title="Zenodo collection DOI — latest version">`);
  source.head.headExtras.push(`<link href="${archive.url}" rel="related" title="Exact archived snapshot ${archive.packagingVersion}">`);
  source.machineProjection.discoveryGuide += `\n\n## Zenodo collection and reproducible archive\n\n- [Zenodo collection — latest version](${concept.url}): public persistent collection DOI ${concept.doi}.\n- [Latest verified immutable snapshot ${archive.packagingVersion}](${archive.url}): exact archive DOI ${archive.doi}; source commit ${archive.sourceCommit}. Current platform packages retain their own commit-bound receipts.\n`;
  return source;
}
