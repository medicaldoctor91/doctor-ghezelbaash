import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as distHtml from './lib/dist-html.mjs';
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
const routes=['/',...Array.from({length:71},(_,i)=>`/route-${i+1}`)];
for (const route of routes) {
  const file=path.join(dist,routeFileForPath(route)); await fs.mkdir(path.dirname(file),{recursive:true});
  await fs.writeFile(file,'<!doctype html><html lang="fa-IR" dir="rtl"><head><link rel="stylesheet" href="/assets/site.abc123.css"></head><body lang="fa-IR" dir="rtl"><article lang="fa-IR" dir="rtl">ok</article><script src="/assets/site.def456.js"></script></body></html>');
}
await fs.mkdir(path.join(dist,'assets')); await fs.writeFile(path.join(dist,'assets/site.abc123.css'),'.render-chunk{content-visibility:auto;contain:layout style paint;contain-intrinsic-size:auto var(--cis,2800px)}'); await fs.writeFile(path.join(dist,'assets/site.def456.js'),'');
await fs.writeFile(path.join(dist,'sitemap.xml'),'<?xml version="1.0"?><urlset>'+routes.map((r)=>`<url><loc>https://www.ghezelbaash.ir${r==='/'?'/':r}</loc><lastmod>2026-10-04</lastmod></url>`).join('')+'</urlset>');
const routingRows=[{source:'/route-1/',target:'/route-1',statusCode:301},{source:'/graph.jsonld/entity',target:'/graph.jsonld',statusCode:200},{source:'/legacy-old-url',target:'/route-1',statusCode:301}];
const summary=await finalizeDist({distDir:dist,routes,routingRows,sourceEdition:'2026-10-05',origin:'https://www.ghezelbaash.ir',watchPosters:new Map([['/route-1','/media/poster.0123456789ab.webp']]),securityEmail:'doctor@ghezelbaash.ir'});
assert.equal(summary.htmlDocuments,72);
assert.equal(summary.distDir,dist);

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
