import {SOURCE as canonicalSource} from '../src/canonical/source.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const begin = source.indexOf('  const pageDiscoveryJsonld = (() => {');
const finish = source.indexOf('\n  // html-contract:', begin);
assert(begin >= 0 && finish > begin, 'Search graph projector boundary');
const projector = source.slice(begin, finish).replace('  const pageDiscoveryJsonld', 'const pageDiscoveryJsonld');
const sandbox = { result: null, SOURCE: canonicalSource };
vm.createContext(sandbox);
vm.runInContext(`const richResultsContract={assertRichResultsDocument(){}}; ${projector}; result={SOURCE,document:pageDiscoveryJsonld.projectPageJsonLd(SOURCE.graph)[0].document};`, sandbox, { timeout: 5000 });
const { SOURCE, document } = sandbox.result;
assert.equal(document['@context'], 'https://schema.org');
const graph = document['@graph'];

assert.equal(new Set(graph.map((node) => node['@id'])).size, graph.length, 'Duplicate Search graph IDs');
const ids = new Set(graph.map((node) => node['@id']));
const physicianId = 'https://www.ghezelbaash.ir/#saeed-ghezelbash';
const person = graph.find((node) => node['@id'] === physicianId); assert(person, 'Search Person missing');

assert.equal(graph.filter((node) => [node['@type']].flat().includes('FAQPage')).length, 0, 'Synthetic FAQPage wrapper must not leak into Search graph');
const refs = (value) => [value].flat().filter(Boolean).map((entry) => typeof entry === 'string' ? entry : entry?.['@id']).filter(Boolean);
for (const property of ['availableService', 'hasCertification', 'makesOffer', 'hasCredential', 'hasOccupation']) {
  const targets = refs(person[property]);
  assert(targets.length, `Search Person ${property} missing`);
  assert(targets.every((id) => ids.has(id)), `Search Person ${property} has undefined target`);
}
const customTerms = new Set(Object.entries(SOURCE.graph['@context']).filter(([, def]) => def && typeof def === 'object' && def['@id']?.startsWith?.('https://www.ghezelbaash.ir/ontology/')).map(([term]) => term));
for (const node of graph) for (const property of Object.keys(node)) {
  assert(!property.includes(':'), `Prefixed non-Schema Search property: ${property}`);
  assert(!customTerms.has(property), `Custom ontology Search property: ${property}`);
}
const infra = new Set(['Dataset','DataDownload','DataCatalog','StatisticalVariable','Observation','SoftwareSourceCode']);
for (const node of graph) assert(![node['@type']].flat().some((type) => infra.has(type)), `Infrastructure type leaked into Search graph: ${node['@id']}`);
console.log(JSON.stringify({
  focusedProjectionSeedAudit: 'PASS',
  context: document['@context'],
  nodes: graph.length,
  availableServicesDefined: refs(person.availableService).length,
  certificationsDefined: refs(person.hasCertification).length,
  offersDefined: refs(person.makesOffer).length,
  credentialsDefined: refs(person.hasCredential).length,
  occupationsDefined: refs(person.hasOccupation).length,
  customOntologyProperties: 0,
}, null, 2));
