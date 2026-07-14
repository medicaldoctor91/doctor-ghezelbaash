import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';

const site = 'https://www.ghezelbaash.ir/';
const huggingFaceProfile = 'https://huggingface.co/Ghezelbaash';
const huggingFaceDataset = 'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data';
const homepagePath = join(process.cwd(), 'dist', 'index.html');
const homepage = readFileSync(homepagePath, 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const asArray = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];
const hasType = (node, type) => asArray(node?.['@type']).includes(type);

const priorityAnswerIds = [
  'priority-best-aesthetic-doctor-kermanshah',
  'priority-clinic-reputation',
  'priority-national-aesthetic-doctor',
  'priority-aesthetic-cost',
  'priority-surgery-boundary',
  'priority-correction-after-treatment',
];

const inlineMatches = [...homepage.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gu)];
check(inlineMatches.length === 1, `expected one inline JSON-LD block; found ${inlineMatches.length}`);
const inline = inlineMatches.length === 1 ? JSON.parse(inlineMatches[0][1]) : { '@graph': [] };
const nodes = inline['@graph'] ?? [];
const byId = new Map(nodes.filter((node) => node?.['@id']).map((node) => [node['@id'], node]));

const person = byId.get(`${site}#person`);
const clinic = byId.get(`${site}#clinic`);
const page = byId.get(`${site}#webpage`);
const reputation = byId.get(`${site}#clinic-reputation-snapshot`);
const priorityAnswerList = byId.get(`${site}#priority-answer-list`);
const availableServiceRefs = asArray(clinic?.availableService);
const allowedMedicalTypes = new Set(['MedicalProcedure', 'SurgicalProcedure', 'MedicalTest', 'MedicalTherapy']);

check(hasType(person, 'Person'), 'inline physician must be typed as Person');
check(!hasType(person, 'IndividualPhysician'), 'inline Person must not be conflated with the organization-like IndividualPhysician type');
check(availableServiceRefs.length > 0, 'inline clinic must expose at least one available medical service');
for (const item of availableServiceRefs) {
  const id = item?.['@id'];
  const node = byId.get(id);
  check(Boolean(node), `inline clinic availableService reference is undefined: ${id}`);
  const types = asArray(node?.['@type']);
  check(types.some((type) => allowedMedicalTypes.has(type)), `inline clinic availableService has invalid type ${types.join('|') || 'missing'}: ${id}`);
  check(!hasType(node, 'Service'), `inline clinic availableService must not point to generic Service: ${id}`);
  check(!hasType(node, 'WebPageElement'), `inline clinic availableService must not point to WebPageElement: ${id}`);
}

const clinicSocialSameAs = [
  'https://www.instagram.com/doctor.ghezelbaash/',
  'https://www.linkedin.com/in/saeed-ghezelbash-93310a96',
  'https://www.facebook.com/Ghezelbaash/',
];
const clinicSameAs = new Set(asArray(clinic?.sameAs));
const personSameAs = new Set(asArray(person?.sameAs));
for (const url of clinicSocialSameAs) {
  check(clinicSameAs.has(url), `inline Clinic.sameAs missing social URL: ${url}`);
  check(!personSameAs.has(url), `inline Person.sameAs must not contain clinic social URL: ${url}`);
}
check(personSameAs.has(huggingFaceProfile), 'inline Person.sameAs must contain the personal Hugging Face profile');
check(!personSameAs.has(huggingFaceDataset), 'Hugging Face Dataset must not be Person.sameAs');
check(!asArray(person?.identifier).some((item) => item?.propertyID === 'Hugging Face Profile'), 'Hugging Face profile must not be modeled as a formal Person identifier');

check(hasType(page, 'MedicalWebPage'), 'homepage must remain MedicalWebPage');
check(hasType(page, 'ProfilePage'), 'homepage must also be ProfilePage');
check(page?.mainEntity?.['@id'] === `${site}#person` && !Array.isArray(page?.mainEntity), 'Person must be the sole homepage mainEntity');
check(person?.worksFor?.['@id'] === `${site}#clinic`, 'inline Person.worksFor must point to Clinic');
check(person?.workLocation?.['@id'] === `${site}#clinic`, 'inline Person.workLocation must point to Clinic');
check(person?.affiliation?.['@id'] === `${site}#clinic`, 'inline Person.affiliation must point to Clinic');
check(clinic?.employee?.['@id'] === `${site}#person`, 'inline Clinic.employee must point to Person');

check(hasType(clinic?.aggregateRating, 'AggregateRating'), 'inline Clinic.aggregateRating is missing');
check(Number(clinic?.aggregateRating?.ratingValue) === 5, 'inline clinic ratingValue must be 5');
check(Number(clinic?.aggregateRating?.bestRating) === 5, 'inline clinic bestRating must be 5');
check(Number(clinic?.aggregateRating?.ratingCount) === 163, 'inline clinic ratingCount must be 163');
check(hasType(reputation, 'Dataset'), 'inline clinic reputation snapshot must be a Dataset');
check(reputation?.mainEntity?.['@id'] === `${site}#clinic`, 'reputation snapshot mainEntity must be Clinic');
check(reputation?.mentions?.['@id'] === `${site}#person`, 'reputation snapshot must explicitly mention Person');

