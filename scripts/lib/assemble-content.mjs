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

const machineResourceDefinitionPattern=/<dt><strong>Machine discovery guide<\/strong><\/dt>(<dd><a href="\/llms\.txt"[\s\S]*?<\/dd>)(<dd><a href="\/artifact-manifest\.json"[\s\S]*?<\/dd>)<dt><strong>Deterministic build provenance<\/strong><\/dt>(<dd><a href="\/knowledge\.xml"[\s\S]*?<\/dd>)<dt><strong>Hierarchical semantic projection<\/strong><\/dt>(<dd><a href="\/entity-facts\.csv"[\s\S]*?<\/dd>)<dt><strong>Flat entity-fact distribution<\/strong><\/dt>(<dd><a href="\/answers\.txt"[\s\S]*?<\/dd>)<dt><strong>Direct-answer retrieval corpus<\/strong><\/dt>/;
const canonicalizeMachineResourceDefinitions=content=>{
  const matches=content.match(new RegExp(machineResourceDefinitionPattern.source,'g'))||[];
  if(matches.length!==1) throw new Error(`Expected one legacy machine-resource definition mapping; found ${matches.length}`);
  return content.replace(machineResourceDefinitionPattern,(_match,llmsDd,manifestDd,knowledgeDd,factsDd,answersDd)=>
    `<dt><strong>Machine discovery guide</strong></dt>${llmsDd}`+
    `<dt><strong>Artifact integrity manifest</strong></dt>${manifestDd}`+
    `<dt><strong>Hierarchical semantic projection</strong></dt>${knowledgeDd}`+
    `<dt><strong>Flat entity-fact distribution</strong></dt>${factsDd}`+
    `<dt><strong>Direct-answer retrieval corpus</strong></dt>${answersDd}`
  );
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
  content=canonicalizeMachineResourceDefinitions(content);
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
  return {content,names,inserted,fullInserted};
}

export const retiredDirectAnswerProjection=retiredProjection;
