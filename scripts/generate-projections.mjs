import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { assembleCanonicalContent } from './lib/assemble-content.mjs';

const root=process.cwd();
const data=path.join(root,'src/data');
const semantic=path.join(data,'semantic');
const projections=path.join(data,'projections');
await mkdir(projections,{recursive:true});
await mkdir(path.join(root,'src/content'),{recursive:true});
const release=JSON.parse(await readFile(path.join(data,'release.json'),'utf8'));
const invariants=JSON.parse(await readFile(path.join(data,'release-invariants.json'),'utf8'));
const evidenceRegistry=JSON.parse(await readFile(path.join(data,'evidence-registry.json'),'utf8'));
const evidenceSnapshot=JSON.parse(await readFile(path.join(data,'evidence-snapshot.json'),'utf8'));
const graph=JSON.parse(await readFile(path.join(semantic,'knowledge-graph.jsonld'),'utf8'));
if(!Array.isArray(graph['@graph'])) throw new Error('Canonical graph lacks @graph');
const byId=new Map(graph['@graph'].filter(n=>n['@id']).map(n=>[n['@id'],n]));
const readIds=async name=>JSON.parse(await readFile(path.join(semantic,`${name}-ids.json`),'utf8'));
const types=n=>Array.isArray(n['@type'])?n['@type']:[n['@type']].filter(Boolean);
const refId=v=>v&&typeof v==='object'&&v['@id']?v['@id']:null;
const refIds=v=>(Array.isArray(v)?v:[v]).map(refId).filter(Boolean);
const evidenceById=new Map((evidenceRegistry.evidence||[]).map(x=>[x.id,x]));
const evidenceByUrl=new Map((evidenceRegistry.evidence||[]).filter(x=>x.url).map(x=>[x.url,x.id]));
const tierAEvidenceIds=new Set((evidenceRegistry.evidence||[]).filter(x=>x.tier==='A').map(x=>x.id));
const refsFromNode=n=>{
  if(!n||typeof n!=='object') return [];
  const found=[];
  const walk=v=>{
    if(Array.isArray(v)) return v.forEach(walk);
    if(v&&typeof v==='object'){
      if(typeof v['@id']==='string') found.push(v['@id']);
      for(const x of Object.values(v)) walk(x);
    }
  };
  walk(n); return [...new Set(found)];
};
const evidenceRefsForNode=n=>[...new Set(refsFromNode(n).map(id=>evidenceById.has(id)?id:evidenceByUrl.get(id)).filter(Boolean))];
const identityFingerprintSha256=createHash('sha256').update(JSON.stringify(release.identityFingerprint)).digest('hex');

// ---- Canonical content assembly: modular source -> one permanent Astro Markdown page.
const assembledCanonical=await assembleCanonicalContent({root,graph});
if(!assembledCanonical.names.length) throw new Error('Canonical modular content source is empty');
await writeFile(path.join(root,'src/content/home.md'),assembledCanonical.content);

// ---- CSS delivery: one canonical source -> critical inline slice + fingerprinted external remainder.
const cssSource=await readFile(path.join(root,'src/styles/global.css'),'utf8');
const cssSplitMarker='/*DIST_CRITICAL_CSS_END*/',cssSplitAt=cssSource.indexOf(cssSplitMarker);
if(cssSplitAt<0) throw new Error('Critical CSS split marker missing');
const externalCss=cssSource.slice(cssSplitAt+cssSplitMarker.length);
if(!externalCss.includes('/*DIST_CHUNK_INTRINSIC_START*/')||!externalCss.includes('/*DIST_CHUNK_INTRINSIC_END*/')) throw new Error('External CSS lost render calibration');
const externalCssHash=createHash('sha256').update(externalCss).digest('hex').slice(0,12);
const cssAssetDir=path.join(root,'public/assets');await mkdir(cssAssetDir,{recursive:true});
for(const name of await readdir(cssAssetDir)) if(/^site\.[0-9a-f]{12}\.css$/.test(name)&&name!==`site.${externalCssHash}.css`) await unlink(path.join(cssAssetDir,name));
await writeFile(path.join(cssAssetDir,`site.${externalCssHash}.css`),externalCss);

// ---- Early Head Graph: property-level projection, not full-node copying.
const headIds=await readIds('head');
const headProfile=JSON.parse(await readFile(path.join(semantic,'head-profile.json'),'utf8'));
function projectNode(node,spec={}){
  if(!spec.include) return structuredClone(node);
  const out={};
  for(const k of spec.include) if(Object.hasOwn(node,k)) out[k]=structuredClone(node[k]);
  for(const [k,allow] of Object.entries(spec.refAllow||{})){
    if(!Object.hasOwn(out,k)) continue;
    const vals=Array.isArray(out[k])?out[k]:[out[k]];
    const filtered=vals.filter(v=>{
      const r=refId(v);
      return r ? allow.includes(r) : true;
    });
    if(!filtered.length) delete out[k];
    else out[k]=Array.isArray(node[k])?filtered:filtered[0];
  }
  for(const [k,allow] of Object.entries(spec.valueAllow||{})){
    if(!Object.hasOwn(out,k)) continue;
    const vals=Array.isArray(out[k])?out[k]:[out[k]];
    const filtered=vals.filter(v=>{
      const literal=v&&typeof v==='object'&&v['@value']!=null?String(v['@value']):typeof v==='string'?v:null;
      return literal===null ? true : allow.includes(literal);
    });
    if(!filtered.length) delete out[k];
    else out[k]=Array.isArray(node[k])?filtered:filtered[0];
  }
  return out;
}
const headNodes=[];
for(const id of headIds){
  const node=byId.get(id); if(!node) throw new Error(`Head selection missing ${id}`);
  headNodes.push(projectNode(node,headProfile.nodes?.[id]));
}
const headDoc={'@context':graph['@context'],'@graph':headNodes};
const headRaw=`${JSON.stringify(headDoc)}\n`;
if(Buffer.byteLength(headRaw)>headProfile.maxBytes) throw new Error(`Head graph ${Buffer.byteLength(headRaw)} exceeds ${headProfile.maxBytes}`);
await writeFile(path.join(semantic,'head-graph.json'),headRaw);

