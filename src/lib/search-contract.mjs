import {appendHomeDatasetDiscovery} from './home-graph-discovery.mjs';

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

const searchIdentity=['@id','@type','name','alternateName','description','url','sameAs','identifier'];
const searchPage=[...searchIdentity,'inLanguage','dateCreated','dateModified','lastReviewed','author','publisher','reviewedBy','mainEntity','about','isPartOf','breadcrumb','primaryImageOfPage'];
const searchPerson=[...searchIdentity,'additionalType','givenName','familyName','additionalName','honorificPrefix','jobTitle','disambiguatingDescription','knowsLanguage','nationality','areaServed','affiliation','alumniOf','hasOccupation','hasCredential','medicalSpecialty','address','geo','telephone','email','practicesAt','owns','image'];
const searchClinic=[...searchIdentity,'telephone','address','geo','openingHoursSpecification','openingHours','hasMap','medicalSpecialty','areaServed','image','logo','location','containedInPlace','contactPoint'];
const searchImage=[...searchIdentity.filter(key=>key!=='description'),'caption','contentUrl','encodingFormat','width','height','thumbnailUrl','creator','copyrightNotice','creditText','license','acquireLicensePage','dateCreated','dateModified','representativeOfPage'];
const searchVideo=[...searchImage,'description','publisher','copyrightHolder','about','uploadDate','duration','embedUrl','inLanguage','hasPart'];
const searchArticle=['@id','@type','url','headline','description','inLanguage','datePublished','dateModified','author','publisher','image','about','hasPart','mainEntityOfPage'];
const searchQuestion=[...searchIdentity,'acceptedAnswer','answerCount','about','inLanguage'];
const searchAnswer=[...searchIdentity,'text','about','inLanguage'];
const searchLeaf=[...searchIdentity,'propertyID','value','unitCode','unitText','termCode','inDefinedTermSet','credentialCategory','educationalLevel','competencyRequired','recognizedBy','validIn','expires','roleName','hasOccupation','streetAddress','addressLocality','addressRegion','addressCountry','postalCode','latitude','longitude','dayOfWeek','opens','closes','validFrom','validThrough','contactType','availableLanguage','telephone','email','containedInPlace'];
const searchTopic=[...searchIdentity,'about','mainEntity','medicalSpecialty','procedureType','bodyLocation','howPerformed','preparation','followup','status','medicineSystem'];

/**
 * Publish a page's Search surface without recursively importing the knowledge
 * graph. Canonical claims remain in graph.jsonld and the preserved home data.
 * Inverse inventories are deliberately absent here. Media attribution points
 * to the physician, while the physician's image uses the actual file URL;
 * these are both Schema.org forms and do not create image/creator cycles.
 */
