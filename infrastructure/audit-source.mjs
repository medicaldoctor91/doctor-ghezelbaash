import {SOURCE,AUTHORED_BODY} from '../src/canonical/source.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = await fs.readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const origin = 'https://www.ghezelbaash.ir';
const physicianId = origin + '/#saeed-ghezelbash';

assert.equal(SOURCE.canonicalOrigin, origin);
assert.deepEqual(Object.keys(SOURCE.routes), ['schemaVersion', 'canonicalOrigin', 'resources', 'htmlIdTargets', 'legacyRedirects']);
assert.equal(SOURCE.routes.schemaVersion, 2);
assert.equal(SOURCE.routes.resources.length, 72);
assert.equal(new Set(SOURCE.routes.resources.map(({ path }) => path)).size, 72);
assert.equal(SOURCE.routes.htmlIdTargets['saeed-ghezelbash'], '/#saeed-ghezelbash');
assert.deepEqual(Object.keys(SOURCE.delivery.routing), ['graphIdentityRepresentations', 'notFound']);
const nonFragmentPhysicianId = physicianId.replace('/#', '/');
const exactStringValues = [];
const visitStrings = (value) => {
  if (typeof value === 'string') exactStringValues.push(value);
  else if (Array.isArray(value)) value.forEach(visitStrings);
  else if (value && typeof value === 'object') Object.values(value).forEach(visitStrings);
};
visitStrings(SOURCE);
assert(!exactStringValues.includes(nonFragmentPhysicianId), 'Physician identity must not use a document pathname');

