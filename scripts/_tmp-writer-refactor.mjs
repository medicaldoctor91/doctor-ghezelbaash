import {readFile,writeFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const write=(path,value)=>writeFile(path,value);
const fail=message=>{throw new Error(message)};
const replaceOnce=(source,needle,replacement,label)=>{
  const first=source.indexOf(needle);
  if(first<0)fail(`Missing ${label}`);
  if(source.indexOf(needle,first+needle.length)>=0)fail(`Non-unique ${label}`);
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
};
const replaceRange=(source,start,end,replacement,label)=>{
  const a=source.indexOf(start),b=a<0?-1:source.indexOf(end,a+start.length);
  if(a<0||b<0)fail(`Missing ${label} boundary`);
  return source.slice(0,a)+replacement+source.slice(b);
};

let gen=await read('scripts/generate-projections.mjs');
const importNeedle="import { assembleCanonicalContent } from './lib/assemble-content.mjs';";
const importReplacement=`${importNeedle}\nimport { expandKnowledgeXml } from './lib/knowledge-xml.mjs';\nimport { normalizeGoogleSupportGraphDoc } from './lib/google-support-graph.mjs';`;
gen=replaceOnce(gen,importNeedle,importReplacement,'projection helper import');

const supportStart="const supportRaw=`";
const supportEnd='// ---- Flat graph projection.';
const supportReplacement=`const supportDoc=normalizeGoogleSupportGraphDoc({'@context':graph['@context'],'@graph':supportNodes});\nconst supportRaw=\`${'${JSON.stringify(supportDoc)}'}\\n\`;\nif(Buffer.byteLength(supportRaw)>supportProfile.maxBytes) throw new Error(\`Support graph ${'${Buffer.byteLength(supportRaw)}'} exceeds ${'${supportProfile.maxBytes}'}\`);\nawait writeFile(path.join(semantic,'support-graph.json'),supportRaw);\n\n`;
gen=replaceRange(gen,supportStart,supportEnd,supportReplacement+supportEnd,'support graph writer');

const knowledgeWrite="await writeFile(path.join(projections,'knowledge.xml'),knowledge);";
const knowledgeReplacement="const knowledgeIntentSource=await readFile(path.join(data,'templates/llms.template.txt'),'utf8');\nconst completeKnowledge=expandKnowledgeXml({body:knowledge,graph,evidenceRegistry,intentSource:knowledgeIntentSource});\nawait writeFile(path.join(projections,'knowledge.xml'),completeKnowledge);";
gen=replaceOnce(gen,knowledgeWrite,knowledgeReplacement,'knowledge XML final write');

const sitemapWrite="await writeFile(path.join(projections,'sitemap.xml'),sitemap);";
const llmsFinalization=`${sitemapWrite}\n\nconst llmsProjectionPath=path.join(projections,'llms.txt');\nlet llmsFinal=await readFile(llmsProjectionPath,'utf8');\nconst evidenceTiers=evidenceRegistry.tiers||{};\nfor(const tier of ['A','B','C'])if(typeof evidenceTiers[tier]!=='string'||!evidenceTiers[tier])throw new Error(\`llms.txt: evidence tier ${'${tier}'} definition missing from evidence registry\`);\nconst evidenceTierLine=\`- Evidence tiers: Tier A = ${'${evidenceTiers.A}'}; Tier B = ${'${evidenceTiers.B}'}; Tier C = ${'${evidenceTiers.C}'}.\`;\nconst evidenceTierPattern=/^- Evidence tiers:.*$/m;\nif(!evidenceTierPattern.test(llmsFinal))throw new Error('llms.txt: generated evidence-tier declaration missing');\nllmsFinal=llmsFinal.replace(evidenceTierPattern,evidenceTierLine);\nawait writeFile(llmsProjectionPath,llmsFinal);`;
gen=replaceOnce(gen,sitemapWrite,llmsFinalization,'llms projection finalization anchor');
await write('scripts/generate-projections.mjs',gen);

await write('src/pages/knowledge.xml.ts',`import body from '../data/projections/knowledge.xml?raw';\nimport { staticResponse } from '../lib/static-endpoint';\nexport const prerender=true;\nexport function GET(){return staticResponse(body,'application/xml; charset=utf-8');}\n`);
await write('src/pages/llms.txt.ts',`import body from '../data/projections/llms.txt?raw';\nimport { staticResponse } from '../lib/static-endpoint';\nexport const prerender=true;\nexport function GET(){return staticResponse(body,'text/plain; charset=utf-8');}\n`);

let layout=await read('src/layouts/BaseLayout.astro');
const layoutStart='type JsonNode=Record<string,any>;';
const layoutEnd='const googleSupportGraphRaw=isMain?normalizeGoogleSupportGraph(supportGraphRaw):supportGraphRaw;';
layout=replaceRange(layout,layoutStart,layoutEnd,'const googleSupportGraphRaw=supportGraphRaw;','layout support normalization');
layout=layout.replace(layoutEnd,'');
await write('src/layouts/BaseLayout.astro',layout);

let headers=await read('src/data/templates/headers.template');
const routeBlock=(route,media,cache,digest=true)=>`\n/${route}\n  Content-Type: ${media}\n  X-Robots-Tag: index, follow, max-snippet:-1\n  X-Robots-Tag: googlebot: noindex, follow\n  Cache-Control: ${cache}\n  Cloudflare-CDN-Cache-Control: ${cache}\n  Link: <https://www.ghezelbaash.ir/${route}>; rel="canonical", <https://www.ghezelbaash.ir/graph.jsonld#dataset>; rel="describedby", <https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah>; rel="about"\n${digest?'  Repr-Digest: sha-256=:__DIGEST__:\n':''}  Access-Control-Allow-Origin: *\n  Access-Control-Expose-Headers: Link, Repr-Digest, Content-Signal\n  Cross-Origin-Resource-Policy: cross-origin\n`;
for(const spec of [
  ['query-matrix.jsonl','application/jsonl; charset=utf-8','public, max-age=3600, must-revalidate',true],
  ['live-observations.jsonld','application/ld+json; charset=utf-8','public, max-age=0, must-revalidate',true],
  ['current-release-matrix.json','application/json; charset=utf-8','public, max-age=0, must-revalidate',true],
  ['live-serving-attestation.json','application/json; charset=utf-8','public, max-age=0, must-revalidate',false]
]){
  if(headers.includes(`\n/${spec[0]}\n`))fail(`Header template already owns /${spec[0]}`);
  headers+=routeBlock(...spec);
}
await write('src/data/templates/headers.template',headers);

let finalizer=await read('scripts/finalize-dist.mjs');
const fallbackStart="const esc=s=>s.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&');";
const mutateStart="const mutateRoute=(route,fn)=>";
finalizer=replaceRange(finalizer,fallbackStart,mutateStart,'', 'header fallback');
finalizer=replaceOnce(finalizer,"const mutateRoute=(route,fn)=>{const lines=headers.split('\\n'),i=lines.findIndex(x=>x===`/${route}`);if(i<0)return;","const mutateRoute=(route,fn)=>{const lines=headers.split('\\n'),i=lines.findIndex(x=>x===`/${route}`);if(i<0)throw new Error(`Missing canonical header block /${route}`);",'positive header mutation contract');
await write('scripts/finalize-dist.mjs',finalizer);

console.log(JSON.stringify({writerConvergence:'APPLIED',supportGraph:'generator-owned',knowledgeXml:'generator-owned',llmsTxt:'generator-owned',headers:'template-owned'}));
