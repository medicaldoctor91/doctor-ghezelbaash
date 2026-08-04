import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const PERSON_ID = 'https://www.ghezelbaash.ir/#saeed-ghezelbash';
const CLINIC_ID = 'https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const PROJECT_ID = 'https://www.ghezelbaash.ir/#doctor-ghezelbaash-structured-data-project';
const CATALOG_ID = 'https://www.ghezelbaash.ir/#data-catalog';
const PRIMARY_DATASET_ID = 'https://www.ghezelbaash.ir/graph.jsonld#dataset';
const HISTORICAL_SUMMARY_ID = 'https://www.ghezelbaash.ir/#historical-patient-origin-summary';
const HISTORICAL_DISTRIBUTION_URL = 'https://www.ghezelbaash.ir/datasets/historical-patient-origin-summary.json';
const HISTORICAL_DISTRIBUTION_IDS = [
  `${HISTORICAL_DISTRIBUTION_URL}#download`,
  'https://www.ghezelbaash.ir/#historical-patient-origin-summary-json',
];
const REPUTATION_SNAPSHOT_ID = 'https://www.ghezelbaash.ir/#google-maps-reputation-snapshot-current';
const LEGACY_DATASET_ID = 'https://www.ghezelbaash.ir/#project-huggingface-dataset';
const HF_DATASET_URL = 'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data';
const ZENODO_DOI_URL = 'https://doi.org/10.5281/zenodo.18765169';
const WIKIDATA_PROJECT_URL = 'https://www.wikidata.org/entity/Q140304972';

const files = {
  head: 'src/data/semantic/head-graph.min.jsonld',
  public: 'public/graph.jsonld',
};

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const asArray = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);
const findNode = (document, id) => document['@graph'].find((node) => node?.['@id'] === id);
const referenceIds = (value) => asArray(value).map((item) => item?.['@id']).filter(Boolean);
const datasetNodes = (document) => document['@graph'].filter((node) => asArray(node?.['@type']).includes('Dataset'));

function datasetProjection(node) {
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
  test(`${label} graph has one canonical physician Dataset and no retired Dataset nodes`, async () => {
    const document = await readJson(file);
    const serialized = JSON.stringify(document);
    assert.equal(serialized.includes(LEGACY_DATASET_ID), false, 'retired duplicate Dataset identifier must be absent');
    for (const retiredId of HISTORICAL_DISTRIBUTION_IDS) {
      assert.equal(serialized.includes(retiredId), false, `retired historical distribution node must be absent: ${retiredId}`);
    }
    assert.equal(serialized.includes(HISTORICAL_DISTRIBUTION_URL), false, 'retired historical distribution URL must be absent');

    const datasets = datasetNodes(document);
    assert.equal(datasets.filter((node) => node['@id'] === PRIMARY_DATASET_ID).length, 1);
    assert.equal(datasets.some((node) => node['@id'] === HISTORICAL_SUMMARY_ID), false);
    if (label === 'public') assert.ok(datasets.some((node) => node['@id'] === REPUTATION_SNAPSHOT_ID));
  });

  test(`${label} graph makes Saeed Ghezelbash the canonical Dataset authority`, async () => {
    const document = await readJson(file);
    const dataset = findNode(document, PRIMARY_DATASET_ID);
    assert.ok(dataset, 'canonical Dataset node is required');
    assert.equal(dataset.name, 'Dr. Saeed Ghezelbash Entity Data');
    assert.ok(typeof dataset.description === 'string' && dataset.description.length >= 50 && dataset.description.length <= 5000);
    assert.equal(dataset.creator?.['@id'], PERSON_ID);
    assert.equal(dataset.publisher?.['@id'], PERSON_ID);
    assert.equal(dataset.copyrightHolder?.['@id'], PERSON_ID);
    assert.equal(dataset.maintainer?.['@id'], PERSON_ID);
    assert.equal(dataset.accountablePerson?.['@id'], PERSON_ID);
    assert.equal(dataset.includedInDataCatalog?.['@id'], CATALOG_ID);
    assert.equal(dataset.isAccessibleForFree, true);
    assert.equal(Object.hasOwn(dataset, 'isPartOf'), false, 'canonical Dataset must not be subordinated to a non-Dataset CreativeWork');
    assert.equal(Object.hasOwn(dataset, 'isBasedOn'), false, 'repository mirrors are not derivative Datasets');

    const aboutIds = new Set(referenceIds(dataset.about));
    assert.ok(aboutIds.has(PERSON_ID));
    assert.ok(aboutIds.has(CLINIC_ID));
    assert.ok(aboutIds.has(PROJECT_ID));

    assert.deepEqual(
      new Set(asArray(dataset.sameAs)),
      new Set([HF_DATASET_URL, ZENODO_DOI_URL, WIKIDATA_PROJECT_URL]),
    );
    assert.ok(referenceIds(dataset.hasPart).includes(HISTORICAL_SUMMARY_ID));
  });

  test(`${label} graph models historical patient-origin geography as integrated CreativeWork evidence`, async () => {
    const document = await readJson(file);
    const summary = findNode(document, HISTORICAL_SUMMARY_ID);
    assert.ok(summary, 'historical geographic evidence object is required');
    assert.ok(asArray(summary['@type']).includes('CreativeWork'));
    assert.equal(asArray(summary['@type']).includes('Dataset'), false);
    assert.equal(summary.name, 'Historical patient-origin geographic coverage summary');
    assert.equal(summary.creator?.['@id'], PERSON_ID);
    assert.equal(summary.publisher?.['@id'], PERSON_ID);
    assert.equal(summary.copyrightHolder?.['@id'], PERSON_ID);
    assert.equal(summary.maintainer?.['@id'], PERSON_ID);
    assert.equal(summary.accountablePerson?.['@id'], PERSON_ID);
    assert.equal(summary.isPartOf?.['@id'], PRIMARY_DATASET_ID);
    assert.equal(summary.url, HISTORICAL_SUMMARY_ID);
    assert.equal(summary.mainEntityOfPage?.['@id'], 'https://www.ghezelbaash.ir/');
    assert.ok(typeof summary.description === 'string' && summary.description.includes('presence-only'));
    assert.ok(summary.description.includes('no patient-level identifiers'));
    assert.ok(asArray(summary.spatialCoverage).length > 2, 'historical place coverage must be preserved');

    for (const forbidden of [
      'includedInDataCatalog',
      'distribution',
      'variableMeasured',
      'temporalCoverage',
      'isBasedOn',
      'contentUrl',
      'encodingFormat',
      'measurementTechnique',
    ]) {
      assert.equal(Object.hasOwn(summary, forbidden), false, `${forbidden} must not remain on supporting CreativeWork evidence`);
    }
  });

  test(`${label} graph keeps only true Datasets in the DataCatalog`, async () => {
    const document = await readJson(file);
    const catalog = findNode(document, CATALOG_ID);
    const project = findNode(document, PROJECT_ID);
    const person = findNode(document, PERSON_ID);
    const clinic = findNode(document, CLINIC_ID);
    const allDatasetIds = datasetNodes(document).map((node) => node['@id']);

    assert.deepEqual(new Set(referenceIds(catalog.dataset)), new Set(allDatasetIds));
    assert.equal(referenceIds(catalog.dataset).includes(HISTORICAL_SUMMARY_ID), false);
    for (const id of allDatasetIds) assert.ok(referenceIds(project.hasPart).includes(id), `repository must include ${id}`);
    assert.ok(referenceIds(project.hasPart).includes(HISTORICAL_SUMMARY_ID));
    assert.ok(referenceIds(person.subjectOf).includes(PRIMARY_DATASET_ID));
    assert.ok(referenceIds(person.subjectOf).includes(HISTORICAL_SUMMARY_ID));
    assert.ok(referenceIds(clinic.subjectOf).includes(PRIMARY_DATASET_ID));
    assert.ok(referenceIds(clinic.subjectOf).includes(HISTORICAL_SUMMARY_ID));
    assert.equal(project.owner?.['@id'], PERSON_ID);
    assert.equal(project.creator?.['@id'], PERSON_ID);
    assert.equal(project.publisher?.['@id'], PERSON_ID);
    assert.equal(project.copyrightHolder?.['@id'], PERSON_ID);
  });

  test(`${label} graph preserves physician ownership of remaining supporting Datasets`, async () => {
    const document = await readJson(file);
    const supporting = datasetNodes(document).filter((node) => node['@id'] !== PRIMARY_DATASET_ID);

    for (const dataset of supporting) {
      assert.equal(dataset.creator?.['@id'], PERSON_ID, `${dataset['@id']} creator`);
      assert.equal(dataset.publisher?.['@id'], PERSON_ID, `${dataset['@id']} publisher`);
      assert.equal(dataset.copyrightHolder?.['@id'], PERSON_ID, `${dataset['@id']} copyrightHolder`);
      assert.equal(dataset.maintainer?.['@id'], PERSON_ID, `${dataset['@id']} maintainer`);
      assert.equal(dataset.accountablePerson?.['@id'], PERSON_ID, `${dataset['@id']} accountablePerson`);
      assert.equal(dataset.includedInDataCatalog?.['@id'], CATALOG_ID, `${dataset['@id']} catalog`);
      assert.equal(dataset.isPartOf?.['@id'], PRIMARY_DATASET_ID, `${dataset['@id']} parent Dataset`);
    }
  });
}

