import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {semanticFingerprint} from './lib/rdf.mjs';
const moduleFile=new URL('../src/canonical/source.mjs',import.meta.url);
assert(await fs.access(moduleFile).then(()=>true,()=>false),'Canonical truth must be directly importable, independent of Astro text parsing');
const {SOURCE,AUTHORED_BODY}=await import(moduleFile.href);
assert.equal(SOURCE.routes.resources.length,72);
assert.equal(typeof AUTHORED_BODY,'string');
const renderer=await fs.readFile(new URL('../src/pages/index.astro',import.meta.url),'utf8');
assert.match(renderer,/import \{SOURCE, AUTHORED_BODY\} from "\.\.\/canonical\/source\.mjs"/,'Renderer imports the same truth');
const expected=(await fs.readFile(new URL('./fixtures/canonical-graph.sha256',import.meta.url),'utf8')).trim();
assert.equal(await semanticFingerprint(SOURCE.graph),expected,'Canonical graph matches the reviewed semantic integrity fixture');
for(const file of ['finalize-dist.mjs','materialize-machine-resources.mjs','audit-source.mjs','test-discovery.mjs']){
 const code=await fs.readFile(new URL(file,import.meta.url),'utf8');
 assert(!/extractSourceObject|extractAuthoredBody|extractJsonObjectAfter/.test(code),'Truth must not be parsed from Astro: '+file);
}
console.log('Direct canonical truth module PASS');
