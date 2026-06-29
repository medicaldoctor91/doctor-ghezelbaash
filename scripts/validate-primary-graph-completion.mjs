import { absoluteUrl } from '../src/data/site.mjs';
import { services } from '../src/data/services.mjs';
import { buildGlobalGraph } from '../src/lib/globalGraph.mjs';
import {
  aestheticMedicineSpecialtyId,
  dataCatalogId,
  kermanshahPlaceId,
  medicalCredentialId,
  medicalCouncilOfCanadaId,
  medicalDegreeCredentialId,
  medicalSchoolId,
  mccCredentialAssessmentId
} from '../src/lib/primaryGraphCompletion.mjs';

let failed = false;
function fail(message) {
  console.error(message);
  failed = true;
}

function refId(value) {
  return value?.['@id'];
}

function refs(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function refIds(value) {
  return refs(value).map((item) => item?.['@id']).filter(Boolean);
}

function typeList(entity) {
  return Array.isArray(entity?.['@type']) ? entity['@type'] : [entity?.['@type']].filter(Boolean);
}

function propertyValues(entity, propertyID) {
  return refs(entity?.additionalProperty)
    .filter((property) => property?.propertyID === propertyID)
    .map((property) => property.value)
    .filter((value) => value !== undefined && value !== null && value !== '');
}

const graph = buildGlobalGraph();
const graphText = JSON.stringify(graph);
const nodes = graph?.['@graph'] || [];
const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
const catalog = byId.get(dataCatalogId());
const credential = byId.get(medicalCredentialId());
const medicalDegree = byId.get(medicalDegreeCredentialId());
const mccAssessment = byId.get(mccCredentialAssessmentId());
const medicalSchool = byId.get(medicalSchoolId());
const mcc = byId.get(medicalCouncilOfCanadaId());
const place = byId.get(kermanshahPlaceId());
const specialty = byId.get(aestheticMedicineSpecialtyId());
const website = byId.get(absoluteUrl('/#website'));
const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
const physician = byId.get(absoluteUrl('/#physician'));
const clinic = byId.get(absoluteUrl('/#clinic'));
const dataset = byId.get(absoluteUrl('/kg/#dataset'));
const termSet = byId.get(absoluteUrl('/kg/aesthetic-scope#term-set'));

for (const forbiddenNeedle of [
  'E0217736',
  'E94583066IMM',
  '1962-87530',
  'MyIntealth',
  'EICS',
  'ECA ID',
  'MCC candidate code',
  'Canadian immigration purposes',
  'immigration validity',
  'LMCC'
]) {
  if (graphText.includes(forbiddenNeedle)) fail(`non-authority MCC workflow wording leaked into completion graph: ${forbiddenNeedle}`);
}

if (!catalog) fail('missing DataCatalog node');
if (!credential) fail('missing medical credential node');
if (!medicalDegree) fail('missing medical degree credential node');
if (!mccAssessment) fail('missing MCC credential assessment node');
if (!medicalSchool) fail('missing medical school organization node');
if (!mcc) fail('missing Medical Council of Canada organization node');
if (!place) fail('missing Kermanshah place node');
if (!specialty) fail('missing aesthetic medicine specialty node');

if (catalog) {
  if (catalog['@type'] !== 'DataCatalog') fail('catalog must be DataCatalog');
  if (refId(catalog.dataset) !== absoluteUrl('/kg/#dataset')) fail('catalog dataset must point to primary dataset');
  if (!Array.isArray(catalog.distribution) || catalog.distribution.length < 20) fail('catalog missing machine asset distribution');
}

if (credential) {
  if (!typeList(credential).includes('EducationalOccupationalCredential')) fail('credential must be EducationalOccupationalCredential');
  if (!typeList(credential).includes('CreativeWork')) fail('credential must be CreativeWork for about retention');
  if (credential.identifier?.value !== '167430') fail('credential missing medical council number');
  if (refId(credential.about) !== absoluteUrl('/#dr-saeed-ghezelbash')) fail('credential must be about person');
}

if (medicalSchool) {
  if (!typeList(medicalSchool).includes('EducationalOrganization')) fail('medical school must be EducationalOrganization');
  if (medicalSchool.name !== 'Kermanshah University of Medical Sciences School of Medicine') fail('medical school name mismatch');
}

if (mcc) {
  if (mcc['@type'] !== 'Organization') fail('Medical Council of Canada must be Organization');
  if (mcc.name !== 'Medical Council of Canada') fail('Medical Council of Canada name mismatch');
}

if (medicalDegree) {
  if (!typeList(medicalDegree).includes('EducationalOccupationalCredential')) fail('medical degree must be EducationalOccupationalCredential');
  if (medicalDegree.name !== 'Medical Degree') fail('medical degree name mismatch');
  if (medicalDegree.dateIssued !== '2018') fail('medical degree graduation year mismatch');
  if (refId(medicalDegree.recognizedBy) !== medicalSchoolId()) fail('medical degree must be recognized by medical school');
  if (!propertyValues(medicalDegree, 'countryOfStudy').includes('IR')) fail('medical degree must preserve countryOfStudy');
}

if (mccAssessment) {
  if (!typeList(mccAssessment).includes('EducationalOccupationalCredential')) fail('MCC assessment must be EducationalOccupationalCredential');
  if (mccAssessment.dateIssued !== '2020-09-17') fail('MCC assessment date mismatch');
  if (mccAssessment.educationalLevel !== 'Doctor of Medicine') fail('MCC equivalency mismatch');
  if (refId(mccAssessment.recognizedBy) !== medicalCouncilOfCanadaId()) fail('MCC assessment must be recognized by MCC');
  if (refId(mccAssessment.assesses) !== medicalDegreeCredentialId()) fail('MCC assessment must assess medical degree');
  if (!propertyValues(mccAssessment, 'assessedCredential').includes('Medical Degree')) fail('MCC assessment must preserve assessedCredential');
  if (!propertyValues(mccAssessment, 'canadianEquivalency').includes('Doctor of Medicine')) fail('MCC assessment must preserve Canadian Doctor of Medicine equivalency');
}

if (place) {
  if (place['@type'] !== 'City') fail('place must be City');
  if (place.name !== 'Kermanshah') fail('place must be Kermanshah');
  if (!place.geo?.latitude || !place.geo?.longitude) fail('place missing geo coordinates');
}

if (specialty) {
  if (specialty['@type'] !== 'DefinedTerm') fail('specialty must be DefinedTerm');
  if (specialty.termCode !== 'aesthetic-medicine') fail('specialty termCode mismatch');
}

if (website) {
  if (refId(website.mainEntity) !== absoluteUrl('/kg/#dataset')) fail('website mainEntity must point to primary dataset');
  const websitePartIds = refIds(website.hasPart);
  for (const requiredPage of [
    `${absoluteUrl('/')}#webpage`,
    `${absoluteUrl('/dr-saeed-ghezelbash/')}#webpage`,
    `${absoluteUrl('/dr-saeed-ghezelbash-aesthetic-clinic/')}#webpage`,
    `${absoluteUrl('/services/')}#webpage`,
    `${absoluteUrl('/kg/')}#webpage`,
    ...services.map((service) => `${absoluteUrl(`/${service.slug}/`)}#webpage`)
  ]) {
    if (!websitePartIds.includes(requiredPage)) fail(`website missing page hasPart: ${requiredPage}`);
  }
}

if (person) {
  for (const requiredCredential of [medicalCredentialId(), medicalDegreeCredentialId(), mccCredentialAssessmentId()]) {
    if (!refIds(person.hasCredential).includes(requiredCredential)) fail(`person missing credential reference: ${requiredCredential}`);
  }
  if (!refIds(person.alumniOf).includes(medicalSchoolId())) fail('person missing medical school alumniOf');
  if (!refIds(person.knowsAbout).includes(aestheticMedicineSpecialtyId())) fail('person missing aesthetic specialty knowsAbout');
}

if (physician) {
  for (const requiredCredential of [medicalCredentialId(), medicalDegreeCredentialId(), mccCredentialAssessmentId()]) {
    if (!refIds(physician.hasCredential).includes(requiredCredential)) fail(`physician missing credential reference: ${requiredCredential}`);
  }
  if (!refIds(physician.alumniOf).includes(medicalSchoolId())) fail('physician missing medical school alumniOf');
  if (!refIds(physician.medicalSpecialty).includes(aestheticMedicineSpecialtyId())) fail('physician missing aesthetic specialty reference');
  if (!refIds(physician.areaServed).includes(kermanshahPlaceId())) fail('physician areaServed must include Kermanshah place');
}

if (clinic) {
  if (!refIds(clinic.areaServed).includes(kermanshahPlaceId())) fail('clinic areaServed must include Kermanshah place');
}

if (dataset) {
  if (refId(dataset.includedInDataCatalog) !== dataCatalogId()) fail('dataset must be included in DataCatalog');
  if (!refIds(dataset.spatialCoverage).includes(kermanshahPlaceId())) fail('dataset spatialCoverage must include Kermanshah place');
  if (dataset.isAccessibleForFree !== true) fail('dataset must mark isAccessibleForFree true');
  const mainEntityIds = refIds(dataset.mainEntity);
  for (const requiredEntity of [absoluteUrl('/#dr-saeed-ghezelbash'), absoluteUrl('/#physician'), absoluteUrl('/#clinic'), absoluteUrl('/kg/aesthetic-scope#term-set')]) {
    if (!mainEntityIds.includes(requiredEntity)) fail(`dataset mainEntity missing ${requiredEntity}`);
  }
  for (const requiredPart of [medicalDegreeCredentialId(), mccCredentialAssessmentId(), medicalSchoolId(), medicalCouncilOfCanadaId()]) {
    if (!refIds(dataset.hasPart).includes(requiredPart)) fail(`dataset missing education hasPart: ${requiredPart}`);
  }
}

if (termSet && !refIds(termSet.hasDefinedTerm).includes(aestheticMedicineSpecialtyId())) {
  fail('aesthetic term set missing aesthetic medicine specialty term');
}

for (const service of services) {
  const serviceNode = byId.get(absoluteUrl(`/${service.slug}/#service`));
  const pageNode = byId.get(`${absoluteUrl(`/${service.slug}/`)}#webpage`);
  if (!serviceNode) fail(`missing service node: ${service.slug}`);
  if (!pageNode) fail(`missing service page node: ${service.slug}`);
  if (serviceNode && !refIds(serviceNode.serviceArea).includes(kermanshahPlaceId())) fail(`service missing Kermanshah serviceArea: ${service.slug}`);
  if (serviceNode && refId(serviceNode.availableAtOrFrom) !== absoluteUrl('/#clinic')) fail(`service missing clinic availableAtOrFrom: ${service.slug}`);
  if (pageNode && !typeList(pageNode).includes('WebPage')) fail(`service page node must be WebPage: ${service.slug}`);
  if (pageNode && refId(pageNode.mainEntity) !== absoluteUrl(`/${service.slug}/#service`)) fail(`service page mainEntity mismatch: ${service.slug}`);
}

if (failed) process.exit(1);
console.log('Primary graph completion validation passed');
