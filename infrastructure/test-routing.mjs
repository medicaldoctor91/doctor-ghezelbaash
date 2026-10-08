import {SOURCE as canonicalSource} from '../src/canonical/source.mjs';
import assert from 'node:assert/strict';
import { deriveRoutingRows, renderRedirects, renderRobotsTxt } from '../src/lib/delivery-output.mjs';



const routingSource={
  canonicalOrigin:'https://www.ghezelbaash.ir',
  routes:{resources:[{path:'/'},{path:'/botox'}]},
  delivery:{routing:{graphIdentityRepresentations:{namedRootSubjects:['/graph.jsonld/dataset'],graphSubjectPrefixes:['/entity/'],representation:'/graph.jsonld',provenanceRepresentation:'/provenance.jsonld'}}}
};
const routingGraph={'@graph':[
  {'@id':'https://www.ghezelbaash.ir/graph.jsonld/dataset','@type':'Dataset'},
  {'@id':'https://www.ghezelbaash.ir/entity/example','@type':'Thing'},
]};
assert.deepEqual(deriveRoutingRows(routingSource,routingGraph),[
  {source:'/index',target:'/',statusCode:301},
  {source:'/index/',target:'/',statusCode:301},
  {source:'/graph.jsonld/dataset',target:'/graph.jsonld',statusCode:200},
  {source:'/entity/example',target:'/graph.jsonld',statusCode:200},
]);


const rows=[
  {source:'/botox/',target:'/botox',statusCode:301},
  {source:'/graph.jsonld/entity',target:'/graph.jsonld',statusCode:200},
];
assert.equal(renderRedirects(rows),'/botox/ /botox 301\n/graph.jsonld/entity /graph.jsonld 200\n');
assert.throws(()=>renderRedirects([{source:'/x',target:'https://example.com',statusCode:200}]),/relative site path/);
assert.throws(()=>renderRedirects(Array.from({length:2001},(_,i)=>({source:`/s-${i}`,target:'/x',statusCode:301}))),/static redirect limit/);
assert.throws(()=>renderRedirects(Array.from({length:101},(_,i)=>({source:`/d-${i}/*`,target:'/x',statusCode:301}))),/dynamic redirect limit/);
assert.throws(()=>renderRedirects([{source:'/'+ 'a'.repeat(1001),target:'/x',statusCode:301}]),/rule length/);
const robots=renderRobotsTxt({origin:'https://www.ghezelbaash.ir',robots:{userAgents:['*'],allow:['/'],disallow:['/cdn-cgi/'],sitemapPath:'/sitemap.xml'},contentSignal:'search=yes, ai-input=yes, ai-train=yes, use=full'});
assert.equal(robots,'User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=yes, use=full\nAllow: /\nDisallow: /cdn-cgi/\nSitemap: https://www.ghezelbaash.ir/sitemap.xml\n');
const SOURCE=canonicalSource;
const realRoutingRows=deriveRoutingRows(SOURCE,SOURCE.graph);
for(const resource of SOURCE.routes.resources.filter(resource=>resource.path!=='/')) {
 for(const alias of [resource.path+'/',resource.path+'.html'])assert(!realRoutingRows.some(row=>row.source===alias),'Platform-owned HTML normalization must not be emitted '+alias);
}
const fs=await import('node:fs/promises');
await assert.rejects(fs.access(new URL('../src/data/legacy-routing-supplement.json',import.meta.url)),{code:'ENOENT'},'Legacy routing supplement must be removed');
assert.equal(new Set(realRoutingRows.map(row=>row.source)).size,realRoutingRows.length,'Routing sources must remain unique');
const canonicalPaths=new Set(SOURCE.routes.resources.map(entry=>entry.path));
for(const row of SOURCE.routes.legacyRedirects){
  assert.equal(row.statusCode,301,'Historical redirects must be permanent');
  const [targetPath,fragment]=row.target.split('#');
  assert.ok(canonicalPaths.has(targetPath||'/'),`Historical redirect target must be a canonical page: ${row.source}`);
  if(fragment) assert.equal(SOURCE.routes.htmlIdTargets[fragment],row.target,`Historical redirect fragment must be owned by its final canonical: ${row.source}`);
  assert.ok(!realRoutingRows.some(other=>other.source===(targetPath||'/')),`Historical redirect must not chain through another route: ${row.source}`);
}
for(const source of ['/graph.jsonld/*','/provenance.jsonld/*','/ontology/*','/shapes/*','/annotation/*']) assert(!realRoutingRows.some(row=>row.source===source),`Bounded V2 namespace must not be broadened: ${source}`);
assert.ok(realRoutingRows.some(row=>row.source==='/2025/02/blog-post54.html'&&row.target==='/subcision-for-tethered-acne-scars'&&row.statusCode===301),'Expected legacy Blogger redirect');
const evidenceBackedMigrationAliases=[
  ['/blog/','/aesthetic-treatment-selection'],
  ['/category/blog/','/aesthetic-treatment-selection'],
  ['/videos/','/video-saeed-ghezelbash-subcision-technique'],
  ['/evidence/','/aesthetic-treatment-selection'],
  ['/aesthetic-medicine-dataset.html','/historical-patient-origin-summary'],
];
for(const [source,target] of evidenceBackedMigrationAliases)assert.ok(realRoutingRows.some(row=>row.source===source&&row.target===target&&row.statusCode===301),`Evidence-backed public alias must retain its permanent redirect: ${source}`);
for(const removed of ['/kg','/routes.json','/dataset.json','/research','/feeds','/blog','/videos','/evidence','/nap.csv']) assert(!realRoutingRows.some(row=>row.source===removed),`Legacy/development surface must stay absent: ${removed}`);
assert.ok(realRoutingRows.some(row=>row.source==='/subcision-kermanshah'&&row.target==='/subcision-for-tethered-acne-scars'&&row.statusCode===301));
assert.ok(realRoutingRows.some(row=>row.source==='/hifu-therapy-in-kermanshah'&&row.target==='/thread-lift-vs-surgery-hifu-and-radiofrequency'&&row.statusCode===301));
assert.ok(realRoutingRows.some(row=>row.source==='/double-chin-liposuction-kermanshah'&&row.target==='/submental-liposuction-for-fat-dominant-fullness'&&row.statusCode===301));
assert.ok(realRoutingRows.some(row=>row.source==='/best-mesotherapy-doctor-kermanshah'&&row.target==='/acne-pigmentation-and-scars#skin-mesotherapy-for-skin-quality-not-volume'&&row.statusCode===301));
assert.ok(realRoutingRows.some(row=>row.source.includes('بهترین+پی+آر+پی+کرمانشاه+دکتر+قزلباش')&&row.target==='/prp-for-skin-and-hair'&&row.statusCode===301));
console.log(JSON.stringify({routingOutput:'PASS',rows:realRoutingRows.length,legacyRedirects:SOURCE.routes.legacyRedirects.length,permanent:realRoutingRows.filter(row=>row.statusCode===301).length,rewrites:realRoutingRows.filter(row=>row.statusCode===200).length},null,2));
