import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(process.cwd(), 'dist', 'index.html'), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const head = html.match(/<head>([\s\S]*?)<\/head>/iu)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/iu)?.[1] ?? '';
const scriptMatch = head.match(/<script\b[^>]*id="homepage-entity-graph"[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/iu);

check(Boolean(head), 'document head is missing');
check(Boolean(scriptMatch), 'canonical inline JSON-LD is not present in head');
check(!/<script\b[^>]*id="homepage-entity-graph"/iu.test(body), 'canonical inline JSON-LD leaked back into body');
check(head.indexOf('id="homepage-entity-graph"') >= 0 && head.indexOf('id="homepage-entity-graph"') < 3000, 'inline JSON-LD is too deep in head');
check(head.includes('rel="describedby"') && head.includes('knowledge-graph.jsonld'), 'external canonical graph discovery link is missing');

let graph = null;
if (scriptMatch) {
  try { graph = JSON.parse(scriptMatch[1]); } catch (error) { failures.push(`inline JSON-LD parse failed: ${error.message}`); }
}
const nodes = graph?.['@graph'] ?? [];
const person = nodes.find((node) => node?.['@id'] === 'https://www.ghezelbaash.ir/#mohammad-saeed-ghezelbash');
const clinic = nodes.find((node) => node?.['@id'] === 'https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic');
check(Array.isArray(nodes) && nodes.length > 30, `inline graph is unexpectedly shallow: ${nodes.length}`);
check(person?.['@type'] === 'Person', 'canonical Person is missing from inline graph');
check(Array.isArray(clinic?.['@type']) && clinic['@type'].includes('MedicalClinic'), 'canonical Clinic is missing from inline graph');
check(!person?.aggregateRating, 'Clinic aggregate rating leaked onto Person');
check(clinic?.aggregateRating?.ratingValue === 5 && clinic?.aggregateRating?.ratingCount === 163, 'Clinic rating is inconsistent in inline graph');

if (failures.length) {
  console.error(JSON.stringify({ issue: 1, status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  issue: 1,
  status: 'pass',
  inlineSchemaLocation: 'head',
  inlineGraphNodes: nodes.length,
  stableScriptId: 'homepage-entity-graph',
  externalGraph: '/knowledge-graph.jsonld',
  person: person['@id'],
  clinic: clinic['@id'],
}, null, 2));
