import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { videos } from '../src/domain/media.mjs';

const site = 'https://www.ghezelbaash.ir/';
const personId = `${site}#mohammad-saeed-ghezelbash`;
const clinicId = `${site}#dr-saeed-ghezelbash-aesthetic-clinic`;
const pageId = `${site}#webpage`;
const contentTableId = `${site}#content-table`;
const huggingFaceProfile = 'https://huggingface.co/Ghezelbaash';
const huggingFaceDataset = 'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data';
const sectionIds = [
  'best-aesthetic-doctor-kermanshah','aesthetic-services-kermanshah','aesthetic-treatment-selection','injectable-aesthetic-treatments','lifting-and-facial-aging','skin-scar-rejuvenation','hair-loss-and-restoration','submental-and-body-contouring','aesthetic-surgery-and-referral','revision-complications-and-safety','aesthetic-cost-and-consultation','aesthetic-faq-kermanshah-iran','medical-research-and-education','clinic-information-kermanshah','knowledge-graph-and-datasets','sources-contact-and-appointment',
];

const homepagePath = join(process.cwd(), 'dist', 'index.html');
const homepage = readFileSync(homepagePath, 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const asArray = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];
const hasType = (node, type) => asArray(node?.['@type']).includes(type);

const inlineMatches = [...homepage.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gu)];
check(inlineMatches.length === 1, `expected one inline JSON-LD block; found ${inlineMatches.length}`);
const inline = inlineMatches.length === 1 ? JSON.parse(inlineMatches[0][1]) : { '@graph': [] };
const nodes = inline['@graph'] ?? [];
const byId = new Map(nodes.filter((node) => node?.['@id']).map((node) => [node['@id'], node]));

const person = byId.get(personId);
const clinic = byId.get(clinicId);
const page = byId.get(pageId);
const contentTable = byId.get(contentTableId);
const reputation = byId.get(`${site}#clinic-reputation-snapshot`);
const availableServiceRefs = asArray(clinic?.availableService);
const allowedMedicalTypes = new Set(['MedicalProcedure', 'SurgicalProcedure', 'MedicalTest', 'MedicalTherapy']);

check(hasType(person, 'Person'), 'inline physician must be typed as Person');
check(!hasType(person, 'IndividualPhysician'), 'Person must not be conflated with IndividualPhysician');
check(!byId.has(`${site}#person`), 'legacy #person graph id must be removed');
check(!byId.has(`${site}#clinic`), 'legacy #clinic graph id must be removed');
check(hasType(clinic, 'MedicalClinic') && hasType(clinic, 'LocalBusiness'), 'clinic must remain MedicalClinic and LocalBusiness');
check(hasType(page, 'MedicalWebPage') && hasType(page, 'ProfilePage'), 'homepage must remain MedicalWebPage and ProfilePage');
check(page?.mainEntity?.['@id'] === personId && !Array.isArray(page?.mainEntity), 'Person must be the sole homepage mainEntity');
check(person?.worksFor?.['@id'] === clinicId, 'Person.worksFor must point to canonical Clinic');
check(person?.workLocation?.['@id'] === clinicId, 'Person.workLocation must point to canonical Clinic');
check(person?.affiliation?.['@id'] === clinicId, 'Person.affiliation must point to canonical Clinic');
check(clinic?.employee?.['@id'] === personId, 'Clinic.employee must point to canonical Person');
check(clinic?.hasMap === 'https://www.google.com/maps?cid=12350483144643112463', 'Clinic.hasMap must use the Google Maps deep link');

check(availableServiceRefs.length > 0, 'clinic must expose at least one available medical service');
for (const item of availableServiceRefs) {
  const node = byId.get(item?.['@id']);
  check(Boolean(node), `undefined clinic availableService reference: ${item?.['@id']}`);
  check(asArray(node?.['@type']).some((type) => allowedMedicalTypes.has(type)), `invalid availableService type: ${item?.['@id']}`);
}

check(hasType(clinic?.aggregateRating, 'AggregateRating'), 'Clinic.aggregateRating is missing');
check(Number(clinic?.aggregateRating?.ratingValue) === 5, 'clinic ratingValue must be 5');
check(Number(clinic?.aggregateRating?.bestRating) === 5, 'clinic bestRating must be 5');
check(Number(clinic?.aggregateRating?.ratingCount) === 163, 'clinic ratingCount must be 163');
if (reputation) {
  check(reputation?.mainEntity?.['@id'] === clinicId, 'reputation snapshot mainEntity must be canonical Clinic');
  check(reputation?.mentions?.['@id'] === personId, 'reputation snapshot must mention canonical Person');
}

