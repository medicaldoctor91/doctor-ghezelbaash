import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSourceObject } from './finalize-dist.mjs';
import { extractAuthoredBody, materializeMachineResources } from './materialize-machine-resources.mjs';
import { serializeGraphAsNTriples } from '../src/lib/machine-output.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFile = path.join(root, 'src/pages/index.astro');
const sourceText = await fs.readFile(sourceFile, 'utf8');
const source = await extractSourceObject(sourceFile);
const authoredBody = extractAuthoredBody(sourceText);
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
assert.match(packageJson.scripts.build, /materialize-machine-resources\.mjs/, 'Build must materialize declared machine resources after Astro');
assert.equal(packageJson.scripts['test:machine'], 'node infrastructure/test-machine-resources.mjs', 'Machine resource contract must have a direct test script');
assert.match(packageJson.scripts['test:v2'], /npm run test:machine/, 'V2 suite must include machine resource verification');
const distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghezelbaash-machine-'));
try {
  await fs.writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>fixture</title>');
  await fs.writeFile(path.join(distDir, 'sitemap.xml'), '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  await fs.writeFile(path.join(distDir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  await fs.copyFile(path.join(root, 'public/site.webmanifest'), path.join(distDir, 'site.webmanifest'));
  const result = await materializeMachineResources({ source, authoredBody, distDir });
  assert.equal(result.paths.length, 20, 'Exactly 20 non-Astro machine artifacts must be materialized');
  for (const resource of source.machineResources) {
    const file = path.join(distDir, resource.path.replace(/^\//, ''));
    const stat = await fs.stat(file);
    assert(stat.isFile() && stat.size > 0, `Declared machine resource missing or empty: ${resource.path}`);
  }

  const graphRaw = await fs.readFile(path.join(distDir, 'graph.jsonld'), 'utf8');
  assert.equal(graphRaw, JSON.stringify(source.graph) + '\n', 'Canonical graph JSON-LD must use compact deterministic serialization');
  const graph = JSON.parse(graphRaw);
  assert.equal(graph['@graph'].length, source.graph['@graph'].length);
  assert.equal(graph['@graph'].length, 1592);
  assert.equal(graph['@graph'].find((node) => node['@id'] === source.canonicalOrigin + '/#saeed-ghezelbash')?.url, source.canonicalOrigin + '/');

  const expectedNTriples = serializeGraphAsNTriples(source.graph);
  assert.equal(await fs.readFile(path.join(distDir, 'graph.ttl'), 'utf8'), expectedNTriples, 'Turtle serialization must deterministically cover the canonical JSON-LD graph');
  assert.match(expectedNTriples, /<https:\/\/www\.ghezelbaash\.ir\/#saeed-ghezelbash> <http:\/\/www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#type> <https:\/\/schema\.org\/Person>/);
  assert.match(expectedNTriples, /<https:\/\/www\.ghezelbaash\.ir\/action-contact-clinic> <https:\/\/schema\.org\/target> <tel:\+989308209494>/, 'Absolute non-HTTP IRIs must remain absolute');
  assert.doesNotMatch(expectedNTriples, /<https:\/\/schema\.org\/tel:\+989308209494>/, 'Absolute IRI values must not be expanded through @vocab');
  assert.match(await fs.readFile(path.join(distDir, 'shapes.ttl'), 'utf8'), /@prefix sh:/);

  const csv = await fs.readFile(path.join(distDir, 'entity-facts.csv'), 'utf8');
  assert.match(csv.split('\n', 1)[0], /row_id,subject,predicate,object,object_kind,datatype,language/);
  assert(csv.split('\n').length > 1500, 'Entity facts CSV must be a substantive graph projection');
  assert.match(await fs.readFile(path.join(distDir, 'answers.txt'), 'utf8'), /Question ID:/);
  assert.match(await fs.readFile(path.join(distDir, 'answers.txt'), 'utf8'), /Answer:/);
  assert.match(await fs.readFile(path.join(distDir, 'knowledge.xml'), 'utf8'), /<knowledge[ >]/);
  assert.match(await fs.readFile(path.join(distDir, 'index.md'), 'utf8'), /^# /m);
  assert((await fs.readFile(path.join(distDir, 'llms-full.txt'), 'utf8')).length > 100000, 'Full-text projection is unexpectedly small');
  assert.match(await fs.readFile(path.join(distDir, 'doctor.vcf'), 'utf8'), /BEGIN:VCARD[\s\S]*UID:https:\/\/www\.ghezelbaash\.ir\/#saeed-ghezelbash/);
  assert.match(await fs.readFile(path.join(distDir, 'clinic.vcf'), 'utf8'), /BEGIN:VCARD/);
  assert(Array.isArray(JSON.parse(await fs.readFile(path.join(distDir, 'linkset.json'), 'utf8')).linkset));
  assert.equal(JSON.parse(await fs.readFile(path.join(distDir, 'croissant.json'), 'utf8'))['@context'], 'https://mlcommons.org/croissant/1.1');
  console.log(JSON.stringify({ machineResources: 'PASS', declared: source.machineResources.length, materialized: result.paths.length, graphNodes: graph['@graph'].length }, null, 2));
} finally {
  await fs.rm(distDir, { recursive: true, force: true });
}
