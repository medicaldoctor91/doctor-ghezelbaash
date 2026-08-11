import body from '../data/projections/knowledge.xml?raw';
import graphRaw from '../data/semantic/knowledge-graph.jsonld?raw';
import evidenceRaw from '../data/evidence-registry.json?raw';
import llmsRaw from '../data/projections/llms.txt?raw';
import { staticResponse } from '../lib/static-endpoint';

export const prerender=true;

type JsonNode=Record<string,any>;
const graph=JSON.parse(graphRaw) as {'@graph'?:JsonNode[]};
const evidenceRegistry=JSON.parse(evidenceRaw) as {tiers?:Record<string,string>;evidence?:JsonNode[]};
const nodes=Array.isArray(graph['@graph'])?graph['@graph']:[];
const types=(node:JsonNode)=>Array.isArray(node?.['@type'])?node['@type']:[node?.['@type']].filter(Boolean);
const refId=(value:any)=>value&&typeof value==='object'&&typeof value['@id']==='string'?value['@id']:'';
const text=(value:any):string=>{
  if(value==null)return'';
  if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return String(value);
  if(Array.isArray(value))return value.map(text).filter(Boolean).join(' | ');
  if(typeof value==='object'){
    if(value['@value']!=null)return String(value['@value']);
    if(typeof value['@id']==='string')return value['@id'];
  }
  return'';
};
const xml=(value:any)=>String(value??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&apos;');

function canonicalIntentClusters(){
  const marker='## Canonical search-intent clusters';
  const start=llmsRaw.indexOf(marker);
  if(start<0)throw new Error('knowledge.xml: canonical intent-cluster section missing from generated llms.txt');
  const rest=llmsRaw.slice(start+marker.length);
  const next=rest.search(/\n##\s+/);
  const section=next>=0?rest.slice(0,next):rest;
  const intents=[...section.matchAll(/^- \[([^\]]+)\]\((https:\/\/www\.ghezelbaash\.ir\/#([^)]+))\)\s*$/gm)]
    .map(match=>({label:match[1],url:match[2],anchor:match[3]}));
  if(!intents.length)throw new Error('knowledge.xml: no canonical intent clusters were parsed');
  return `  <intentClusters count="${intents.length}">${intents.map(item=>`<intent id="${xml(item.anchor)}" url="${xml(item.url)}"><label>${xml(item.label)}</label></intent>`).join('')}</intentClusters>`;
}

function canonicalEvidence(){
  const tiers=evidenceRegistry.tiers||{};
  for(const tier of ['A','B','C'])if(typeof tiers[tier]!=='string'||!tiers[tier])throw new Error(`knowledge.xml: evidence tier ${tier} definition missing`);
  const evidence=Array.isArray(evidenceRegistry.evidence)?evidenceRegistry.evidence:[];
  if(!evidence.length)throw new Error('knowledge.xml: evidence registry is empty');
  const tierXml=['A','B','C'].map(tier=>`<tier id="${tier}">${xml(tiers[tier])}</tier>`).join('');
  const itemXml=evidence.map(item=>{
    const supports=Array.isArray(item.supports)?item.supports.map(text).filter(Boolean):[];
    return `<item id="${xml(item.id)}" tier="${xml(item.tier)}" url="${xml(item.url)}" liveStatus="${xml(item.liveStatus)}" verifiedAt="${xml(item.verifiedAt)}">${supports.map(value=>`<supports>${xml(value)}</supports>`).join('')}</item>`;
  }).join('');
  return `  <evidence count="${evidence.length}"><tiers>${tierXml}</tiers>${itemXml}</evidence>`;
}

function canonicalMediaInventory(){
  const videos=nodes.filter(node=>types(node).includes('VideoObject'));
  const images=nodes.filter(node=>types(node).includes('ImageObject'));
  const videoXml=videos.map(video=>{
    const clips=(Array.isArray(video.hasPart)?video.hasPart:[video.hasPart]).map(refId).filter(Boolean);
    return `<video id="${xml(video['@id'])}" contentUrl="${xml(text(video.contentUrl||video.url))}" duration="${xml(text(video.duration))}" language="${xml(text(video.inLanguage))}"><name>${xml(text(video.name))}</name>${clips.map(id=>`<clip ref="${xml(id)}"/>`).join('')}</video>`;
  }).join('');
  const imageXml=images.map(image=>`<image id="${xml(image['@id'])}" contentUrl="${xml(text(image.contentUrl||image.url))}" encodingFormat="${xml(text(image.encodingFormat))}"><name>${xml(text(image.name))}</name></image>`).join('');
  return `  <mediaInventory videoCount="${videos.length}" imageCount="${images.length}">${videoXml}${imageXml}</mediaInventory>`;
}

function canonicalAnswerResources(){
  const questions=nodes.filter(node=>types(node).includes('Question'));
  if(!questions.length)throw new Error('knowledge.xml: canonical graph contains no Question nodes');
  const units=questions.map(question=>`<unit questionRef="${xml(question['@id'])}" answerRef="${xml(refId(question.acceptedAnswer))}" source="${xml(text(question.url||question['@id']))}"/>`).join('');
  return `  <answerResources count="${questions.length}" corpus="https://www.ghezelbaash.ir/answers.txt">${units}</answerResources>`;
}

function expandKnowledgeXml(){
  if(!body.includes('</knowledge>'))throw new Error('knowledge.xml: generated projection lacks closing knowledge element');
  const additions:string[]=[];
  if(!/<intentClusters\b/.test(body))additions.push(canonicalIntentClusters());
  if(!/<evidence\b/.test(body))additions.push(canonicalEvidence());
  if(!/<mediaInventory\b/.test(body))additions.push(canonicalMediaInventory());
  if(!/<answerResources\b/.test(body))additions.push(canonicalAnswerResources());
  return additions.length?body.replace('</knowledge>',`${additions.join('\n')}\n</knowledge>`):body;
}

const expandedBody=expandKnowledgeXml();
export function GET(){return staticResponse(expandedBody,'application/xml; charset=utf-8');}
