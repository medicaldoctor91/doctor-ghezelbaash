import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const FULL_GRAPH_PATH = path.join(ROOT, 'public/graph.jsonld');
const HEAD_GRAPH_PATH = path.join(ROOT, 'src/data/semantic/head-graph.min.jsonld');
const TURTLE_PATH = path.join(ROOT, 'public/graph.ttl');

const HOME = 'https://www.ghezelbaash.ir/';
const PERSON_ID = `${HOME}#saeed-ghezelbash`;
const CLINIC_ID = `${HOME}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`;
const PROJECT_ID = `${HOME}#doctor-ghezelbaash-structured-data-project`;
const CATALOG_ID = `${HOME}#data-catalog`;
const WEBSITE_ID = `${HOME}#website`;
const WEBPAGE_ID = `${HOME}#webpage`;
const PRIMARY_DATASET_ID = `${HOME}graph.jsonld#dataset`;
const JSONLD_DOWNLOAD_ID = `${HOME}graph.jsonld#download`;
const TURTLE_DOWNLOAD_ID = `${HOME}graph.ttl#download`;
const HISTORICAL_SUMMARY_ID = `${HOME}#historical-patient-origin-summary`;
const REPUTATION_SNAPSHOT_ID = `${HOME}#google-maps-reputation-snapshot-current`;
const LEGACY_HUGGINGFACE_DATASET_ID = `${HOME}#project-huggingface-dataset`;
const HISTORICAL_DISTRIBUTION_ID = `${HOME}#historical-patient-origin-summary-json`;
const HISTORICAL_DISTRIBUTION_URL = `${HOME}datasets/historical-patient-origin-summary.json`;
const HF_DATASET_URL = 'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data';
const ZENODO_DOI_URL = 'https://doi.org/10.5281/zenodo.18765169';
const WIKIDATA_PROJECT_URL = 'https://www.wikidata.org/entity/Q140304972';
const DATE_MODIFIED = '2026-08-06';

const HEAD_NODE_IDS = [
  `${HOME}#identifier-person-google-kgid`,
  `${HOME}#identifier-person-irimc`,
  `${HOME}#identifier-clinic-google-kgid`,
  `${HOME}#identifier-clinic-google-place-id`,
  `${HOME}#identifier-clinic-google-maps-cid`,
  `${HOME}#identifier-person-orcid`,
  `${HOME}#identifier-person-wikidata`,
  `${HOME}#identifier-clinic-wikidata`,
  `${HOME}#identifier-project-doi`,
  `${HOME}#identifier-project-wikidata`,
  `${HOME}#country-iran`,
  `${HOME}#country-iraq`,
  `${HOME}#city-kermanshah`,
  WEBSITE_ID,
  WEBPAGE_ID,
  `${HOME}#irimc-credential-167430`,
  `${HOME}#organization-iran-medical-council`,
  `${HOME}#clinic-postal-address`,
  `${HOME}#online-consultation-contact-point`,
  `${HOME}#saeed-ghezelbash-clinic-role`,
  CLINIC_ID,
  PERSON_ID,
  `${HOME}#free-online-aesthetic-initial-consultation`,
  `${HOME}#online-consultation-channel`,
  `${HOME}#free-online-aesthetic-initial-consultation-offer`,
  `${HOME}#aesthetic-medical-consultation`,
  HISTORICAL_SUMMARY_ID,
  PROJECT_ID,
  CATALOG_ID,
  PRIMARY_DATASET_ID,
  JSONLD_DOWNLOAD_ID,
  TURTLE_DOWNLOAD_ID,
  `${HOME}#evidence-irimc`,
  `${HOME}#evidence-orcid`,
  `${HOME}#evidence-wikidata-doctor`,
  `${HOME}#evidence-google-maps-clinic`,
  `${HOME}#action-contact-clinic`,
  `${HOME}#action-online-initial-consultation`,
  `${HOME}#action-view-clinic-map`,
  `${HOME}#action-follow-instagram`,
  `${HOME}#clinic-geo`,
  `${HOME}#clinic-opening-hours-sat-thu`,
  `${HOME}#clinic-friday-closed`,
  `${HOME}#occupation-physician`,
  `${HOME}#occupation-medical-researcher`,
  `${HOME}#medical-specialty-aesthetic-medicine`,
  `${HOME}#kermanshah-university-of-medical-sciences`,
  `${HOME}#credential-doctor-of-medicine`,
  `${HOME}#image-saeed-ghezelbash-portrait-master`,
  `${HOME}#image-saeed-ghezelbash-portrait-square-1200`,
  `${HOME}#image-doctor-ghezelbaash-clinic-logo`,
  `${HOME}doctor.vcf#document`,
  `${HOME}clinic.vcf#document`,
];

