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
import {createHash} from 'node:crypto';
import jsonld from 'jsonld';

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
  console.log('Canonical RDF/CSV equivalence, native datatypes, language tags and uniqueness: PASS');
  const dataset = source.graph['@graph'].find(node => node['@id'] === source.canonicalOrigin + '/graph.jsonld/dataset');
  const dct = 'http://purl.org/dc/terms/';
  const prov = 'http://www.w3.org/ns/prov#';
  const schema = 'https://schema.org/';
  const metadataFailures = [];
  const check = (name, assertion) => { try { assertion(); } catch (error) { metadataFailures.push(name + ': ' + error.message); } };
  const csvMetadata = JSON.parse(await fs.readFile(path.join(distDir, 'entity-facts.csv-metadata.json'), 'utf8'));
  check('CSVW portable metadata', () => {
    assert.equal(csvMetadata.tableSchema.primaryKey, 'row_id');
    assert.equal(csvMetadata[dct + 'isPartOf']['@id'], dataset['@id']);
    assert.equal(csvMetadata[schema + 'version'], dataset.version);
    assert.equal(csvMetadata[dct + 'issued'], dataset.datePublished['@value']);
    assert.equal(csvMetadata[dct + 'modified'], dataset.dateModified['@value']);
    assert.equal(csvMetadata[dct + 'hasVersion']['@id'], dataset['dcat:hasCurrentVersion']['@id']);
    assert.match(csvMetadata.notes, new RegExp(source.edition));
    assert.deepEqual(csvMetadata[prov + 'wasDerivedFrom'], {'@id': source.canonicalOrigin + '/graph.jsonld'});
    assert.deepEqual(csvMetadata[dct + 'references'].map(ref => ref['@id']), ['/answers.txt', '/fact-map.json', '/provenance.jsonld'].map(p => source.canonicalOrigin + p));
    for (const column of csvMetadata.tableSchema.columns) {
      assert(column[dct + 'description']?.length > 30, column.name + ' has a meaningful RDF role description');
      assert.equal(column.datatype, column.name === 'predicate' ? 'anyURI' : 'string', 'CSV lexical datatype is unchanged');
    }
    assert.match(csvMetadata.tableSchema.columns.find(c => c.name === 'row_id')[dct + 'description'], /SHA-256/);
    assert.match(csvMetadata.tableSchema.columns.find(c => c.name === 'object')[dct + 'description'], /lexical/);
    assert.match(csvMetadata.tableSchema.columns.find(c => c.name === 'datatype')[dct + 'description'], /RDF/);
  });
  const dataPackage = JSON.parse(await fs.readFile(path.join(distDir, 'datapackage.json'), 'utf8'));
  check('Data Package descriptive metadata', () => {
    assert.equal(dataPackage.id, dataset['@id']);
    assert.equal(dataPackage.description, dataset.description);
    assert.equal(dataPackage.version, dataset.version);
    assert.equal(dataPackage.edition, source.edition);
    assert.equal(dataPackage.datePublished, dataset.datePublished['@value']);
    assert(!Object.hasOwn(dataPackage, 'created'), 'Dataset publication date must not become an invented package creation timestamp');
    assert.equal(dataPackage.dateModified, dataset.dateModified['@value']);
    assert.deepEqual(dataPackage.keywords, dataset.keywords);
    assert.equal(dataPackage.homepage, dataset.url);
    assert(dataPackage.contributors.some(c => c.role === 'author' && c.path === dataset.creator['@id']));
    assert(dataPackage.contributors.some(c => c.role === 'publisher' && c.path === dataset.publisher['@id']));
    assert(dataPackage.sources.some(s => s.path === source.canonicalOrigin + '/graph.jsonld'));
    assert(dataPackage.sources.some(s => s.path === source.canonicalOrigin + '/provenance.jsonld'));
    const facts = dataPackage.resources.find(r => r.path.endsWith('/entity-facts.csv'));
    assert.equal(facts.schema.primaryKey, 'row_id');
    assert.deepEqual(facts.schema.fields.map(f => f.name), csvMetadata.tableSchema.columns.map(c => c.name));
    assert(facts.schema.fields.every(f => f.description && f.type === 'string'));
  });
  const croissant = JSON.parse(await fs.readFile(path.join(distDir, 'croissant.json'), 'utf8'));
  check('Croissant dataset attribution and structure', () => {
    assert.equal(croissant['@id'], dataset['@id']);
    assert.deepEqual(croissant.creator, dataset.creator);
    assert.deepEqual(croissant.publisher, dataset.publisher);
    assert.equal(croissant.license, dataset.license);
    assert.equal(croissant.version, dataset.version);
    assert.equal(croissant.datePublished, dataset.datePublished['@value']);
    assert.equal(croissant.dateModified, dataset.dateModified['@value']);
    assert.equal(croissant['dct:hasVersion']['@id'], dataset['dcat:hasCurrentVersion']['@id']);
    assert.deepEqual(croissant['prov:wasDerivedFrom'], {'@id': source.canonicalOrigin + '/graph.jsonld'});
    assert(croissant['dct:references'].some(r => r['@id'].endsWith('/fact-map.json')));
    assert(croissant.recordSet[0].field.every(field => field.description));
  });
  const expandedCroissant = await jsonld.expand(croissant, {base: source.canonicalOrigin + '/croissant.json', documentLoader: () => { throw new Error('Croissant context must stay local'); }});
  check('Croissant local JSON-LD semantics', () => {
    assert.equal(expandedCroissant[0][schema + 'creator'][0]['@id'], dataset.creator['@id']);
    assert.equal(expandedCroissant[0][prov + 'wasDerivedFrom'][0]['@id'], source.canonicalOrigin + '/graph.jsonld');
    assert.equal(expandedCroissant[0][dct + 'references'].length, 3);
  });
  for (const file of croissant.distribution) {
    const bytes = await fs.readFile(path.join(distDir, new URL(file.contentUrl).pathname.slice(1)));
    assert.equal(file.sha256, createHash('sha256').update(bytes).digest('hex'), 'Croissant digest describes current bytes');
    assert.equal(file.contentSize, bytes.byteLength + ' B', 'Croissant size describes current bytes');
  }
  for (const resource of dataPackage.resources.filter(r => !r.path.endsWith('/datapackage.json') && !r.path.endsWith('/croissant.json'))) {
    const bytes = await fs.readFile(path.join(distDir, new URL(resource.path).pathname.slice(1)));
    assert.equal(resource.hash, 'sha256:' + createHash('sha256').update(bytes).digest('hex'), 'Data Package digest describes current bytes');
    assert.equal(resource.bytes, bytes.byteLength, 'Data Package size describes current bytes');
  }
  assert(!dataPackage.resources.filter(r => /\/(datapackage|croissant)\.json$/.test(r.path)).some(r => r.hash || r.bytes), 'Cyclic catalog checksums are omitted');
  for (const catalogPath of ['dcat.ttl', 'void.ttl']) {
    const quads = new Parser({format: 'text/turtle'}).parse(await fs.readFile(path.join(distDir, catalogPath), 'utf8'));
    const has = (subject, predicate, object) => quads.some(q => q.subject.termType === 'NamedNode' && q.subject.value === subject && q.predicate.value === predicate && q.object.value === object);
    check(catalogPath + ' named dataset, release and provenance', () => {
      assert(has(dataset['@id'], 'http://www.w3.org/ns/dcat#version', dataset.version));
      assert(has(dataset['@id'], 'http://www.w3.org/ns/dcat#hasCurrentVersion', dataset['dcat:hasCurrentVersion']['@id']));
      assert(has(dataset['@id'], prov + 'wasDerivedFrom', source.canonicalOrigin + '/graph.jsonld'));
      assert(has(dataset['@id'], dct + 'provenance', source.canonicalOrigin + '/provenance.jsonld'));
      assert(has(dataset['@id'], dct + 'references', source.canonicalOrigin + '/fact-map.json'));
      assert(has(dataset['@id'], dct + 'modified', dataset.dateModified['@value']));
      for (const resource of source.machineResources.filter(r => r.distributionIri)) {
        assert(has(dataset['@id'], 'http://www.w3.org/ns/dcat#distribution', resource.distributionIri));
        assert(has(resource.distributionIri, prov + 'wasDerivedFrom', dataset['@id']));
        assert(has(resource.distributionIri, 'http://www.w3.org/ns/dcat#version', dataset.version));
      }
    });
  }
  assert.equal(metadataFailures.length, 0, metadataFailures.join('\n'));
  const before=new Map(await Promise.all(result.paths.map(async resourcePath=>[resourcePath,await fs.readFile(path.join(distDir,resourcePath.slice(1)),'utf8')])));
  await materializeMachineResources({source,authoredBody,distDir});
  for(const [resourcePath,bytes] of before)assert.equal(await fs.readFile(path.join(distDir,resourcePath.slice(1)),'utf8'),bytes,'Repeated materialization is deterministic '+resourcePath);
  console.log(JSON.stringify({ machineResources: 'PASS', declared: source.machineResources.length, materialized: result.paths.length, graphNodes: graph['@graph'].length }, null, 2));
} finally {
  await fs.rm(distDir, { recursive: true, force: true });
}
