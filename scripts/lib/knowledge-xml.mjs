const asArray=value=>Array.isArray(value)?value:[value].filter(Boolean);
const types=node=>Array.isArray(node?.['@type'])?node['@type']:[node?.['@type']].filter(Boolean);
const refId=value=>value&&typeof value==='object'&&typeof value['@id']==='string'?value['@id']:'';
const text=value=>{
  if(value==null)return'';
  if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return String(value);
  if(Array.isArray(value))return value.map(text).filter(Boolean).join(' | ');
  if(typeof value==='object'){
    if(value['@value']!=null)return String(value['@value']);
    if(typeof value['@id']==='string')return value['@id'];
  }
  return'';
};
const xml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const xmlRich=value=>xml(value).replaceAll("'",'&apos;');

function intentClusters(intentGuideText){
  const marker='## Canonical search-intent clusters';
  const start=intentGuideText.indexOf(marker);
  if(start<0)throw new Error('knowledge.xml intent-cluster source missing');
  const rest=intentGuideText.slice(start+marker.length),next=rest.search(/\n##\s+/),section=next>=0?rest.slice(0,next):rest;
  const intents=[...section.matchAll(/^- \[([^\]]+)\]\((https:\/\/www\.ghezelbaash\.ir\/#([^)]+))\)\s*$/gm)].map(match=>({label:match[1],url:match[2],anchor:match[3]}));
  if(!intents.length)throw new Error('knowledge.xml contains no canonical intent clusters');
  return `  <intentClusters count="${intents.length}">${intents.map(item=>`<intent id="${xmlRich(item.anchor)}" url="${xmlRich(item.url)}"><label>${xmlRich(item.label)}</label></intent>`).join('')}</intentClusters>`;
}

function evidenceLayer(evidenceRegistry){
  const tiers=evidenceRegistry.tiers||{};
  for(const tier of ['A','B','C'])if(typeof tiers[tier]!=='string'||!tiers[tier])throw new Error(`knowledge.xml evidence tier ${tier} definition missing`);
  const evidence=Array.isArray(evidenceRegistry.evidence)?evidenceRegistry.evidence:[];
  if(!evidence.length)throw new Error('knowledge.xml evidence registry is empty');
  const tierXml=['A','B','C'].map(tier=>`<tier id="${tier}">${xmlRich(tiers[tier])}</tier>`).join('');
  const itemXml=evidence.map(item=>{
    const supports=asArray(item.supports).map(text).filter(Boolean);
    return `<item id="${xmlRich(item.id)}" tier="${xmlRich(item.tier)}" url="${xmlRich(item.url)}" liveStatus="${xmlRich(item.liveStatus)}" verifiedAt="${xmlRich(item.verifiedAt)}">${supports.map(value=>`<supports>${xmlRich(value)}</supports>`).join('')}</item>`;
  }).join('');
  return `  <evidence count="${evidence.length}"><tiers>${tierXml}</tiers>${itemXml}</evidence>`;
}

function mediaInventory(graph){
  const nodes=graph['@graph']||[],videos=nodes.filter(node=>types(node).includes('VideoObject')),images=nodes.filter(node=>types(node).includes('ImageObject'));
  const videoXml=videos.map(video=>{
    const clips=asArray(video.hasPart).map(refId).filter(Boolean);
    return `<video id="${xmlRich(video['@id'])}" contentUrl="${xmlRich(text(video.contentUrl||video.url))}" duration="${xmlRich(text(video.duration))}" language="${xmlRich(text(video.inLanguage))}"><name>${xmlRich(text(video.name))}</name>${clips.map(id=>`<clip ref="${xmlRich(id)}"/>`).join('')}</video>`;
  }).join('');
  const imageXml=images.map(image=>`<image id="${xmlRich(image['@id'])}" contentUrl="${xmlRich(text(image.contentUrl||image.url))}" encodingFormat="${xmlRich(text(image.encodingFormat))}"><name>${xmlRich(text(image.name))}</name></image>`).join('');
  return `  <mediaInventory videoCount="${videos.length}" imageCount="${images.length}">${videoXml}${imageXml}</mediaInventory>`;
}

function answerResources(graph){
  const questions=(graph['@graph']||[]).filter(node=>types(node).includes('Question'));
  if(!questions.length)throw new Error('knowledge.xml canonical graph contains no Question nodes');
  const units=questions.map(question=>`<unit questionRef="${xmlRich(question['@id'])}" answerRef="${xmlRich(refId(question.acceptedAnswer))}" source="${xmlRich(text(question.url||question['@id']))}"/>`).join('');
  return `  <answerResources count="${questions.length}" corpus="https://www.ghezelbaash.ir/answers.txt">${units}</answerResources>`;
}

export function buildKnowledgeXml({release,graph,evidenceRegistry,intentGuideText}){
  const nodes=graph['@graph']||[],byId=new Map(nodes.filter(node=>node?.['@id']).map(node=>[node['@id'],node]));
  const person=byId.get(release.primaryEntity.id),clinic=byId.get(release.clinic.id),dataset=byId.get(release.dataset.id);
  if(!person||!clinic||!dataset)throw new Error('knowledge.xml canonical Person/Clinic/Dataset topology missing');
  const distributions=nodes.filter(node=>types(node).includes('DataDownload'));
  const questions=nodes.filter(node=>types(node).includes('Question'));
  const aliases=[...release.primaryEntity.officialAliases,...(release.primaryEntity.reconciliationAliases||[])];
  const base=`<?xml version="1.0" encoding="UTF-8"?>\n<knowledge release="${release.release}" modified="${release.dateModified}" canonical="${release.canonicalUrl}">\n  <primaryEntity id="${xml(person['@id'])}" googleKg="${xml(release.primaryEntity.googleKnowledgeGraphId)}" wikidata="${xml(release.primaryEntity.wikidata)}"><name>Saeed Ghezelbash</name>${aliases.map(value=>`<alias>${xml(value)}</alias>`).join('')}</primaryEntity>\n  <ownedClinic id="${xml(clinic['@id'])}" googleLocalKg="${xml(release.clinic.googleLocalKgmid)}" placeId="${xml(release.clinic.placeId)}" cid="${xml(release.clinic.cid)}" postalCode="${xml(release.clinic.postalCode)}"><hours>${xml(release.clinic.hours)}</hours><owner ref="${xml(release.primaryEntity.id)}"/></ownedClinic>\n  <dataset id="${xml(dataset['@id'])}" version="${release.release}" creator="${xml(release.primaryEntity.id)}" publisher="${xml(release.primaryEntity.id)}">${distributions.map(node=>`<distribution id="${xml(node['@id'])}" url="${xml(node.contentUrl||node.url)}" format="${xml(node.encodingFormat)}"/>`).join('')}</dataset>\n  <answers count="${questions.length}">${questions.map(question=>`<question id="${xml(question['@id'])}" url="${xml(question.url||question['@id'])}">${xml(text(question.name))}</question>`).join('')}</answers>\n</knowledge>\n`;
  const additions=[intentClusters(intentGuideText),evidenceLayer(evidenceRegistry),mediaInventory(graph),answerResources(graph)];
  return base.replace('</knowledge>',`${additions.join('\n')}\n</knowledge>`);
}
