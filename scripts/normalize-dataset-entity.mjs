import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const JSON_GRAPH_PATHS = [
  path.join(ROOT, 'src/data/semantic/head-graph.min.jsonld'),
  path.join(ROOT, 'public/graph.jsonld'),
];
const TURTLE_PATH = path.join(ROOT, 'public/graph.ttl');

const PERSON_ID = 'https://www.ghezelbaash.ir/#saeed-ghezelbash';
const CLINIC_ID = 'https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const PROJECT_ID = 'https://www.ghezelbaash.ir/#doctor-ghezelbaash-structured-data-project';
const CATALOG_ID = 'https://www.ghezelbaash.ir/#data-catalog';
const PRIMARY_DATASET_ID = 'https://www.ghezelbaash.ir/graph.jsonld#dataset';
const HISTORICAL_DATASET_ID = 'https://www.ghezelbaash.ir/#historical-patient-origin-summary';
const REPUTATION_SNAPSHOT_ID = 'https://www.ghezelbaash.ir/#google-maps-reputation-snapshot-current';
const LEGACY_HUGGINGFACE_DATASET_ID = 'https://www.ghezelbaash.ir/#project-huggingface-dataset';
const JSONLD_DOWNLOAD_ID = 'https://www.ghezelbaash.ir/graph.jsonld#download';
const TURTLE_DOWNLOAD_ID = 'https://www.ghezelbaash.ir/graph.ttl#download';
const HF_DATASET_URL = 'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data';
const ZENODO_DOI_URL = 'https://doi.org/10.5281/zenodo.18765169';
const WIKIDATA_PROJECT_URL = 'https://www.wikidata.org/entity/Q140304972';
const DATE_MODIFIED = '2026-08-04';

