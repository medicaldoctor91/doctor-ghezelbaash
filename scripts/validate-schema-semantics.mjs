import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';

const site = 'https://www.ghezelbaash.ir/';
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

const person = byId.get(`${site}#person`);
const clinic = byId.get(`${site}#clinic`);
const availableServiceRefs = asArray(clinic?.availableService);
const allowedMedicalTypes = new Set(['MedicalProcedure', 'SurgicalProcedure', 'MedicalTest', 'MedicalTherapy']);
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

check(person?.worksFor?.['@id'] === `${site}#clinic`, 'inline Person.worksFor must point to Clinic');
check(person?.workLocation?.['@id'] === `${site}#clinic`, 'inline Person.workLocation must point to Clinic');
check(person?.affiliation?.['@id'] === `${site}#clinic`, 'inline Person.affiliation must point to Clinic');
check(clinic?.employee?.['@id'] === `${site}#person`, 'inline Clinic.employee must point to Person');

check(!byId.has(`${site}#service-coverage-panel`), 'service coverage WebPageElement leaked into Google inline graph');
for (const node of nodes.filter((item) => /^https:\/\/www\.ghezelbaash\.ir\/#service-/.test(item?.['@id'] ?? ''))) {
  check(hasType(node, 'Service'), `inline #service-* node is not a Service: ${node['@id']}`);
}

const openingTags = homepage.match(/<(?!\/|!|\?)[a-z][^>]*>/giu) ?? [];
const elementCount = openingTags.length;
check(elementCount < 3500, `homepage DOM is too large: ${elementCount} elements`);

const rawBytes = statSync(homepagePath).size;
const gzipBytes = gzipSync(Buffer.from(homepage), { level: 9 }).length;
const brotliBytes = brotliCompressSync(Buffer.from(homepage), {
  params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
}).length;
check(gzipBytes < 140_000, `homepage gzip payload unexpectedly large: ${gzipBytes} bytes`);
check(brotliBytes < 110_000, `homepage brotli payload unexpectedly large: ${brotliBytes} bytes`);

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  inlineAvailableMedicalServices: availableServiceRefs.length,
  genericServiceNodes: nodes.filter((node) => hasType(node, 'Service')).length,
  invalidAvailableServiceTypes: 0,
  clinicSocialSameAs: clinicSocialSameAs.length,
  doctorClinicRelation: true,
  domElements: elementCount,
  rawBytes,
  gzipBytes,
  brotliBytes,
}, null, 2));
