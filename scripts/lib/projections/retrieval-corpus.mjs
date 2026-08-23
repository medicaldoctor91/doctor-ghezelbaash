import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {sha256,valueText} from '../projection-context.mjs';

const entityMap={'amp':'&','lt':'<','gt':'>','quot':'"','apos':"'",'#39':"'",'nbsp':' ','zwnj':'‌'};
const decode=value=>String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(match,key)=>{
  if(key[0]==='#'){
    const number=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
    return Number.isFinite(number)?String.fromCodePoint(number):match;
  }
  return entityMap[key.toLowerCase()]??match;
});
const strip=value=>decode(String(value).replace(/<!--[^]*?-->/g,' ').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,'\n').trim();
const inline=value=>{
  let source=String(value);
  source=source.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,(_,href,text)=>`[${strip(text)}](${decode(href)})`);
  source=source.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi,'**$2**').replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi,'*$2*').replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi,'`$1`');
  return decode(source.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,'\n').trim();
};
const sentenceChunks=(text,max)=>{
  const units=String(text).split(/(?<=[.!؟!?])\s+|\n+/u).map(value=>value.trim()).filter(Boolean);
  const out=[];
  let buffer='';
  for(const unitSource of units){
    const unit=unitSource;
    if(unit.length>max){
      if(buffer){out.push(buffer);buffer='';}
      for(let index=0;index<unit.length;index+=max)out.push(unit.slice(index,index+max));
      continue;
    }
    const candidate=buffer?`${buffer} ${unit}`:unit;
    if(candidate.length>max){if(buffer)out.push(buffer);buffer=unit;}else buffer=candidate;
  }
  if(buffer)out.push(buffer);
  return out;
};

const bindLlmsTemplate=(template,bindings)=>{
  const tokenPattern=/{{[A-Z0-9_]+}}/g;
  const known=new Set(Object.keys(bindings));
  const seen=new Set(template.match(tokenPattern)||[]);
  for(const token of seen)if(!known.has(token))throw new Error(`llms.txt: unknown template token ${token}`);
  const output=String(template).replace(tokenPattern,token=>String(bindings[token]));
  const unresolved=output.match(tokenPattern)||[];
  if(unresolved.length)throw new Error(`llms.txt: unresolved template token ${[...new Set(unresolved)].join(', ')}`);
  return output;
};