const personSameAs = new Set(asArray(person?.sameAs));
check(personSameAs.has(huggingFaceProfile), 'Person.sameAs must contain the personal Hugging Face profile');
check(!personSameAs.has(huggingFaceDataset), 'Hugging Face Dataset must not be Person.sameAs');
check(personSameAs.has('https://www.wikidata.org/entity/Q140287622'), 'Person.sameAs must contain Wikidata Q140287622');
const clinicSameAs = new Set(asArray(clinic?.sameAs));
check(clinicSameAs.has('https://www.wikidata.org/entity/Q140288589'), 'Clinic.sameAs must contain Wikidata Q140288589');

check(hasType(contentTable, 'ItemList'), 'content table ItemList is missing');
check(Number(contentTable?.numberOfItems) === sectionIds.length, 'content table ItemList count mismatch');
for (const fragment of sectionIds) {
  const section = byId.get(`${site}#${fragment}`);
  check(hasType(section, 'WebPageElement'), `canonical WebPageElement missing: ${fragment}`);
  check(section?.isPartOf?.['@id'] === pageId, `section must be part of homepage: ${fragment}`);
}
check(!nodes.some((node) => hasType(node, 'WebPageElement') && /#clinical-decision-model-/u.test(node?.['@id'] ?? '')), 'legacy numeric WebPageElement nodes must be removed');

const videoNodes = nodes.filter((node) => hasType(node, 'VideoObject'));
check(videoNodes.length === videos.length, `expected ${videos.length} VideoObject nodes; found ${videoNodes.length}`);
for (const video of videos) {
  const node = byId.get(`${site}#video-${video.id}`);
  check(hasType(node, 'VideoObject'), `VideoObject missing: ${video.id}`);
  check(node?.creator?.['@id'] === personId && node?.author?.['@id'] === personId, `VideoObject creator/author mismatch: ${video.id}`);
  check(node?.isPartOf?.['@id'] === `${site}#${video.subsectionId ?? video.sectionId}`, `VideoObject isPartOf mismatch: ${video.id}`);
}

for (const node of nodes.filter((item) => hasType(item, 'Service') || hasType(item, 'MedicalProcedure') || hasType(item, 'SurgicalProcedure'))) {
  check(typeof node.url === 'string' && node.url.startsWith(`${site}#`), `service/procedure must target a homepage fragment: ${node['@id']}`);
  if (hasType(node, 'Service')) check(node?.provider?.['@id'] === clinicId, `Service.provider must point to canonical Clinic: ${node['@id']}`);
}

const canonical = JSON.parse(readFileSync(join(process.cwd(), 'dist', 'knowledge-graph.jsonld'), 'utf8'));
const canonicalNodes = canonical['@graph'] ?? [];
const canonicalById = new Map(canonicalNodes.filter((node) => node?.['@id']).map((node) => [node['@id'], node]));
const canonicalPerson = canonicalById.get(personId);
const canonicalClinic = canonicalById.get(clinicId);
const dataset = canonicalById.get(huggingFaceDataset);
check(hasType(canonicalPerson, 'Person'), 'external graph physician must be canonical Person');
check(hasType(canonicalClinic, 'MedicalClinic'), 'external graph Clinic is missing');
check(Number(canonicalClinic?.aggregateRating?.ratingCount) === 163, 'external graph clinic rating count mismatch');
check(hasType(dataset, 'Dataset'), 'Hugging Face resource must remain a separate Dataset');
check(dataset?.creator?.['@id'] === personId, 'Dataset.creator must point to canonical Person');
check(dataset?.publisher?.['@id'] === clinicId, 'Dataset.publisher must point to canonical Clinic');
check(canonicalNodes.filter((node) => hasType(node, 'VideoObject')).length === videos.length, 'external graph video count mismatch');
for (const fragment of sectionIds) check(hasType(canonicalById.get(`${site}#${fragment}`), 'WebPageElement'), `external graph section missing: ${fragment}`);

const openingTags = homepage.match(/<(?!\/|!|\?)[a-z][^>]*>/giu) ?? [];
const elementCount = openingTags.length;
check(elementCount < 4200, `homepage DOM is too large: ${elementCount} elements`);
const rawBytes = statSync(homepagePath).size;
const gzipBytes = gzipSync(Buffer.from(homepage), { level: 9 }).length;
const brotliBytes = brotliCompressSync(Buffer.from(homepage), { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } }).length;
check(gzipBytes < 180_000, `homepage gzip payload unexpectedly large: ${gzipBytes} bytes`);
check(brotliBytes < 145_000, `homepage brotli payload unexpectedly large: ${brotliBytes} bytes`);

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  personId,
  clinicId,
  homepageMainEntity: page.mainEntity['@id'],
  canonicalSections: sectionIds.length,
  contentTableItems: contentTable.numberOfItems,
  videoSchemaNodes: videoNodes.length,
  inlineAvailableMedicalServices: availableServiceRefs.length,
  domElements: elementCount,
  rawBytes,
  gzipBytes,
  brotliBytes,
}, null, 2));
