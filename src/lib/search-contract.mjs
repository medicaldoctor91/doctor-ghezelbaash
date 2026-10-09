const values=v=>Array.isArray(v)?v:v==null?[]:[v];
const blocked=new Set(['Dataset','DataDownload','DataCatalog','StatisticalVariable','Observation','SoftwareSourceCode','FAQPage']);
const OMIT=Symbol('omit');
const personBoundaryKeys=new Set(['@id','@type','name','alternateName','givenName','familyName','honorificPrefix','jobTitle','description','disambiguatingDescription','url','sameAs','mainEntityOfPage','worksFor','medicalSpecialty','knowsLanguage']);
const clinicBoundaryKeys=new Set(['@id','@type','name','alternateName','url','description','telephone','address','geo','openingHoursSpecification','hasMap','sameAs','medicalSpecialty','owner','founder','priceRange','areaServed']);
function focusedAuthorityBoundary(node,id,primaryPageId){
  if(id===primaryPageId)return structuredClone(node);
  const types=values(node?.['@type']);
  const keys=types.includes('Person')?personBoundaryKeys:types.some(type=>['MedicalClinic','PhysiciansOffice','LocalBusiness'].includes(type))?clinicBoundaryKeys:null;
  if(!keys)return structuredClone(node);
  return Object.fromEntries(Object.entries(node).filter(([key])=>keys.has(key)).map(([key,value])=>[key,structuredClone(value)]));
}
/** Complete Schema.org reference closure without importing machine infrastructure. */
export function closeSearchReferences(document,{origin,graph,project,primaryPageId=document['@graph'][0]['@id'],visibleQuestionIds,visibleMediaIds,authorityIsScoped=false}) {
  const truth=new Map(graph['@graph'].map(n=>[n['@id'],n]));
  const templates=new Map(document['@graph'].map(n=>[n['@id'],n]));
  const questions=visibleQuestionIds?new Set(visibleQuestionIds):null;
  const answers=questions?new Set([...questions].flatMap(id=>values((truth.get(id)??templates.get(id))?.acceptedAnswer).map(ref=>ref['@id']))):null;
  const media=visibleMediaIds?new Set(visibleMediaIds):null;
  const clips=media?new Set([...media].flatMap(id=>values(truth.get(id)?.hasPart).map(ref=>ref['@id']))):null;
  const selected=new Map(),queue=[];
  function resolve(id){
    if(selected.has(id))return true;
    const authored=truth.get(id),template=templates.get(id),node=template??project(id);
    if(!node||!node['@type']||values(node['@type']).some(t=>blocked.has(t)))return false;
    const types=values(node['@type']);
    if(questions&&types.includes('Question')&&!questions.has(id))return false;
    if(answers&&types.includes('Answer')&&!answers.has(id))return false;
    if(media&&types.includes('VideoObject')&&!media.has(id))return false;
    if(clips&&types.includes('Clip')&&!clips.has(id))return false;
    // The renderer's route projector already selects topic-specific credentials
    // and expertise. Keep those selected edges; generic callers retain the boundary.
    let output=authorityIsScoped?structuredClone(node):focusedAuthorityBoundary(node,id,primaryPageId);
    // Apply to preselected pages as well as newly resolved pages. A cited
    // document is a link to its identity, never a copy of its clinical corpus.
    if(id!==primaryPageId&&(id.endsWith('#webpage')||id===origin+'/webpage')) {
      output=Object.fromEntries(['@id','@type','url','name','inLanguage','author','publisher'].filter(k=>k in output).map(k=>[k,output[k]]));
    }
    selected.set(id,output);queue.push(output);return true;
  }
  function clean(value){
    if(Array.isArray(value)){const out=value.map(clean).filter(v=>v!==OMIT);return out.length?out:OMIT;}
    if(!value||typeof value!=='object')return value;
    if(Object.keys(value).length===1&&value['@id']?.startsWith(origin+'/')&&!resolve(value['@id']))return OMIT;
    const out={};for(const [key,entry] of Object.entries(value)){const v=key==='@id'?entry:clean(entry);if(v!==OMIT)out[key]=v;}return out;
  }
  resolve(primaryPageId);
  for(const node of graph['@graph'])if(node['@id']===origin+'/#saeed-ghezelbash'||values(node['@type']).includes('MedicalClinic'))resolve(node['@id']);
  for(let i=0;i<queue.length;i++) {
    const node=queue[i],cleaned=clean(node);
    for(const key of Object.keys(node))delete node[key];Object.assign(node,cleaned);
  }
  document['@graph']=[...selected.values()];return document;
}

const escape=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
export function truthText(value,language='fa-IR'){
  if(typeof value==='string')return value;
  const vs=values(value),base=language.split('-')[0];
  const item=vs.find(v=>v?.['@language']===language)||vs.find(v=>v?.['@language']===base)||vs[0];
  return item?.['@value']??item??'';
}
export function renderMedicalTrust(page,graph,language='fa-IR') {
  if(!values(page['@type']).includes('MedicalWebPage'))return '';
  const byId=new Map(graph['@graph'].map(n=>[n['@id'],n]));
  const labels=language.startsWith('en')?['Author','Medical reviewer','Last reviewed','Last meaningful update']:language.startsWith('ar')?['المؤلف','المراجع الطبي','آخر مراجعة','آخر تحديث للمحتوى']:language.startsWith('ckb')?['نووسەر','پێداچوونەوەی پزیشکی','دوا پێداچوونەوە','دوا نوێکردنەوەی ناوەڕۆک']:['نویسنده','بازبین پزشکی','آخرین بازبینی پزشکی','آخرین به‌روزرسانی محتوایی'];
  const parts=[];
  for(const [i,key] of ['author','reviewedBy','lastReviewed','dateModified'].entries()){
    const value=page[key];if(!value)continue;
    const id=values(value)[0]?.['@id'];
    const display=id?truthText(byId.get(id)?.name,language):truthText(value,language);
    if(!display)continue;
    const content=id?`<a href="${escape(byId.get(id)?.url??id)}">${escape(display)}</a>`:`<time datetime="${escape(display)}">${escape(display)}</time>`;
    parts.push(`<span data-trust-property="${key}"${id?` data-entity-id="${escape(id)}"`:''}>${labels[i]}: ${content}</span>`);
  }
  return parts.length?`<div class="medical-trust" data-medical-trust="${escape(page['@id'])}">${parts.join(' · ')}</div>`:'';
}
