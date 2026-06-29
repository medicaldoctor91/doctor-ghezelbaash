import { absoluteUrl } from '../src/data/site.mjs';
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
  if (!Array.isArray(dataset.distribution) || dataset.distribution.length < 20) fail('dataset missing machine asset distribution');
  if (refId(dataset.isBasedOn) !== absoluteUrl('/graph-ghezelbaash-final.jsonld')) fail('dataset must be based on global graph');
  if (!Array.isArray(dataset.keywords) || !dataset.keywords.includes('dataset manifest')) fail('dataset missing dataset manifest keyword');
  if (!dataset.keywords.includes('publishing crosswalk')) fail('dataset missing publishing crosswalk keyword');
}

if (serviceNodes.length < services.length) fail('missing service nodes for channel validation');
for (const service of serviceNodes) {
  if (!service.availableChannel) fail(`service missing availableChannel: ${service['@id'] || service.name}`);
  if (service.availableChannel?.['@type'] !== 'ServiceChannel') fail(`service availableChannel must be ServiceChannel: ${service['@id'] || service.name}`);
  if (refId(service.availableChannel?.servicePhone) !== graphContactPointId()) fail(`service channel must point to graph ContactPoint: ${service['@id'] || service.name}`);
  if (refId(service.availableChannel?.serviceLocation) !== absoluteUrl('/#clinic')) fail(`service channel must point to clinic: ${service['@id'] || service.name}`);
  if (!String(refId(service.offers) || '').endsWith('/#offer')) fail(`service missing official offer reference: ${service['@id'] || service.name}`);
}

if (failed) process.exit(1);
console.log('Schema property expansion validation passed');
