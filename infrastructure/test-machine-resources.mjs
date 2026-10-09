import {AUTHORED_BODY as canonicalBody} from '../src/canonical/source.mjs';
import {SOURCE as canonicalSource} from '../src/canonical/source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { materializeMachineResources } from './materialize-machine-resources.mjs';
import { serializeGraphAsNTriples,buildCsvMetadata,serializeEntityFactsCsv } from '../src/lib/machine-output.mjs';
import {semanticFingerprint,rdfFingerprint,csvFingerprint} from './lib/rdf.mjs';
import {Parser} from 'n3';

const fixture={'@context':{'@vocab':'https://schema.org/'},'@graph':[
 {'@id':'https://example.com/entity',name:['duplicate','duplicate','unique']},
 {'@id':'https://example.com/entity',name:'duplicate'},
]};
const fixtureRows=serializeEntityFactsCsv(fixture).trim().split('\n').slice(1);
const typedFixture={'@context':{'@vocab':'https://schema.org/'},'@graph':[
 {'@id':'https://example.com/entity',value:[1,'1',-2,3.14,true,false,{'@value':2.5},{'@value':'bonjour','@language':'fr'},{'@value':'12','@type':'http://www.w3.org/2001/XMLSchema#integer'}],name:'Comma, quote " and\nnewline'},
]};
assert.equal(await csvFingerprint(serializeEntityFactsCsv(typedFixture)),await semanticFingerprint(typedFixture),'CSV reconstruction preserves native and explicit RDF datatypes, language and quoted strings');
const numericEdges={'@context':{'@vocab':'https://schema.org/'},'@graph':[{'@id':'https://example.com/entity',largeValue:1e21,zeroValue:-0,smallValue:1e-7,decimalValue:{'@value':2.5,'@type':'http://www.w3.org/2001/XMLSchema#decimal'},doubleValue:{'@value':'2.5','@type':'http://www.w3.org/2001/XMLSchema#double'}}]};
assert.equal(await csvFingerprint(serializeEntityFactsCsv(numericEdges)),await semanticFingerprint(numericEdges),'Numeric CSV lexical values agree with the installed JSON-LD processor');
const fixtureTurtle=serializeGraphAsNTriples(fixture).trim().split('\n');
assert.equal(fixtureTurtle.length,2,'Turtle emits each unique RDF statement once');
assert.equal(fixtureRows.length,2,'CSV materializer emits one row per unique fact');
assert.equal(new Set(fixtureRows).size,fixtureRows.length,'No duplicate complete CSV rows');
assert.equal(new Set(fixtureRows.map(row=>row.split(',')[0])).size,fixtureRows.length,'No duplicate CSV row_id');
const contract=await import('./lib/delivery-contract.mjs');
assert.equal(typeof contract.assertCanonicalFactCsv,'function','Final artifact verifies CSV uniqueness and canonical fact coverage');
assert.equal(contract.assertCanonicalFactCsv(serializeEntityFactsCsv(fixture),fixture),2);
assert.throws(()=>contract.assertCanonicalFactCsv(serializeEntityFactsCsv(fixture)+fixtureRows[0]+'\n',fixture),/Duplicate CSV/);
assert.throws(()=>contract.assertCanonicalFactCsv('row_id,subject,predicate,object,object_kind,datatype,language\n',fixture),/canonical facts/);
const quotedFixture={'@context':{'@vocab':'https://schema.org/'},'@graph':[{'@id':'https://example.com/entity',name:'Comma, quote " and\nnewline'}]};
assert.equal(contract.assertCanonicalFactCsv(serializeEntityFactsCsv(quotedFixture),quotedFixture),1,'Quoted CSV fields and newlines parse correctly');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = canonicalSource;
const authoredBody = canonicalBody;
const assertCanonicalRows=csv=>contract.assertCanonicalFactCsv(csv,source.graph);
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
assert.match(packageJson.scripts.build, /materialize-machine-resources\.mjs/, 'Build must materialize declared machine resources after Astro');
assert.match(packageJson.scripts['test:machine'], /node infrastructure\/test-machine-resources\.mjs/, 'Machine resource contract must have a direct test script');
assert.match(packageJson.scripts['test:v2'], /npm run test:machine/, 'V2 suite must include machine resource verification');
const distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghezelbaash-machine-'));
try {
  await fs.writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>fixture</title>');
  await fs.writeFile(path.join(distDir, 'sitemap.xml'), '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  await fs.writeFile(path.join(distDir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  await fs.copyFile(path.join(root, 'public/site.webmanifest'), path.join(distDir, 'site.webmanifest'));
  const result = await materializeMachineResources({ source, authoredBody, distDir });
  const evidenceSnapshot = JSON.parse(await fs.readFile(path.join(distDir, 'evidence-snapshot.json'), 'utf8'));
  assert.equal(evidenceSnapshot.observedAt, null, 'Materialized evidence cannot label a release date as an observation');
  assert.equal(evidenceSnapshot.edition, source.edition, 'Materialized evidence exposes the authored release edition');

  for (const resource of source.machineResources) {
    const file = path.join(distDir, resource.path.replace(/^\//, ''));
    const stat = await fs.stat(file);
    assert(stat.isFile() && stat.size > 0, `Declared machine resource missing or empty: ${resource.path}`);
  }

  const graphRaw = await fs.readFile(path.join(distDir, 'graph.jsonld'), 'utf8');
  assert.equal(graphRaw, JSON.stringify(source.graph) + '\n', 'Canonical graph JSON-LD must use compact deterministic serialization');
  const graph = JSON.parse(graphRaw);
  assert.equal(graph['@graph'].length, source.graph['@graph'].length);
  assert.equal(graph['@graph'].find((node) => node['@id'] === source.canonicalOrigin + '/#saeed-ghezelbash')?.url, source.canonicalOrigin + '/');

  const expectedNTriples = serializeGraphAsNTriples(source.graph);
  assert.equal(await fs.readFile(path.join(distDir, 'graph.ttl'), 'utf8'), expectedNTriples, 'Turtle serialization must deterministically cover the canonical JSON-LD graph');
  assert.match(expectedNTriples, /<https:\/\/www\.ghezelbaash\.ir\/#saeed-ghezelbash> <http:\/\/www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#type> <https:\/\/schema\.org\/Person>/);
  assert.match(expectedNTriples, /<https:\/\/www\.ghezelbaash\.ir\/action-contact-clinic> <https:\/\/schema\.org\/target> <tel:\+989308209494>/, 'Absolute non-HTTP IRIs must remain absolute');
  assert.doesNotMatch(expectedNTriples, /<https:\/\/schema\.org\/tel:\+989308209494>/, 'Absolute IRI values must not be expanded through @vocab');
  assert.match(await fs.readFile(path.join(distDir, 'shapes.ttl'), 'utf8'), /@prefix sh:/);

  const csv = await fs.readFile(path.join(distDir, 'entity-facts.csv'), 'utf8');
  assert.equal(await csvFingerprint(csv),await semanticFingerprint(source.graph),'Full CSV reconstruction equals canonical RDF graph');
  const statements=expectedNTriples.trim().split('\n');
  assert.equal(statements.length,new Set(statements).size,'No duplicate Turtle statements');
  assert.equal(await rdfFingerprint(expectedNTriples),await semanticFingerprint(source.graph),'Dedupe preserves full RDF semantics');
  const uniqueCount=new Set(new Parser().parse(expectedNTriples).map(q=>JSON.stringify(q))).size;
  assert.match(await fs.readFile(path.join(distDir,'void.ttl'),'utf8'),new RegExp('void:triples '+uniqueCount+'\\b'),'VoID counts unique RDF triples');
  assert.deepEqual(csv.split('\n',1)[0].split(','),buildCsvMetadata(source).tableSchema.columns.map(c=>c.name),'CSVW columns match the real export header');
  assertCanonicalRows(csv);
  assert.match(csv.split('\n', 1)[0], /row_id,subject,predicate,object,object_kind,datatype,language/);
  assert.match(await fs.readFile(path.join(distDir, 'answers.txt'), 'utf8'), /Question ID:/);
  assert.match(await fs.readFile(path.join(distDir, 'answers.txt'), 'utf8'), /Answer:/);
  assert.match(await fs.readFile(path.join(distDir, 'knowledge.xml'), 'utf8'), /<knowledge[ >]/);
  assert.match(await fs.readFile(path.join(distDir, 'index.md'), 'utf8'), /^# /m);
  assert.match(await fs.readFile(path.join(distDir, 'doctor.vcf'), 'utf8'), /BEGIN:VCARD[\s\S]*UID:https:\/\/www\.ghezelbaash\.ir\/#saeed-ghezelbash/);
  assert.match(await fs.readFile(path.join(distDir, 'clinic.vcf'), 'utf8'), /BEGIN:VCARD/);
  assert(Array.isArray(JSON.parse(await fs.readFile(path.join(distDir, 'linkset.json'), 'utf8')).linkset));
  assert.equal(JSON.parse(await fs.readFile(path.join(distDir, 'croissant.json'), 'utf8')).conformsTo, 'http://mlcommons.org/croissant/1.1');
  const before=new Map(await Promise.all(result.paths.map(async resourcePath=>[resourcePath,await fs.readFile(path.join(distDir,resourcePath.slice(1)),'utf8')])));
  await materializeMachineResources({source,authoredBody,distDir});
  for(const [resourcePath,bytes] of before)assert.equal(await fs.readFile(path.join(distDir,resourcePath.slice(1)),'utf8'),bytes,'Repeated materialization is deterministic '+resourcePath);
  console.log(JSON.stringify({ machineResources: 'PASS', declared: source.machineResources.length, materialized: result.paths.length, graphNodes: graph['@graph'].length }, null, 2));
} finally {
  await fs.rm(distDir, { recursive: true, force: true });
}
