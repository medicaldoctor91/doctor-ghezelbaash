import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const PERSON_ID = 'https://www.ghezelbaash.ir/#saeed-ghezelbash';
const CLINIC_ID = 'https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const PROJECT_ID = 'https://www.ghezelbaash.ir/#doctor-ghezelbaash-structured-data-project';
const CATALOG_ID = 'https://www.ghezelbaash.ir/#data-catalog';
const PRIMARY_DATASET_ID = 'https://www.ghezelbaash.ir/graph.jsonld#dataset';
const HISTORICAL_DATASET_ID = 'https://www.ghezelbaash.ir/#historical-patient-origin-summary';
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
  test(`${label} graph has one canonical physician Dataset and no Hugging Face duplicate`, async () => {
    const document = await readJson(file);
    const serialized = JSON.stringify(document);
    assert.equal(serialized.includes(LEGACY_DATASET_ID), false, 'retired duplicate Dataset identifier must be absent');

    const datasets = document['@graph'].filter((node) => asArray(node?.['@type']).includes('Dataset'));
    assert.equal(datasets.length, 2, 'only the canonical entity Dataset and historical supporting Dataset should remain');
    assert.deepEqual(
      new Set(datasets.map((node) => node['@id'])),
      new Set([PRIMARY_DATASET_ID, HISTORICAL_DATASET_ID]),
    );
  });

  test(`${label} graph makes Saeed Ghezelbash the Dataset authority`, async () => {
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
  });

  test(`${label} graph keeps reciprocal catalog and repository links`, async () => {
    const document = await readJson(file);
    const catalog = findNode(document, CATALOG_ID);
    const project = findNode(document, PROJECT_ID);
    const person = findNode(document, PERSON_ID);
    const clinic = findNode(document, CLINIC_ID);

    assert.deepEqual(new Set(referenceIds(catalog.dataset)), new Set([PRIMARY_DATASET_ID, HISTORICAL_DATASET_ID]));
    assert.ok(referenceIds(project.hasPart).includes(PRIMARY_DATASET_ID));
    assert.ok(referenceIds(person.subjectOf).includes(PRIMARY_DATASET_ID));
    assert.ok(referenceIds(clinic.subjectOf).includes(PRIMARY_DATASET_ID));
    assert.equal(project.owner?.['@id'], PERSON_ID);
    assert.equal(project.creator?.['@id'], PERSON_ID);
    assert.equal(project.publisher?.['@id'], PERSON_ID);
    assert.equal(project.copyrightHolder?.['@id'], PERSON_ID);
  });
}

test('embedded and public JSON-LD expose the same canonical Dataset statement', async () => {
  const [head, publicGraph] = await Promise.all([readJson(files.head), readJson(files.public)]);
  assert.deepEqual(
    datasetProjection(findNode(head, PRIMARY_DATASET_ID)),
    datasetProjection(findNode(publicGraph, PRIMARY_DATASET_ID)),
  );
});

test('Turtle is non-empty and carries the canonical Dataset ownership triples', async () => {
  const turtle = await readFile('public/graph.ttl', 'utf8');
  assert.ok(turtle.length > 1000, 'Turtle distribution must contain the generated public graph');
  assert.match(
    turtle,
    new RegExp(`<${PRIMARY_DATASET_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://schema.org/Dataset> \\.`),
  );
  assert.ok(turtle.includes(`<${PRIMARY_DATASET_ID}> <https://schema.org/publisher> <${PERSON_ID}> .`));
  assert.ok(turtle.includes(`<${PRIMARY_DATASET_ID}> <https://schema.org/copyrightHolder> <${PERSON_ID}> .`));
  assert.equal(turtle.includes(LEGACY_DATASET_ID), false);
});
