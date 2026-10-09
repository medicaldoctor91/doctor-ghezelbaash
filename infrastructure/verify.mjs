import {AUTHORED_BODY as canonicalBody} from '../src/canonical/source.mjs';
import {SOURCE as canonicalSource} from '../src/canonical/source.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parse} from 'parse5';

import {measureDelivery} from './lib/delivery-contract.mjs';

const root=process.cwd();
const source=canonicalSource;
const locked=JSON.parse(await fs.readFile(new URL('./fixtures/locked-route-text.json',import.meta.url),'utf8'));
const report=await measureDelivery({distDir:path.join(root,'dist'),source,verify:true,locked});
const normalized=html=>{function text(n){if(['head','script','style','template'].includes(n.tagName)||n.attrs?.some(a=>['data-medical-trust','data-medical-review-date'].includes(a.name)))return '';return n.nodeName==='#text'?n.value:(n.childNodes??[]).map(text).join('');}return text(parse(html)).replace(/\s+/g,' ').trim();};
assert.equal(normalized(await fs.readFile(path.join(root,'dist/index.html'),'utf8')),normalized(canonicalBody),'Unique authored Home copy preserved');
for(const resource of source.machineResources){const stat=await fs.stat(path.join(root,'dist',resource.path.slice(1)));assert(stat.isFile()&&stat.size>0,'Registered resource exists '+resource.path);}
// Verification is read-only, including pre-seal checks. Reports are produced by
// the release runner outside dist only after verification succeeds.
console.log(JSON.stringify({...report,routes:undefined,focusedFingerprints:undefined,distHashes:{sha256:report.distHashes.sha256},machineResources:undefined,copyUnchanged:true},null,2));
