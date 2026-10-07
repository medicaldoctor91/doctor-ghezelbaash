import {SOURCE as canonicalSource} from '../src/canonical/source.mjs';
import assert from 'node:assert/strict';import {generateHeaders} from './lib/headers.mjs';import {deriveRoutingRows} from '../src/lib/delivery-output.mjs';
const s=canonicalSource;
const rows=deriveRoutingRows(s,s.graph);const html=new Set(s.routes.resources.map(r=>r.path));
const text=generateHeaders({origin:s.canonicalOrigin,routes:[...html],cssPath:'/assets/site.test.css',delivery:s.delivery,machineResources:s.machineResources});
const blocks=text.trim().split(/\n\s*\n/).map(b=>b.split('\n'));
const match=(pattern,path)=>pattern===path||pattern.endsWith('/*')&&path.startsWith(pattern.slice(0,-1));
for(const row of rows.filter(r=>r.statusCode===200)) {
 assert(!html.has(row.source),'Alias cannot shadow canonical HTML');
 const covered=blocks.filter(([pattern])=>match(pattern,row.source));
 const policy=covered.flat().join('\n');
 assert.match(policy,/X-Robots-Tag: noindex, follow/,'Every identity alias is noindex, follow: '+row.source);
 assert.match(policy,/Content-Type: application\/ld\+json/,'Machine MIME: '+row.source);
 assert.match(policy,/Access-Control-Allow-Origin: \*/,'Machine CORS: '+row.source);
 assert(policy.includes(`<${row.target}>; rel=describedby`),'Identity describes resource: '+row.source);
 assert(!covered.some(lines=>lines.slice(1).some(l=>/rel=canonical/.test(l))),'Entity IRI is not a duplicate document: '+row.source);
 assert(!rows.some(r=>r.source===row.target),'No redirect/rewrite chain');
}
console.log('All graph identity 200 aliases policy-covered PASS');
