import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import policyTemplate from '../canonical/doi-policy.json' with {type: 'json'};
const exactHead = () => execFileSync('git', ['rev-parse', 'HEAD'], {cwd: new URL('../..', import.meta.url), encoding: 'utf8'}).trim();
const requireValue = (condition, message) => {if (!condition) throw new Error(message);};
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

// The external plan is finalized after a real reservation and C/M refs exist;
// keeping it outside the source commit avoids a commit self-reference.
export function resolveDoiPolicy(template, env = process.env, head = exactHead) {
  const plan = env.RELEASE_PLAN_PATH ? JSON.parse(readFileSync(env.RELEASE_PLAN_PATH, 'utf8')) : null;
  const policy = structuredClone(plan ? plan.policy : template);
  const archive = policy.currentArchive;
  if (plan) {
    requireValue(plan.schemaVersion === 1 && ['new-reserved', 'published-maintenance'].includes(plan.context), 'Invalid release context');
    const boundPolicy = structuredClone(policy);
    delete boundPolicy.currentArchive.sourceCommit;
    requireValue(!Object.hasOwn(template.currentArchive ?? {}, 'sourceCommit'), 'Build-source policy must not store its own future commit');
    requireValue(JSON.stringify(canonical(boundPolicy)) === JSON.stringify(canonical(template)), 'Approved plan policy differs from the canonical policy bound before C');
    const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
    const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
    const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
    const archiveBinding = p => {
      for (const item of [p.concept,p.currentArchive]) requireValue(Number.isSafeInteger(item.recordId) && item.recordId > 0 &&
        item.doi === `10.5281/zenodo.${item.recordId}` && item.url === `https://doi.org/${item.doi}`, 'Record/DOI mismatch');
      const binding = p.downloadBindings, record = p.currentArchive.recordId;
      requireValue(record !== p.concept.recordId && binding.recordId === record &&
        binding.publicPrefix === `https://zenodo.org/records/${record}/files/` && binding.apiPrefix === `https://zenodo.org/api/records/${record}/files/` &&
        binding.bundle.startsWith(binding.publicPrefix) && binding.bundle.endsWith('.zip') && !binding.bundle.slice(binding.publicPrefix.length).includes('/'), 'Record download bindings differ');
    };
    archiveBinding(policy); archiveBinding(plan.previousPolicy);
    const scope = plan.approvedPublicationScope;
    requireValue(Array.isArray(scope) && scope.length === 5 && ['website','hf','kaggle','notebook','zenodo_dataset'].every(value => scope.includes(value)), 'Publication scope differs');
    requireValue(policy.canonicalDatasetIri === 'https://www.ghezelbaash.ir/graph.jsonld/dataset' &&
      JSON.stringify(canonical(plan.identity)) === JSON.stringify(canonical({personIri:'https://www.ghezelbaash.ir/#saeed-ghezelbash',
        clinicIri:'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah',datasetIri:policy.canonicalDatasetIri})), 'Canonical identity changed');
    requireValue(plan.expectedPrimaryRoutes === 72 && Number.isSafeInteger(plan.expectedSourceFiles) && plan.expectedSourceFiles > 0, 'Reviewed route/source count differs');
    requireValue(digest(plan.backupManifestSHA256) && digest(plan.previousArchiveInventorySHA256) &&
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(plan.websitePreviousDeploymentId), 'Verified rollback binding missing');
    const previous = plan.previousPolicy.currentArchive;
    requireValue(sha(plan.previousArchiveSourceCommit) && (!previous.sourceCommit || previous.sourceCommit === plan.previousArchiveSourceCommit), 'Previous archive source differs');
    const fingerprint = createHash('sha256').update(JSON.stringify(canonical(plan.previousPolicy))).digest('hex');
    requireValue(fingerprint === plan.previousPolicySHA256, 'Previous policy fingerprint differs');
    requireValue(JSON.stringify(canonical(policy.concept)) === JSON.stringify(canonical(plan.previousPolicy.concept)), 'Collection identity changed');
    requireValue(policy.canonicalDatasetIri === plan.previousPolicy.canonicalDatasetIri, 'Dataset identity changed');
    requireValue(archive.recordId !== previous.recordId && archive.packagingVersion !== previous.packagingVersion, 'A new edition cannot overwrite the previous archive');
    requireValue(archive.doi === `10.5281/zenodo.${archive.recordId}` && archive.url === `https://doi.org/${archive.doi}`, 'Reserved record/DOI mismatch');
    const reservation = plan.reservation;
    requireValue(reservation.published === false && reservation.reservedRecord === archive.recordId && reservation.reservedDoi === archive.doi
      && reservation.previousRecord === previous.recordId && reservation.conceptDoi === policy.concept.doi, 'Reservation binding differs');
    const history = policy.historical.find(item => item.doi === previous.doi);
    requireValue(history?.role === 'historical' && history.sourceCommit === plan.previousArchiveSourceCommit, 'Previous archive history missing');
    for (const key of ['doi', 'url', 'packagingVersion', 'contentBaseline', 'edition']) requireValue(history[key] === previous[key], 'Previous archive field changed: ' + key);
    for (const item of plan.previousPolicy.historical) requireValue(policy.historical.some(value => JSON.stringify(canonical(value)) === JSON.stringify(canonical(item))), 'Old archive history changed');
    requireValue(policy.downloadBindings.recordId === archive.recordId
      && policy.downloadBindings.publicPrefix === `https://zenodo.org/records/${archive.recordId}/files/`
      && policy.downloadBindings.apiPrefix === `https://zenodo.org/api/records/${archive.recordId}/files/`
      && policy.downloadBindings.bundle.startsWith(policy.downloadBindings.publicPrefix), 'Record download bindings differ');
    requireValue(plan.positioningCorpusRelease === '1.3.4' && plan.requireHfSearchFilter === true, 'Scientific or runtime contract differs');
    for (const key of ['applicationCheckpoint', 'buildSource', 'publicationToolCommit']) requireValue(/^[a-f0-9]{40}$/.test(plan.refs[key]), 'Invalid reviewed ref');
    requireValue(plan.refs.applicationCheckpoint !== plan.refs.buildSource && plan.refs.publicationToolCommit === plan.refs.buildSource, 'Invalid C/M tool roles');
    requireValue(/^refs\/tags\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(plan.refs.reviewedRef) &&
      !['..','//','@{'].some(value => plan.refs.reviewedRef.includes(value)), 'Invalid reviewed immutable ref');
    requireValue(Object.keys(plan.refs.toolInventory).length > 0 && Object.entries(plan.refs.toolInventory).every(([name,value]) =>
      (name.startsWith('.github/scripts/') || name.startsWith('.github/workflows/')) && !name.split('/').includes('..') && digest(value)), 'Invalid reviewed tool inventory');
    const cohort = policy.coordinatedRelease;
    requireValue(cohort.previousZenodoRecord === previous.recordId && cohort.hfParent === archive.inputBaselineHfRevision &&
      sha(cohort.hfParent) && sha(cohort.websiteBaselineCommit), 'Reviewed provider baseline differs');
    for (const prefix of ['kaggle','notebook']) requireValue(Number.isSafeInteger(cohort[prefix+'BaselineVersion']) && cohort[prefix+'BaselineVersion'] > 0 &&
      cohort[prefix+'TargetVersion'] === cohort[prefix+'BaselineVersion'] + 1, 'Next provider version differs');
    requireValue(['expectedGraphNodes','expectedGraphTriples'].every(key => Number.isSafeInteger(cohort[key]) && cohort[key] > 0) &&
      Object.keys(plan.reviewedTables).length > 0 && Object.values(plan.reviewedTables).every(value => Number.isSafeInteger(value) && value > 0), 'Reviewed graph/table counts missing');
    requireValue([plan.publicationDate,plan.maintenanceDate,plan.contentEdition].every(date) && archive.edition === plan.contentEdition &&
      typeof plan.hfCommitTimestamp === 'string' && date(plan.hfCommitTimestamp.slice(0,10)) && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(plan.hfCommitTimestamp) && Number.isFinite(Date.parse(plan.hfCommitTimestamp)), 'Recorded date roles differ');
    requireValue(archive.sourceCommitMode === 'build-source' && (archive.sourceCommit || plan.refs.buildSource) === plan.refs.buildSource, 'Approved archive source must derive from reviewed M');
  }
  if (archive.sourceCommitMode === 'build-source') {
    const pinned = env.ARCHIVE_SOURCE_COMMIT;
    const preparing = env.PREPARE_RESERVED_DOI;
    let sourceCommit;
    if (plan?.context === 'new-reserved') {
      requireValue(!pinned, 'Old archive source pin is forbidden for a new reserved edition');
      requireValue(preparing === String(archive.recordId), 'Preparing mode must select the actual reserved record');
      sourceCommit = head();
      requireValue(sourceCommit === plan.refs.buildSource && (env.GITHUB_SHA || sourceCommit) === sourceCommit, 'Build source is not actual reviewed M');
    } else if (plan) {
      requireValue(!preparing && pinned === plan.refs.buildSource, 'Maintenance must pin the newly published archive source M');
      sourceCommit = pinned;
    } else {
      requireValue(pinned || preparing === String(archive.recordId), 'ARCHIVE_SOURCE_COMMIT must pin the published archive; use an approved release plan for a new edition');
      sourceCommit = pinned || env.GITHUB_SHA || head();
    }
    requireValue(/^[a-f0-9]{40}$/.test(sourceCommit), 'Invalid archive build source commit');
    archive.sourceCommit = sourceCommit;
  }
  return policy;
}
const DOI_POLICY = resolveDoiPolicy(policyTemplate);
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
    {'@id': source.canonicalOrigin + '/identifier-dataset-zenodo-current-archive', '@type': 'PropertyValue', propertyID: 'Zenodo Version DOI', name: 'Exact release binding ' + archive.packagingVersion, value: archive.doi, url: archive.url},
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
       'dcterms:hasVersion': ref(archive.url)});
  add({'@id': archive.url, '@type': ['Dataset', 'dcat:Dataset', 'prov:Entity'],
       name: 'Dr. Saeed Ghezelbash — exact Zenodo snapshot ' + archive.packagingVersion,
       identifier: archive.doi, version: archive.packagingVersion, url: archive.url,
       creator: person, license: dataset.license, about: ref(datasetIri),
       description: 'Exact reproducible snapshot binding for content baseline ' + archive.contentBaseline + '; source commit ' + archive.sourceCommit + '. Current website and platform distributions record their own source revisions.',
       'dcterms:isVersionOf': ref(concept.url), 'dcat:isVersionOf': ref(concept.url),
       'prov:wasDerivedFrom': ref('https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/' + archive.sourceCommit)});
  for (const previous of DOI_POLICY.historical.filter(item => item.packagingVersion && item.sourceCommit)) {
    add({'@id': previous.url, '@type': ['Dataset', 'dcat:Dataset', 'prov:Entity'],
      name: 'Historical Zenodo snapshot ' + previous.packagingVersion,
      identifier: previous.doi, version: previous.packagingVersion, url: previous.url,
      creator: person, license: dataset.license, about: ref(datasetIri),
      'dcterms:isVersionOf': ref(concept.url), 'dcat:isVersionOf': ref(concept.url),
      'prov:wasDerivedFrom': ref('https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/' + previous.sourceCommit)});
  }
  const distribution = source.canonicalOrigin + '/project-zenodo-current-release';
  add({'@id': distribution, '@type': ['DataDownload', 'dcat:Distribution'],
       name: 'Zenodo exact release binding ' + archive.packagingVersion,
       url: concept.url, identifier: 'DOI:' + archive.doi, version: archive.packagingVersion,
       creator: person, publisher: person, license: dataset.license,
       'dcterms:title': 'Zenodo exact release binding ' + archive.packagingVersion,
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
  source.head.headExtras.push(`<link href="${archive.url}" rel="related" title="Exact release binding ${archive.packagingVersion}">`);
  source.machineProjection.discoveryGuide += `\n\n## Zenodo collection and reproducible archive\n\n- [Zenodo collection — latest version](${concept.url}): public persistent collection DOI ${concept.doi}.\n- [Exact release binding ${archive.packagingVersion}](${archive.url}): exact archive DOI ${archive.doi}; source commit ${archive.sourceCommit}. Current platform packages retain their own commit-bound receipts.\n`;
  return source;
}
