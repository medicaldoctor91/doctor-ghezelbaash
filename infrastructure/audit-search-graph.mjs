import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
function extractObjectSource(marker) {
  const markerIndex = source.indexOf(marker); assert(markerIndex >= 0, `Missing marker: ${marker}`);
  const start = source.indexOf('{', markerIndex + marker.length); assert(start >= 0);
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true; else if (char === '{') depth++; else if (char === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed object after ${marker}`);
}
const sourceLiteral = extractObjectSource('export const SOURCE = ');
const begin = source.indexOf('  const pageDiscoveryJsonld = (() => {');
const finish = source.indexOf('\n  // html-contract:', begin);
assert(begin >= 0 && finish > begin, 'Search graph projector boundary');
const projector = source.slice(begin, finish).replace('  const pageDiscoveryJsonld', 'const pageDiscoveryJsonld');
const sandbox = { result: null };
vm.createContext(sandbox);
vm.runInContext(`const SOURCE=${sourceLiteral}; const richResultsContract={assertRichResultsDocument(){}}; ${projector}; result={SOURCE,document:pageDiscoveryJsonld.projectPageJsonLd(SOURCE.graph)[0].document};`, sandbox, { timeout: 5000 });
const { SOURCE, document } = sandbox.result;
assert.equal(document['@context'], 'https://schema.org');
const graph = document['@graph'];
assert.ok(Array.isArray(graph) && graph.length > 0, 'Search graph must contain semantic nodes');
assert.equal(new Set(graph.map((node) => node['@id'])).size, graph.length, 'Duplicate Search graph IDs');
const ids = new Set(graph.map((node) => node['@id']));
const physicianId = 'https://www.ghezelbaash.ir/#saeed-ghezelbash';
const homeId = 'https://www.ghezelbaash.ir/webpage';
const clinicId = 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const person = graph.find((node) => node['@id'] === physicianId); assert(person, 'Search Person missing');
assert(graph.some((node) => node['@id'] === homeId), 'Search Home page missing');
assert(graph.some((node) => node['@id'] === clinicId), 'Search Clinic missing');
assert.equal(graph.filter((node) => [node['@type']].flat().includes('FAQPage')).length, 0, 'Synthetic FAQPage wrapper must not leak into Search graph');
const refs = (value) => [value].flat().filter(Boolean).map((entry) => typeof entry === 'string' ? entry : entry?.['@id']).filter(Boolean);
for (const property of ['availableService', 'hasCertification', 'makesOffer', 'hasCredential', 'hasOccupation']) {
  const targets = refs(person[property]);
  assert(targets.length, `Search Person ${property} missing`);
  assert(targets.every((id) => ids.has(id)), `Search Person ${property} has undefined embedded target`);
}
const customTerms = new Set(Object.entries(SOURCE.graph['@context']).filter(([, def]) => def && typeof def === 'object' && def['@id']?.startsWith?.('https://www.ghezelbaash.ir/ontology/')).map(([term]) => term));
for (const node of graph) for (const property of Object.keys(node)) {
  assert(!property.includes(':'), `Prefixed non-Schema Search property: ${property}`);
  assert(!customTerms.has(property), `Custom ontology Search property: ${property}`);
}
const infra = new Set(['Dataset','DataDownload','DataCatalog','StatisticalVariable','Observation','SoftwareSourceCode']);
for (const node of graph) assert(![node['@type']].flat().some((type) => infra.has(type)), `Infrastructure type leaked into Search graph: ${node['@id']}`);
console.log(JSON.stringify({
  searchGraphAudit: 'PASS',
  context: document['@context'],
  nodes: graph.length,
  authorityMetric: 'semantic-contracts-not-node-count',
  availableServicesDefined: refs(person.availableService).length,
  certificationsDefined: refs(person.hasCertification).length,
  offersDefined: refs(person.makesOffer).length,
  credentialsDefined: refs(person.hasCredential).length,
  occupationsDefined: refs(person.hasOccupation).length,
  customOntologyProperties: 0,
}, null, 2));