export async function compileRetrievalCorpus(context,{answerRecords}={}){
  const {root,data,projections,release,invariants,graph,byId,graphByUrl,evidenceRegistry,evidenceSnapshot,evidenceByUrl,tierAEvidenceIds,evidenceRefsForNode,identityFingerprintSha256}=context;
  if(!Array.isArray(answerRecords))throw new Error('Retrieval compiler requires answerRecords[] from semantic compiler');

  const home=await readFile(path.join(root,'src/content/home.md'),'utf8');
  const body=home.replace(/^---[\s\S]*?---\s*/,'').replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ');
  const blocks=[];
  const blockPattern=/<(h[1-6]|p|li|figcaption|summary|dt|dd)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while((match=blockPattern.exec(body))){
    const tag=match[1].toLowerCase(),attrs=match[2],text=inline(match[3]);
    if(!text)continue;
    const id=(attrs.match(/\bid=["']([^"']+)["']/i)||[])[1]||'';
    const retrievalAlias=decode((attrs.match(/\bdata-retrieval-alias=["']([^"']+)["']/i)||[])[1]||'');
    blocks.push({index:match.index,tag,id,text,retrievalAlias});
  }
  blocks.sort((left,right)=>left.index-right.index);

  let markdown=`# دکتر سعید قزلباش | پزشک زیبایی در کرمانشاه\n\n> Canonical human source: ${release.canonicalUrl}\n> Primary entity: ${release.primaryEntity.id} | Google KG ${release.primaryEntity.googleKnowledgeGraphId} | Wikidata ${release.primaryEntity.wikidata}\n> Release: ${release.release} | Reviewed: ${release.medicalReviewedAt}\n\n`;
  for(const block of blocks){
    if(/^h[1-6]$/.test(block.tag)){
      const level=Number(block.tag[1]);
      markdown+=`${'#'.repeat(level)} ${block.text}\n${block.id?`<!-- anchor: ${release.canonicalUrl}#${block.id} -->\n`:''}${block.retrievalAlias?`<!-- retrieval-alias: ${block.retrievalAlias} -->\n`:''}\n`;
    }else if(block.tag==='li')markdown+=`- ${block.text}\n`;
    else if(block.tag==='dt'||block.tag==='summary')markdown+=`**${block.text}**\n\n`;
    else markdown+=`${block.text}\n\n`;
  }
  markdown=markdown.replace(/\n{3,}/g,'\n\n');
  await writeFile(path.join(projections,'index.md'),markdown);

  const sections=[];
  let current={level:1,title:'دکتر سعید قزلباش | پزشک زیبایی در کرمانشاه',id:'saeed-ghezelbash',retrievalAlias:'',parts:[]};
  const flush=()=>{if(current.parts.length||current.title)sections.push(current);};
  for(const block of blocks){
    if(/^h[1-4]$/.test(block.tag)){
      flush();
      current={level:Number(block.tag[1]),title:block.text,id:block.id||'',retrievalAlias:block.retrievalAlias||'',parts:[]};
    }else if(['p','li','figcaption','summary','dd'].includes(block.tag))current.parts.push(block.text);
  }
  flush();

  const maxPassage=Number(invariants.maxRagPassageChars||4200);
  const emitted=[];
  for(const section of sections){
    const joined=section.parts.join('\n').replace(/\n{3,}/g,'\n\n').trim();
    if(!joined)continue;
    const chunks=sentenceChunks(joined,maxPassage);
    chunks.forEach((text,index)=>{
      const anchor=section.id?`${release.canonicalUrl}#${section.id}`:release.canonicalUrl;
      const hash=sha256(Buffer.from(`${anchor}|${index}|${text}`)).slice(0,16);
      const lang=/-ckb-iq(?:$|-)/i.test(section.id)?'ckb-IQ':/(?:^|-)(?:en|english)(?:$|-)/i.test(section.id)?'en':'fa-IR';
      const entityIds=[release.primaryEntity.id];
      if(/کلینیک|clinic|کلینیکەکە/i.test(text))entityIds.push(release.clinic.id);
      const graphNode=graphByUrl.get(anchor)||byId.get(anchor);
      const inlineEvidenceIds=[...evidenceByUrl].filter(([url])=>text.includes(url)).map(([,id])=>id);
      const claimEvidenceIds=[...new Set([...(graphNode?.['@id']===release.primaryEntity.id||graphNode?.['@id']===release.clinic.id?[]:evidenceRefsForNode(graphNode)),...inlineEvidenceIds])];
      const entityEvidenceIds=[...new Set(entityIds.flatMap(id=>evidenceRefsForNode(byId.get(id))))];
      const evidenceIds=[...new Set([...claimEvidenceIds,...entityEvidenceIds])];
      const tierA=evidenceIds.filter(id=>tierAEvidenceIds.has(id));
      emitted.push({...section,text,anchor,part:index+1,partsTotal:chunks.length,hash,lang,entityIds,graphNodeId:graphNode?.['@id']||'',evidenceIds,claimEvidenceIds,entityEvidenceIds,tierAEvidenceIds:tierA});
    });
  }

  let full=`# ENTITY\nNAME: Saeed Ghezelbash\nPERSIAN_NAME: سعید قزلباش\nENTITY_ID: ${release.primaryEntity.id}\nGOOGLE_KG: ${release.primaryEntity.googleKnowledgeGraphId}\nWIKIDATA: ${release.primaryEntity.wikidata}\nOWNED_CLINIC: ${release.clinic.id}\nCLINIC_KG: ${release.clinic.googleLocalKgmid}\nPLACE_ID: ${release.clinic.placeId}\nCID: ${release.clinic.cid}\nPOSTAL_CODE: ${release.clinic.postalCode}\nHOURS: ${release.clinic.hours}\nPRICE_RANGE: ${release.clinic.priceRange}\nCANONICAL: ${release.canonicalUrl}\nRELEASE: ${release.release}\nREVIEWED: ${release.dateModified}\nIDENTITY_FINGERPRINT_SHA256: ${identityFingerprintSha256}\nPASSAGE_COUNT: ${emitted.length}\n\n`;
  for(const passage of emitted){
    full+=`[PASSAGE]\nPASSAGE_ID: ${passage.hash}\nLEVEL: H${passage.level}\nTITLE: ${passage.title}\nANCHOR: ${passage.anchor}\nGRAPH_NODE_ID: ${passage.graphNodeId}\nPART: ${passage.part}/${passage.partsTotal}\nLANGUAGE: ${passage.lang}\nENTITY_IDS: ${passage.entityIds.join(' | ')}\nSOURCE_HASH_SHA256: ${sha256(Buffer.from(passage.text))}\nEVIDENCE_IDS: ${passage.evidenceIds.join(' | ')}\nCLAIM_EVIDENCE_IDS: ${passage.claimEvidenceIds.join(' | ')}\nENTITY_EVIDENCE_IDS: ${passage.entityEvidenceIds.join(' | ')}\nTIER_A_EVIDENCE_IDS: ${passage.tierAEvidenceIds.join(' | ')}\nPROVENANCE_CLASS: first-party physician-reviewed canonical content\nPROVENANCE: ${release.canonicalUrl} visible canonical HTML\nREVIEWED_BY: ${release.reviewedBy}\nREVIEWED_AT: ${release.medicalReviewedAt}\n${passage.retrievalAlias?`RETRIEVAL_ALIASES: ${passage.retrievalAlias}\n`:''}TEXT:\n${passage.text}\n[/PASSAGE]\n\n`;
  }
  await writeFile(path.join(projections,'llms-full.txt'),full);

  const provenanceGraph=[{
    '@id':`${release.canonicalUrl}provenance.jsonld#dataset`,
    '@type':['Dataset','prov:Entity'],
    name:'Saeed Ghezelbash claim and passage provenance graph',
    creator:{'@id':release.primaryEntity.id},publisher:{'@id':release.primaryEntity.id},
    about:[{'@id':release.primaryEntity.id},{'@id':release.clinic.id}],
    version:release.release,dateModified:release.dateModified,
    isBasedOn:{'@id':`${release.canonicalUrl}graph.jsonld#dataset`},
    identifier:{'@type':'PropertyValue',propertyID:'Primary entity identity fingerprint SHA-256',value:identityFingerprintSha256},
  }];
  for(const evidence of evidenceRegistry.evidence||[]){
    provenanceGraph.push({
      '@id':evidence.id,'@type':['CreativeWork','prov:Entity'],name:evidence.label||evidence.id,url:evidence.url,
      additionalType:`EvidenceTier${evidence.tier}`,identifier:{'@type':'PropertyValue',propertyID:'Evidence tier',value:evidence.tier},
      dateModified:evidenceRegistry.verifiedAt,keywords:evidence.supports||[],
      additionalProperty:[{'@type':'PropertyValue',propertyID:'Evidence supports',value:(evidence.supports||[]).join(' | ')}],
      about:[{'@id':(evidence.supports||[]).some(value=>/clinic|place-id|cid|rating|review-count|opening-hours|local-identity|local-corroboration/.test(value))?release.clinic.id:release.primaryEntity.id}],
    });
  }
  for(const passage of emitted){
    provenanceGraph.push({
      '@id':`${release.canonicalUrl}provenance.jsonld#passage-${passage.hash}`,'@type':['CreativeWork','prov:Entity'],name:`Passage provenance — ${passage.title}`,
      url:passage.anchor,inLanguage:passage.lang,about:passage.entityIds.map(id=>({'@id':id})),isPartOf:{'@id':`${release.canonicalUrl}provenance.jsonld#dataset`},
      identifier:{'@type':'PropertyValue',propertyID:'SHA-256',value:sha256(Buffer.from(passage.text))},
      ...(passage.graphNodeId?{isBasedOn:{'@id':passage.graphNodeId}}:{}),'prov:wasDerivedFrom':[{'@id':passage.anchor}],
      ...(passage.claimEvidenceIds.length?{'prov:hadPrimarySource':passage.claimEvidenceIds.map(id=>({'@id':id}))}:{}),
      additionalProperty:[{'@type':'PropertyValue',propertyID:'Entity evidence IDs',value:passage.entityEvidenceIds.join(' | ')}],dateModified:release.dateModified,
    });
  }
  for(const {q,a,sourceUrl,claimEvidenceIds,entityEvidenceIds,sourceHash,executiveSummaryHash} of answerRecords){
    provenanceGraph.push({
      '@id':`${release.canonicalUrl}provenance.jsonld#answer-${sourceHash.slice(0,16)}`,'@type':['CreativeWork','prov:Entity'],name:`Answer provenance — ${valueText(q.name)}`,
      url:sourceUrl,about:[q.about].flat().filter(Boolean),isPartOf:{'@id':`${release.canonicalUrl}provenance.jsonld#dataset`},isBasedOn:{'@id':a['@id']},
      identifier:{'@type':'PropertyValue',propertyID:'SHA-256',value:sourceHash},'prov:wasDerivedFrom':[{'@id':sourceUrl}],
      ...(claimEvidenceIds.length?{'prov:hadPrimarySource':claimEvidenceIds.map(id=>({'@id':id}))}:{}),
      additionalProperty:[{'@type':'PropertyValue',propertyID:'Entity evidence IDs',value:entityEvidenceIds.join(' | ')},...(executiveSummaryHash?[{'@type':'PropertyValue',propertyID:'Executive summary SHA-256',value:executiveSummaryHash}]:[])],dateModified:release.dateModified,
    });
  }
  await writeFile(path.join(projections,'provenance.jsonld'),`${JSON.stringify({'@context':graph['@context'],'@graph':provenanceGraph})}\n`);
  await writeFile(path.join(projections,'evidence-snapshot.json'),`${JSON.stringify(evidenceSnapshot,null,2)}\n`);

  const template=await readFile(path.join(data,'templates/llms.template.txt'),'utf8');
  const tiers=evidenceRegistry.tiers||{};
  for(const tier of ['A','B','C'])if(typeof tiers[tier]!=='string'||!tiers[tier])throw new Error(`llms.txt: evidence tier ${tier} definition missing from evidence registry`);
  const evidenceTierLine=`- Evidence tiers: Tier A = ${tiers.A}; Tier B = ${tiers.B}; Tier C = ${tiers.C}.`;
  const llms=bindLlmsTemplate(template,{
    '{{RELEASE}}':release.release,
    '{{REVIEW_DATE}}':release.dateModified,
    '{{OFFICIAL_ALIASES}}':release.primaryEntity.officialAliases.join(' | '),
    '{{RECONCILIATION_ALIASES}}':(release.primaryEntity.reconciliationAliases||[]).join(' | '),
    '{{RETRIEVAL_VARIANTS}}':release.primaryEntity.retrievalVariants.join(' | '),
    '{{ZENODO_CONCEPT_DOI}}':release.dataset.zenodo.conceptDoi,
    '{{ZENODO_CONCEPT_DOI_URL}}':`https://doi.org/${release.dataset.zenodo.conceptDoi}`,
    '{{ZENODO_VERSION_DOI}}':release.dataset.zenodo.versionDoi,
    '{{ZENODO_VERSION_DOI_URL}}':`https://doi.org/${release.dataset.zenodo.versionDoi}`,
    '{{ZENODO_RECORD_ID}}':String(release.dataset.zenodo.recordId),
    '{{DATASET_WIKIDATA}}':release.dataset.wikidata,
    '{{HUGGING_FACE_DATASET}}':release.dataset.huggingFace.dataset,
    '{{EVIDENCE_TIER_LINE}}':evidenceTierLine,
  });
  await writeFile(path.join(projections,'llms.txt'),llms);

  return {markdownBytes:Buffer.byteLength(markdown),passages:emitted.length,maxPassageChars:Math.max(...emitted.map(item=>item.text.length),0)};
}