const supportIds=await readIds('support');
const supportProfile=JSON.parse(await readFile(path.join(semantic,'support-profile.json'),'utf8'));
const supportSelected=new Set([...supportIds,...headIds]);
const graphIds=new Set(byId.keys());
const profileFor=n=>supportProfile.idProfiles?.[n['@id']]||types(n).map(x=>supportProfile.typeProfiles?.[x]).find(Boolean)||null;
const pruneInlineRefs=v=>{
  if(Array.isArray(v)) return v.map(pruneInlineRefs).filter(x=>x!==undefined);
  if(v&&typeof v==='object'){
    if(v['@id']&&graphIds.has(v['@id'])&&!supportSelected.has(v['@id'])) return undefined;
    const out={};
    for(const [k,x] of Object.entries(v)){const y=pruneInlineRefs(x);if(y!==undefined&&(!Array.isArray(y)||y.length))out[k]=y;}
    return out;
  }
  return v;
};
const supportNodes=[];
for(const id of supportIds){
  const node=byId.get(id); if(!node) throw new Error(`Support selection missing ${id}`);
  supportNodes.push(supportProfile.mode==='full' ? structuredClone(node) : pruneInlineRefs(projectNode(node,profileFor(node)||{})));
}
const supportRaw=`${JSON.stringify({'@context':graph['@context'],'@graph':supportNodes})}
`;
if(Buffer.byteLength(supportRaw)>supportProfile.maxBytes) throw new Error(`Support graph ${Buffer.byteLength(supportRaw)} exceeds ${supportProfile.maxBytes}`);
await writeFile(path.join(semantic,'support-graph.json'),supportRaw);

