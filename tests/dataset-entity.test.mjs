import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const HOME = 'https://www.ghezelbaash.ir/';
const PERSON_ID = `${HOME}#saeed-ghezelbash`;
const CLINIC_ID = `${HOME}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`;
const PROJECT_ID = `${HOME}#doctor-ghezelbaash-structured-data-project`;
const CATALOG_ID = `${HOME}#data-catalog`;
const PRIMARY_DATASET_ID = `${HOME}graph.jsonld#dataset`;
const HISTORICAL_SUMMARY_ID = `${HOME}#historical-patient-origin-summary`;
const LEGACY_DATASET_ID = `${HOME}#project-huggingface-dataset`;
const HISTORICAL_DISTRIBUTION_URL = `${HOME}datasets/historical-patient-origin-summary.json`;
const HISTORICAL_DISTRIBUTION_IDS = [
  `${HISTORICAL_DISTRIBUTION_URL}#download`,
  `${HOME}#historical-patient-origin-summary-json`,
];

const files = {
  head: 'src/data/semantic/head-graph.min.jsonld',
  full: 'public/graph.jsonld',
};

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const asArray = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);
const findNode = (document, id) => document['@graph'].find((node) => node?.['@id'] === id);
const referenceIds = (value) => asArray(value).map((item) => item?.['@id']).filter(Boolean);
const datasets = (document) => document['@graph'].filter((node) => asArray(node?.['@type']).includes('Dataset'));

function primaryProjection(node) {
  return {
    id: node['@id'],
    type: node['@type'],
    name: node.name,
    description: node.description,
    creator: node.creator,
    publisher: node.publisher,
    copyrightHolder: node.copyrightHolder,
    maintainer: node.maintainer,
    accountablePerson: node.accountablePerson,
    about: node.about,
    sameAs: node.sameAs,
    identifier: node.identifier,
    distribution: node.distribution,
    includedInDataCatalog: node.includedInDataCatalog,
    isAccessibleForFree: node.isAccessibleForFree,
    license: node.license,
    version: node.version,
  };
}

for (const [label, file] of Object.entries(files)) {
  test(`${label} graph exposes a valid physician-owned primary Dataset`, async () => {
    const document = await readJson(file);
    const serialized = JSON.stringify(document);
    const primary = findNode(document, PRIMARY_DATASET_ID);
    const publisher = findNode(document, PERSON_ID);

    assert.ok(primary, 'primary Dataset is required');
    assert.equal(primary.name, 'Dr. Saeed Ghezelbash Entity Data');
    assert.ok(typeof primary.description === 'string' && primary.description.length >= 50);
    assert.equal(primary.creator?.['@id'], PERSON_ID);
    assert.equal(primary.publisher?.['@id'], PERSON_ID);
    assert.equal(primary.copyrightHolder?.['@id'], PERSON_ID);
    assert.equal(primary.maintainer?.['@id'], PERSON_ID);
    assert.equal(primary.accountablePerson?.['@id'], PERSON_ID);
    assert.equal(primary.includedInDataCatalog?.['@id'], CATALOG_ID);
    assert.equal(primary.isAccessibleForFree, true);
    assert.equal(Object.hasOwn(primary, 'isPartOf'), false);
    assert.equal(Object.hasOwn(primary, 'isBasedOn'), false);
    assert.ok(asArray(publisher?.['@type']).some((type) => ['Person', 'IndividualPhysician'].includes(type)));

    const about = new Set(referenceIds(primary.about));
    assert.ok(about.has(PERSON_ID));
    assert.ok(about.has(CLINIC_ID));
    assert.ok(about.has(PROJECT_ID));

    assert.equal(serialized.includes(LEGACY_DATASET_ID), false);
    assert.equal(serialized.includes(HISTORICAL_DISTRIBUTION_URL), false);
    assert.equal(/separate secondary supporting Dataset/i.test(serialized), false);
    for (const retired of HISTORICAL_DISTRIBUTION_IDS) assert.equal(serialized.includes(retired), false);
  });

  test(`${label} graph models historical geography as CreativeWork evidence`, async () => {
    const document = await readJson(file);
    const summary = findNode(document, HISTORICAL_SUMMARY_ID);

    assert.ok(summary);
    assert.ok(asArray(summary['@type']).includes('CreativeWork'));
    assert.equal(asArray(summary['@type']).includes('Dataset'), false);
    assert.equal(summary.creator?.['@id'], PERSON_ID);
    assert.equal(summary.publisher?.['@id'], PERSON_ID);
    assert.equal(summary.isPartOf?.['@id'], PRIMARY_DATASET_ID);
    assert.ok(summary.description.includes('presence-only'));
    assert.ok(summary.description.includes('no patient-level identifiers'));

    if (label === 'full') assert.ok(asArray(summary.spatialCoverage).length > 2);
    for (const forbidden of ['includedInDataCatalog', 'distribution', 'variableMeasured', 'temporalCoverage', 'isBasedOn', 'contentUrl', 'encodingFormat', 'measurementTechnique']) {
      assert.equal(Object.hasOwn(summary, forbidden), false, `${forbidden} must not remain on CreativeWork evidence`);
    }
  });
}

