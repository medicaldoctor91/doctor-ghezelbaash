import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as distHtml from './lib/dist-html.mjs';
import {semanticFingerprint} from './lib/rdf.mjs';
const { routeFileForPath, discoverCriticalAssets } = distHtml;
assert.equal(distHtml.normalizeDocumentLanguage, undefined, 'Finalizer must not repair document language after build');
assert.equal(distHtml.rewriteSitemapLastmod, undefined, 'Finalizer must not rewrite canonical sitemap dates after build');
import * as finalizerModule from './finalize-dist.mjs';
const { finalizeDist } = finalizerModule;
assert.equal(finalizerModule.prepareCandidates, undefined, 'Finalizer must emit one final dist, not candidate trees');
assert.equal(finalizerModule.loadRoutingSupplement, undefined, 'Finalizer must not expose a supplemental routing layer');

assert.equal(routeFileForPath('/'), 'index.html');
assert.equal(routeFileForPath('/botox'), 'botox.html');
const assets = discoverCriticalAssets('<link rel="stylesheet" href="/assets/site.abc123.css"><script defer src="/assets/site.def456.js"></script>');
assert.deepEqual(assets, { css:['/assets/site.abc123.css'], js:['/assets/site.def456.js'] });

const root = await fs.mkdtemp(path.join(os.tmpdir(),'v2-finalizer-'));
const dist = path.join(root,'dist'); await fs.mkdir(dist,{recursive:true});
const origin='https://www.ghezelbaash.ir';
const routes=['/',...Array.from({length:71},(_,i)=>`/route-${i+1}`)];
for (const route of routes) {
  const file=path.join(dist,routeFileForPath(route)); await fs.mkdir(path.dirname(file),{recursive:true});
  await fs.writeFile(file,'<!doctype html><html lang="fa-IR" dir="rtl"><head><link rel="stylesheet" href="/assets/site.abc123.css"></head><body lang="fa-IR" dir="rtl"><article lang="fa-IR" dir="rtl">ok</article><script src="/assets/site.def456.js"></script></body></html>');
}
await fs.mkdir(path.join(dist,'assets')); await fs.writeFile(path.join(dist,'assets/site.abc123.css'),'.render-chunk{content-visibility:auto;contain:layout style paint;contain-intrinsic-size:auto var(--cis,2800px)}'); await fs.writeFile(path.join(dist,'assets/site.def456.js'),'');

