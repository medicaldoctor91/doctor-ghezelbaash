import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse,parseFragment,serialize,serializeOuter} from 'parse5';
import {SOURCE,AUTHORED_BODY} from '../src/canonical/source.mjs';
import {deriveRoutingRows,renderRobotsTxt} from '../src/lib/delivery-output.mjs';
import {serializeInlineJsonLd} from '../src/lib/jsonld.mjs';
import {closeSearchReferences,renderMedicalTrust} from '../src/lib/search-contract.mjs';

const attr=(node,name)=>node?.attrs?.find(a=>a.name===name)?.value;
const elements=node=>[...(node.tagName?[node]:[]),...(node.childNodes??[]).flatMap(elements)];
const text=node=>node.nodeName==='#text'?node.value:(node.childNodes??[]).map(text).join(' ');
const normalize=value=>String(value??'').replace(/\s+/g,' ').trim();
const headings=doc=>elements(elements(doc).find(n=>n.tagName==='article')).filter(n=>/^h[1-6]$/.test(n.tagName));
function parents(nodes){const out=new Map(),stack=[];for(const node of nodes){const level=Number(node.tagName.slice(1));while(stack.length&&stack.at(-1).level>=level)stack.pop();out.set(attr(node,'id'),stack.at(-1)?.id??null);stack.push({id:attr(node,'id'),level});}return out;}

// Evaluate the actual renderer frontmatter, using its real imported dependencies.
// An optional dist path verifies the same contract against release HTML.
let render;
if(process.argv[2]){
 const dist=path.resolve(process.argv[2]);
 render=route=>fs.readFile(path.join(dist,route==='/'?'index.html':route.slice(1)+'.html'),'utf8');
}else{
 const source=await fs.readFile(new URL('../src/pages/index.astro',import.meta.url),'utf8');
 const frontmatter=source.slice(source.indexOf('\n')+1,source.indexOf('\nconst requestedPath = '))
  .replace(/^import .*;\n/gm,'').replace(/^export \{SOURCE, AUTHORED_BODY\};\n/gm,'').replace(/^export /gm,'');
 const imports={parse,parseFragment,serialize,serializeOuter,createHash,deriveRoutingRows,renderRobotsTxt,serializeInlineJsonLd,closeSearchReferences,renderMedicalTrust,SOURCE,AUTHORED_BODY};
 const canonical=Function(...Object.keys(imports),frontmatter+'\nreturn CANONICAL;')(...Object.values(imports));
 render=route=>canonical.render(route);
}
const home=parse(await render('/')),authoredHeadings=headings(home),authoredParents=parents(authoredHeadings);
const parentDefects=[],descriptions=new Set(),documents=new Map();
for(const resource of SOURCE.routes.resources.filter(r=>r.path!=='/')){
 const document=parse(await render(resource.path));documents.set(resource.path,document);
 const focused=headings(document),actualParents=parents(focused),included=new Set(focused.map(h=>attr(h,'id')));
 assert.equal(focused.filter(n=>n.tagName==='h1').length,1,'Focused page retains its sole H1: '+resource.path);
 for(const node of focused.slice(1)){
  const id=attr(node,'id');if(!authoredParents.has(id))continue;
  let expected=authoredParents.get(id);while(expected&&!included.has(expected))expected=authoredParents.get(expected);
  expected??=attr(focused[0],'id');
  if(actualParents.get(id)!==expected)parentDefects.push({route:resource.path,id,expected,actual:actualParents.get(id)});
 }
 const all=elements(document),description=attr(all.find(n=>n.tagName==='meta'&&attr(n,'name')==='description'),'content');
 assert(description,'Every focused route has a description: '+resource.path);
 assert(!descriptions.has(description),'Focused descriptions remain unique: '+resource.path);descriptions.add(description);
 for(const property of ['og:description','twitter:description'])assert.equal(attr(all.find(n=>n.tagName==='meta'&&(attr(n,'property')===property||attr(n,'name')===property)),'content'),description,'Social description agrees: '+resource.path+' '+property);
 const graph=all.filter(n=>n.tagName==='script'&&attr(n,'type')==='application/ld+json').flatMap(n=>JSON.parse(n.childNodes.map(c=>c.value??'').join(''))['@graph']??[]);
 const page=graph.find(n=>n['@id']===SOURCE.canonicalOrigin+resource.path+'#webpage');
 assert.equal(page?.description,description,'Page schema description agrees with HTML: '+resource.path);
 const canonicalPage=SOURCE.graph['@graph'].find(n=>n['@id']===SOURCE.canonicalOrigin+resource.path+'#webpage');
 assert.equal(canonicalPage?.description,description,'Canonical machine and Home metadata agree with the focused page: '+resource.path);
}

// These actual authored paragraphs reproduce clipped FA, Arabic, Kurdish and
// English-name descriptions; an arbitrary character slice must fail here.
for(const route of ['/aesthetic-guide-ar-iq','/aesthetic-guide-ckb-iq','/blepharoplasty-for-excess-eyelid-skin-and-fat','/central-lip-lift-for-long-upper-lip','/saeed-ghezelbash-research-education-and-clinical-decisions','/subcision-for-tethered-acne-scars']){
 const all=elements(documents.get(route));const description=attr(all.find(n=>n.tagName==='meta'&&attr(n,'name')==='description'),'content');
 assert(/[.!?؟۔…]["'»”)]*$/.test(description),'Description ends at a complete authored sentence: '+route+' '+description.slice(-45));
 const prose=all.filter(n=>['p','address','figcaption','li'].includes(n.tagName)).map(n=>normalize(text(n))).find(value=>value.startsWith(description));
 assert(prose,'Complete description remains an exact normalized excerpt of visible authored prose: '+route);
}
const researchElements=elements(documents.get('/saeed-ghezelbash-research-education-and-clinical-decisions'));
const researchDescription=attr(researchElements.find(n=>n.tagName==='meta'&&attr(n,'name')==='description'),'content');
assert(researchDescription.startsWith('آثار علمی من با نام‌های '),'Research metadata describes the existing scientific-work paragraph instead of the general identity introduction');
assert(researchDescription.includes('پژوهش ۲۰۲۱'),'Research metadata retains the source paragraph’s published-research subject');
assert.equal(parentDefects.length,0,'Focused heading parents must preserve authored sibling/ancestor relationships: '+JSON.stringify({count:parentDefects.length,first:parentDefects.slice(0,3)}));
console.log(JSON.stringify({focusedHtmlSemantics:'PASS',routes:documents.size,authoredHeadingParents:'preserved',uniqueDescriptions:descriptions.size,completeMultilingualDescriptions:'PASS',descriptionProjectionAgreement:'PASS'},null,2));
