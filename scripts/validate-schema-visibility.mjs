import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'dist');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const externalRaw = readFileSync(join(root, 'knowledge-graph.jsonld'), 'utf8');
const headers = readFileSync(join(root, '_headers'), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const head = html.match(/<head>([\s\S]*?)<\/head>/iu)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/iu)?.[1] ?? '';
const scriptMatch = head.match(/<script\b[^>]*id="homepage-entity-graph"[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/iu);
const scriptPosition = head.indexOf('id="homepage-entity-graph"');
const describedByPosition = head.indexOf('rel="describedby"');
const alternatePosition = head.indexOf('rel="alternate"');

check(Boolean(head), 'document head is missing');
check(Boolean(scriptMatch), 'canonical inline JSON-LD is not present in head');
check(!/<script\b[^>]*id="homepage-entity-graph"/iu.test(body), 'canonical inline JSON-LD leaked back into body');
check(scriptPosition >= 0 && scriptPosition < 4000, 'inline JSON-LD is too deep in head');
check(describedByPosition >= 0 && describedByPosition < scriptPosition, 'describedby discovery link must precede the complete inline graph');
check(alternatePosition >= 0 && alternatePosition < scriptPosition, 'alternate JSON-LD discovery link must precede the complete inline graph');
check(head.includes('data-schema-completeness="full"'), 'full-schema marker is missing');

let inlineGraph = null;
try { inlineGraph = scriptMatch ? JSON.parse(scriptMatch[1]) : null; } catch (error) { failures.push(`inline JSON-LD parse failed: ${error.message}`); }
let externalGraph = null;
try { externalGraph = JSON.parse(externalRaw); } catch (error) { failures.push(`external JSON-LD parse failed: ${error.message}`); }

const inlineNodes = inlineGraph?.['@graph'] ?? [];
const externalNodes = externalGraph?.['@graph'] ?? [];
const inlineBytes = Buffer.byteLength(scriptMatch?.[1] ?? '');
const externalBytes = Buffer.byteLength(externalRaw);
const personId = 'https://www.ghezelbaash.ir/#mohammad-saeed-ghezelbash';
const clinicId = 'https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic';
const inlinePerson = inlineNodes.find((node) => node?.['@id'] === personId);
const inlineClinic = inlineNodes.find((node) => node?.['@id'] === clinicId);
const externalIds = new Set(externalNodes.map((node) => node?.['@id']).filter(Boolean));

check(Array.isArray(inlineNodes) && inlineNodes.length >= 120, `full inline graph was reduced: ${inlineNodes.length} nodes`);
check(inlineBytes >= 100_000, `full inline graph was reduced: ${inlineBytes} bytes`);
check(Array.isArray(externalNodes) && externalNodes.length >= 600, `full external graph was reduced: ${externalNodes.length} nodes`);
check(externalBytes >= 750_000, `full external graph was reduced: ${externalBytes} bytes`);
check(inlinePerson?.['@type'] === 'Person', 'canonical Person is missing from inline graph');
check(Array.isArray(inlineClinic?.['@type']) && inlineClinic['@type'].includes('MedicalClinic'), 'canonical Clinic is missing from inline graph');
check(!inlinePerson?.aggregateRating, 'Clinic aggregate rating leaked onto Person');
check(inlineClinic?.aggregateRating?.ratingValue === 5 && inlineClinic?.aggregateRating?.ratingCount === 163, 'Clinic rating is inconsistent in inline graph');
check(inlineNodes.every((node) => !node?.['@id'] || externalIds.has(node['@id'])), 'external graph is not a superset of the complete inline graph');

const graphHeader = headers.match(/\/knowledge-graph\.jsonld\n([\s\S]*?)(?=\n\/|$)/u)?.[1] ?? '';
check(graphHeader.includes('Content-Type: application/ld+json; charset=utf-8'), 'external graph Content-Type contract is missing');
check(!/X-Robots-Tag:\s*noindex/iu.test(graphHeader), 'external graph remains blocked by X-Robots-Tag noindex');
check(graphHeader.includes('Cache-Control: public, max-age=0, must-revalidate'), 'external graph freshness contract is missing');
check(graphHeader.includes('Content-Disposition: inline; filename="knowledge-graph.jsonld"'), 'external graph inline disposition is missing');

if (failures.length) {
  console.error(JSON.stringify({ issue: 1, status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  issue: 1,
  status: 'pass',
  schemaPreserved: true,
  inlineSchemaLocation: 'head',
  discoveryBeforeSchema: true,
  inlineGraphNodes: inlineNodes.length,
  inlineGraphBytes: inlineBytes,
  externalGraphNodes: externalNodes.length,
  externalGraphBytes: externalBytes,
  externalGraphIndexable: true,
  externalGraphFreshness: 'must-revalidate',
  person: inlinePerson['@id'],
  clinic: inlineClinic['@id'],
}, null, 2));