// ---- Flat graph projection.
const valueText=v=>{if(v==null)return'';if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')return String(v);if(Array.isArray(v))return v.map(valueText).filter(Boolean).join(' | ');if(v['@value']!=null)return String(v['@value']);if(v['@id'])return v['@id'];return JSON.stringify(v)};
const nodeName=n=>valueText(n?.name).split(' | ')[0];
const escCsv=v=>{const s=String(v??'');return /[",\n\r]/.test(s)?`"${s.replaceAll('"','""')}"`:s};
const rows=[['subject','type','name','predicate','value','object','object_name','language','datatype','provenance','dataset','version','modified']];
const add=(n,p,v)=>{for(const x of (Array.isArray(v)?v:[v])){let literal='',object='',lang='',datatype='';if(x&&typeof x==='object'){if(x['@id'])object=x['@id'];else if(x['@value']!=null){literal=String(x['@value']);lang=x['@language']||'';datatype=x['@type']||''}else literal=JSON.stringify(x)}else literal=String(x??'');rows.push([n['@id']||'',types(n).join('|'),nodeName(n),p,literal,object,nodeName(byId.get(object)),lang,datatype,n['@id']||'',`${release.canonicalUrl}graph.jsonld#dataset`,release.release,release.dateModified]);}};
for(const n of graph['@graph']) for(const [p,v] of Object.entries(n)) if(p!=='@id') add(n,p,v);
await writeFile(path.join(projections,'entity-facts.csv'),rows.map(r=>r.map(escCsv).join(',')).join('\n')+'\n');

// ---- Direct-answer corpus with graph/evidence provenance.
const graphByUrl=new Map(graph['@graph'].filter(n=>typeof n.url==='string').map(n=>[n.url,n]));
const answerRecords=[];
for(const q of graph['@graph'].filter(n=>types(n).includes('Question'))){
  const ref=q.acceptedAnswer?.['@id'],a=ref&&byId.get(ref); if(!a) continue;
  const sourceUrl=q.url||q['@id'];
  const section=graphByUrl.get(sourceUrl);
  const claimEvidenceIds=[...new Set([
    ...evidenceRefsForNode(q),
    ...evidenceRefsForNode(a),
    ...evidenceRefsForNode(section),
  ])];
  const aboutEntityIds=refIds(q.about).filter(id=>id===release.primaryEntity.id||id===release.clinic.id);
  const entityEvidenceIds=[...new Set(aboutEntityIds.flatMap(id=>evidenceRefsForNode(byId.get(id))))];
  const evidenceIds=[...new Set([...claimEvidenceIds,...entityEvidenceIds])];
  const sourceHash=createHash('sha256').update(Buffer.from(valueText(a.text))).digest('hex');
  const executiveSummary=valueText(a.description);
  const executiveSummaryHash=executiveSummary?createHash('sha256').update(Buffer.from(executiveSummary)).digest('hex'):'';
  answerRecords.push({q,a,sourceUrl,evidenceIds,claimEvidenceIds,entityEvidenceIds,sourceHash,executiveSummary,executiveSummaryHash});
}
const answers=answerRecords.map(({q,a,sourceUrl,evidenceIds,claimEvidenceIds,entityEvidenceIds,sourceHash,executiveSummary,executiveSummaryHash})=>`QUESTION_ID: ${q['@id']}
QUESTION: ${valueText(q.name)}
ANSWER_ID: ${a['@id']}
EXECUTIVE_SUMMARY: ${executiveSummary}
EXECUTIVE_SUMMARY_HASH_SHA256: ${executiveSummaryHash}
ANSWER: ${valueText(a.text)}
LANGUAGE: ${a.inLanguage||q.inLanguage||'fa-IR'}
SOURCE: ${sourceUrl}
SOURCE_HASH_SHA256: ${sourceHash}
ABOUT_IDS: ${valueText(q.about)}
EVIDENCE_IDS: ${evidenceIds.join(' | ')}
CLAIM_EVIDENCE_IDS: ${claimEvidenceIds.join(' | ')}
ENTITY_EVIDENCE_IDS: ${entityEvidenceIds.join(' | ')}
PROVENANCE_CLASS: first-party physician-reviewed canonical guidance
REVIEWED_BY: ${release.reviewedBy}
REVIEWED_AT: ${release.dateModified}
VERSION: ${release.release}
`);
await writeFile(path.join(projections,'answers.txt'),`# Direct-answer corpus — Dr. Saeed Ghezelbash
# Release ${release.release}; reviewed ${release.dateModified}; provenance-rich canonical answer records

${answers.join('\n---\n\n')}`);

// ---- Hierarchical XML projection.
const xml=e=>String(e??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const person=byId.get(release.primaryEntity.id),clinic=byId.get(release.clinic.id),dataset=byId.get(`${release.canonicalUrl}graph.jsonld#dataset`);
const distributions=graph['@graph'].filter(n=>types(n).includes('DataDownload'));
const qas=graph['@graph'].filter(n=>types(n).includes('Question'));
const allAliases=[...release.primaryEntity.officialAliases,...(release.primaryEntity.reconciliationAliases||[])];
const knowledge=`<?xml version="1.0" encoding="UTF-8"?>\n<knowledge release="${release.release}" modified="${release.dateModified}" canonical="${release.canonicalUrl}">\n  <primaryEntity id="${xml(person?.['@id'])}" googleKg="${xml(release.primaryEntity.googleKnowledgeGraphId)}" wikidata="${xml(release.primaryEntity.wikidata)}"><name>Saeed Ghezelbash</name>${allAliases.map(x=>`<alias>${xml(x)}</alias>`).join('')}</primaryEntity>\n  <ownedClinic id="${xml(clinic?.['@id'])}" googleLocalKg="${xml(release.clinic.googleLocalKgmid)}" placeId="${xml(release.clinic.placeId)}" cid="${xml(release.clinic.cid)}" postalCode="${xml(release.clinic.postalCode)}"><hours>${xml(release.clinic.hours)}</hours><owner ref="${xml(release.primaryEntity.id)}"/></ownedClinic>\n  <dataset id="${xml(dataset?.['@id'])}" version="${release.release}" creator="${xml(release.primaryEntity.id)}" publisher="${xml(release.primaryEntity.id)}">${distributions.map(n=>`<distribution id="${xml(n['@id'])}" url="${xml(n.contentUrl||n.url)}" format="${xml(n.encodingFormat)}"/>`).join('')}</dataset>\n  <answers count="${qas.length}">${qas.map(q=>`<question id="${xml(q['@id'])}" url="${xml(q.url||q['@id'])}">${xml(valueText(q.name))}</question>`).join('')}</answers>\n</knowledge>\n`;
await writeFile(path.join(projections,'knowledge.xml'),knowledge);

// ---- True semantic Markdown and passage-oriented LLM projection.
const home=await readFile(path.join(root,'src/content/home.md'),'utf8');
const body=home.replace(/^---[\s\S]*?---\s*/,'').replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ');
const entities={'amp':'&','lt':'<','gt':'>','quot':'"','apos':"'",'#39':"'",'nbsp':' ','zwnj':'‌'};
const decode=s=>String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,k)=>{if(k[0]==='#'){const n=k[1].toLowerCase()==='x'?parseInt(k.slice(2),16):parseInt(k.slice(1),10);return Number.isFinite(n)?String.fromCodePoint(n):m;}return entities[k.toLowerCase()]??m;});
const strip=s=>decode(String(s).replace(/<!--[^]*?-->/g,' ').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,'\n').trim();
const inline=s=>{
  let x=String(s);
  x=x.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,(_,href,text)=>`[${strip(text)}](${decode(href)})`);
  x=x.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi,'**$2**').replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi,'*$2*').replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi,'`$1`');
  return decode(x.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,'\n').trim();
};
const blocks=[];
const re=/<(h[1-6]|p|li|figcaption|summary|dt|dd)\b([^>]*)>([\s\S]*?)<\/\1>/gi; let m;
while((m=re.exec(body))){
  const tag=m[1].toLowerCase(),attrs=m[2],text=inline(m[3]); if(!text) continue;
  const id=(attrs.match(/\bid=["']([^"']+)["']/i)||[])[1]||'';
  const retrievalAlias=decode((attrs.match(/\bdata-retrieval-alias=["']([^"']+)["']/i)||[])[1]||'');
  blocks.push({index:m.index,tag,id,text,retrievalAlias});
}
blocks.sort((a,b)=>a.index-b.index);
let md=`# دکتر سعید قزلباش | پزشک زیبایی در کرمانشاه\n\n> Canonical human source: ${release.canonicalUrl}\n> Primary entity: ${release.primaryEntity.id} | Google KG ${release.primaryEntity.googleKnowledgeGraphId} | Wikidata ${release.primaryEntity.wikidata}\n> Release: ${release.release} | Reviewed: ${release.dateModified}\n\n`;
for(const b of blocks){
  if(/^h[1-6]$/.test(b.tag)){
    const level=Number(b.tag[1]); md+=`${'#'.repeat(level)} ${b.text}\n${b.id?`<!-- anchor: ${release.canonicalUrl}#${b.id} -->\n`:''}${b.retrievalAlias?`<!-- retrieval-alias: ${b.retrievalAlias} -->\n`:''}\n`;
  }else if(b.tag==='li') md+=`- ${b.text}\n`;
  else if(b.tag==='dt') md+=`**${b.text}**\n\n`;
  else if(b.tag==='summary') md+=`**${b.text}**\n\n`;
  else md+=`${b.text}\n\n`;
}
await writeFile(path.join(projections,'index.md'),md.replace(/\n{3,}/g,'\n\n'));

