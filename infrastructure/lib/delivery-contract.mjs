import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parse,serialize} from 'parse5';
import {createHash} from 'node:crypto';
import {semanticFingerprint,rdfFingerprint} from './rdf.mjs';
import {assertValidLinkTypes} from './headers.mjs';
import {graphFactRows} from '../../src/lib/machine-output.mjs';
import {deriveRoutingRows} from '../../src/lib/delivery-output.mjs';
import {clinicalCopyFingerprint} from './clinical-copy.mjs';
import {truthText} from '../../src/lib/search-contract.mjs';

const vals=v=>Array.isArray(v)?v:v==null?[]:[v];
const attr=(n,k)=>n.attrs?.find(a=>a.name===k)?.value;
const text=n=>n?.nodeName==='#text'?n.value:(n?.childNodes??[]).map(text).join('');
const inspect=html=>{const out=[];function walk(n){out.push(n);for(const c of n.childNodes??[])walk(c);if(n.content)walk(n.content);}walk(parse(html));return out;};
const hash=v=>createHash('sha256').update(v).digest('hex');
const value=v=>v?.['@value']??v;
export function unresolvedReferences(graph,origin,documentUrls=[]){
 const definitions=new Set(documentUrls);function define(v){if(!v||typeof v!=='object')return;if(v['@id']&&Object.keys(v).length>1)definitions.add(v['@id']);Object.values(v).forEach(define);}define(graph);
 const missing=new Set();function visit(v){if(!v||typeof v!=='object')return;if(Object.keys(v).length===1&&v['@id']?.startsWith(origin+'/')&&!definitions.has(v['@id']))missing.add(v['@id']);Object.values(v).forEach(visit);}visit(graph);return [...missing].sort();
}
export function assertCanonicalFactCsv(csv,graph){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<csv.length;i++){
  const c=csv[i];
  if(quoted){if(c==='"'){if(csv[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=c;}
  else if(c==='"'){assert.equal(cell,'','CSV quote starts a field');quoted=true;}
  else if(c===','){row.push(cell);cell='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 assert(!quoted,'CSV quoted field closes');if(cell||row.length){row.push(cell);rows.push(row);}
 const columns=['row_id','subject','predicate','object','object_kind','datatype','language'];
 assert.deepEqual(rows.shift(),columns,'Canonical CSV columns');
 assert(rows.every(row=>row.length===columns.length),'Canonical CSV field count');
 const identities=rows.map(row=>row[0]),facts=rows.map(row=>JSON.stringify(row));
 assert.equal(new Set(identities).size,rows.length,'Duplicate CSV row_id');
 assert.equal(new Set(facts).size,rows.length,'Duplicate CSV complete rows');
 const canonical=new Set(graphFactRows(graph).map(row=>JSON.stringify(columns.map(key=>row[key]==null?'':String(row[key])))));
 assert.deepEqual(new Set(facts),canonical,'CSV preserves all unique canonical facts');
 return rows.length;
}
export async function distHashes(dir){const files={};async function walk(folder){for(const entry of (await fs.readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(folder,entry.name);if(entry.isDirectory())await walk(file);else files['/'+path.relative(dir,file)]=hash(await fs.readFile(file));}}await walk(dir);return {files,sha256:hash(JSON.stringify(files))};}
export async function measureDelivery({distDir,source,verify=false,locked=null,semantic=true}){
 const origin=source.canonicalOrigin,personId=origin+'/#saeed-ghezelbash',clinicId=origin+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
 const full=source.graph,truth=new Map(full['@graph'].map(n=>[n['@id'],n]));
 const routes=[],focusedFingerprints={},clinicFingerprints=new Set();let missing=0,duplicates=0,faq=0,incorrectAbout=0,dateErrors=0,visibleReviewDateErrors=0,trustPages=0;const linksByPath=new Map(),idsByPath=new Map();
 let homeGraph=null,homeHtml=null;
 for(const resource of source.routes.resources){
  const route=resource.path,file=route==='/'?'index.html':route.slice(1)+'.html';
  const html=await fs.readFile(path.join(distDir,file),'utf8');const nodes=inspect(html);
  const scripts=nodes.filter(n=>n.tagName==='script'&&attr(n,'type')==='application/ld+json');
  const document=JSON.parse(serialize(scripts[0]));const ns=document['@graph'];
  const pageId=origin+(route==='/'?'/webpage':route+'#webpage'),page=ns.find(n=>n['@id']===pageId),canonical=nodes.filter(n=>n.tagName==='link'&&attr(n,'rel')==='canonical');
  const actualTitle=text(nodes.find(n=>n.tagName==='title')),h1=nodes.filter(n=>n.tagName==='h1');
  const unresolved=unresolvedReferences(document,origin,route==='/'?[origin+'/',...source.machineResources.map(r=>origin+r.path)]:[]);missing+=unresolved.length;duplicates+=ns.length-new Set(ns.map(n=>n['@id'])).size;
  const pageFaq=ns.filter(n=>vals(n['@type']).includes('FAQPage')).length;faq+=pageFaq;
  if(resource.pagePurpose==='clinical-guide'&&vals(page?.about).some(v=>v?.['@id']===personId))incorrectAbout++;
  const authored=truth.get(pageId);for(const key of ['datePublished','dateModified','lastReviewed'])if(value(page?.[key])!==value(authored?.[key]))dateErrors++;
  const trust=nodes.filter(n=>attr(n,'data-medical-trust')===pageId);
  if(route==='/'){const review=nodes.find(n=>(attr(n,'class')??'').split(/\s+/).includes('hero-trust-item--review'));const times=[];function collect(n){if(n?.tagName==='time')times.push(n);for(const child of n?.childNodes??[])collect(child);}collect(review);if(times.some(n=>attr(n,'datetime')!==value(page.lastReviewed)))visibleReviewDateErrors++;if(verify)assert.equal(visibleReviewDateErrors,0,'Visible Home review badge derives from canonical review date');}
  if(verify){
   assert.equal(scripts.length,1,'One inline JSON-LD '+route);assert.equal(canonical.length,1,'One canonical '+route);assert.equal(attr(canonical[0],'href'),origin+route,'Canonical ownership '+route);
   assert.equal(h1.length,1,'One H1 '+route);assert.equal(nodes.filter(n=>n.tagName==='article'&&(attr(n,'class')??'').split(/\s+/).includes('medical-guide')).length,1,'One primary article '+route);
   if(locked){assert.equal(actualTitle,locked[route].title,'Locked title '+route);assert.equal(text(h1[0]),locked[route].h1,'Locked H1 '+route);}
   assert(page,'Route page node '+route);assert.equal(page.url,origin+route,'Structured canonical URL '+route);
   assert.equal(unresolved.length,0,'Unresolved internal references '+route+': '+unresolved.slice(0,5).join(', '));assert.equal(new Set(ns.map(n=>n['@id'])).size,ns.length,'Duplicate @id '+route);
   if(route!=='/'){
    assert.equal(document['@context'],'https://schema.org','Focused Schema.org context '+route);assert.equal(pageFaq,0,'Synthetic FAQPage '+route);
    const forbidden=new Set(Object.entries(full['@context']).filter(([,v])=>v?.['@id']?.startsWith(origin+'/ontology/')).map(([k])=>k));
    function vocabulary(v){if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){assert(!k.includes(':')&&!forbidden.has(k),'Custom focused vocabulary '+route+': '+k);if(k==='@type')for(const t of vals(x))assert(!t.includes(':')&&!t.startsWith('http'),'Custom focused type '+route+': '+t);vocabulary(x);}}vocabulary(document);
    if(resource.pagePurpose==='clinical-guide')assert(!vals(page.about).some(v=>v?.['@id']===personId),'Clinical topic about Person '+route);
    assert(Buffer.byteLength(html)<1500000,'Focused page comfortably below Search fetch limit '+route);
   }
   for(const key of ['datePublished','dateModified','lastReviewed'])assert.equal(value(page[key]),value(authored[key]),'Route date truth '+key+' '+route);
   if(vals(page['@type']).includes('MedicalWebPage')){
    assert.equal(trust.length,1,'Visible medical trust '+route);trustPages++;
    for(const key of ['author','reviewedBy','lastReviewed','dateModified']){
     const expected=page[key];const elements=nodes.filter(n=>attr(n,'data-trust-property')===key);
     if(!expected){assert.equal(elements.length,0,'Unsupported visible '+key+' '+route);continue;}
     assert.equal(elements.length,1,'Visible '+key+' '+route);
     const id=vals(expected)[0]?.['@id'];if(id){assert.equal(attr(elements[0],'data-entity-id'),id);assert(text(elements[0]).includes(truthText(truth.get(id)?.name,attr(nodes.find(n=>n.tagName==='html'),'lang'))));}
     else {const time=elements[0].childNodes.find(n=>n.tagName==='time');assert.equal(attr(time,'datetime'),value(expected));assert.equal(text(time),value(expected));}
    }
   }
  }
  const ids=new Set(nodes.map(n=>attr(n,'id')).filter(Boolean));idsByPath.set(route,ids);
  linksByPath.set(route,nodes.filter(n=>n.tagName==='a'&&attr(n,'href')).map(n=>new URL(attr(n,'href'),origin+route)).filter(u=>u.origin===origin));
  if(semantic&&route!=='/'){
   focusedFingerprints[route]=await semanticFingerprint(document);
   const clinic=ns.find(n=>n['@id']===clinicId);assert(clinic,'Clinic spine '+route);
   clinicFingerprints.add(await semanticFingerprint({'@context':document['@context'],'@graph':[clinic]}));
  }
  routes.push({path:route,bytes:Buffer.byteLength(html),title:actualTitle,h1:text(h1[0]),unresolved:unresolved.length,duplicateIds:ns.length-new Set(ns.map(n=>n['@id'])).size,faq:pageFaq});
  if(route==='/'){homeGraph=document;homeHtml=html;}
 }
 if(verify){
  const reachable=new Set(['/']),queue=['/'];while(queue.length){for(const u of linksByPath.get(queue.shift())??[])if(linksByPath.has(u.pathname)&&!reachable.has(u.pathname)){reachable.add(u.pathname);queue.push(u.pathname);}}
  assert.equal(reachable.size,source.routes.resources.length,'No canonical orphans');
  for(const [route,urls] of linksByPath)for(const u of urls){if(idsByPath.has(u.pathname)&&u.hash)assert(idsByPath.get(u.pathname).has(decodeURIComponent(u.hash.slice(1))),'Internal fragment '+route+' '+u.href);}
  if(semantic)assert.equal(clinicFingerprints.size,1,'Stable Clinic semantics across focused routes');
 }
 const sourceFingerprint=semantic?await semanticFingerprint(full):null,homeFingerprint=semantic?await semanticFingerprint(homeGraph):null;
 const external=await fs.readFile(path.join(distDir,'graph.jsonld'),'utf8').catch(()=>null),turtle=await fs.readFile(path.join(distDir,'graph.ttl'),'utf8').catch(()=>null);
 const externalFingerprint=semantic&&external?await semanticFingerprint(JSON.parse(external)):null,turtleFingerprint=semantic&&turtle?await rdfFingerprint(turtle):null;
 if(verify){assert.equal(homeFingerprint,sourceFingerprint,'Home full KG equals SOURCE');assert.equal(externalFingerprint,sourceFingerprint,'graph.jsonld equals SOURCE');assert.equal(turtleFingerprint,sourceFingerprint,'Turtle equals SOURCE');}
 const kgStart=homeHtml.indexOf('<script id="schema-core-mainentity"'),contentStart=homeHtml.indexOf('>',kgStart)+1,kgEnd=homeHtml.indexOf('</script>',contentStart)+9;
 const homePositions={scriptStart:Buffer.byteLength(homeHtml.slice(0,kgStart)),jsonStart:Buffer.byteLength(homeHtml.slice(0,contentStart)),scriptEnd:Buffer.byteLength(homeHtml.slice(0,kgEnd))};
 if(verify){
  assert(kgStart>=0&&kgEnd<homeHtml.indexOf('</head>'),'Entire full KG is inline in head');
  assert(homeHtml.indexOf('<title>')<kgStart&&homeHtml.indexOf('rel=\"canonical\"')<kgStart&&homeHtml.indexOf('name=\"description\"')<kgStart,'Critical Home indexing metadata precedes full KG');
 }
 const rows=deriveRoutingRows(source,full),aliases=rows.filter(r=>r.statusCode===200);
 const sitemap=await fs.readFile(path.join(distDir,'sitemap.xml'),'utf8').catch(()=>null),robots=await fs.readFile(path.join(distDir,'robots.txt'),'utf8').catch(()=>null),headers=await fs.readFile(path.join(distDir,'_headers'),'utf8').catch(()=>null);
 if(verify){
  assertCanonicalFactCsv(await fs.readFile(path.join(distDir,'entity-facts.csv'),'utf8'),source.graph);
  const copyLock=(await fs.readFile(new URL('../fixtures/locked-clinical-copy.sha256',import.meta.url),'utf8')).trim();
  assert.equal(clinicalCopyFingerprint(homeHtml),copyLock,'Original unique clinical copy preserved');
  const locations=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);assert.deepEqual(locations.sort(),source.routes.resources.map(r=>origin+r.path).sort(),'Only canonical HTML sitemap URLs');
  for(const entry of sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)){const url=entry[1].match(/<loc>([^<]+)<\/loc>/)[1],actual=entry[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1],route=new URL(url).pathname;assert.equal(actual,value(truth.get(origin+(route==='/'?'/webpage':route+'#webpage'))?.dateModified),'Sitemap actual modification '+route);}
  for(const alias of aliases){assert(!locations.includes(origin+alias.source),'No entity alias in sitemap');assert(!source.routes.resources.some(r=>r.path===alias.source),'No identity shadow');}
  for(const documentName of ['datapackage.json','croissant.json']){
   const doc=JSON.parse(await fs.readFile(path.join(distDir,documentName),'utf8'));
   for(const resource of doc.resources??doc.distribution){
    const url=new URL(resource.path??resource.contentUrl,origin).pathname;
    const expected=resource.hash?.replace(/^sha256:/,'')??resource.sha256;
    if(expected){const bytes=await fs.readFile(path.join(distDir,url.slice(1)));assert.equal(hash(bytes),expected,'Accurate distribution checksum '+documentName+' '+url);assert.equal(bytes.length,resource.bytes??Number.parseInt(resource.contentSize,10),'Accurate distribution size '+documentName+' '+url);}
   }
  }
  const manifestText=await fs.readFile(path.join(distDir,'integrity-manifest.json'),'utf8').catch(()=>null);
  if(manifestText){const manifest=JSON.parse(manifestText);for(const resource of [...source.machineResources,...source.delivery.releaseResources])if(manifest.files[resource.path])assert.equal(manifest.files[resource.path].mediaType,resource.mediaType,'Sealed resource MIME truth '+resource.path);}
  for(const row of rows)assert(!rows.some(next=>next.source===row.target),'No routing chain or loop '+row.source);
  if(headers){
   assertValidLinkTypes(headers);
   const blocks=headers.trim().split(/\n\s*\n/).map(b=>b.split('\n'));
   for(const resourcePath of ['/graph.ttl','/shapes.ttl','/dcat.ttl']) {
    const block=blocks.find(([pattern])=>pattern===resourcePath);
    assert.equal(block?.find(line=>line.trim().startsWith('Content-Type:'))?.trim(),'Content-Type: text/turtle; charset=utf-8','Turtle Content-Type '+resourcePath);
   }
   const covers=(pattern,url)=>pattern===url||pattern.endsWith('/*')&&url.startsWith(pattern.slice(0,-1));
   for(const alias of aliases){
    const covered=blocks.filter(([pattern])=>covers(pattern,alias.source)&&pattern!=='/*').flat().join('\n');
    assert(covered.includes('X-Robots-Tag: noindex, follow')&&covered.includes('Content-Type: application/ld+json')&&covered.includes('Access-Control-Allow-Origin: *'),'Actual entity headers '+alias.source);
    assert(covered.includes(`<${alias.target}>; rel=describedby`)&&!covered.includes('rel=canonical'),'Actual entity identity relation '+alias.source);
   }
   for(const resource of [...source.machineResources,...(source.delivery.releaseResources??[])].filter(r=>r.indexing!=='canonical-html')){
    const block=blocks.find(([pattern])=>pattern===resource.path)?.join('\n');
    assert(block?.includes('Content-Type: '+resource.mediaType),'Actual resource MIME '+resource.path);
    assert(block.includes('X-Robots-Tag: noindex'),'Actual resource indexing '+resource.path);
    if(['machine','contact'].includes(resource.indexing))assert(block.includes('Access-Control-Allow-Origin: *'),'Actual resource CORS '+resource.path);
   }
  }
  assert(robots.includes('User-agent: *')&&robots.includes('Allow: /'),'Canonical Search content crawlable');assert(!/User-agent: (Googlebot|Bingbot|OAI-SearchBot)[\s\S]*Disallow: \/(?:\s|$)/i.test(robots),'Search agents not blocked');
 }
 const focused=routes.filter(r=>r.path!=='/').map(r=>r.bytes).sort((a,b)=>a-b);
 return {canonicalRoutes:routes.length,sitemapCount:sitemap?(sitemap.match(/<url>/g)??[]).length:null,homeBytes:routes.find(r=>r.path==='/').bytes,homeKgOffsets:homePositions,fullKgPresent:sourceFingerprint===homeFingerprint,focusedBytes:{min:focused[0],median:focused[Math.floor(focused.length/2)],max:focused.at(-1)},unresolvedIds:missing,duplicateIds:duplicates,faqPageLeakage:faq,incorrectPersonAbout:incorrectAbout,dateInconsistencies:dateErrors,visibleReviewDateInconsistencies:visibleReviewDateErrors,editionStampedPageDates:source.routes.resources.filter(r=>value(truth.get(origin+(r.path==='/'?'/webpage':r.path+'#webpage'))?.dateModified)===source.edition).length,visibleTrustPages:trustPages,sourceFingerprint,homeFingerprint,externalFingerprint,turtleFingerprint,focusedFingerprints,clinicVariants:clinicFingerprints.size,routingByStatus:{301:rows.filter(r=>r.statusCode===301).length,200:aliases.length},machineResources:source.machineResources.map(r=>({path:r.path,mime:r.mediaType,indexing:r.indexing})),robotsPresent:!!robots,headersPresent:!!headers,identityPolicyCovered:headers?aliases.length:0,resourcePolicyCovered:headers?source.machineResources.filter(r=>r.indexing!=='canonical-html').length+(source.delivery.releaseResources?.length??0):0,clinicalCopyUnchanged:clinicalCopyFingerprint(homeHtml)===(await fs.readFile(new URL('../fixtures/locked-clinical-copy.sha256',import.meta.url),'utf8')).trim(),routes,distHashes:await distHashes(distDir)};
}