const resourceByPath = new Map(SOURCE.routes.resources.map((resource) => [resource.path, resource]));
for (const [id, target] of Object.entries(SOURCE.routes.htmlIdTargets)) {
  assert(id && !/[\s#\u0000-\u001f\u007f]/u.test(id), `Invalid HTML ID: ${id}`);
  const parsed = new URL(target, origin);
  assert.equal(parsed.origin, origin, `External fragment owner: ${id}`);
  assert(resourceByPath.has(parsed.pathname), `Fragment lacks canonical document owner: ${id} -> ${target}`);
  if (parsed.hash) assert.equal(decodeURIComponent(parsed.hash.slice(1)), id, `Fragment ID drift: ${id}`);
  else assert.equal(resourceByPath.get(parsed.pathname).htmlId, id, `Canonical route ID drift: ${id}`);
}
for (const resource of SOURCE.routes.resources)
  assert.equal(SOURCE.routes.htmlIdTargets[resource.htmlId], resource.path, `Missing route target: ${resource.path}`);

const nodes = SOURCE.graph['@graph'];
const byId = new Map(nodes.map((node) => [node['@id'], node]));
assert.equal(byId.size, nodes.length, 'Duplicate graph @id');
const person = byId.get(physicianId);
const home = byId.get(origin + '/webpage');
assert(person, 'Canonical physician fragment node missing');
assert(home, 'Homepage WebPage node missing');
assert([person['@type']].flat().includes('Person'));
assert([person['@type']].flat().includes('IndividualPhysician'));
assert.equal(person.url, origin + '/');
assert.deepEqual(person.mainEntityOfPage, { '@id': origin + '/webpage' });
assert([home['@type']].flat().includes('ProfilePage'));
assert([home['@type']].flat().includes('MedicalWebPage'));
assert.deepEqual(home.mainEntity, { '@id': physicianId });
assert.equal(nodes.filter((node) => [node['@type']].flat().includes('ProfilePage')).length, 1, 'Competing ProfilePage');

assert.match(SOURCE.edition, /^\d{4}-\d{2}-\d{2}$/, 'Source edition is an ISO date, independent of clinical modification');
for (const resource of SOURCE.routes.resources) {
  const page = byId.get(origin + (resource.path === '/' ? '/webpage' : resource.path + '#webpage'));
  for(const key of ['datePublished','dateModified','lastReviewed']) if(page?.[key]) assert.match(page[key]['@value']??page[key], /^\d{4}-\d{2}-\d{2}/, `Invalid authored ${key}: ${resource.path}`);
}
const fullGraphResource = SOURCE.machineResources.find((resource) => resource.path === '/graph.jsonld');
assert.equal(fullGraphResource?.rel, 'describedby', 'Homepage must discover the canonical /graph.jsonld resource');
assert.equal(fullGraphResource?.discoverable, true, 'Canonical graph must remain discoverable');
assert(source.includes("const baseHead = SOURCE.head.metaValues"), 'Homepage head must separate critical metadata from discovery links');
const rawHomeSource = source.slice(source.indexOf('const rawHome = shell('), source.indexOf('const home = readerScope.stampGuideSource', source.indexOf('const rawHome = shell(')));
for (const token of ['baseHead', '<title>', '<link rel=\"canonical\"', '<link rel=\"stylesheet\"', 'discoveryHead', 'schema-core-mainentity']) assert(rawHomeSource.includes(token), `Homepage head construction missing ${token}`);
assert(rawHomeSource.indexOf('baseHead') < rawHomeSource.indexOf('<title>'), 'Base metadata must precede title');
assert(rawHomeSource.indexOf('<title>') < rawHomeSource.indexOf('<link rel=\"canonical\"'), 'Title/description metadata must precede canonical');
assert(rawHomeSource.indexOf('<link rel=\"stylesheet\"') < rawHomeSource.indexOf('schema-core-mainentity'), 'Stylesheet discovery must precede the complete inline KG');
assert(rawHomeSource.indexOf('<link rel=\"canonical\"') < rawHomeSource.indexOf('discoveryHead'), 'Canonical must precede CSS/discovery links');
assert(rawHomeSource.indexOf('schema-core-mainentity') < rawHomeSource.indexOf('discoveryHead'), 'Full KG must precede discovery links');
assert(source.includes('function browserContextFor() { return "https://schema.org"; }'), 'Search-facing JSON-LD must use a pure Schema.org context');
assert(source.includes('"availableService", "hasCertification", "makesOffer"'), 'Focused authority spine is missing high-value physician relations');

const refIds = (value) => [value].flat().filter(Boolean).map((entry) => typeof entry === 'string' ? entry : entry?.['@id']).filter(Boolean);
const medicalSpecialtyId = origin + '/medical-specialty-aesthetic-medicine';
const eligibleMedicalPages = nodes.filter((node) => [node['@type']].flat().includes('MedicalWebPage'));
assert(eligibleMedicalPages.length >= 1, 'MedicalWebPage corpus missing');
for (const page of eligibleMedicalPages) {
  assert([page.medicalAudience].flat().filter(Boolean).some((audience) => audience?.['@type'] === 'Patient'), `Medical audience missing Patient: ${page['@id']}`);
  assert(refIds(page.specialty).includes(medicalSpecialtyId), `Medical specialty missing: ${page['@id']}`);
  assert(refIds(page.reviewedBy).includes(physicianId), `Medical reviewer drift: ${page['@id']}`);
  if(page.lastReviewed) assert.match(page.lastReviewed?.['@value'] ?? page.lastReviewed, /^\d{4}-\d{2}-\d{2}$/, `Medical review date invalid: ${page['@id']}`);
}
const allSourceText = JSON.stringify(SOURCE);
assert(!allSourceText.includes('https://www.pinterest.com/medicaldoctor91/'), 'Invalid Pinterest identity must be absent from the entire source');
assert(refIds(person.sameAs).includes('https://www.pinterest.com/qezelbaash/'), 'Canonical Pinterest identity missing');
assert.equal(refIds(person.sameAs).filter((url) => url.startsWith('https://www.linkedin.com/in/saeed-ghezelbash-93310a96')).length, 1, 'LinkedIn identity must be canonicalized');
assert.equal(refIds(person.sameAs).filter((url) => url.startsWith('https://www.youtube.com/')).length, 1, 'YouTube identity must be canonicalized to one stable profile');
const translationGroup = SOURCE.discovery.translationGroups.find((group) => group.kind === 'equivalent-guide');
assert.equal(translationGroup?.xDefault, '/aesthetic-guide-en', 'Equivalent guide x-default must resolve to English guide');
for (const resource of SOURCE.routes.resources) {
  const pageId = resource.path === '/' ? origin + '/webpage' : origin + resource.path + '#webpage';
  const page = byId.get(pageId);
  assert(page, `Canonical page graph node missing: ${pageId}`);
  assert(refIds(page.author).includes(physicianId), `Canonical page author drift: ${resource.path}`);
  assert(refIds(page.publisher).includes(physicianId), `Canonical page publisher drift: ${resource.path}`);
}

const shacl = SOURCE.validation.shaclSupplement;
assert(shacl.includes(`<${physicianId}>`), 'SHACL does not target canonical physician fragment');
assert(SOURCE.machineProjection.discoveryGuide.includes(`Primary entity: ${physicianId}.`), 'Discovery guide identity drift');
assert(SOURCE.delivery.http.documentIdentity.about.includes(physicianId), 'HTTP about identity drift');

const authoredSource = AUTHORED_BODY;
assert(authoredSource.includes('id="saeed-ghezelbash"'), 'Real physician H1 fragment missing');
assert(authoredSource.includes(`itemid="${physicianId}"`), 'Microdata physician identity drift');
assert(!authoredSource.includes(`itemid="${nonFragmentPhysicianId}"`), 'Microdata physician identity must use the canonical fragment');

const canonicalPaths = new Set(SOURCE.routes.resources.map(({ path }) => path));
const machinePaths = new Set(SOURCE.machineResources.map(({ path }) => path));
const forbiddenArtificialPaths = new Set(
  Object.keys(SOURCE.routes.htmlIdTargets)
    .map((id) => '/' + id)
    .filter((path) => !canonicalPaths.has(path)),
);
const localHrefs = [...authoredSource.matchAll(/href="(\/[^"]*)"/g)].map((match) => match[1]);
for (const href of localHrefs) {
  const parsed = new URL(href, origin);
  assert(!forbiddenArtificialPaths.has(parsed.pathname), `Authored link revives an ID-derived pathname: ${href}`);
  assert(
    canonicalPaths.has(parsed.pathname) || machinePaths.has(parsed.pathname) || parsed.pathname.startsWith('/media/'),
    `Unregistered local authored link: ${href}`,
  );
  if (parsed.hash) {
    const id = decodeURIComponent(parsed.hash.slice(1));
    assert(Object.hasOwn(SOURCE.routes.htmlIdTargets, id), `Unregistered authored fragment link: ${href}`);
    const owner = new URL(SOURCE.routes.htmlIdTargets[id], origin).pathname;
    assert(parsed.pathname === owner || parsed.pathname === '/', `Authored fragment points at the wrong canonical document: ${href}`);
  }
}

const report = {
  sourceAudit: 'PASS',
  canonicalPages: SOURCE.routes.resources.length,
  authoredFragmentTargets: Object.keys(SOURCE.routes.htmlIdTargets).length,
  graphNodes: nodes.length,
  physicianId,
  routeModel: 'canonical-documents+authored-fragments',
  canonicalPageAuthorPublisherConsistency: `${SOURCE.routes.resources.length}/${SOURCE.routes.resources.length}`,
  sourceEdition: SOURCE.edition,
  fullCanonicalGraphEmbeddedInHome: true,
  focusedSearchContext: 'https://schema.org',
  shaclIdentityAligned: true,
  microdataIdentityAligned: true,
};
console.log(JSON.stringify(report, null, 2));