const sections=[]; let current={level:1,title:'دکتر سعید قزلباش | پزشک زیبایی در کرمانشاه',id:'saeed-ghezelbash',retrievalAlias:'',parts:[]};
const flush=()=>{if(current.parts.length||current.title) sections.push(current);};
for(const b of blocks){
  if(/^h[1-4]$/.test(b.tag)){flush();current={level:Number(b.tag[1]),title:b.text,id:b.id||'',retrievalAlias:b.retrievalAlias||'',parts:[]};}
  else if(['p','li','figcaption','summary','dd'].includes(b.tag)) current.parts.push(b.text);
}
flush();
const sentenceChunks=(text,max)=>{
  const units=String(text).split(/(?<=[.!؟!?])\s+|\n+/u).map(x=>x.trim()).filter(Boolean),out=[];let buf='';
  for(const u0 of units){
    let u=u0;
    if(u.length>max){if(buf){out.push(buf);buf='';}for(let i=0;i<u.length;i+=max)out.push(u.slice(i,i+max));continue;}
    const candidate=buf?`${buf} ${u}`:u;
    if(candidate.length>max){if(buf)out.push(buf);buf=u}else buf=candidate;
  }
  if(buf)out.push(buf);return out;
};
const maxPassage=Number(invariants.maxRagPassageChars||4200),emitted=[];
for(const s of sections){
  const joined=s.parts.join('\n').replace(/\n{3,}/g,'\n\n').trim();if(!joined)continue;
  const chunks=sentenceChunks(joined,maxPassage);
  chunks.forEach((text,i)=>{
    const anchor=s.id?`${release.canonicalUrl}#${s.id}`:release.canonicalUrl;
    const hash=createHash('sha256').update(`${anchor}|${i}|${text}`).digest('hex').slice(0,16);
    const lang=/-ckb-iq(?:$|-)/i.test(s.id)?'ckb-IQ':/(?:^|-)(?:en|english)(?:$|-)/i.test(s.id)?'en':'fa-IR';
    const entityIds=[release.primaryEntity.id];if(/کلینیک|clinic|کلینیکەکە/i.test(text))entityIds.push(release.clinic.id);
    const graphNode=graphByUrl.get(anchor)||byId.get(anchor);
    const inlineEvidenceIds=[...evidenceByUrl].filter(([url])=>text.includes(url)).map(([,id])=>id);
    const claimEvidenceIds=[...new Set([...(graphNode?.['@id']===release.primaryEntity.id||graphNode?.['@id']===release.clinic.id?[]:evidenceRefsForNode(graphNode)),...inlineEvidenceIds])];
    const entityEvidenceIds=[...new Set(entityIds.flatMap(id=>evidenceRefsForNode(byId.get(id))))];
    const evidenceIds=[...new Set([...claimEvidenceIds,...entityEvidenceIds])];
    const tierA=evidenceIds.filter(x=>tierAEvidenceIds.has(x));
    emitted.push({...s,text,anchor,part:i+1,partsTotal:chunks.length,hash,lang,entityIds,graphNodeId:graphNode?.['@id']||'',evidenceIds,claimEvidenceIds,entityEvidenceIds,tierAEvidenceIds:tierA});
  });
}
let full=`# ENTITY\nNAME: Saeed Ghezelbash\nPERSIAN_NAME: سعید قزلباش\nENTITY_ID: ${release.primaryEntity.id}\nGOOGLE_KG: ${release.primaryEntity.googleKnowledgeGraphId}\nWIKIDATA: ${release.primaryEntity.wikidata}\nOWNED_CLINIC: ${release.clinic.id}\nCLINIC_KG: ${release.clinic.googleLocalKgmid}\nPLACE_ID: ${release.clinic.placeId}\nCID: ${release.clinic.cid}\nPOSTAL_CODE: ${release.clinic.postalCode}\nHOURS: ${release.clinic.hours}\nPRICE_RANGE: ${release.clinic.priceRange}\nCANONICAL: ${release.canonicalUrl}\nRELEASE: ${release.release}\nREVIEWED: ${release.dateModified}\nIDENTITY_FINGERPRINT_SHA256: ${identityFingerprintSha256}\nPASSAGE_COUNT: ${emitted.length}\n\n`;
for(const psg of emitted){
  full+=`[PASSAGE]\nPASSAGE_ID: ${psg.hash}\nLEVEL: H${psg.level}\nTITLE: ${psg.title}\nANCHOR: ${psg.anchor}\nGRAPH_NODE_ID: ${psg.graphNodeId}\nPART: ${psg.part}/${psg.partsTotal}\nLANGUAGE: ${psg.lang}\nENTITY_IDS: ${psg.entityIds.join(' | ')}\nSOURCE_HASH_SHA256: ${createHash('sha256').update(psg.text).digest('hex')}\nEVIDENCE_IDS: ${psg.evidenceIds.join(' | ')}\nCLAIM_EVIDENCE_IDS: ${psg.claimEvidenceIds.join(' | ')}\nENTITY_EVIDENCE_IDS: ${psg.entityEvidenceIds.join(' | ')}\nTIER_A_EVIDENCE_IDS: ${psg.tierAEvidenceIds.join(' | ')}\nPROVENANCE_CLASS: first-party physician-reviewed canonical content\nPROVENANCE: ${release.canonicalUrl} visible canonical HTML\nREVIEWED_BY: ${release.reviewedBy}\nREVIEWED_AT: ${release.dateModified}\n${psg.retrievalAlias?`RETRIEVAL_ALIASES: ${psg.retrievalAlias}\n`:''}TEXT:\n${psg.text}\n[/PASSAGE]\n\n`;
}
await writeFile(path.join(projections,'llms-full.txt'),full);

