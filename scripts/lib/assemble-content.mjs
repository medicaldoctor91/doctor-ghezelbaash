import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, mkdir, unlink } from 'node:fs/promises';
import { parseFragment } from 'parse5';

const retiredProjection='001a-direct-answer-capsules.html';
const asArray=value=>Array.isArray(value)?value:[value].filter(Boolean);
const hasType=(node,type)=>asArray(node?.['@type']).includes(type);
const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const escapeAttr=value=>escapeHtml(value).replaceAll("'",'&#39;');
const escapeRegExp=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const normalizeVisible=value=>String(value).replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
const headingFor=(content,fragment)=>{const headingPattern=new RegExp(`<h([2-6])\\b(?=[^>]*\\bid=["']${escapeRegExp(fragment)}["'])[^>]*>[\\s\\S]*?<\\/h\\1>`,'gi'),matches=[...content.matchAll(headingPattern)];if(matches.length!==1)throw new Error(`Expected one native heading; found ${matches.length} at #${fragment}`);return matches[0]};
const dedupeExactPlainParagraphs=html=>{const seen=new Set();let removed=0,removedBytes=0;const content=String(html).replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi,block=>{const open=block.slice(0,block.indexOf('>')+1);if(/\b(?:id|class|itemprop|itemscope|data-[\w-]+|aria-[\w-]+)=/i.test(open))return block;const key=block.replace(/\s+/g,' ').trim();if(!key||!normalizeVisible(block))return block;if(seen.has(key)){removed++;removedBytes+=Buffer.byteLength(block);return''}seen.add(key);return block});return{content,removed,removedBytes}};
const attrs=node=>Object.fromEntries((node.attrs||[]).map(x=>[x.name,x.value]));
const classSet=node=>new Set(String(attrs(node).class||'').split(/\s+/).filter(Boolean));
const walk=(node,out=[])=>{if(node?.tagName)out.push(node);for(const child of node?.childNodes||[])walk(child,out);return out};
const idsIn=html=>[...String(html).matchAll(/\bid=["']([^"']+)["']/gi)].map(m=>m[1]);
const criticalKeepClasses=new Set(['section-answer','micro-answer','semantic-alias','clinic-facts','trust-governance','verified-identity-core','video-chapters']);
function deferDeepPresentation(fullContent,canonicalGraph){
  const answerNeedles=canonicalGraph['@graph'].filter(n=>hasType(n,'Answer')).flatMap(a=>[a.description,a.text]).filter(x=>typeof x==='string').map(normalizeVisible).filter(Boolean);
  const document=parseFragment(fullContent,{sourceCodeLocationInfo:true}),all=walk(document),chunks=all.filter(n=>classSet(n).has('render-chunk')),candidates=[];
  const shouldKeep=(node,raw,state)=>{const tag=node.tagName,classes=classSet(node);if(/^h[1-6]$/.test(tag)||['script','style','noscript'].includes(tag))return true;if([...classes].some(x=>criticalKeepClasses.has(x)))return true;if(/<(?:video|picture|img)\b/i.test(raw))return true;if(/\bid=["'](?:medical-content-governance|dr-saeed-ghezelbash-aesthetic-clinic-facts)["']/i.test(raw))return true;const visible=normalizeVisible(raw);if(visible&&answerNeedles.some(needle=>visible.includes(needle)))return true;if(tag==='p'&&state.keptParagraphs<1){state.keptParagraphs++;return true}if(['address','dl'].includes(tag))return true;return false};
  for(let chunkIndex=0;chunkIndex<chunks.length;chunkIndex++){if(chunkIndex<2)continue;const chunk=chunks[chunkIndex],state={keptParagraphs:0};for(const child of chunk.childNodes||[]){const loc=child.sourceCodeLocation;if(!child.tagName||!loc||!Number.isInteger(loc.startOffset)||!Number.isInteger(loc.endOffset))continue;const raw=fullContent.slice(loc.startOffset,loc.endOffset);if(!shouldKeep(child,raw,state))candidates.push({start:loc.startOffset,end:loc.endOffset,raw})}}
  for(const node of all){if(!classSet(node).has('final-collapsible-content'))continue;const loc=node.sourceCodeLocation;if(loc)candidates.push({start:loc.startOffset,end:loc.endOffset,raw:fullContent.slice(loc.startOffset,loc.endOffset)})}
  candidates.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start));const selected=[];
  for(const candidate of candidates){const overlap=selected.find(x=>candidate.start<x.end&&candidate.end>x.start);if(overlap){if(candidate.start>=overlap.start&&candidate.end<=overlap.end)continue;if(overlap.start>=candidate.start&&overlap.end<=candidate.end){selected.splice(selected.indexOf(overlap),1);selected.push(candidate);continue}throw new Error(`Deferred presentation overlap ${candidate.start}-${candidate.end}/${overlap.start}-${overlap.end}`)}selected.push(candidate)}
  const entries=[],replacements=[];let n=0;
  for(const item of selected){const key=`d${++n}`,ids=[...new Set(idsIn(item.raw))],aliases=ids.map(id=>`<span id="${escapeAttr(id)}"></span>`).join(''),placeholder=`<span aria-hidden="true" class="deferred-fragment-placeholder" data-deferred-fragment="${key}">${aliases}</span>`;entries.push({id:key,html:item.raw});replacements.push({...item,placeholder})}
  const cssBody=entries.map(entry=>`--${entry.id}:"${Buffer.from(entry.html).toString('base64')}"`).join(';'),css=`.deferred-content-store{${cssBody}}\n`,cssHash=createHash('sha256').update(css).digest('hex').slice(0,12),cssName=`deferred-content.${cssHash}.css`;
  let presentation=fullContent;for(const item of replacements.sort((a,b)=>b.start-a.start))presentation=presentation.slice(0,item.start)+item.placeholder+presentation.slice(item.end);
  if(entries.length)presentation+=`<span aria-hidden="true" class="deferred-content-store" hidden id="deferred-content-config" data-css="/assets/${cssName}" data-count="${entries.length}"></span>`;
  return{presentation,css,cssName,entries:entries.length,deferredSourceBytes:entries.reduce((sum,x)=>sum+Buffer.byteLength(x.html),0),presentationBytes:Buffer.byteLength(presentation)};
}
async function shipDeferredProjection(root,deferred){
  const homeDir=path.join(root,'src/content'),assetDir=path.join(root,'public/assets');await mkdir(homeDir,{recursive:true});await mkdir(assetDir,{recursive:true});
  for(const name of await readdir(assetDir))if(/^deferred-content\.[0-9a-f]{12}\.css$/.test(name)&&name!==deferred.cssName)await unlink(path.join(assetDir,name));
  await writeFile(path.join(homeDir,'home.md'),deferred.presentation);await writeFile(path.join(assetDir,deferred.cssName),deferred.css);
}

export async function canonicalSourceNames(root=process.cwd()){const sourceDir=path.join(root,'src/content-source');return(await readdir(sourceDir)).filter(name=>/\.(?:md|html)$/.test(name)&&name!==retiredProjection).sort()}

export async function assembleCanonicalContent({root=process.cwd(),graph}={}){
  const sourceDir=path.join(root,'src/content-source'),canonicalGraph=graph??JSON.parse(await readFile(path.join(root,'src/data/semantic/knowledge-graph.jsonld'),'utf8')),names=await canonicalSourceNames(root);let fullContent=(await Promise.all(names.map(name=>readFile(path.join(sourceDir,name),'utf8')))).join('');
  const deduped=dedupeExactPlainParagraphs(fullContent);fullContent=deduped.content;const byId=new Map(canonicalGraph['@graph'].filter(node=>node['@id']).map(node=>[node['@id'],node]));let inserted=0;
  for(const question of canonicalGraph['@graph'].filter(node=>hasType(node,'Question'))){const answer=byId.get(question.acceptedAnswer?.['@id']);if(!answer?.description)continue;if(typeof answer.description!=='string')throw new Error(`Answer.description must be a string: ${answer['@id']}`);const url=new URL(question.url||question['@id']),fragment=decodeURIComponent(url.hash.slice(1));if(!fragment)throw new Error(`Executive answer has no visible fragment: ${answer['@id']}`);const match=headingFor(fullContent,fragment),summary=`<p>${escapeHtml(answer.description)}</p>`,at=match.index+match[0].length;fullContent=fullContent.slice(0,at)+summary+fullContent.slice(at);inserted++}
  let fullInserted=0;for(const question of canonicalGraph['@graph'].filter(node=>hasType(node,'Question'))){const answer=byId.get(question.acceptedAnswer?.['@id']);if(typeof answer?.text!=='string'||!normalizeVisible(answer.text))continue;if(normalizeVisible(fullContent).includes(normalizeVisible(answer.text)))continue;const url=new URL(question.url||question['@id']),fragment=decodeURIComponent(url.hash.slice(1)),match=headingFor(fullContent,fragment),paragraph=`<p>${escapeHtml(answer.text)}</p>`,at=match.index+match[0].length;fullContent=fullContent.slice(0,at)+paragraph+fullContent.slice(at);fullInserted++}
  const deferred=deferDeepPresentation(fullContent,canonicalGraph),projectionGenerator=/generate-projections\.mjs$/.test(String(process.argv[1]||''));
  if(projectionGenerator){let shipped=false;process.once('beforeExit',async()=>{if(shipped)return;shipped=true;await shipDeferredProjection(root,deferred)})}
  return{content:projectionGenerator?fullContent:deferred.presentation,fullContent,presentationContent:deferred.presentation,deferredCss:deferred.css,deferredCssName:deferred.cssName,deferredEntryCount:deferred.entries,deferredSourceBytes:deferred.deferredSourceBytes,presentationBytes:deferred.presentationBytes,names,inserted,fullInserted,dedupedParagraphs:deduped.removed,dedupedParagraphBytes:deduped.removedBytes};
}

export const retiredDirectAnswerProjection=retiredProjection;