const ref = (id) => ({ '@id': id });
const asArray = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);
const itemKey = (value) => value && typeof value === 'object' && typeof value['@id'] === 'string'
  ? `@id:${value['@id']}`
  : JSON.stringify(value);
const unique = (values) => {
  const seen = new Set();
  return values.filter((value) => {
    const key = itemKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function findRequiredNode(graph, id, label) {
  const node = graph.find((entry) => entry?.['@id'] === id);
  if (!node) throw new Error(`Missing ${label}: ${id}`);
  return node;
}

function replaceRetiredReferences(value) {
  if (Array.isArray(value)) return unique(value.map(replaceRetiredReferences).filter((item) => item != null));
  if (!value || typeof value !== 'object') return value === HISTORICAL_DISTRIBUTION_URL ? null : value;
  if (value['@id'] === HISTORICAL_DISTRIBUTION_ID) return null;

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === '@id' && child === LEGACY_HUGGINGFACE_DATASET_ID) output[key] = PRIMARY_DATASET_ID;
    else {
      const replacement = replaceRetiredReferences(child);
      if (replacement != null) output[key] = replacement;
    }
  }
  return output;
}

function ensureReferences(value, ids) {
  const retired = new Set([LEGACY_HUGGINGFACE_DATASET_ID, HISTORICAL_DISTRIBUTION_ID]);
  return unique([
    ...asArray(value).filter((item) => item?.['@id'] && !retired.has(item['@id']) && !ids.includes(item['@id'])),
    ...ids.map(ref),
  ]);
}

function normalizeSupportingDataset(node) {
  if (!node) return;
  Object.assign(node, {
    creator: ref(PERSON_ID),
    publisher: ref(PERSON_ID),
    copyrightHolder: ref(PERSON_ID),
    maintainer: ref(PERSON_ID),
    accountablePerson: ref(PERSON_ID),
    includedInDataCatalog: ref(CATALOG_ID),
    isPartOf: ref(PRIMARY_DATASET_ID),
    isAccessibleForFree: true,
    license: node.license ?? 'https://creativecommons.org/licenses/by/4.0/',
  });
}

function normalizeFullGraph(document) {
  if (!document || typeof document !== 'object' || !Array.isArray(document['@graph'])) {
    throw new Error('public/graph.jsonld must contain an @graph array.');
  }

  document['@graph'] = document['@graph']
    .filter((node) => ![LEGACY_HUGGINGFACE_DATASET_ID, HISTORICAL_DISTRIBUTION_ID].includes(node?.['@id']))
    .map(replaceRetiredReferences);

  const graph = document['@graph'];
  const primary = findRequiredNode(graph, PRIMARY_DATASET_ID, 'primary physician Dataset');
  const historical = findRequiredNode(graph, HISTORICAL_SUMMARY_ID, 'historical geographic evidence');
  const person = findRequiredNode(graph, PERSON_ID, 'physician');
  const clinic = findRequiredNode(graph, CLINIC_ID, 'physician-owned clinic');
  const project = findRequiredNode(graph, PROJECT_ID, 'structured-data project');
  const catalog = findRequiredNode(graph, CATALOG_ID, 'DataCatalog');
  const jsonDownload = findRequiredNode(graph, JSONLD_DOWNLOAD_ID, 'JSON-LD distribution');
  const turtleDownload = findRequiredNode(graph, TURTLE_DOWNLOAD_ID, 'Turtle distribution');
  const reputationSnapshot = graph.find((node) => node?.['@id'] === REPUTATION_SNAPSHOT_ID);

  Object.assign(primary, {
    '@type': 'Dataset',
    name: 'Dr. Saeed Ghezelbash Entity Data',
    alternateName: [
      'Dr. Saeed Ghezelbaash Public Knowledge Graph',
      'Doctor Ghezelbash Structured Data Repository',
      'Primary physician entity Dataset',
      'مجموعه‌داده اصلی انتیتی دکتر سعید قزلباش',
    ],
    description: 'Dr. Saeed Ghezelbash Entity Data is the single canonical public machine-readable Dataset created, published, owned, copyrighted and maintained by Saeed Ghezelbash. It represents the physician identified by Wikidata Q140287622 and Google Knowledge Graph /g/11nqdfk76c, covers his personally owned aesthetic clinic and structured-data repository, and is published through the official website, Hugging Face and Zenodo as synchronized authoritative distributions of the same Dataset.',
    url: `${HOME}#doctor-ghezelbaash-structured-data-repository`,
    creator: ref(PERSON_ID),
    publisher: ref(PERSON_ID),
    copyrightHolder: ref(PERSON_ID),
    maintainer: ref(PERSON_ID),
    accountablePerson: ref(PERSON_ID),
    about: [ref(PERSON_ID), ref(CLINIC_ID), ref(PROJECT_ID)],
    sameAs: [HF_DATASET_URL, ZENODO_DOI_URL, WIKIDATA_PROJECT_URL],
    identifier: [
      PRIMARY_DATASET_ID,
      ref(`${HOME}#identifier-project-doi`),
      ref(`${HOME}#identifier-project-wikidata`),
    ],
    distribution: [ref(JSONLD_DOWNLOAD_ID), ref(TURTLE_DOWNLOAD_ID)],
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
    includedInDataCatalog: ref(CATALOG_ID),
    hasPart: ensureReferences(primary.hasPart, [HISTORICAL_SUMMARY_ID]),
    version: '1.1.0',
    dateModified: DATE_MODIFIED,
  });
  delete primary.isPartOf;
  delete primary.isBasedOn;

  const spatialCoverage = asArray(historical.spatialCoverage).filter((item) => item?.['@id'] || typeof item === 'string');
  Object.assign(historical, {
    '@type': 'CreativeWork',
    name: 'Historical patient-origin geographic coverage summary',
    alternateName: [
      'Historical patient-origin locations — presence-only summary',
      'خلاصه تاریخی پوشش جغرافیایی مبدأ مراجعان',
    ],
    description: 'A presence-only historical geographic coverage summary derived from patient-origin place names recorded in the personally owned clinic records of Saeed Ghezelbash. The published summary contains no patient-level identifiers, counts, frequencies, percentages, rankings, visit dates or medical information, and it must not be interpreted as evidence of current service availability in any listed location.',
    creator: ref(PERSON_ID),
    publisher: ref(PERSON_ID),
    copyrightHolder: ref(PERSON_ID),
    maintainer: ref(PERSON_ID),
    accountablePerson: ref(PERSON_ID),
    about: [ref(PERSON_ID), ref(CLINIC_ID)],
    isPartOf: ref(PRIMARY_DATASET_ID),
    url: HISTORICAL_SUMMARY_ID,
    mainEntityOfPage: ref(HOME),
    spatialCoverage,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
    version: '1.1.0',
    dateModified: DATE_MODIFIED,
  });
  for (const property of ['includedInDataCatalog', 'distribution', 'variableMeasured', 'temporalCoverage', 'isBasedOn', 'contentUrl', 'encodingFormat', 'measurementTechnique']) {
    delete historical[property];
  }

  normalizeSupportingDataset(reputationSnapshot);
  const datasetIds = graph
    .filter((node) => asArray(node?.['@type']).includes('Dataset'))
    .map((node) => node['@id']);

  Object.assign(catalog, {
    description: 'Canonical first-party data catalog for Dr. Saeed Ghezelbaash. Its primary Dataset is the complete physician entity knowledge graph, published as JSON-LD and RDF Turtle. Historical patient-origin geography is integrated as supporting CreativeWork evidence inside that Dataset, not as a separate Dataset.',
    creator: ref(PERSON_ID),
    publisher: ref(PERSON_ID),
    about: [ref(PERSON_ID), ref(CLINIC_ID)],
    dataset: datasetIds.map(ref),
    dateModified: DATE_MODIFIED,
  });

  Object.assign(project, {
    creator: ref(PERSON_ID),
    publisher: ref(PERSON_ID),
    copyrightHolder: ref(PERSON_ID),
    owner: ref(PERSON_ID),
    maintainer: ref(PERSON_ID),
    accountablePerson: ref(PERSON_ID),
    hasPart: ensureReferences(project.hasPart, [PRIMARY_DATASET_ID, HISTORICAL_SUMMARY_ID, CATALOG_ID]),
    dateModified: DATE_MODIFIED,
  });

  person.subjectOf = ensureReferences(person.subjectOf, [PRIMARY_DATASET_ID, HISTORICAL_SUMMARY_ID]);
  clinic.subjectOf = ensureReferences(clinic.subjectOf, [PRIMARY_DATASET_ID, HISTORICAL_SUMMARY_ID]);

  for (const download of [jsonDownload, turtleDownload]) {
    Object.assign(download, {
      isPartOf: ref(PRIMARY_DATASET_ID),
      license: 'https://creativecommons.org/licenses/by/4.0/',
      isAccessibleForFree: true,
      dateModified: DATE_MODIFIED,
      version: '1.1.0',
    });
  }

  const serialized = JSON.stringify(document);
  for (const retired of [LEGACY_HUGGINGFACE_DATASET_ID, HISTORICAL_DISTRIBUTION_ID, HISTORICAL_DISTRIBUTION_URL]) {
    if (serialized.includes(retired)) throw new Error(`Retired semantic value remains: ${retired}`);
  }
  if (/separate secondary supporting Dataset/i.test(serialized)) {
    throw new Error('The graph still describes historical CreativeWork evidence as a separate Dataset.');
  }

  const primaryDatasets = graph.filter((node) => node?.['@id'] === PRIMARY_DATASET_ID && asArray(node?.['@type']).includes('Dataset'));
  if (primaryDatasets.length !== 1) throw new Error('Exactly one canonical primary Dataset is required.');
  if (!primary.description || primary.publisher?.['@id'] !== PERSON_ID || Object.hasOwn(primary, 'isPartOf')) {
    throw new Error('Primary Dataset rich-result contract is invalid.');
  }
  const publisher = findRequiredNode(graph, PERSON_ID, 'Dataset publisher Person');
  if (!asArray(publisher['@type']).some((type) => ['Person', 'IndividualPhysician'].includes(type))) {
    throw new Error('Dataset publisher must resolve to the physician Person node.');
  }

  return document;
}

function compactNode(node) {
  const output = structuredClone(node);
  const id = output['@id'];

  const remove = (...keys) => keys.forEach((key) => delete output[key]);
  if (id === WEBPAGE_ID) remove('mentions', 'citation', 'hasPart', 'keywords', 'subjectOf');
  if (id === WEBSITE_ID) remove('hasPart');
  if (id === PERSON_ID) remove('availableService', 'makesOffer', 'subjectOf', 'potentialAction', 'knowsAbout', 'performerIn');
  if (id === CLINIC_ID) remove('availableService', 'subjectOf', 'potentialAction');
  if (id === PROJECT_ID) remove('subjectOf');
  if (id === HISTORICAL_SUMMARY_ID) remove('spatialCoverage', 'keywords');
  if (id === PRIMARY_DATASET_ID) remove('mentions', 'keywords');
  if (id?.includes('#image-')) remove('keywords', 'alternateName');

  return output;
}

function buildHeadGraph(document) {
  const byId = new Map(document['@graph'].map((node) => [node?.['@id'], node]));
  const graph = HEAD_NODE_IDS
    .map((id) => byId.get(id))
    .filter(Boolean)
    .filter((node) => node['@id'] === PRIMARY_DATASET_ID || !asArray(node['@type']).includes('Dataset'))
    .map(compactNode);

  const catalog = graph.find((node) => node['@id'] === CATALOG_ID);
  if (catalog) catalog.dataset = [ref(PRIMARY_DATASET_ID)];

  const project = graph.find((node) => node['@id'] === PROJECT_ID);
  if (project) {
    project.hasPart = asArray(project.hasPart).filter((item) => [PRIMARY_DATASET_ID, HISTORICAL_SUMMARY_ID, CATALOG_ID, `${HOME}doctor.vcf#document`, `${HOME}clinic.vcf#document`].includes(item?.['@id']));
  }

  const head = { '@context': document['@context'], '@graph': graph };
  const primary = graph.find((node) => node['@id'] === PRIMARY_DATASET_ID);
  const person = graph.find((node) => node['@id'] === PERSON_ID);
  if (!primary?.description || primary.publisher?.['@id'] !== PERSON_ID || Object.hasOwn(primary, 'isPartOf')) {
    throw new Error('Compact Head Graph does not satisfy the Dataset rich-result contract.');
  }
  if (!person) throw new Error('Compact Head Graph must define the physician publisher node.');

  const bytes = Buffer.byteLength(JSON.stringify(head), 'utf8');
  if (bytes > 120_000) throw new Error(`Compact Head Graph is too large: ${bytes} bytes.`);
  return head;
}

function expandIri(value, context, useVocab = false) {
  if (typeof value !== 'string') throw new TypeError(`IRI must be a string: ${String(value)}`);
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    const colon = value.indexOf(':');
    const prefix = value.slice(0, colon);
    const suffix = value.slice(colon + 1);
    const prefixValue = context?.[prefix];
    if (typeof prefixValue === 'string' && /^[a-z][a-z0-9+.-]*:/i.test(prefixValue)) return `${prefixValue}${suffix}`;
    return value;
  }
  if (useVocab && typeof context?.['@vocab'] === 'string') return `${context['@vocab']}${value}`;
  return value;
}