// ---- Claim/passage provenance graph: external, noindex, machine-readable evidence layer.
const provGraph=[
  {
    '@id':`${release.canonicalUrl}provenance.jsonld#dataset`,
    '@type':['Dataset','prov:Entity'],
    name:'Saeed Ghezelbash claim and passage provenance graph',
    creator:{'@id':release.primaryEntity.id},
    publisher:{'@id':release.primaryEntity.id},
    about:[{'@id':release.primaryEntity.id},{'@id':release.clinic.id}],
    version:release.release,
    dateModified:release.dateModified,
    isBasedOn:{'@id':`${release.canonicalUrl}graph.jsonld#dataset`},
    identifier:{'@type':'PropertyValue',propertyID:'Primary entity identity fingerprint SHA-256',value:identityFingerprintSha256}
  }

];
for(const ev of evidenceRegistry.evidence||[]){
  provGraph.push({
    '@id':ev.id,
    '@type':['CreativeWork','prov:Entity'],
    name:ev.label||ev.id,
    url:ev.url,
    additionalType:`EvidenceTier${ev.tier}`,
    identifier:{'@type':'PropertyValue',propertyID:'Evidence tier',value:ev.tier},
    dateModified:evidenceRegistry.verifiedAt,
    keywords:ev.supports||[],
    additionalProperty:[{'@type':'PropertyValue',propertyID:'Evidence supports',value:(ev.supports||[]).join(' | ')}],
    about:[{'@id':(ev.supports||[]).some(x=>/clinic|place-id|cid|rating|review-count|opening-hours|local-identity|local-corroboration/.test(x))?release.clinic.id:release.primaryEntity.id}]
  });
}
for(const psg of emitted){
  const derived=[{'@id':psg.anchor}];
  provGraph.push({
    '@id':`${release.canonicalUrl}provenance.jsonld#passage-${psg.hash}`,
    '@type':['CreativeWork','prov:Entity'],
    name:`Passage provenance — ${psg.title}`,
    url:psg.anchor,
    inLanguage:psg.lang,
    about:psg.entityIds.map(id=>({'@id':id})),
    isPartOf:{'@id':`${release.canonicalUrl}provenance.jsonld#dataset`},
    identifier:{'@type':'PropertyValue',propertyID:'SHA-256',value:createHash('sha256').update(psg.text).digest('hex')},
    ...(psg.graphNodeId?{isBasedOn:{'@id':psg.graphNodeId}}:{}),
    'prov:wasDerivedFrom':derived,
    ...(psg.claimEvidenceIds.length?{'prov:hadPrimarySource':psg.claimEvidenceIds.map(id=>({'@id':id}))}:{}),
    additionalProperty:[{'@type':'PropertyValue',propertyID:'Entity evidence IDs',value:psg.entityEvidenceIds.join(' | ')}],
    dateModified:release.dateModified
  });
}
for(const {q,a,sourceUrl,claimEvidenceIds,entityEvidenceIds,sourceHash,executiveSummaryHash} of answerRecords){
  provGraph.push({
    '@id':`${release.canonicalUrl}provenance.jsonld#answer-${sourceHash.slice(0,16)}`,
    '@type':['CreativeWork','prov:Entity'],
    name:`Answer provenance — ${valueText(q.name)}`,
    url:sourceUrl,
    about:[q.about].flat().filter(Boolean),
    isPartOf:{'@id':`${release.canonicalUrl}provenance.jsonld#dataset`},
    isBasedOn:{'@id':a['@id']},
    identifier:{'@type':'PropertyValue',propertyID:'SHA-256',value:sourceHash},
    'prov:wasDerivedFrom':[{'@id':sourceUrl}],
    ...(claimEvidenceIds.length?{'prov:hadPrimarySource':claimEvidenceIds.map(id=>({'@id':id}))}:{}),
    additionalProperty:[{'@type':'PropertyValue',propertyID:'Entity evidence IDs',value:entityEvidenceIds.join(' | ')},...(executiveSummaryHash?[{'@type':'PropertyValue',propertyID:'Executive summary SHA-256',value:executiveSummaryHash}]:[])],
    dateModified:release.dateModified
  });
}
const provenanceDoc={'@context':graph['@context'],'@graph':provGraph};
await writeFile(path.join(projections,'provenance.jsonld'),`${JSON.stringify(provenanceDoc)}\n`);
await writeFile(path.join(projections,'evidence-snapshot.json'),`${JSON.stringify(evidenceSnapshot,null,2)}\n`);


// ---- Compact llms.txt with explicit name tiers and retrieval/indexing policy.
const llmsTemplate=await readFile(path.join(data,'templates/llms.template.txt'),'utf8');
const llms=llmsTemplate
  .replaceAll('{{RELEASE}}',release.release)
  .replaceAll('{{REVIEW_DATE}}',release.dateModified)
  .replaceAll('{{OFFICIAL_ALIASES}}',release.primaryEntity.officialAliases.join(' | '))
  .replaceAll('{{RECONCILIATION_ALIASES}}',(release.primaryEntity.reconciliationAliases||[]).join(' | '))
  .replaceAll('{{RETRIEVAL_VARIANTS}}',release.primaryEntity.retrievalVariants.join(' | '))
  .replaceAll('{{ZENODO_CONCEPT_DOI}}',release.dataset.zenodo.conceptDoi)
  .replaceAll('{{ZENODO_CONCEPT_DOI_URL}}',`https://doi.org/${release.dataset.zenodo.conceptDoi}`)
  .replaceAll('{{ZENODO_VERSION_DOI}}',release.dataset.zenodo.versionDoi)
  .replaceAll('{{ZENODO_VERSION_DOI_URL}}',`https://doi.org/${release.dataset.zenodo.versionDoi}`)
  .replaceAll('{{ZENODO_RECORD_ID}}',String(release.dataset.zenodo.recordId))
  .replaceAll('{{DATASET_WIKIDATA}}',release.dataset.wikidata)
  .replaceAll('{{HUGGING_FACE_DATASET}}',release.dataset.huggingFace.dataset);
if(/{{[^}]+}}/.test(llms)) throw new Error('Unresolved llms.txt template placeholder');
await writeFile(path.join(projections,'llms.txt'),llms);