check(hasType(priorityAnswerList, 'ItemList'), 'priority answer ItemList missing from inline graph');
check(Number(priorityAnswerList?.numberOfItems) === priorityAnswerIds.length, 'priority answer ItemList count mismatch');
for (const id of priorityAnswerIds) {
  const question = byId.get(`${site}#question-${id}`);
  const answer = byId.get(`${site}#answer-${id}`);
  check(hasType(question, 'Question'), `priority Question missing: ${id}`);
  check(hasType(answer, 'Answer'), `priority Answer missing: ${id}`);
  check(question?.acceptedAnswer?.['@id'] === `${site}#answer-${id}`, `priority acceptedAnswer mismatch: ${id}`);
  check(answer?.author?.['@id'] === `${site}#person`, `priority Answer author must be Person: ${id}`);
}

check(!nodes.some((node) => hasType(node, 'VideoObject') || hasType(node, 'Clip')), 'homepage inline graph must not claim video rich-result eligibility');
check(!byId.has(`${site}#service-coverage-panel`), 'service coverage WebPageElement leaked into Google inline graph');
for (const node of nodes.filter((item) => /^https:\/\/www\.ghezelbaash\.ir\/#service-/.test(item?.['@id'] ?? ''))) {
  check(hasType(node, 'Service'), `inline #service-* node is not a Service: ${node['@id']}`);
}

const canonical = JSON.parse(readFileSync(join(process.cwd(), 'dist', 'knowledge-graph.jsonld'), 'utf8'));
const canonicalNodes = canonical['@graph'] ?? [];
const canonicalById = new Map(canonicalNodes.filter((node) => node?.['@id']).map((node) => [node['@id'], node]));
const canonicalPerson = canonicalById.get(`${site}#person`);
const canonicalClinic = canonicalById.get(`${site}#clinic`);
const dataset = canonicalById.get(huggingFaceDataset);
check(hasType(canonicalPerson, 'Person'), 'canonical physician must be Person');
check(!hasType(canonicalPerson, 'IndividualPhysician'), 'canonical Person must not be conflated with IndividualPhysician');
check(Number(canonicalClinic?.aggregateRating?.ratingValue) === 5, 'canonical clinic ratingValue must be 5');
check(Number(canonicalClinic?.aggregateRating?.ratingCount) === 163, 'canonical clinic ratingCount must be 163');
check(hasType(dataset, 'Dataset'), 'Hugging Face resource must be modeled as a separate Dataset');
check(dataset?.creator?.['@id'] === `${site}#person`, 'Hugging Face Dataset.creator must point to Person');
check(dataset?.publisher?.['@id'] === `${site}#clinic`, 'Hugging Face Dataset.publisher must point to Clinic');
const datasetAbout = new Set(asArray(dataset?.about).map((item) => item?.['@id']));
check(datasetAbout.has(`${site}#person`) && datasetAbout.has(`${site}#clinic`), 'Hugging Face Dataset.about must include Person and Clinic');
check(!canonicalNodes.some((node) => hasType(node, 'VideoObject') || hasType(node, 'Clip')), 'canonical graph must keep videos as contextual HTML media rather than separate video entities');

const openingTags = homepage.match(/<(?!\/|!|\?)[a-z][^>]*>/giu) ?? [];
const elementCount = openingTags.length;
check(elementCount < 3500, `homepage DOM is too large: ${elementCount} elements`);

const rawBytes = statSync(homepagePath).size;
const gzipBytes = gzipSync(Buffer.from(homepage), { level: 9 }).length;
const brotliBytes = brotliCompressSync(Buffer.from(homepage), {
  params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
}).length;
check(gzipBytes < 145_000, `homepage gzip payload unexpectedly large: ${gzipBytes} bytes`);
check(brotliBytes < 115_000, `homepage brotli payload unexpectedly large: ${brotliBytes} bytes`);

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  homepageTypes: asArray(page?.['@type']),
  homepageMainEntity: `${site}#person`,
  physicianType: 'Person',
  inlineAvailableMedicalServices: availableServiceRefs.length,
  genericServiceNodes: nodes.filter((node) => hasType(node, 'Service')).length,
  clinicSocialSameAs: clinicSocialSameAs.length,
  clinicAggregateRating: clinic.aggregateRating,
  priorityAnswerPairs: priorityAnswerIds.length,
  huggingFaceProfileInPersonSameAs: true,
  huggingFaceProfileAsIdentifier: false,
  huggingFaceDataset: {
    separateDataset: true,
    creator: `${site}#person`,
    publisher: `${site}#clinic`,
    aboutPersonAndClinic: true,
  },
  videoSchemaNodes: 0,
  doctorClinicRelation: true,
  domElements: elementCount,
  rawBytes,
  gzipBytes,
  brotliBytes,
}, null, 2));