const ref = (id) => ({ '@id': id });
const asArray = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);
const itemKey = (value) => {
  if (value && typeof value === 'object' && typeof value['@id'] === 'string') return `@id:${value['@id']}`;
  return JSON.stringify(value);
};
const unique = (values) => {
  const seen = new Set();
  return values.filter((value) => {
    const key = itemKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const ensureRef = (value, id) => unique([...asArray(value).filter((item) => item?.['@id'] !== LEGACY_HUGGINGFACE_DATASET_ID), ref(id)]);

function replaceLegacyReference(value) {
  if (Array.isArray(value)) return unique(value.map(replaceLegacyReference));
  if (!value || typeof value !== 'object') return value;

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === '@id' && child === LEGACY_HUGGINGFACE_DATASET_ID) output[key] = PRIMARY_DATASET_ID;
    else output[key] = replaceLegacyReference(child);
  }
  return output;
}

function findRequiredNode(graph, id, label) {
  const node = graph.find((entry) => entry?.['@id'] === id);
  if (!node) throw new Error(`Missing ${label}: ${id}`);
  return node;
}

function normalizeOwnedSupportingDataset(node) {
  if (!node) return;
  node.creator = ref(PERSON_ID);
  node.publisher = ref(PERSON_ID);
  node.copyrightHolder = ref(PERSON_ID);
  node.maintainer = ref(PERSON_ID);
  node.accountablePerson = ref(PERSON_ID);
  node.includedInDataCatalog = ref(CATALOG_ID);
  node.isPartOf = ref(PRIMARY_DATASET_ID);
  if (!Object.hasOwn(node, 'isAccessibleForFree')) node.isAccessibleForFree = true;
  if (!node.license) node.license = 'https://creativecommons.org/licenses/by/4.0/';
}

function normalizeDocument(document, sourceLabel) {
  if (!document || typeof document !== 'object' || !Array.isArray(document['@graph'])) {
    throw new Error(`${sourceLabel} is not a JSON-LD document with an @graph array.`);
  }

  document['@graph'] = document['@graph']
    .filter((node) => node?.['@id'] !== LEGACY_HUGGINGFACE_DATASET_ID)
    .map(replaceLegacyReference);

  const graph = document['@graph'];
  const primary = findRequiredNode(graph, PRIMARY_DATASET_ID, 'primary Dataset');
  const historical = findRequiredNode(graph, HISTORICAL_DATASET_ID, 'historical Dataset');
  const reputationSnapshot = graph.find((entry) => entry?.['@id'] === REPUTATION_SNAPSHOT_ID);
  const person = findRequiredNode(graph, PERSON_ID, 'physician Person');
  const clinic = findRequiredNode(graph, CLINIC_ID, 'physician-owned clinic');
  const project = findRequiredNode(graph, PROJECT_ID, 'structured-data repository');
  const catalog = findRequiredNode(graph, CATALOG_ID, 'DataCatalog');
  const jsonDownload = findRequiredNode(graph, JSONLD_DOWNLOAD_ID, 'JSON-LD distribution');
  const turtleDownload = findRequiredNode(graph, TURTLE_DOWNLOAD_ID, 'Turtle distribution');
  const supportingDatasetIds = [HISTORICAL_DATASET_ID, ...(reputationSnapshot ? [REPUTATION_SNAPSHOT_ID] : [])];

  Object.assign(primary, {
    '@type': 'Dataset',
    name: 'Dr. Saeed Ghezelbash Entity Data',
    alternateName: [
      'Dr. Saeed Ghezelbaash Public Knowledge Graph',
      'Doctor Ghezelbash Structured Data Repository',
      'Primary physician entity Dataset',
      'مجموعه‌داده اصلی انتیتی دکتر سعید قزلباش',
    ],
    description:
      'Dr. Saeed Ghezelbash Entity Data is the single canonical public machine-readable Dataset created, published, owned, copyrighted and maintained by Saeed Ghezelbash. It represents the physician identified by Wikidata Q140287622 and Google Knowledge Graph /g/11nqdfk76c, covers his personally owned aesthetic clinic and structured-data repository, and is published through the official website, Hugging Face and Zenodo as synchronized authoritative distributions of the same Dataset.',
    url: 'https://www.ghezelbaash.ir/#doctor-ghezelbaash-structured-data-repository',
    creator: ref(PERSON_ID),
    publisher: ref(PERSON_ID),
    copyrightHolder: ref(PERSON_ID),
    maintainer: ref(PERSON_ID),
    accountablePerson: ref(PERSON_ID),
    about: [ref(PERSON_ID), ref(CLINIC_ID), ref(PROJECT_ID)],
    sameAs: [HF_DATASET_URL, ZENODO_DOI_URL, WIKIDATA_PROJECT_URL],
    identifier: [
      PRIMARY_DATASET_ID,
      ref('https://www.ghezelbaash.ir/#identifier-project-doi'),
      ref('https://www.ghezelbaash.ir/#identifier-project-wikidata'),
    ],
    distribution: [ref(JSONLD_DOWNLOAD_ID), ref(TURTLE_DOWNLOAD_ID)],
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
    includedInDataCatalog: ref(CATALOG_ID),
    hasPart: supportingDatasetIds.map(ref),
    keywords: [
      'Saeed Ghezelbash',
      'Mohammad Saeed Ghezelbash',
      'physician entity data',
      'physician knowledge graph',
      'aesthetic medicine',
      'Kermanshah',
      'Wikidata Q140287622',
      'Google Knowledge Graph /g/11nqdfk76c',
      'linked data',
    ],
    version: '1.1.0',
    dateModified: DATE_MODIFIED,
  });
  delete primary.isPartOf;
  delete primary.isBasedOn;

  normalizeOwnedSupportingDataset(historical);
  normalizeOwnedSupportingDataset(reputationSnapshot);

  Object.assign(project, {
    creator: ref(PERSON_ID),
    publisher: ref(PERSON_ID),
    copyrightHolder: ref(PERSON_ID),
    owner: ref(PERSON_ID),
    maintainer: ref(PERSON_ID),
    accountablePerson: ref(PERSON_ID),
    hasPart: unique([
      ref(PRIMARY_DATASET_ID),
      ...supportingDatasetIds.map(ref),
      ref(CATALOG_ID),
      ...asArray(project.hasPart).filter(
        (item) => ![PRIMARY_DATASET_ID, ...supportingDatasetIds, CATALOG_ID, LEGACY_HUGGINGFACE_DATASET_ID].includes(item?.['@id']),
      ),
    ]),
    dateModified: DATE_MODIFIED,
  });

  Object.assign(catalog, {
    creator: ref(PERSON_ID),
    publisher: ref(PERSON_ID),
    about: [ref(PERSON_ID), ref(CLINIC_ID)],
    dataset: [ref(PRIMARY_DATASET_ID), ...supportingDatasetIds.map(ref)],
    dateModified: DATE_MODIFIED,
  });

  person.subjectOf = ensureRef(person.subjectOf, PRIMARY_DATASET_ID);
  clinic.subjectOf = ensureRef(clinic.subjectOf, PRIMARY_DATASET_ID);

  for (const download of [jsonDownload, turtleDownload]) {
    download.isPartOf = ref(PRIMARY_DATASET_ID);
    download.license = 'https://creativecommons.org/licenses/by/4.0/';
    download.isAccessibleForFree = true;
    download.dateModified = DATE_MODIFIED;
    download.version = '1.1.0';
  }

  const legacyText = JSON.stringify(document);
  if (legacyText.includes(LEGACY_HUGGINGFACE_DATASET_ID)) {
    throw new Error(`${sourceLabel} still contains the retired duplicate Dataset identifier.`);
  }

  const datasetNodes = graph.filter((node) => asArray(node?.['@type']).includes('Dataset'));
  const primaryNodes = datasetNodes.filter((node) => node?.['@id'] === PRIMARY_DATASET_ID);
  if (primaryNodes.length !== 1) {
    throw new Error(`${sourceLabel} must contain exactly one primary Dataset node; found ${primaryNodes.length}.`);
  }
  console.log(`${sourceLabel}: Dataset inventory — ${datasetNodes.map((node) => node?.['@id']).filter(Boolean).join(', ')}`);

  return document;
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
  if (useVocab) {
    const vocab = context?.['@vocab'];
    if (typeof vocab === 'string') return `${vocab}${value}`;
  }
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

function iri(value) {
  return `<${String(value).replace(/\\/g, '%5C').replace(/>/g, '%3E').replace(/</g, '%3C')}>`;
}

function literal(value, language, datatype) {
  const text = JSON.stringify(String(value));
  if (language) return `${text}@${language}`;
  if (datatype) return `${text}^^${iri(datatype)}`;
  return text;
}

function jsonLdToTurtle(document) {
  const context = document['@context'] ?? {};
  const triples = new Set();
  const processedNamedNodes = new Set();
  let blankCounter = 0;

  const add = (subject, predicate, object) => triples.add(`${subject} ${predicate} ${object} .`);

  const objectTerm = (value, propertyKey) => {
    if (value == null) return null;
    if (typeof value === 'boolean' || typeof value === 'number') return String(value);
    if (typeof value === 'string') {
      if (propertyUsesIdValues(propertyKey, context)) return iri(expandIri(value, context));
      return literal(value);
    }
    if (Array.isArray(value)) throw new TypeError('Arrays must be expanded by emitProperty.');
    if (Object.hasOwn(value, '@value')) {
      const datatype = value['@type'] ? expandIri(value['@type'], context) : undefined;
      return literal(value['@value'], value['@language'], datatype);
    }
    if (typeof value['@id'] === 'string') {
      const subject = iri(expandIri(value['@id'], context));
      if (Object.keys(value).some((key) => key !== '@id')) emitNode(value, subject);
      return subject;
    }

    const blank = `_:b${++blankCounter}`;
    emitNode(value, blank);
    return blank;
  };

  const emitProperty = (subject, key, value) => {
    const predicate = iri(propertyIri(key, context));
    for (const item of asArray(value)) {
      const term = objectTerm(item, key);
      if (term != null) add(subject, predicate, term);
    }
  };

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
      emitProperty(subject, key, value);
    }
    return subject;
  };

  for (const node of document['@graph'] ?? []) emitNode(node);

  return [
    '# Canonical RDF Turtle distribution for Dr. Saeed Ghezelbash Entity Data.',
    '# Generated from public/graph.jsonld; do not edit this file manually.',
    ...[...triples].sort(),
    '',
  ].join('\n');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function main() {
  const normalized = new Map();
  for (const filePath of JSON_GRAPH_PATHS) {
    const document = normalizeDocument(await readJson(filePath), path.relative(ROOT, filePath));
    await writeFile(filePath, `${JSON.stringify(document)}\n`, 'utf8');
    normalized.set(filePath, document);
  }

  const publicDocument = normalized.get(path.join(ROOT, 'public/graph.jsonld'));
  await writeFile(TURTLE_PATH, jsonLdToTurtle(publicDocument), 'utf8');
  console.log('Canonical physician-owned Dataset normalized in embedded JSON-LD, public JSON-LD and Turtle.');
}

await main();
