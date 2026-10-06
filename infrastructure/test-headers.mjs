import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { generateHeaders, generateSecurityTxt } from './lib/headers.mjs';
import { extractSourceObject } from './finalize-dist.mjs';

const origin='https://www.ghezelbaash.ir';
const routes=['/','/botox','/video-saeed-ghezelbash-subcision-technique'];
const delivery={
  http:{
    contentSignal:'search=yes, ai-input=yes, ai-train=yes, use=full',
    htmlIndexing:'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
    indexingProfiles:{
      machine:{default:'noindex, follow'},
      contact:{default:'noindex, follow'}, support:{default:'noindex'}, preview:{default:'noindex, nofollow, noarchive'}
    },
    compression:{vary:['Accept-Encoding']},
    machineCors:{origin:'*',exposeHeaders:['Link','Content-Signal'],resourcePolicy:'cross-origin'},
    security:{
      referrerPolicy:'strict-origin-when-cross-origin',xContentTypeOptions:'nosniff',crossOriginOpenerPolicy:'same-origin',originAgentCluster:'?1',
      permissionsPolicy:{camera:[],microphone:[],autoplay:['self'],fullscreen:['self']},
      xFrameOptions:'DENY',
      csp:{defaultSrc:["'none'"],baseUri:["'self'"],scriptSrc:["'self'","'unsafe-inline'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:'],mediaSrc:["'self'"],fontSrc:["'self'"],manifestSrc:["'self'"],connectSrc:["'self'"],objectSrc:["'none'"],frameSrc:["'none'"],formAction:["'self'"],frameAncestors:["'none'"],upgradeInsecureRequests:true}
    }
  },
  html:{cacheControl:'public, max-age=0, must-revalidate'},
  machine:{cacheControl:'public, max-age=3600, must-revalidate'},
  routing:{notFound:{cacheControl:'no-store'}}
};
const machineResources=[
  {path:'/graph.jsonld',mediaType:'application/ld+json',parameters:{},indexing:'machine',canonicalPath:'/graph.jsonld',about:[origin+'/#saeed-ghezelbash'],httpRelationships:[{path:'/graph.ttl',rel:'alternate'}]},
  {path:'/graph.ttl',mediaType:'text/turtle',parameters:{charset:'utf-8'},indexing:'machine',canonicalPath:'/graph.ttl',about:[origin+'/#saeed-ghezelbash'],httpRelationships:[]},
  {path:'/doctor.vcf',mediaType:'text/vcard',parameters:{charset:'utf-8'},indexing:'contact',canonicalPath:'/doctor.vcf',about:[origin+'/#saeed-ghezelbash'],httpRelationships:[]},
  {path:'/robots.txt',mediaType:'text/plain',parameters:{charset:'utf-8'},indexing:'support',canonicalPath:'/robots.txt',about:[],httpRelationships:[]},
];
const headers=generateHeaders({
  origin,routes,cssPath:'/assets/site.0123456789ab.css',delivery,machineResources,
  watchPosters:new Map([['/video-saeed-ghezelbash-subcision-technique','/media/posters/subcision.0123456789ab.webp']]),
});
assert.match(headers,/Content-Signal: search=yes, ai-input=yes, ai-train=yes, use=full/);
assert.match(headers,/Referrer-Policy: strict-origin-when-cross-origin/);
assert.match(headers,/X-Content-Type-Options: nosniff/);
assert.match(headers,/Cross-Origin-Opener-Policy: same-origin/);
assert.match(headers,/Origin-Agent-Cluster: \?1/);
assert.match(headers,/X-Frame-Options: DENY/);
assert.match(headers,/Content-Security-Policy: [^\n]*default-src 'none'/);
assert.match(headers,/Content-Security-Policy: [^\n]*frame-ancestors 'none'/);
assert.match(headers,/Content-Security-Policy: [^\n]*upgrade-insecure-requests/);
assert.match(headers,/Permissions-Policy: autoplay=\(self\), camera=\(\), fullscreen=\(self\), microphone=\(\)/);
assert.match(headers,/Vary: Accept-Encoding/);
assert.match(headers,/\/botox\n[\s\S]*Link: <\/assets\/site\.0123456789ab\.css>; rel=preload; as=style/);
assert.match(headers,/rel=describedby; type="application\/ld\+json"/);
assert.match(headers,/rel=describedby; type="text\/turtle"/);
assert.match(headers,/https:\/\/www\.ghezelbaash\.ir\/#saeed-ghezelbash>; rel=about/);
assert.match(headers,/\/video-saeed-ghezelbash-subcision-technique\n[\s\S]*<\/media\/posters\/subcision\.0123456789ab\.webp>; rel=preload; as=image/);
assert(!headers.includes('as=script'), 'JS must not be Early-Hinted by default');
assert.match(headers,/\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
assert.match(headers,/\/media\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
assert.match(headers,/\/fonts\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
assert.match(headers,/\/graph\.jsonld\n[\s\S]*Content-Type: application\/ld\+json/);
assert.match(headers,/\/graph\.jsonld\n[\s\S]*Access-Control-Allow-Origin: \*/);
assert.match(headers,/\/graph\.jsonld\n[\s\S]*Cross-Origin-Resource-Policy: cross-origin/);
assert.match(headers,/\/graph\.jsonld\n[\s\S]*X-Robots-Tag: noindex, follow/);
assert.doesNotMatch(headers,/X-Robots-Tag: googlebot:/);
assert.match(headers,/\/doctor\.vcf\n[\s\S]*X-Robots-Tag: noindex, follow/);
assert.match(headers,/\/robots\.txt\n[\s\S]*X-Robots-Tag: noindex/);
assert.match(headers,/https:\/\/:project\.pages\.dev\/\*\n\s+X-Robots-Tag: noindex, nofollow, noarchive/);
assert.match(headers,/https:\/\/:version\.:project\.pages\.dev\/\*\n\s+X-Robots-Tag: noindex, nofollow, noarchive/);
assert(!headers.includes('Strict-Transport-Security:'),'HSTS must remain gated until host coverage is verified');
const rules=headers.split(/\n\n+/).filter(Boolean);assert.ok(rules.length<=100,`Cloudflare header rule limit exceeded: ${rules.length}`);
assert.ok(headers.split('\n').every(line=>line.length<=2000),'Cloudflare header line length limit exceeded');
const security=generateSecurityTxt({origin,email:'doctor@ghezelbaash.ir',expires:'2027-04-05T00:00:00Z'});
assert.equal(security,`Contact: mailto:doctor@ghezelbaash.ir\nExpires: 2027-04-05T00:00:00Z\nPreferred-Languages: fa, en\nCanonical: https://www.ghezelbaash.ir/.well-known/security.txt\n`);
const SOURCE=await extractSourceObject(new URL('../src/pages/index.astro', import.meta.url));
const realRoutes=SOURCE.routes.resources.map(entry=>entry.path);
const byId=new Map(SOURCE.graph['@graph'].map(node=>[node['@id'],node]));
const realWatchPosters=new Map(SOURCE.discovery.sitemapPolicy.videoWatchPages.map(entry=>{const thumb=byId.get(entry.videoId)?.thumbnailUrl;assert.equal(typeof thumb,'string',`Missing video poster for ${entry.videoId}`);return [entry.path,new URL(thumb).pathname];}));
const realHeaders=generateHeaders({origin:SOURCE.canonicalOrigin,routes:realRoutes,cssPath:'/assets/site.0123456789ab.css',watchPosters:realWatchPosters,delivery:SOURCE.delivery,machineResources:SOURCE.machineResources});
const realRules=realHeaders.trim().split(/\n\n+/).filter(Boolean);
assert.ok(realRules.length<=100,`Real Cloudflare _headers rule limit exceeded: ${realRules.length}`);
assert.ok(realHeaders.split('\n').every(line=>line.length<=2000),'Real Cloudflare _headers line length limit exceeded');
console.log(JSON.stringify({headersPolicy:'PASS',securityTxt:'PASS',fixtureRules:rules.length,realRules:realRules.length,realMachineResources:SOURCE.machineResources.length},null,2));