// ---- Generated vCard 4.0 contact projections from canonical release truth.
const vEsc=s=>String(s??'').replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll(';','\\;').replaceAll(',','\\,');
const foldVCard=line=>{const out=[];let buf='';for(const ch of line){const next=buf+ch;if(Buffer.byteLength(next,'utf8')>73){out.push(buf);buf=' '+ch}else buf=next;}if(buf)out.push(buf);return out.join('\r\n');};
const vCard=lines=>lines.map(foldVCard).join('\r\n')+'\r\n';
const addressNode=byId.get(clinic?.address?.['@id']);
const personPortrait=byId.get(`${release.canonicalUrl}#image-saeed-ghezelbash-portrait-master`);
const clinicImages=(Array.isArray(clinic?.image)?clinic.image:[clinic?.image].filter(Boolean)).map(x=>x?.['@id']);
const clinicPhoto=byId.get(clinicImages.find(x=>x&&x!==`${release.canonicalUrl}#image-doctor-ghezelbaash-clinic-logo`));
const rev=`${release.dateModified.replaceAll('-','')}T000000Z`;
const doctorVcf=vCard([
 'BEGIN:VCARD','VERSION:4.0',`PRODID:-//ghezelbaash.ir//Entity Contact Projection ${release.release}//FA`,
 `UID:${release.primaryEntity.id}`,'FN:دکتر سعید قزلباش','N:قزلباش;سعید;;;دکتر','TITLE:پزشک زیبایی',
 `TEL;TYPE=work,voice:${clinic?.telephone||''}`,
 `ADR;TYPE=work:;;${vEsc(addressNode?.streetAddress)};${vEsc(addressNode?.addressLocality)};${vEsc(addressNode?.addressRegion)};${vEsc(addressNode?.postalCode)};${vEsc(addressNode?.addressCountry)}`,
 `URL:${release.canonicalUrl}`,`SOURCE:${release.canonicalUrl}doctor.vcf`,personPortrait?.contentUrl?`PHOTO;MEDIATYPE=image/jpeg:${personPortrait.contentUrl}`:'',
 `X-GOOGLE-KG-ID:${release.primaryEntity.googleKnowledgeGraphId}`,`X-WIKIDATA:${release.primaryEntity.wikidata}`,
 'X-IRIMC:167430','X-ORCID:0009-0001-9346-8475',`X-OWNED-CLINIC:${release.clinic.id}`,
 `X-ENTITY-VERSION:${release.release}`,`REV:${rev}`,'END:VCARD'
].filter(Boolean));
const clinicVcf=vCard([
 'BEGIN:VCARD','VERSION:4.0',`PRODID:-//ghezelbaash.ir//Entity Contact Projection ${release.release}//FA`,
 `UID:${release.clinic.id}`,'FN:کلینیک زیبایی دکتر سعید قزلباش','ORG:کلینیک زیبایی دکتر سعید قزلباش',
 `TEL;TYPE=work,voice:${clinic?.telephone||''}`,
 `ADR;TYPE=work:;;${vEsc(addressNode?.streetAddress)};${vEsc(addressNode?.addressLocality)};${vEsc(addressNode?.addressRegion)};${vEsc(addressNode?.postalCode)};${vEsc(addressNode?.addressCountry)}`,
 `URL:${release.canonicalUrl}`,`SOURCE:${release.canonicalUrl}clinic.vcf`,clinicPhoto?.contentUrl?`PHOTO;MEDIATYPE=image/webp:${clinicPhoto.contentUrl}`:'',
 `X-GOOGLE-KG-ID:${release.clinic.googleLocalKgmid}`,`X-GOOGLE-PLACE-ID:${release.clinic.placeId}`,`X-GOOGLE-MAPS-CID:${release.clinic.cid}`,
 'X-WIKIDATA:Q140288589',`X-OWNER:${release.primaryEntity.id}`,`X-PRICE-RANGE:${release.clinic.priceRange}`,
 `X-HOURS:${release.clinic.hours}`,`X-ENTITY-VERSION:${release.release}`,`REV:${rev}`,'END:VCARD'
].filter(Boolean));
await writeFile(path.join(root,'public/doctor.vcf'),doctorVcf);
await writeFile(path.join(root,'public/clinic.vcf'),clinicVcf);

