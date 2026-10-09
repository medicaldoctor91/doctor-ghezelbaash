import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parse} from 'parse5';
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
const homeHtml=CANONICAL.render('/');
const homeHead=homeHtml.slice(homeHtml.indexOf('<head>'),homeHtml.indexOf('</head>'));
const stylesheets=[...homeHead.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)];
assert.equal(stylesheets.length,1,'Home discovers one render-blocking stylesheet');
assert(stylesheets[0].index<homeHead.indexOf('<script id="schema-core-mainentity"'),'Browser discovers render-blocking CSS before the complete inline KG');
const inline=JSON.parse(homeHtml.match(/<script id="schema-core-mainentity"[^>]*>(.*?)<\/script>/s)[1]);
assert.equal(await semanticFingerprint(inline),await semanticFingerprint(SOURCE.graph),'Home includes full canonical truth');
const homeNodes=[];
function visitHome(node){homeNodes.push(node);for(const child of node.childNodes??[])visitHome(child);}visitHome(parse(homeHtml));
const homeAttribute=(node,name)=>node.attrs?.find(entry=>entry.name===name)?.value;
const homeHero=homeNodes.find(node=>homeAttribute(node,'class')==='entity-hero');
const homeChildren=homeHero.childNodes.filter(node=>node.tagName);
const homeStrip=homeChildren.find(node=>homeAttribute(node,'class')==='hero-trust-strip');
assert.equal(homeNodes.filter(node=>homeAttribute(node,'data-medical-trust')).length,0,'Home omits the removed author/reviewer card');
assert.equal(homeNodes.filter(node=>homeAttribute(node,'class')==='hero-trust-strip').length,1,'Home exposes one three-part trust strip');
assert(homeChildren[homeChildren.findIndex(node=>node.tagName==='h1')+1]===homeStrip,'The three-part strip immediately follows the Home title in document order');
for(const record of CANONICAL.records){
 assert.equal(record.document['@context'],'https://schema.org');
 const rendered=CANONICAL.render(record.path);
 const tree=parse(rendered),visibleNodes=[];
 function visit(node){visibleNodes.push(node);for(const child of node.childNodes??[])visit(child);}visit(tree);
 const attribute=(node,name)=>node.attrs?.find(entry=>entry.name===name)?.value;
 const trust=visibleNodes.find(node=>attribute(node,'data-medical-trust'));
 if(trust){
  const heading=visibleNodes.find(node=>node.tagName==='h1');
  const anchor=['a','summary'].includes(heading.parentNode.tagName)?heading.parentNode:heading;
  const siblings=anchor.parentNode.childNodes.filter(node=>node.tagName);
  assert(trust.parentNode===anchor.parentNode,'Medical trust shares the focused heading container '+record.path);
  assert.equal(siblings.indexOf(trust),siblings.indexOf(anchor)+1,'Medical trust follows the focused title and stays in its entry viewport '+record.path);
  if(anchor.tagName==='summary')assert(anchor.parentNode.attrs.some(entry=>entry.name==='open'),'Focused multilingual trust is initially expanded '+record.path);
 }
 const nav=rendered.match(/<nav\b[^>]*data-topic-navigation[^>]*>(.*?)<\/nav>/s)?.[1];
 const related=[record.navigation?.parent,...(record.navigation?.children??[])].filter(Boolean);
 if(related.length){
  assert(nav,'Focused page exposes contextual navigation '+record.path);
  const links=[...nav.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(links,related.map(r=>r.path),'Only authored parent/children navigation '+record.path);
  assert(!links.includes(record.path),'No navigation self-link');
 }else assert.equal(nav,undefined,'No generic navigation on unrelated page');
 const socialImage=rendered.match(/property="og:image" content="([^"]+)"/)?.[1];
 if(socialImage&&new URL(socialImage).pathname.endsWith('.webp'))assert.match(rendered,/property="og:image:type" content="image\/webp"/,'WebP social MIME '+record.path);
 assert.equal(/<body[^>]* lang="([^"]+)"/.exec(rendered)?.[1],record.lang,'Focused body language '+record.path);
 assert.equal(/<body[^>]* dir="([^"]+)"/.exec(rendered)?.[1],record.dir,'Focused body direction '+record.path);
 const questions=record.document['@graph'].filter(n=>[n['@type']].flat().includes('Question'));
 assert(questions.every(n=>record.visibleQuestionIds.includes(n['@id'])),'Only visible route Questions '+record.path);
 const videos=record.document['@graph'].filter(n=>[n['@type']].flat().includes('VideoObject'));
 assert(videos.every(n=>record.visibleMediaIds.includes(n['@id'])),'Only route-relevant videos '+record.path);
 assert(!record.document['@graph'].some(n=>[n['@type']].flat().includes('FAQPage')),'No synthetic FAQ wrapper '+record.path);
}
const watchPath='/video-saeed-ghezelbash-kurdish-patient-review';
const rendered=CANONICAL.render(watchPath),nodes=[];
function walk(node){nodes.push(node);for(const child of node.childNodes??[])walk(child);}walk(parse(rendered));
function text(node){return node.nodeName==='#text'?node.value:(node.childNodes??[]).map(text).join('');}
const headings=nodes.filter(node=>node.tagName==='h1');
assert.equal(headings.length,1);
assert.equal(text(headings[0]),'ڕەزامەندیی مراجعێک لە هەولێر | دکتۆر سەعید قزلباش','Kurdish watch H1 describes its established subject');
assert(text(nodes.find(node=>node.tagName==='article')).includes('امتیاز اعلام‌شدهٔ بیمار: ۵ از ۵.'),'Rating remains in primary page content');
console.log('Canonical semantic contracts PASS');