test('embedded and public JSON-LD expose the same canonical Dataset and historical evidence statements', async () => {
  const [head, publicGraph] = await Promise.all([readJson(files.head), readJson(files.public)]);
  assert.deepEqual(
    datasetProjection(findNode(head, PRIMARY_DATASET_ID)),
    datasetProjection(findNode(publicGraph, PRIMARY_DATASET_ID)),
  );
  const headSummary = findNode(head, HISTORICAL_SUMMARY_ID);
  const publicSummary = findNode(publicGraph, HISTORICAL_SUMMARY_ID);
  assert.deepEqual(headSummary, publicSummary);
});

test('Turtle carries integrated historical CreativeWork semantics without retired distribution identifiers', async () => {
  const turtle = await readFile('public/graph.ttl', 'utf8');
  assert.ok(turtle.length > 1000, 'Turtle distribution must contain the generated public graph');
  assert.match(
    turtle,
    new RegExp(`<${PRIMARY_DATASET_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://schema.org/Dataset> \\.`),
  );
  assert.ok(turtle.includes(`<${PRIMARY_DATASET_ID}> <https://schema.org/publisher> <${PERSON_ID}> .`));
  assert.ok(turtle.includes(`<${HISTORICAL_SUMMARY_ID}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://schema.org/CreativeWork> .`));
  assert.ok(turtle.includes(`<${HISTORICAL_SUMMARY_ID}> <https://schema.org/isPartOf> <${PRIMARY_DATASET_ID}> .`));
  assert.equal(turtle.includes(`<${HISTORICAL_SUMMARY_ID}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://schema.org/Dataset> .`), false);
  assert.equal(turtle.includes(LEGACY_DATASET_ID), false);
  for (const retiredId of HISTORICAL_DISTRIBUTION_IDS) assert.equal(turtle.includes(retiredId), false);
  assert.equal(turtle.includes(HISTORICAL_DISTRIBUTION_URL), false);
});

test('retired standalone historical distribution is removed and permanently redirected', async () => {
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