// ---- XML sitemap: one canonical indexable page; high-value images/videos remain attached to it.
const imgIds=[
  `${release.canonicalUrl}#image-saeed-ghezelbash-portrait`,
  `${release.canonicalUrl}#image-saeed-ghezelbash-clinical-examination`,
  `${release.canonicalUrl}#image-saeed-ghezelbash-clinic-team`,
  `${release.canonicalUrl}#image-ghezelbash-clinic-interior-kermanshah`,
  `${release.canonicalUrl}#image-ghezelbash-clinic-reception-kermanshah`
];
const clinicImageUrls=(Array.isArray(clinic?.image)?clinic.image:[clinic?.image].filter(Boolean)).filter(x=>typeof x==='string' && x.startsWith(release.canonicalUrl));
const imageLocs=[...new Set([...imgIds.map(id=>byId.get(id)?.contentUrl).filter(Boolean),...clinicImageUrls])];
const videos=graph['@graph'].filter(n=>types(n).includes('VideoObject'));
const isoDurationSeconds=v=>{const m=String(v??'').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);if(!m)return null;return Math.round((Number(m[1]||0)*3600)+(Number(m[2]||0)*60)+Number(m[3]||0))};
const xmlEsc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
let sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n  <url>\n    <loc>${release.canonicalUrl}</loc>\n    <lastmod>${release.dateModified}</lastmod>\n`;
for(const u of imageLocs) sitemap+=`    <image:image><image:loc>${xmlEsc(u)}</image:loc></image:image>\n`;
for(const v of videos){
  const thumb=valueText(v.thumbnailUrl||v.thumbnail?.contentUrl||v.thumbnail), content=valueText(v.contentUrl||v.url), title=valueText(v.name), desc=valueText(v.description), date=valueText(v.uploadDate||v.datePublished), duration=isoDurationSeconds(valueText(v.duration));
  sitemap+=`    <video:video><video:thumbnail_loc>${xmlEsc(thumb)}</video:thumbnail_loc><video:title>${xmlEsc(title)}</video:title><video:description>${xmlEsc(desc)}</video:description><video:content_loc>${xmlEsc(content)}</video:content_loc>${date?`<video:publication_date>${xmlEsc(date)}</video:publication_date>`:''}${duration?`<video:duration>${duration}</video:duration>`:''}</video:video>\n`;
}
sitemap+='  </url>\n</urlset>\n';
await writeFile(path.join(projections,'sitemap.xml'),sitemap);

// ---- Source-level linked-data descriptors. Finalization regenerates these from actual DIST bytes,
// but source projections must already carry the current release truth and current resource hashes.
const shaHex=b=>createHash('sha256').update(b).digest('hex');
const ttlString=s=>`"${String(s).replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','\\n')}"`;
const contentTypes={
  'graph.jsonld':'application/ld+json','graph.ttl':'text/turtle','entity-facts.csv':'text/csv','answers.txt':'text/plain','knowledge.xml':'application/xml','llms.txt':'text/plain','index.md':'text/markdown','llms-full.txt':'text/plain','void.ttl':'text/turtle','dcat.ttl':'text/turtle','linkset.json':'application/linkset+json','provenance.jsonld':'application/ld+json','evidence-snapshot.json':'application/json','shapes.ttl':'text/turtle'
};
const resourceTitles={
  'graph.jsonld':'Canonical JSON-LD entity knowledge graph','graph.ttl':'RDF Turtle serialization isomorphic with JSON-LD','entity-facts.csv':'Flat fact projection of canonical graph','answers.txt':'Canonical direct-answer corpus','knowledge.xml':'Hierarchical semantic knowledge projection','llms.txt':'Machine discovery and retrieval guide','index.md':'Full canonical content projection','llms-full.txt':'Passage-oriented full content projection','void.ttl':'VoID RDF dataset description','dcat.ttl':'W3C DCAT 3 catalog and distribution metadata','linkset.json':'RFC 9264 Web Link Set','provenance.jsonld':'Claim and passage provenance graph','evidence-snapshot.json':'Release-time evidence health snapshot','shapes.ttl':'SHACL entity constitution'
};
const projectionAbs=rel=>rel==='graph.jsonld'?path.join(semantic,'knowledge-graph.jsonld'):rel==='graph.ttl'?path.join(semantic,'knowledge-graph.ttl'):rel==='shapes.ttl'?path.join(semantic,'shapes.ttl'):path.join(projections,rel);
const fileMeta=async rel=>{const b=await readFile(projectionAbs(rel));return {rel,bytes:b.length,sha256:shaHex(b),mediaType:contentTypes[rel]||'application/octet-stream',title:resourceTitles[rel]||rel};};
const coreResources=['graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','index.md','llms-full.txt','provenance.jsonld','evidence-snapshot.json','shapes.ttl'];
const datasetName=typeof dataset?.name==='string'?dataset.name:'Dr. Saeed Ghezelbash Public Knowledge Graph';
const datasetDescription=typeof dataset?.description==='string'?dataset.description:'Physician-owned first-party entity and medical knowledge graph for Saeed Ghezelbash.';

const linkset={linkset:[{anchor:release.canonicalUrl,canonical:[{href:release.canonicalUrl}],author:[{href:release.primaryEntity.id}],about:[{href:release.primaryEntity.id},{href:release.clinic.id},{href:`${release.canonicalUrl}#doctor-ghezelbaash-structured-data-project`}],describedby:[
  {href:`${release.canonicalUrl}graph.jsonld`,type:'application/ld+json'},{href:`${release.canonicalUrl}graph.ttl`,type:'text/turtle'},{href:`${release.canonicalUrl}entity-facts.csv`,type:'text/csv'},{href:`${release.canonicalUrl}knowledge.xml`,type:'application/xml'},{href:`${release.canonicalUrl}datapackage.json`,type:'application/json'},{href:`${release.canonicalUrl}void.ttl`,type:'text/turtle'},{href:`${release.canonicalUrl}dcat.ttl`,type:'text/turtle'},{href:`${release.canonicalUrl}croissant.json`,type:'application/ld+json'},{href:`${release.canonicalUrl}provenance.jsonld`,type:'application/ld+json'},{href:`${release.canonicalUrl}evidence-snapshot.json`,type:'application/json'},{href:`${release.canonicalUrl}shapes.ttl`,type:'text/turtle'},{href:`${release.canonicalUrl}artifact-manifest.json`,type:'application/json'}],license:[{href:'https://creativecommons.org/licenses/by/4.0/'}],alternate:[{href:`${release.canonicalUrl}answers.txt`,type:'text/plain'},{href:`${release.canonicalUrl}llms.txt`,type:'text/plain'},{href:`${release.canonicalUrl}index.md`,type:'text/markdown'},{href:`${release.canonicalUrl}llms-full.txt`,type:'text/plain'}],me:[{href:'https://www.wikidata.org/entity/Q140287622'},{href:'https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e'},{href:'https://orcid.org/0009-0001-9346-8475'},{href:'https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/'},{href:'https://openalex.org/A5064828898'},{href:'https://www.semanticscholar.org/author/-/3786699'},{href:'https://scholar.google.com/citations?user=BcWBirUAAAAJ'}]}]};
await writeFile(path.join(projections,'linkset.json'),`${JSON.stringify(linkset,null,2)}\n`);

const voidTtl=`@prefix void: <http://rdfs.org/ns/void#> .\n@prefix dct: <http://purl.org/dc/terms/> .\n@prefix foaf: <http://xmlns.com/foaf/0.1/> .\n@prefix schema: <https://schema.org/> .\n<${release.canonicalUrl}graph.jsonld#dataset> a void:Dataset ;\n  dct:title ${ttlString(datasetName)}@en ;\n  dct:publisher <${release.primaryEntity.id}> ;\n  dct:modified ${ttlString(release.dateModified)} ;\n  dct:license <https://creativecommons.org/licenses/by/4.0/> ;\n  foaf:homepage <${release.canonicalUrl}> ;\n  foaf:primaryTopic <${release.primaryEntity.id}> ;\n  void:uriSpace ${ttlString(release.canonicalUrl)} ;\n  void:triples ${JSON.parse(await readFile(path.join(data,'release-invariants.json'),'utf8')).externalRdfTripleCount} ;\n  void:dataDump <${release.canonicalUrl}graph.jsonld>, <${release.canonicalUrl}graph.ttl>, <${release.canonicalUrl}entity-facts.csv> ;\n  void:vocabulary <https://schema.org/>, <http://purl.org/dc/terms/>, <http://www.w3.org/ns/prov#> .\n<${release.primaryEntity.id}> a foaf:Person ; foaf:name "Saeed Ghezelbash"@en .\n`;
await writeFile(path.join(projections,'void.ttl'),voidTtl);

