import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'parse5';
import {serializeCanonicalGraph,serializeGoogleCompatibleCanonicalGraph} from '../src/lib/jsonld.mjs';

const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const exported=JSON.parse(readFileSync(new URL('../dist/graph.jsonld',import.meta.url),'utf8'));
const transformed=JSON.parse(serializeGoogleCompatibleCanonicalGraph(exported));
const byteSize=text=>Buffer.byteLength(text,'utf8');
const attr=(node,key)=>node?.attrs?.find(x=>x.name===key)?.value;
const nodes=[];
function collect(node){nodes.push(node);for(const child of node.childNodes??[])collect(child);}
collect(parse(html));
const scripts=nodes.filter(n=>n.tagName==='script');
const full=scripts.filter(n=>attr(n,'id')==='canonical-entity-graph');
const contents=node=>(node.childNodes??[]).map(n=>n.value??'').join('');
const ldScripts=scripts.filter(n=>attr(n,'type')==='application/ld+json');
const firstOpen=html.indexOf('<script id="canonical-entity-graph" type="application/ld+json">');
const fullEnd=html.indexOf('</script>',firstOpen)+'</script>'.length;

test('homepage embeds the entire canonical RDF JSON-LD as the first standard schema script, inside HEAD',()=>{
  assert.equal(full.length,1,'exactly one complete canonical graph script');
  assert.equal(attr(full[0],'type'),'application/ld+json');
  assert.equal(full[0].parentNode?.tagName,'head');
  assert.deepEqual(ldScripts,[full[0]],'homepage contains exactly one JSON-LD script');
  const graph=JSON.parse(contents(full[0]));
  assert.ok(graph['@context']&&Array.isArray(graph['@graph']));
  assert.ok(graph['@graph'].length>=1900,'no missing canonical nodes');
  assert.deepEqual(graph,transformed,'every canonical entity must appear in the deterministic, semantics-preserving full JSON-LD serialization');
  assert.equal(graph['@graph'].length,exported['@graph'].length);
  for(const prop of ['image','url','sameAs','contentUrl','serviceUrl','dayOfWeek','additionalType','codeRepository','target','hasMap','license','measuredProperty','procedureType','thumbnailUrl','acquireLicensePage','eventAttendanceMode','isBasedOn','inDefinedTermSet'])assert.ok(!(prop in graph['@context']),'No problematic term-level @id coercions: '+prop);
  assert.ok(fullEnd>firstOpen);
  assert.ok(html.toLowerCase().indexOf('<meta charset=')>=0);
  assert.ok(html.toLowerCase().indexOf('<meta charset=')<firstOpen,'first UTF-8 declaration before the large graph');
  assert.ok(html.indexOf('rel="stylesheet"')<firstOpen,'critical stylesheet can load before the large graph');
  assert.ok(firstOpen<html.indexOf('<title>'),'full graph before document title and text');
  assert.ok(fullEnd<html.indexOf('</head>'),'complete graph ends within HEAD');
  assert.ok(fullEnd<html.indexOf('<body'),'full graph precedes all visible text');
  assert.ok(!/<script id="canonical-entity-graph" type="application\/json">/.test(html));
  for(const name of ['schema-core-mainentity','schema-physician-clinical-authority'])
    assert.equal(scripts.filter(node=>attr(node,'id')===name).length,0,
      'homepage must not publish duplicate or partial JSON-LD projections');
});
test('the complete JSON-LD is fully received before the strict 2,000,000 byte Googlebot budget',()=>{
  const first2MB=2_000_000;
  const endByte=byteSize(html.slice(0,fullEnd));
  assert.ok(endByte<first2MB,'entire active RDF graph must finish within the 2MB Googlebot budget; actual end '+endByte);
  assert.ok(byteSize(contents(full[0]))>1_000_000,'complete graph, not a tiny projection');
});
test('progressive reader can restore the canonical graph as a single standard HEAD script',()=>{
  const readerMarker=html.match(/<meta name="guide-reader-resource" content="([^"]+)"/);
  assert.ok(readerMarker,'existing progressive reader pointer remains');
  const reader=JSON.parse(readFileSync(new URL('../dist'+readerMarker[1],import.meta.url),'utf8'));
  assert.ok(reader.metadataPath);
  const metadata=JSON.parse(readFileSync(new URL('../dist'+reader.metadataPath,import.meta.url),'utf8'));
  assert.equal(metadata.canonicalGraph.id,'canonical-entity-graph');
  assert.deepEqual(JSON.parse(metadata.canonicalGraph.text),transformed);
  assert.equal(metadata.scripts.filter(x=>x.id==='canonical-entity-graph').length,0);
  assert.deepEqual(metadata.scripts,[],'home route metadata must not restore duplicate schema projections');
  const jsRef=html.match(/<script id="site-runtime" defer src="([^"]+)"/);
  assert.ok(jsRef);
  const js=readFileSync(new URL('../dist'+jsRef[1],import.meta.url),'utf8');
  assert.match(js,/script\.type = "application\/ld\+json";\s*script\.id = "canonical-entity-graph"/);
  assert.match(js,/if \(state\.canonicalGraphScript\) d\.head\.append/);
  assert.doesNotMatch(js,/if \(state\.canonicalGraphScript\) d\.body\.append/);
});

test('homepage AVIF LCP preload exactly matches its authored responsive portrait and never leaks to focused pages',()=>{
  const preloads=nodes.filter(n=>n.tagName==='link'&&attr(n,'rel')==='preload'&&attr(n,'as')==='image');
  assert.equal(preloads.length,1,'only the first-screen physician portrait should be preloaded');
  const preload=preloads[0];
  assert.equal(preload.parentNode?.tagName,'head');
  assert.equal(attr(preload,'type'),'image/avif');
  assert.equal(attr(preload,'fetchpriority'),'high');
  assert.equal(attr(preload,'href'),undefined,'do not force a fallback WebP fetch for unsupported AVIF browsers');
  const portrait=nodes.find(n=>n.tagName==='picture'&&attr(n,'id')==='image-saeed-ghezelbash-portrait-master-webp');
  assert.ok(portrait,'original authored portrait preserved');
  const source=portrait.childNodes.find(n=>n.tagName==='source'&&attr(n,'type')==='image/avif');
  const img=portrait.childNodes.find(n=>n.tagName==='img');
  assert.ok(source&&img,'original AVIF picture and fallback must remain');
  assert.equal(attr(preload,'imagesrcset'),attr(source,'srcset'),'no duplicated or divergent image inventory');
  assert.equal(attr(preload,'imagesizes'),attr(source,'sizes'),'responsive variant choice must agree');
  assert.equal(attr(img,'loading'),'eager');
  assert.equal(attr(img,'fetchpriority'),'high');
  const hrefs=String(attr(preload,'imagesrcset')).split(',').map(s=>s.trim().split(/\s+/u)[0]);
  for(const href of hrefs)assert.match(href,/^\/media\/images\/physician\/saeed-ghezelbash-portrait-\d+\.avif$/);
  const linkStart=html.indexOf('<link rel="preload" as="image"');
  assert.ok(linkStart>0 && linkStart<firstOpen,'browser must discover LCP image ahead of large RDF script');
  assert.ok(linkStart>html.indexOf('rel="stylesheet"'),'retain critical CSS before the image hint');
  const focused=readFileSync(new URL('../dist/filler.html',import.meta.url),'utf8');
  assert.doesNotMatch(focused,/<link\b[^>]*rel="preload"[^>]*as="image"/u,
    'focused pages must not fetch a homepage portrait they do not render');
});
