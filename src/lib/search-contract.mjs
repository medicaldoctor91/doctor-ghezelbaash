const values=v=>Array.isArray(v)?v:v==null?[]:[v];
const blocked=new Set(['Dataset','DataDownload','DataCatalog','StatisticalVariable','Observation','SoftwareSourceCode','FAQPage']);
const OMIT=Symbol('omit');
const identityKeys=['@id','@type','name','alternateName','description','url','sameAs','identifier'];
const personBoundaryKeys=new Set([...identityKeys,'additionalType','givenName','familyName','additionalName','honorificPrefix','jobTitle','disambiguatingDescription','mainEntityOfPage','worksFor','medicalSpecialty','knowsLanguage','nationality','areaServed','affiliation','alumniOf','potentialAction','hasOccupation','hasCredential','skills','knowsAbout','address','geo','telephone','email','practicesAt','workLocation','owns','image']);
const clinicBoundaryKeys=new Set([...identityKeys,'telephone','address','geo','openingHoursSpecification','openingHours','hasMap','medicalSpecialty','owner','founder','priceRange','areaServed','image','logo','location','containedInPlace','potentialAction','contactPoint','mainEntityOfPage']);
const imageBoundaryKeys=new Set([...identityKeys,'caption','contentUrl','encodingFormat','width','height','thumbnailUrl','about','creator','publisher','copyrightHolder','copyrightNotice','creditText','license','acquireLicensePage','dateCreated','dateModified','version','keywords','representativeOfPage']);
const credentialBoundaryKeys=new Set([...identityKeys,'credentialCategory','educationalLevel','competencyRequired','recognizedBy','validIn','expires']);
const termBoundaryKeys=new Set([...identityKeys,'termCode','inDefinedTermSet']);
const termSetBoundaryKeys=new Set([...identityKeys,'dateModified']);
const identifierBoundaryKeys=new Set([...identityKeys,'propertyID','value','unitCode','unitText']);
const organizationBoundaryKeys=new Set(identityKeys);
const supportingPageTypes=new Set(['WebPage','MedicalWebPage','ContactPage','ProfilePage','AboutPage']);
function focusedAuthorityBoundary(node,id,primaryPageId){
  if(id===primaryPageId)return structuredClone(node);
  const types=values(node?.['@type']);
  // Supporting identities retain their claims, codes and descriptions without
  // traversing a second evidence, membership or content inventory. The complete
  // relationships remain in the canonical graph and the full homepage graph.
  const keys=types.includes('Person')?personBoundaryKeys
    :types.some(type=>['MedicalClinic','PhysiciansOffice','LocalBusiness'].includes(type))?clinicBoundaryKeys
    :types.includes('ImageObject')?imageBoundaryKeys
    :types.includes('EducationalOccupationalCredential')?credentialBoundaryKeys
    :types.includes('DefinedTerm')?termBoundaryKeys
    :types.includes('DefinedTermSet')?termSetBoundaryKeys
    :types.includes('PropertyValue')?identifierBoundaryKeys
    :types.some(type=>['Organization','EducationalOrganization','CollegeOrUniversity'].includes(type))?organizationBoundaryKeys:null;
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
    // The renderer first selects topic-specific credentials and expertise; the
    // support boundary retains those claims while closing their identities.
    let output=authorityIsScoped?structuredClone(node):focusedAuthorityBoundary(node,id,primaryPageId);
    // Apply to preselected pages as well as newly resolved pages. A cited
    // document is a link to its identity, never a copy of its clinical corpus.
    // ProfilePage still requires its subject; keep that edge to the physician.
    if(id!==primaryPageId&&(types.some(type=>supportingPageTypes.has(type))||id.endsWith('#webpage')||id===origin+'/webpage')) {
      const keys=['@id','@type','url','name','inLanguage','author','publisher','identifier','dateModified'];
      if(types.includes('ProfilePage'))keys.push('mainEntity');
      output=Object.fromEntries(keys.filter(k=>k in output).map(k=>[k,output[k]]));
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
  // Visible questions and media are route content roots, even when no
  // supporting physician inventory happens to link back to them.
  for(const id of questions??[])resolve(id);
  for(const id of media??[])resolve(id);
  for(const node of graph['@graph'])if(node['@id']===origin+'/#saeed-ghezelbash'||values(node['@type']).includes('MedicalClinic'))resolve(node['@id']);
  for(let i=0;i<queue.length;i++) {
    const node=queue[i],cleaned=clean(node);
    for(const key of Object.keys(node))delete node[key];Object.assign(node,cleaned);
  }
  // A focused clinical topic needs one direction of its content relationship.
  // Keep every page/question's explicit about edge; do not also re-expand that
  // same content through the procedure's reciprocal subjectOf index.
  if(!authorityIsScoped)for(const node of selected.values()) {
    if(!values(node['@type']).some(type=>['MedicalProcedure','Service'].includes(type))||!node.subjectOf)continue;
    const kept=values(node.subjectOf).filter(ref=>{
      const target=selected.get(typeof ref==='string'?ref:ref?.['@id']);
      return !values(target?.about).some(about=>(typeof about==='string'?about:about?.['@id'])===node['@id']);
    });
    if(kept.length)node.subjectOf=Array.isArray(node.subjectOf)?kept:kept[0];else delete node.subjectOf;
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
    const content=id?`<a href="${escape(byId.get(id)?.url??id)}"${key==='author'?' rel="author"':''}>${escape(display)}</a>`:`<time datetime="${escape(display)}">${escape(display)}</time>`;
    parts.push(`<span data-trust-property="${key}"${id?` data-entity-id="${escape(id)}"`:''}>${labels[i]}: ${content}</span>`);
  }
  return parts.length?`<div class="medical-trust" data-medical-trust="${escape(page['@id'])}">${parts.join(' · ')}</div>`:'';
}
