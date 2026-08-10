import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';

const retiredProjection='001a-direct-answer-capsules.html';
const asArray=value=>Array.isArray(value)?value:[value].filter(Boolean);
const hasType=(node,type)=>asArray(node?.['@type']).includes(type);
const escapeHtml=value=>String(value)
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;');
const escapeRegExp=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const normalizeVisible=value=>String(value)
  .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]+>/g,' ')
  .replace(/&amp;/g,'&')
  .replace(/&nbsp;/g,' ')
  .replace(/\s+/g,' ')
  .trim();
const headingFor=(content,fragment)=>{
  const headingPattern=new RegExp(`<h([2-6])\\b(?=[^>]*\\bid=["']${escapeRegExp(fragment)}["'])[^>]*>[\\s\\S]*?<\\/h\\1>`,'gi');
  const matches=[...content.matchAll(headingPattern)];
  if(matches.length!==1) throw new Error(`Expected one native heading; found ${matches.length} at #${fragment}`);
  return matches[0];
};
const dedupeExactPlainParagraphs=html=>{
  const seen=new Set();let removed=0,removedBytes=0;
  const content=String(html).replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi,block=>{
    const open=block.slice(0,block.indexOf('>')+1);
    if(/\b(?:id|class|itemprop|itemscope|data-[\w-]+|aria-[\w-]+)=/i.test(open)) return block;
    const key=block.replace(/\s+/g,' ').trim();
    if(!key||!normalizeVisible(block)) return block;
    if(seen.has(key)){removed++;removedBytes+=Buffer.byteLength(block);return ''}
    seen.add(key);return block;
  });
  return {content,removed,removedBytes};
};

export async function canonicalSourceNames(root=process.cwd()){
  const sourceDir=path.join(root,'src/content-source');
  return (await readdir(sourceDir))
    .filter(name=>/\.(?:md|html)$/.test(name)&&name!==retiredProjection)
    .sort();
}

export async function assembleCanonicalContent({root=process.cwd(),graph}={}){
  const sourceDir=path.join(root,'src/content-source');
  const canonicalGraph=graph??JSON.parse(await readFile(path.join(root,'src/data/semantic/knowledge-graph.jsonld'),'utf8'));
  const names=await canonicalSourceNames(root);
  let content=(await Promise.all(names.map(name=>readFile(path.join(sourceDir,name),'utf8')))).join('');
  const deduped=dedupeExactPlainParagraphs(content);content=deduped.content;
  const byId=new Map(canonicalGraph['@graph'].filter(node=>node['@id']).map(node=>[node['@id'],node]));
  let inserted=0;
  for(const question of canonicalGraph['@graph'].filter(node=>hasType(node,'Question'))){
    const answer=byId.get(question.acceptedAnswer?.['@id']);
    if(!answer?.description) continue;
    if(typeof answer.description!=='string') throw new Error(`Answer.description must be a string: ${answer['@id']}`);
    const url=new URL(question.url||question['@id']);
    const fragment=decodeURIComponent(url.hash.slice(1));
    if(!fragment) throw new Error(`Executive answer has no visible fragment: ${answer['@id']}`);
    const match=headingFor(content,fragment);
    const summary=`<p>${escapeHtml(answer.description)}</p>`;
    const at=match.index+match[0].length;
    content=content.slice(0,at)+summary+content.slice(at);
    inserted++;
  }
  let fullInserted=0;
  for(const question of canonicalGraph['@graph'].filter(node=>hasType(node,'Question'))){
    const answer=byId.get(question.acceptedAnswer?.['@id']);
    if(typeof answer?.text!=='string'||!normalizeVisible(answer.text)) continue;
    if(normalizeVisible(content).includes(normalizeVisible(answer.text))) continue;
    const url=new URL(question.url||question['@id']),fragment=decodeURIComponent(url.hash.slice(1));
    const match=headingFor(content,fragment),paragraph=`<p>${escapeHtml(answer.text)}</p>`,at=match.index+match[0].length;
    content=content.slice(0,at)+paragraph+content.slice(at);
    fullInserted++;
  }
  return {content,names,inserted,fullInserted,dedupedParagraphs:deduped.removed,dedupedParagraphBytes:deduped.removedBytes};
}

export const retiredDirectAnswerProjection=retiredProjection;