test('compact Head Graph is a bounded projection of the canonical full graph', async () => {
  const [head, full, headStats] = await Promise.all([
    readJson(files.head),
    readJson(files.full),
    stat(files.head),
  ]);
  const fullIds = new Set(full['@graph'].map((node) => node?.['@id']).filter(Boolean));

  assert.ok(headStats.size <= 120_000, `Head Graph must remain compact; current size is ${headStats.size} bytes`);
  assert.ok(head['@graph'].length < full['@graph'].length);
  for (const node of head['@graph']) assert.ok(fullIds.has(node['@id']), `Head node must originate in full graph: ${node['@id']}`);
  assert.deepEqual(primaryProjection(findNode(head, PRIMARY_DATASET_ID)), primaryProjection(findNode(full, PRIMARY_DATASET_ID)));
  assert.deepEqual(datasets(head).map((node) => node['@id']), [PRIMARY_DATASET_ID]);

  const headCatalog = findNode(head, CATALOG_ID);
  assert.deepEqual(referenceIds(headCatalog.dataset), [PRIMARY_DATASET_ID]);
});

test('full DataCatalog contains only true Datasets and all remain physician-owned', async () => {
  const document = await readJson(files.full);
  const catalog = findNode(document, CATALOG_ID);
  const project = findNode(document, PROJECT_ID);
  const person = findNode(document, PERSON_ID);
  const clinic = findNode(document, CLINIC_ID);
  const allDatasets = datasets(document);
  const allDatasetIds = allDatasets.map((node) => node['@id']);

  assert.deepEqual(new Set(referenceIds(catalog.dataset)), new Set(allDatasetIds));
  assert.equal(referenceIds(catalog.dataset).includes(HISTORICAL_SUMMARY_ID), false);
  assert.ok(catalog.description.includes('not as a separate Dataset'));
  for (const id of allDatasetIds) assert.ok(referenceIds(project.hasPart).includes(id));
  assert.ok(referenceIds(project.hasPart).includes(HISTORICAL_SUMMARY_ID));
  assert.ok(referenceIds(person.subjectOf).includes(PRIMARY_DATASET_ID));
  assert.ok(referenceIds(clinic.subjectOf).includes(PRIMARY_DATASET_ID));

  for (const dataset of allDatasets.filter((node) => node['@id'] !== PRIMARY_DATASET_ID)) {
    assert.equal(dataset.creator?.['@id'], PERSON_ID);
    assert.equal(dataset.publisher?.['@id'], PERSON_ID);
    assert.equal(dataset.copyrightHolder?.['@id'], PERSON_ID);
    assert.equal(dataset.maintainer?.['@id'], PERSON_ID);
    assert.equal(dataset.accountablePerson?.['@id'], PERSON_ID);
    assert.equal(dataset.includedInDataCatalog?.['@id'], CATALOG_ID);
    assert.equal(dataset.isPartOf?.['@id'], PRIMARY_DATASET_ID);
  }
});

test('Turtle is generated from the canonical full graph with valid Dataset semantics', async () => {
  const turtle = await readFile('public/graph.ttl', 'utf8');
  assert.ok(turtle.length > 1000);
  assert.ok(turtle.includes(`<${PRIMARY_DATASET_ID}> <https://schema.org/publisher> <${PERSON_ID}> .`));
  assert.ok(turtle.includes(`<${HISTORICAL_SUMMARY_ID}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://schema.org/CreativeWork> .`));
  assert.equal(turtle.includes(`<${HISTORICAL_SUMMARY_ID}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://schema.org/Dataset> .`), false);
  assert.equal(turtle.includes(LEGACY_DATASET_ID), false);
});

test('retired historical distribution stays removed and redirected', async () => {
  await assert.rejects(access('public/datasets/historical-patient-origin-summary.json'));
  const [redirects, headers, sitemap, head, llms] = await Promise.all([
    readFile('public/_redirects', 'utf8'),
    readFile('public/_headers', 'utf8'),
    readFile('public/sitemap.xml', 'utf8'),
    readFile('src/components/DocumentHead.astro', 'utf8'),
    readFile('public/llms.txt', 'utf8'),
  ]);

  assert.ok(redirects.includes('/datasets/historical-patient-origin-summary.json /graph.jsonld 301'));
  for (const [label, source] of Object.entries({ headers, sitemap, head, llms })) {
    assert.equal(source.includes(HISTORICAL_DISTRIBUTION_URL), false, `${label} must not advertise retired distribution`);
  }
  assert.ok(llms.includes('## Integrated historical geographic evidence'));
});
