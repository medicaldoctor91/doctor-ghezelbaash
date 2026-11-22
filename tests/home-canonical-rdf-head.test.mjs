import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'parse5';

const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const canonical=JSON.parse(readFileSync(new URL('../dist/graph.jsonld',import.meta.url),'utf8'));
const byteSize=text=>Buffer.byteLength(text,'utf8');
const attr=(node,key)=>node?.attrs?.find(x=>x.name===key)?.value;
const nodes=[];
function collect(node){nodes.push(node);for(const child of node.childNodes??[])collect(child);}
collect(parse(html));
const scripts=nodes.filter(n=>n.tagName==='script');
const scriptText=node=>(node.childNodes??[]).map(n=>n.value??'').join('');
const full=scripts.filter(n=>attr(n,'id')==='canonical-entity-graph');
const ldScripts=scripts.filter(n=>attr(n,'type')==='application/ld+json');

test('canonical RDF graph remains fully embedded and exactly matches published graph.jsonld',()=>{
  assert.equal(full.length,1);
  assert.equal(attr(full[0],'type'),'application/json','RDF is available without an advanced JSON-LD context in Google's homepage Rich Results markup');
  assert.equal(full[0].parentNode?.tagName,'body');
  assert.deepEqual(JSON.parse(scriptText(full[0])),canonical,'no entity, property or RDF triple can be silently dropped');
  assert.ok(canonical['@graph'].length>=1900);
  assert.equal(canonical['@graph'].filter(n=>n['@type']==='Service'||Array.isArray(n['@type'])&&n['@type'].includes('Service')).length,124);
});

test('homepage exposes one strict Google-compatible ProfilePage JSON-LD in HEAD',()=>{
  assert.equal(ldScripts.length,1,'no competing or unparsable Rich Results script');
  const schema=ldScripts[0];
  assert.equal(attr(schema,'id'),'schema-core-mainentity');
  assert.equal(schema.parentNode?.tagName,'head');
  const structured=JSON.parse(scriptText(schema));
  assert.equal(structured['@context'],'https://schema.org');
  const graph=structured['@graph'];
  assert.ok(Array.isArray(graph));
  const physicianId='https://www.ghezelbaash.ir/#saeed-ghezelbash';
  const profile=graph.find(n=>n['@id']==='https://www.ghezelbaash.ir/webpage');
  const person=graph.find(n=>n['@id']===physicianId);
  assert.ok(profile && person,'physician and home ProfilePage retained');
  assert.ok([profile['@type']].flat().includes('ProfilePage'));
  assert.equal(profile.mainEntity?.['@id'],physicianId);
  assert.ok([person['@type']].flat().includes('Person'));
  assert.ok(!Object.values(structured).some(x=>typeof x==='object'&&!Array.isArray(x)&&x?.['@type']==='@id'));
});

test('Googlebot can see homepage H1 and bounded schema well before 2MB',()=>{
  const limit=2_000_000;
  const firstH1=html.search(/<h1\b/i);
  const firstMain=html.search(/<main\b/i);
  const searchEnd=html.indexOf('</script>',html.indexOf('<script id="schema-core-mainentity"'))+9;
  assert.ok(firstMain>=0&&firstH1>=0&&searchEnd>9);
  assert.ok(byteSize(html.slice(0,firstH1))<limit-100_000);
  assert.ok(byteSize(html.slice(0,firstMain))<limit-100_000);
  assert.ok(byteSize(html.slice(0,searchEnd))<limit-100_000);
  assert.ok(html.indexOf('<script id="canonical-entity-graph"')>firstH1,
    'full canonical graph must follow visible main content rather than hide it beyond 2 MB');
});

test('progressive reader restores the same bounded Search schema plus full, non-LD-JSON graph',()=>{
  const readerMarker=html.match(/<meta name="guide-reader-resource" content="([^"]+)"/);
  assert.ok(readerMarker);
  const reader=JSON.parse(readFileSync(new URL('../dist'+readerMarker[1],import.meta.url),'utf8'));
  const metadata=JSON.parse(readFileSync(new URL('../dist'+reader.metadataPath,import.meta.url),'utf8'));
  assert.deepEqual(JSON.parse(metadata.canonicalGraph.text),canonical);
  assert.equal(metadata.scripts.length,1);
  assert.equal(metadata.scripts[0].id,'schema-core-mainentity');
  const schema=JSON.parse(metadata.scripts[0].text);
  assert.equal(schema['@context'],'https://schema.org');
  const jsRef=html.match(/<script id="site-runtime" defer src="([^"]+)"/);
  assert.ok(jsRef);
  const js=readFileSync(new URL('../dist'+jsRef[1],import.meta.url),'utf8');
  assert.match(js,/script\.type = "application\/json";\s*script\.id = "canonical-entity-graph"/);
  assert.match(js,/if \(state\.canonicalGraphScript\) d\.body\.append/);
});