function propertyIri(key, context) {
  const definition = context?.[key];
  if (typeof definition === 'string') return expandIri(definition, context, true);
  if (definition && typeof definition === 'object' && typeof definition['@id'] === 'string') return expandIri(definition['@id'], context, true);
  return expandIri(key, context, true);
}

function propertyUsesIdValues(key, context) {
  const definition = context?.[key];
  return Boolean(definition && typeof definition === 'object' && definition['@type'] === '@id');
}

const iri = (value) => `<${String(value).replace(/\\/g, '%5C').replace(/>/g, '%3E').replace(/</g, '%3C')}>`;
const literal = (value, language, datatype) => {
  const text = JSON.stringify(String(value));
  if (language) return `${text}@${language}`;
  if (datatype) return `${text}^^${iri(datatype)}`;
  return text;
};

function jsonLdToTurtle(document) {
  const context = document['@context'] ?? {};
  const triples = new Set();
  const processedNamedNodes = new Set();
  let blankCounter = 0;
  const add = (subject, predicate, object) => triples.add(`${subject} ${predicate} ${object} .`);

  const emitNode = (node, forcedSubject) => {
    const namedId = typeof node['@id'] === 'string' ? expandIri(node['@id'], context) : null;
    const subject = forcedSubject ?? (namedId ? iri(namedId) : `_:b${++blankCounter}`);
    if (namedId) {
      if (processedNamedNodes.has(namedId)) return subject;
      processedNamedNodes.add(namedId);
    }

    for (const type of asArray(node['@type'])) {
      add(subject, iri('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), iri(expandIri(type, context, true)));
    }
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('@')) continue;
      const predicate = iri(propertyIri(key, context));
      for (const item of asArray(value)) {
        let object;
        if (item == null) continue;
        if (typeof item === 'boolean' || typeof item === 'number') object = String(item);
        else if (typeof item === 'string') object = propertyUsesIdValues(key, context) ? iri(expandIri(item, context)) : literal(item);
        else if (Object.hasOwn(item, '@value')) object = literal(item['@value'], item['@language'], item['@type'] ? expandIri(item['@type'], context) : undefined);
        else if (typeof item['@id'] === 'string') {
          object = iri(expandIri(item['@id'], context));
          if (Object.keys(item).some((entry) => entry !== '@id')) emitNode(item, object);
        } else {
          object = `_:b${++blankCounter}`;
          emitNode(item, object);
        }
        add(subject, predicate, object);
      }
    }
    return subject;
  };

  for (const node of document['@graph']) emitNode(node);
  return [
    '# Canonical RDF Turtle distribution for Dr. Saeed Ghezelbash Entity Data.',
    '# Generated from public/graph.jsonld; do not edit this file manually.',
    ...[...triples].sort(),
    '',
  ].join('\n');
}

async function main() {
  const source = JSON.parse(await readFile(FULL_GRAPH_PATH, 'utf8'));
  const fullGraph = normalizeFullGraph(source);
  const headGraph = buildHeadGraph(fullGraph);

  await mkdir(path.dirname(HEAD_GRAPH_PATH), { recursive: true });
  await Promise.all([
    writeFile(FULL_GRAPH_PATH, `${JSON.stringify(fullGraph)}\n`, 'utf8'),
    writeFile(HEAD_GRAPH_PATH, `${JSON.stringify(headGraph)}\n`, 'utf8'),
    writeFile(TURTLE_PATH, jsonLdToTurtle(fullGraph), 'utf8'),
  ]);

  console.log(`Semantic assets built from one canonical graph: ${fullGraph['@graph'].length} full nodes, ${headGraph['@graph'].length} Head Graph nodes.`);
}

await main();