export function projectBoundedSearchDocument(document,{graph,primaryPageId,language='fa-IR',visibleQuestionIds=[],visibleMediaIds=[],pagePurpose,visibleImageUrls=[]}={}) {
  const truth=new Map(graph['@graph'].map(node=>[node['@id'],node]));
  const source=new Map([...truth,...document['@graph'].map(node=>[node['@id'],node])]);
  function indexInline(value){
    if(Array.isArray(value)){for(const item of value)indexInline(item);return;}
    if(!value||typeof value!=='object')return;
    if(value['@id']&&value['@type']&&!source.has(value['@id']))source.set(value['@id'],value);
    for(const child of Object.values(value))indexInline(child);
  }
  indexInline(graph['@graph']);indexInline(document['@graph']);
  let primary=source.get(primaryPageId);
  if(!primary)throw new Error('Search projection requires its primary page');
  const origin=new URL(primary['@id']).origin;
  const physicianId=origin+'/#saeed-ghezelbash';
  const physician=source.get(physicianId);
  const clinic=[...source.values()].find(node=>values(node['@type']).some(type=>['MedicalClinic','PhysiciansOffice','LocalBusiness'].includes(type))&&node['@id']!==physicianId);
  const home=values(primary['@type']).includes('ProfilePage')&&primary.url===origin+'/';
  const topicIds=new Set([...values(primary.mainEntity),...values(primary.about)].map(ref=>ref?.['@id']).filter(Boolean));
  // MedicalWebPage describes the document; Article describes its authored
  // clinical guide. Only the reviewed route purpose enables this publication
  // wrapper. A clinic, a video or an access/contact page must not be retyped as
  // an article merely because it is the existing page's mainEntity.
  if(pagePurpose==='clinical-guide') {
    if(home||!values(primary['@type']).includes('MedicalWebPage')||typeof primary.url!=='string')
      throw new Error('Clinical Article requires its reviewed MedicalWebPage');
    const articleId=primary.url+'#article';
    if(source.has(articleId))throw new Error('Clinical Article identifier already exists: '+articleId);
    const article={'@id':articleId,'@type':'Article',url:primary.url,headline:structuredClone(primary.name),
      inLanguage:structuredClone(primary.inLanguage??language),mainEntityOfPage:primary.url};
    for(const key of ['description','author','publisher','about','datePublished','dateModified'])
      if(key in primary)article[key]=structuredClone(primary[key]);
    const content=values(primary.mainEntity).filter(ref=>values(source.get(ref?.['@id'])?.['@type'])
      .some(type=>['WebPageElement','Article','Question','Answer'].includes(type)));
    if(content.length)article.hasPart=structuredClone(content);
    // These URLs come from images actually present in this route's article.
    // The physician's portrait/logo is not an editorial-image fallback, and
    // publication dates are never inferred from review or build timestamps.
    const images=[...new Set(visibleImageUrls)];
    if(images.length)article.image=images;
    source.set(articleId,article);
    primary={...primary,mainEntity:{'@id':articleId}};
    source.set(primaryPageId,primary);
  }
  const selected=new Map(),queue=[];
  const leafTypes=new Set(['PostalAddress','GeoCoordinates','OpeningHoursSpecification','ContactPoint','Country','City','State','AdministrativeArea','Place','EducationalOccupationalCredential','Certification','DefinedTerm','DefinedTermSet','PropertyValue','QuantitativeValue','Occupation','Role','Organization','EducationalOrganization','CollegeOrUniversity']);
  const namedText=new Set(['name','headline','description','caption','givenName','familyName','additionalName','honorificPrefix','jobTitle','roleName','disambiguatingDescription']);
  function normalized(value,key){
    if(Array.isArray(value)) {
      if(namedText.has(key)&&value.some(item=>item&&typeof item==='object'&&'@language' in item))return truthText(value,language);
      const result=value.map(item=>normalized(item,key)).filter(item=>item!==OMIT);
      return result.length?result:OMIT;
    }
    if(!value||typeof value!=='object')return value;
    if('@value' in value)return value['@value'];
    if(value['@id']) {
      const target=source.get(value['@id']);
      if(!target) {
        if(value['@id'].startsWith(origin+'/'))throw new Error('Unresolved local Search entity: '+value['@id']);
        return structuredClone(value);
      }
      // A cited page remains a URL in the canonical graph. Importing a second
      // ProfilePage into a clinical page misstates that document's focus.
      if(value['@id']!==primaryPageId&&values(target['@type']).some(type=>supportingPageTypes.has(type)))return OMIT;
      if(!resolve(value['@id']))return OMIT;
      return {'@id':value['@id']};
    }
    const result={};
    for(const [child,entry]of Object.entries(value)){const item=normalized(entry,child);if(item!==OMIT)result[child]=item;}
    return result;
  }
  function imageUrls(value){
    const urls=values(value).map(ref=>typeof ref==='string'?ref:source.get(ref?.['@id'])?.contentUrl).filter(url=>typeof url==='string');
    for(const ref of values(value))if(ref?.['@id'])resolve(ref['@id']);
    return Array.isArray(value)?urls:urls[0]??OMIT;
  }
  function resolve(id){
    if(selected.has(id))return true;
    const node=source.get(id),types=values(node?.['@type']);
    if(!node||!types.length||types.some(type=>blocked.has(type)))return false;
    let keys;
    if(id===primaryPageId)keys=searchPage;
    else if(id===physicianId)keys=searchPerson;
    else if(node===clinic)keys=searchClinic;
    else if(types.includes('Article'))keys=searchArticle;
    else if(types.includes('ImageObject'))keys=searchImage;
    else if(types.includes('VideoObject'))keys=searchVideo;
    else if(types.includes('Clip'))keys=[...searchIdentity,'startOffset','endOffset'];
    else if(types.includes('Question'))keys=searchQuestion;
    else if(types.includes('Answer'))keys=searchAnswer;
    else if(types.includes('BreadcrumbList'))keys=['@id','@type','itemListElement'];
    else if(types.includes('WebSite'))keys=[...searchIdentity,'inLanguage','publisher'];
    else if(types.some(type=>leafTypes.has(type)))keys=searchLeaf;
    else keys=topicIds.has(id)?searchTopic:searchIdentity;
    const output={};selected.set(id,output);queue.push({node,output,keys});return true;
  }
  resolve(primaryPageId);
  if(physician)resolve(physicianId);
  if(clinic)resolve(clinic['@id']);
  // Homepage is the physician profile; detailed questions and watch markup
  // belong to their focused public pages. Its complete data stays inline.
  if(!home)for(const id of [...visibleQuestionIds,...visibleMediaIds])resolve(id);
  for(let i=0;i<queue.length;i++) {
    const {node,output,keys}=queue[i];
    for(const key of keys)if(key in node) {
      // Google's ProfilePage dates require DateTime. A recorded calendar date
      // remains authoritative in the canonical graph; never invent its hour.
      if(home&&node['@id']===primaryPageId&&['dateCreated','dateModified'].includes(key)&&
          /^\d{4}-\d{2}-\d{2}$/.test(node[key]?.['@value']??node[key]))continue;
      let item;
      if(key==='@id'||key==='@type')item=structuredClone(node[key]);
      // Keep the clinical ownership claim without importing the separately
      // described software/data project into the physician profile surface.
      else if(key==='owns'&&node['@id']===physicianId)item=values(node[key]).filter(ref=>ref?.['@id']===clinic?.['@id']).map(ref=>normalized(ref,key));
      else if((key==='image'||key==='logo')&&(node['@id']===physicianId||node===clinic))item=imageUrls(node[key]);
      else if((key==='width'||key==='height')&&node[key]?.['@id'])item=node[key].value??source.get(node[key]['@id'])?.value??OMIT;
      else item=normalized(node[key],key);
      if(item!==OMIT)output[key]=item;
    }
    // The last chapter may end implicitly at the video's recorded duration.
    // Expose that existing boundary for Google's recommended Clip.endOffset;
    // preserve explicit chapter ends and the canonical scientific data.
    if(values(node['@type']).includes('Clip')&&node.endOffset==null) {
      const parent=source.get(node.isPartOf?.['@id']);
      const duration=typeof parent?.duration==='string'&&
        /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(parent.duration);
      const seconds=duration&&duration.slice(1).some(Boolean)
        ?Number(duration[1]??0)*3600+Number(duration[2]??0)*60+Number(duration[3]??0):NaN;
      if(values(parent?.['@type']).includes('VideoObject')&&
          values(parent.hasPart).at(-1)?.['@id']===node['@id']&&
          Number.isFinite(node.startOffset)&&Number.isFinite(seconds)&&seconds>node.startOffset)
        output.endOffset=seconds;
    }
  }
  const result={'@context':'https://schema.org','@graph':[...selected.values()]};
  assertBoundedSearchDocument(result);
  if(home&&new TextEncoder().encode(JSON.stringify(result)).length>38000)throw new Error('Homepage Search markup exceeds the crawler-prefix budget');
  return result;
}