const personId=origin+'/#saeed-ghezelbash',clinicId=origin+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const fullGraph={
  '@context':{'@vocab':'https://schema.org/','internal':'https://www.ghezelbaash.ir/ontology/internal'},
  '@graph':[
    {'@id':origin+'/webpage','@type':['ProfilePage','MedicalWebPage'],url:origin+'/',name:'Home',description:'Canonical physician profile',mainEntity:{'@id':personId},author:{'@id':personId},publisher:{'@id':personId},isPartOf:{'@id':origin+'/website'},primaryImageOfPage:{'@id':origin+'/image-primary'},about:[{'@id':personId},{'@id':origin+'/medical-specialty-aesthetic-medicine'}],reviewedBy:{'@id':personId}},
    {'@id':personId,'@type':['Person','IndividualPhysician'],name:'Dr. Saeed Ghezelbash',url:origin+'/',jobTitle:'Physician',practicesAt:{'@id':clinicId},owns:{'@id':clinicId},sameAs:['https://www.wikidata.org/wiki/Q140287622']},
    {'@id':clinicId,'@type':['MedicalClinic','PhysiciansOffice','LocalBusiness'],name:'Dr. Saeed Ghezelbash Aesthetic Clinic',url:origin+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah',owner:{'@id':personId}},
    {'@id':origin+'/website','@type':'WebSite',name:'Ghezelbaash',url:origin+'/'},
    {'@id':origin+'/image-primary','@type':'ImageObject',name:'Portrait',contentUrl:origin+'/media/portrait.webp'},
    {'@id':origin+'/medical-specialty-aesthetic-medicine','@type':'MedicalSpecialty',name:'Aesthetic medicine'},
    {'@id':origin+'/dataset-unrelated','@type':'Dataset',name:'Machine corpus',description:'x'.repeat(5000),internal:'not-for-search-html'}
  ]
};
await fs.writeFile(path.join(dist,'graph.jsonld'),JSON.stringify(fullGraph));
const routeLinks=routes.slice(1).map((route,i)=>`<li><a href="${route}">Route ${i+1}</a></li>`).join('');
const home='<!doctype html><html lang="fa-IR" dir="rtl"><head><link rel="stylesheet" href="/assets/site.abc123.css"><title>Home</title><meta name="description" content="Home"><link rel="canonical" href="'+origin+'/"><script id="schema-core-mainentity" type="application/ld+json">'+JSON.stringify(fullGraph)+'</script></head><body lang="fa-IR" dir="rtl"><article class="medical-guide medical-guide--entity-home" lang="fa-IR" dir="rtl"><header class="entity-hero"><h1>Dr. Saeed Ghezelbash</h1></header><p>Primary entity introduction retained on Home.</p><nav id="aesthetic-medicine-table-of-contents"><ul><li><a href="/route-1">Guide</a></li></ul></nav><section id="topic" class="content-section"><h2>Topic</h2><p>Compact factual summary retained on Home for search and users.</p><p data-detail="duplicate">Deep detail belongs on focused routes and should not remain duplicated on Home.</p><nav><ul>'+routeLinks+'</ul></nav></section></article><script src="/assets/site.def456.js"></script></body></html>';
await fs.writeFile(path.join(dist,'index.html'),home);
await fs.writeFile(path.join(dist,'sitemap.xml'),'<?xml version="1.0"?><urlset>'+routes.map((r)=>`<url><loc>${origin}${r==='/'?'/':r}</loc><lastmod>2026-10-04</lastmod></url>`).join('')+'</urlset>');
const routingRows=[{source:'/route-1/',target:'/route-1',statusCode:301},{source:'/graph.jsonld/entity',target:'/graph.jsonld',statusCode:200},{source:'/legacy-old-url',target:'/route-1',statusCode:301}];
const summary=await finalizeDist({distDir:dist,routes,routingRows,sourceEdition:'2026-10-05',origin,watchPosters:new Map([['/route-1','/media/poster.0123456789ab.webp']]),securityEmail:'doctor@ghezelbaash.ir'});
assert.equal(summary.htmlDocuments,72);
assert.equal(summary.distDir,dist);

const finalizedHome=await fs.readFile(path.join(dist,'index.html'),'utf8');
const inlineGraph=JSON.parse(finalizedHome.match(/<script\b(?=[^>]*id=["']schema-core-mainentity["'])[^>]*>([\s\S]*?)<\/script>/i)?.[1]??'null');
const externalGraph=JSON.parse(await fs.readFile(path.join(dist,'graph.jsonld'),'utf8'));
assert.equal(await semanticFingerprint(inlineGraph),await semanticFingerprint(fullGraph),'Home keeps the full canonical KG, including machine vocabulary');
assert.equal(await semanticFingerprint(inlineGraph),await semanticFingerprint(externalGraph),'Home and graph.jsonld describe the same RDF dataset');
assert.ok(finalizedHome.includes('data-detail="duplicate"'),'Finalization preserves the authored unified-reader context');
for(const route of routes.slice(1))assert.ok(finalizedHome.includes(`href="${route}"`),`Home keeps canonical discovery link ${route}`);
// Measure the graph boundary separately from the surrounding clinical corpus.
// Total Home size is not a reason to discard canonical facts or reader context.
const graphStart=finalizedHome.indexOf('schema-core-mainentity');
const graphClose=finalizedHome.indexOf('</script>',graphStart);
assert.ok(graphStart>=0&&graphClose>graphStart,'The full inline graph has a complete closing script');
assert.deepEqual(JSON.parse(await fs.readFile(path.join(dist,'graph.jsonld'),'utf8')),fullGraph,'External full KG remains byte-semantically intact');

const redirects=await fs.readFile(path.join(dist,'_redirects'),'utf8');
assert.equal(redirects,'/route-1/ /route-1 301\n/graph.jsonld/entity /graph.jsonld 200\n/legacy-old-url /route-1 301\n');
const bHeaders=await fs.readFile(path.join(dist,'_headers'),'utf8');
assert.match(bHeaders,/Link: <\/assets\/site\.abc123\.css>; rel=preload; as=style/);
assert.match(bHeaders,/\/route-1\n[\s\S]*<\/media\/poster\.0123456789ab\.webp>; rel=preload; as=image/);
const security=await fs.readFile(path.join(dist,'.well-known/security.txt'),'utf8');
assert.match(security,/Contact: mailto:doctor@ghezelbaash.ir/);
const sitemap=await fs.readFile(path.join(dist,'sitemap.xml'),'utf8');
assert.equal([...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].every((m)=>m[1]==='2026-10-04'),true);
console.log(JSON.stringify({finalizerFoundation:'PASS',htmlDocuments:summary.htmlDocuments},null,2));
