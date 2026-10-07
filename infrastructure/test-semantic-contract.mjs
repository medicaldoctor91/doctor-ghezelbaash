import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {semanticFingerprint} from './lib/rdf.mjs';
const root=new URL('../',import.meta.url);
const source=await fs.readFile(new URL('src/pages/index.astro',root),'utf8');
let code=source.slice(4,source.lastIndexOf('\n---\n'));
code=code.slice(0,code.lastIndexOf('\nconst requestedPath ='));
code=code.replace(/from "\.\.\/lib\/([^"]+)"/g,(_,name)=>`from "${new URL('src/lib/'+name,root).href}"`);
code=code.replaceAll('../canonical/source.mjs',new URL('src/canonical/source.mjs',root).href);
await fs.mkdir(new URL('.generated/',root),{recursive:true});
const moduleFile=new URL('.generated/semantic-source.mjs',root);
await fs.writeFile(moduleFile,code);
const {SOURCE,CANONICAL}=await import(moduleFile.href);
assert(!SOURCE.graph['@graph'].some(n=>[n['@type']].flat().includes('FAQPage')),'No synthetic canonical FAQPage wrappers');
for(const entry of SOURCE.discovery.sitemapPolicy.videoWatchPages){
 const record=CANONICAL.records.find(r=>r.path===entry.path);
 assert.equal(record.pagePurpose,SOURCE.routes.resources.find(r=>r.path===entry.path).pagePurpose,'Watch page retains registry purpose');
}
const inline=JSON.parse(CANONICAL.render('/').match(/<script id="schema-core-mainentity"[^>]*>(.*?)<\/script>/s)[1]);
assert.equal(await semanticFingerprint(inline),await semanticFingerprint(SOURCE.graph),'Home includes full canonical truth');
for(const record of CANONICAL.records){
 assert.equal(record.document['@context'],'https://schema.org');
 const rendered=CANONICAL.render(record.path);
 assert.equal(/<body[^>]* lang="([^"]+)"/.exec(rendered)?.[1],record.lang,'Focused body language '+record.path);
 assert.equal(/<body[^>]* dir="([^"]+)"/.exec(rendered)?.[1],record.dir,'Focused body direction '+record.path);
 const questions=record.document['@graph'].filter(n=>[n['@type']].flat().includes('Question'));
 assert(questions.every(n=>record.visibleQuestionIds.includes(n['@id'])),'Only visible route Questions '+record.path);
 const videos=record.document['@graph'].filter(n=>[n['@type']].flat().includes('VideoObject'));
 assert(videos.every(n=>record.visibleMediaIds.includes(n['@id'])),'Only route-relevant videos '+record.path);
 assert(!record.document['@graph'].some(n=>[n['@type']].flat().includes('FAQPage')),'No synthetic FAQ wrapper '+record.path);
}
console.log('Canonical semantic contracts PASS');