/** Deterministic homepage entry point also used by the release verifier. */
export function projectHomeSearchGraph(graph,origin='https://www.ghezelbaash.ir') {
  const projected=projectBoundedSearchDocument(graph,{graph,primaryPageId:origin+'/webpage'});
  const result=appendHomeDatasetDiscovery(projected,graph,origin);
  assertBoundedSearchDocument(result);
  if(new TextEncoder().encode(JSON.stringify(result)).length>38000)
    throw new Error('Homepage Search markup exceeds the crawler-prefix budget');
  return result;
}

/** Reject both identifier cycles and excessive per-path tree expansion. */
export function assertBoundedSearchDocument(document,{maxNodes=256,maxExpandedObjects=4096,maxDepth=12}={}) {
  const nodes=document['@graph'];
  if(!Array.isArray(nodes)||!nodes.length||nodes.length>maxNodes)throw new Error('Search graph node budget exceeded');
  const byId=new Map(nodes.map(node=>[node['@id'],node]));
  if(byId.size!==nodes.length)throw new Error('Duplicate Search entity identifier');
  const origin=new URL(nodes[0]['@id']).origin;
  const edges=new Map();
  function refs(value,out){
    if(Array.isArray(value)){for(const item of value)refs(item,out);return;}
    if(!value||typeof value!=='object')return;
    if(value['@id']) {
      if(byId.has(value['@id']))out.push(value['@id']);
      else if(value['@id'].startsWith(origin+'/'))throw new Error('Unresolved local Search entity: '+value['@id']);
    }
    for(const [key,item]of Object.entries(value))if(key!=='@id'&&key!=='@type')refs(item,out);
  }
  for(const node of nodes){const out=[];for(const[key,item]of Object.entries(node))if(key!=='@id'&&key!=='@type')refs(item,out);edges.set(node['@id'],out);}
  const memo=new Map(),active=new Set();
  function expanded(id){
    if(active.has(id))throw new Error('Cyclic Search entity reference: '+[...active,id].join(' -> '));
    if(memo.has(id))return memo.get(id);
    active.add(id);let count=1,height=0;
    for(const target of edges.get(id)){const child=expanded(target);count+=child.count;height=Math.max(height,child.height+1);if(count>maxExpandedObjects)throw new Error('Search graph expansion budget exceeded');}
    if(height>maxDepth)throw new Error('Search graph depth budget exceeded');
    const result={count,height};active.delete(id);memo.set(id,result);return result;
  }
  let total=0,height=0;
  for(const id of byId.keys()){const result=expanded(id);total+=result.count;height=Math.max(height,result.height);if(total>maxExpandedObjects)throw new Error('Search graph expansion budget exceeded');}
  return {nodes:nodes.length,expandedObjects:total,maxDepth:height};
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