const dcatMeta=await Promise.all(coreResources.map(fileMeta));
const distributionIris=dcatMeta.map(m=>`<${release.canonicalUrl}${m.rel}#distribution>`).join(', ');
let dcat=`@prefix dcat: <http://www.w3.org/ns/dcat#> .\n@prefix dct: <http://purl.org/dc/terms/> .\n@prefix spdx: <http://spdx.org/rdf/terms#> .\n@prefix schema: <https://schema.org/> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n\n<${release.canonicalUrl}#data-catalog> a dcat:Catalog ; dct:title "Doctor Ghezelbash Structured Data Catalog"@en ; dct:publisher <${release.primaryEntity.id}> ; dct:modified "${release.dateModified}"^^xsd:date ; dcat:dataset <${release.canonicalUrl}graph.jsonld#dataset> .\n<${release.canonicalUrl}graph.jsonld#dataset> a dcat:Dataset ; dct:title ${ttlString(datasetName)}@en ; dct:description ${ttlString(datasetDescription)}@en ; dct:creator <${release.primaryEntity.id}> ; dct:publisher <${release.primaryEntity.id}> ; dct:modified "${release.dateModified}"^^xsd:date ; dct:license <https://creativecommons.org/licenses/by/4.0/> ; dcat:landingPage <${release.canonicalUrl}> ; schema:version "${release.release}" ; dcat:distribution ${distributionIris} .\n\n`;
for(const m of dcatMeta)dcat+=`<${release.canonicalUrl}${m.rel}#distribution> a dcat:Distribution ; dct:title ${ttlString(m.title)}@en ; dct:license <https://creativecommons.org/licenses/by/4.0/> ; dcat:accessURL <${release.canonicalUrl}${m.rel}> ; dcat:downloadURL <${release.canonicalUrl}${m.rel}> ; dcat:mediaType ${ttlString(m.mediaType)} ; dcat:byteSize "${m.bytes}"^^xsd:decimal ; spdx:checksum [ a spdx:Checksum ; spdx:algorithm spdx:checksumAlgorithm_sha256 ; spdx:checksumValue "${m.sha256}" ] .\n\n`;
await writeFile(path.join(projections,'dcat.ttl'),dcat);

const descriptorResources=[...coreResources,'void.ttl','dcat.ttl','linkset.json'];
const descriptorMeta=await Promise.all(descriptorResources.map(fileMeta));
async function walkPublic(dir,prefix=''){let out=[];for(const e of await readdir(dir,{withFileTypes:true})){const abs=path.join(dir,e.name),rel=prefix?`${prefix}/${e.name}`:e.name;if(e.isDirectory())out.push(...await walkPublic(abs,rel));else if(e.isFile())out.push({abs,rel});}return out;}
const vttMeta=[];for(const f of (await walkPublic(path.join(root,'public'))).filter(x=>x.rel.endsWith('.vtt'))){const b=await readFile(f.abs);vttMeta.push({rel:f.rel,bytes:b.length,sha256:shaHex(b),mediaType:'text/vtt',title:'WebVTT chapter track for a self-hosted physician video.'});}
const resources=[...descriptorMeta,...vttMeta];
const slug=s=>s.replace(/\.[^.]+$/,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();
const dataPackage={profile:'data-package',name:'dr-saeed-ghezelbash-entity-data',title:'Dr. Saeed Ghezelbash Entity Knowledge Graph Data Package',description:'Physician-owned first-party entity, clinic, medical-topic, answer and provenance resources for Saeed Ghezelbash. The physician is the primary entity and publisher; the clinic and structured-data project are supporting assets.',homepage:release.canonicalUrl,id:`${release.canonicalUrl}datapackage.json`,version:release.release,created:release.dateModified,lastUpdated:release.dateModified,licenses:[{name:'CC-BY-4.0',path:'https://creativecommons.org/licenses/by/4.0/',title:'Creative Commons Attribution 4.0'}],contributors:[{title:'Saeed Ghezelbash',path:release.primaryEntity.id,role:'author, creator, publisher, owner'}],resources:resources.map(m=>({name:slug(m.rel),path:m.rel,title:m.title,format:m.rel.endsWith('.vtt')?'vtt':undefined,mediatype:m.mediaType,bytes:m.bytes,hash:`sha256:${m.sha256}`,description:m.rel.endsWith('.vtt')?m.title:undefined})).map(o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined)))};
await writeFile(path.join(projections,'datapackage.json'),`${JSON.stringify(dataPackage,null,2)}\n`);
const croissant={'@context':{'@language':'en','@base':release.canonicalUrl,'@vocab':'https://schema.org/','sc':'https://schema.org/','cr':'http://mlcommons.org/croissant/','dct':'http://purl.org/dc/terms/','conformsTo':'dct:conformsTo'},'@id':`${release.canonicalUrl}graph.jsonld#dataset`,'@type':'sc:Dataset',conformsTo:'http://mlcommons.org/croissant/1.1',name:'Dr. Saeed Ghezelbash Entity Knowledge Graph',description:'Physician-owned first-party entity, clinic, medical-topic, answer and provenance dataset for Saeed Ghezelbash. The physician is the primary entity, creator and publisher.',url:release.canonicalUrl,license:'https://creativecommons.org/licenses/by/4.0/',version:release.release,datePublished:'2026-07-25',dateCreated:'2026-07-25',dateModified:release.dateModified,creator:{'@id':release.primaryEntity.id,'@type':'sc:Person',name:'Saeed Ghezelbash'},publisher:{'@id':release.primaryEntity.id,'@type':'sc:Person',name:'Saeed Ghezelbash'},keywords:['Saeed Ghezelbash',...release.primaryEntity.officialAliases.slice(0,2),'physician knowledge graph','aesthetic medicine','Kermanshah','entity data','linked data'],inLanguage:['fa','en','ar','ckb'],isLiveDataset:false,distribution:resources.map(m=>({'@type':'cr:FileObject','@id':`${release.canonicalUrl}${m.rel}#croissant-file`,name:path.basename(m.rel),contentUrl:`${release.canonicalUrl}${m.rel}`,contentSize:String(m.bytes),encodingFormat:m.mediaType,sha256:m.sha256,description:m.rel.endsWith('.vtt')?m.title:undefined})).map(o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined)))};
await writeFile(path.join(projections,'croissant.json'),`${JSON.stringify(croissant,null,2)}\n`);

console.log(JSON.stringify({generated:true,release:release.release,graphNodes:graph['@graph'].length,facts:rows.length-1,answers:answers.length,head:headIds.length,headBytes:Buffer.byteLength(headRaw),support:supportIds.length,supportBytes:Buffer.byteLength(supportRaw),markdownBytes:Buffer.byteLength(md),passages:emitted.length,maxPassageChars:Math.max(...emitted.map(x=>x.text.length),0)},null,2));
