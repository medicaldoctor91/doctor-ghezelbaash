import { absoluteUrl } from '../src/data/site.mjs';
import { publicDataset } from '../src/data/dataset.mjs';
import { services } from '../src/data/services.mjs';
import { buildGlobalGraph } from '../src/lib/globalGraph.mjs';
import {
  graphClinicLogoId,
  graphContactPointId,
  graphDoctorImageId
} from '../src/lib/schemaPropertyExpansion.mjs';

let failed = false;
function fail(message) {
  console.error(message);
  failed = true;
}

function refId(value) {
  return value?.['@id'];
}

function propertyValues(entity, propertyID) {
  return (Array.isArray(entity?.additionalProperty) ? entity.additionalProperty : [entity?.additionalProperty].filter(Boolean))
    .filter((property) => property?.propertyID === propertyID)
    .map((property) => property.value);
}

const graph = buildGlobalGraph();
const nodes = graph?.['@graph'] || [];
const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
const physician = byId.get(absoluteUrl('/#physician'));
const clinic = byId.get(absoluteUrl('/#clinic'));
const website = byId.get(absoluteUrl('/#website'));
const dataset = byId.get(absoluteUrl('/kg/#dataset'));
const contactPoint = byId.get(graphContactPointId());
const doctorImage = byId.get(graphDoctorImageId());
const clinicLogo = byId.get(graphClinicLogoId());
const serviceNodes = nodes.filter((node) => node['@type'] === 'Service');

if (!contactPoint) fail('missing graph ContactPoint node');
if (!doctorImage) fail('missing doctor ImageObject node');
if (!clinicLogo) fail('missing clinic logo ImageObject node');

if (contactPoint) {
  if (contactPoint['@type'] !== 'ContactPoint') fail('contact point must be ContactPoint');
  if (contactPoint.telephone !== '+989308209494') fail('contact point telephone mismatch');
  if (!String(contactPoint.contactType || '').includes('aesthetic')) fail('contact point missing aesthetic consultation type');
}

if (doctorImage?.['@type'] !== 'ImageObject') fail('doctor image must be ImageObject');
if (clinicLogo?.['@type'] !== 'ImageObject') fail('clinic logo must be ImageObject');

if (person && refId(person.image) !== graphDoctorImageId()) fail('person image must point to doctor ImageObject');
if (physician) {
  if (refId(physician.image) !== graphDoctorImageId()) fail('physician image must point to doctor ImageObject');
  if (refId(physician.contactPoint) !== graphContactPointId()) fail('physician must point to graph ContactPoint');
  if (!Array.isArray(physician.availableLanguage) || !physician.availableLanguage.includes('fa-IR')) fail('physician missing fa-IR availableLanguage');
}
if (clinic) {
  if (refId(clinic.image) !== graphDoctorImageId()) fail('clinic image must point to doctor ImageObject');
  if (refId(clinic.logo) !== graphClinicLogoId()) fail('clinic logo must point to logo ImageObject');
  if (refId(clinic.contactPoint) !== graphContactPointId()) fail('clinic must point to graph ContactPoint');
  if (!Array.isArray(clinic.availableLanguage) || !clinic.availableLanguage.includes('fa-IR')) fail('clinic missing fa-IR availableLanguage');
}
if (website && refId(website.image) !== graphDoctorImageId()) fail('website image must point to doctor ImageObject');

if (dataset) {
  const hasPartText = JSON.stringify(dataset.hasPart || []);
  if (!Array.isArray(dataset.distribution) || dataset.distribution.length < 20) fail('dataset missing machine asset DataDownload distribution');
  if (refId(dataset.isBasedOn) !== absoluteUrl('/graph-ghezelbaash-final.jsonld')) fail('dataset must be based on global graph');
  if (dataset.spatialCoverage?.name !== 'Kermanshah') fail('dataset missing Kermanshah spatialCoverage');
  if (!Array.isArray(dataset.keywords) || !dataset.keywords.includes('aesthetic medicine Kermanshah')) fail('dataset missing expanded keywords');
  if (!dataset.keywords.includes('dataset manifest')) fail('dataset missing dataset manifest keyword');
  if (!dataset.keywords.includes('publishing crosswalk')) fail('dataset missing publishing crosswalk keyword');
  if (!hasPartText.includes('Canonical website')) fail('dataset hasPart missing canonical website work');
  if (!hasPartText.includes('Repository context')) fail('dataset hasPart missing repository context');
  if (!hasPartText.includes('External archived DOI record')) fail('dataset hasPart missing external DOI archive');
  if (!hasPartText.includes(publicDataset.doiUrl)) fail('dataset hasPart missing DOI URL');
  if (!hasPartText.includes(publicDataset.huggingFace)) fail('dataset hasPart missing Hugging Face mirror');
  if (!propertyValues(dataset, 'jsonLdConsolidationPolicy').some((value) => String(value).includes('Dataset manifest and publishing crosswalk'))) {
    fail('dataset missing JSON-LD consolidation policy');
  }
}

if (serviceNodes.length < services.length) fail('missing service nodes for channel validation');
for (const service of serviceNodes) {
  if (!service.availableChannel) fail(`service missing availableChannel: ${service['@id'] || service.name}`);
  if (service.availableChannel?.['@type'] !== 'ServiceChannel') fail(`service availableChannel must be ServiceChannel: ${service['@id'] || service.name}`);
  if (refId(service.availableChannel?.servicePhone) !== graphContactPointId()) fail(`service channel must point to graph ContactPoint: ${service['@id'] || service.name}`);
  if (refId(service.availableChannel?.serviceLocation) !== absoluteUrl('/#clinic')) fail(`service channel must point to clinic: ${service['@id'] || service.name}`);
  if (!Array.isArray(service.isRelatedTo) || service.isRelatedTo.length < services.length - 1) fail(`service missing related official services: ${service['@id'] || service.name}`);
}

if (failed) process.exit(1);
console.log('Schema property expansion validation passed');
