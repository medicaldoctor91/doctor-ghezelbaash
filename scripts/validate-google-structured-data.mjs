import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deriveGooglePageMicrodata} from '../src/lib/google-page-microdata.mjs';

const ROOT='https://www.ghezelbaash.ir/';
const PHYSICIAN=`${ROOT}#saeed-ghezelbash`;
const CLINIC=`${ROOT}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`;
const PAGE=`${ROOT}#webpage`;
const DATASET=`${ROOT}graph.jsonld#dataset`;
const CATALOG=`${ROOT}#data-catalog`;
const ADDRESS=`${ROOT}#clinic-postal-address`;
const GEO=`${ROOT}#clinic-geo`;
const RETIRED='Q140304972';
const asArray=value=>Array.isArray(value)?value:(value==null?[]:[value]);
const types=node=>asArray(node?.['@type']);
const refId=value=>typeof value==='string'?value:value?.['@id'];
const refs=value=>asArray(value).map(refId).filter(Boolean);
const exact=(actual,expected,label)=>assert.deepEqual([...new Set(actual)].sort(),[...new Set(expected)].sort(),label);
const requireNode=(byId,id,label)=>{const node=byId.get(id);assert.ok(node,`${label} missing: ${id}`);return node};
const isDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value));
const isDateTime=value=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(String(value));
const durationSeconds=value=>{const match=String(value??'').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);return match?(Number(match[1]||0)*3600)+(Number(match[2]||0)*60)+Number(match[3]||0):null};

const [canonical,head,support,headProfile,supportProfile]=await Promise.all([
  readFile('src/data/semantic/knowledge-graph.jsonld','utf8').then(JSON.parse),
  readFile('.generated/semantic/head-graph.json','utf8').then(JSON.parse),
  readFile('.generated/semantic/support-graph.json','utf8').then(JSON.parse),
  readFile('src/data/semantic/head-profile.json','utf8').then(JSON.parse),
  readFile('src/data/semantic/support-profile.json','utf8').then(JSON.parse),
]);
for(const [label,document] of [['canonical',canonical],['head',head],['support',support]])assert.ok(Array.isArray(document['@graph']),`${label} graph lacks @graph`);

const canonicalRaw=JSON.stringify(canonical),pageRaw=JSON.stringify([head,support]);
assert.ok(!canonicalRaw.includes(RETIRED),'Retired Wikidata identifier exists in canonical graph');
assert.ok(!pageRaw.includes(RETIRED),'Retired Wikidata identifier exists in page structured data');

const canonicalNodes=canonical['@graph'];
const canonicalIds=canonicalNodes.filter(node=>node?.['@id']).map(node=>node['@id']);
assert.equal(new Set(canonicalIds).size,canonicalIds.length,'Canonical graph contains duplicate @id values');
const pageNodes=[...head['@graph'],...support['@graph']];
const pageIds=pageNodes.filter(node=>node?.['@id']).map(node=>node['@id']);
assert.equal(new Set(pageIds).size,pageIds.length,'Head/support page graphs contain duplicate top-level @id values');
const byId=new Map(pageNodes.filter(node=>node?.['@id']).map(node=>[node['@id'],node]));

const scan=(value,path='$')=>{
  if(Array.isArray(value))return value.forEach((nested,index)=>scan(nested,`${path}[${index}]`));
  if(!value||typeof value!=='object')return;
  assert.ok(!Object.hasOwn(value,'@value'),`JSON-LD value object leaked into Google page projection at ${path}`);
  for(const [key,nested] of Object.entries(value)){
    assert.ok(!/^(?:prov|dcterms|skos):/.test(key),`Non-Schema property leaked into Google page projection at ${path}.${key}`);
    scan(nested,`${path}.${key}`);
  }
};
scan(head);scan(support);
for(const document of [head,support]){
  const context=document['@context'];
  assert.ok(context&&typeof context==='object'&&!Array.isArray(context),'Page projection context must be an object');
  assert.equal(context['@vocab'],'https://schema.org/','Page projection @vocab drift');
  for(const key of Object.keys(context))assert.ok(!['prov','dcterms','skos'].includes(key),`Third-party context leaked into page projection: ${key}`);
}

const page=requireNode(byId,PAGE,'ProfilePage');
exact(types(page),['ProfilePage'],'Google page node must remain exactly ProfilePage');
exact(refs(page.mainEntity),[PHYSICIAN],'ProfilePage mainEntity drift');
assert.ok(!Object.hasOwn(page,'dateModified')||isDateTime(page.dateModified),'ProfilePage dateModified must be omitted or a genuine DateTime');
const physician=requireNode(byId,PHYSICIAN,'Physician');
exact(types(physician),['Person','IndividualPhysician'],'Physician type model drift');
assert.ok(asArray(physician.name).every(value=>typeof value==='string')&&asArray(physician.name).length>=1,'Physician name must be page-safe Text');
assert.ok(refs(physician.practicesAt).includes(CLINIC),'Physician practicesAt lost clinic');
assert.ok(refs(physician.worksFor).includes(CLINIC),'Physician worksFor lost clinic');
assert.ok(refs(physician.owns).includes(CLINIC),'Physician owns lost clinic');
assert.ok(asArray(physician.sameAs).includes('https://www.wikidata.org/entity/Q140287622'),'Physician Wikidata identity missing');

const clinic=requireNode(byId,CLINIC,'Medical clinic');
for(const type of ['MedicalClinic','PhysiciansOffice','LocalBusiness'])assert.ok(types(clinic).includes(type),`Clinic missing ${type}`);
for(const property of ['owner','founder','employee'])exact(refs(clinic[property]),[PHYSICIAN],`Clinic ${property} drift`);
exact(refs(clinic.address),[ADDRESS],'Clinic address identity drift');
exact(refs(clinic.geo),[GEO],'Clinic geo identity drift');
const address=requireNode(byId,ADDRESS,'Clinic PostalAddress');
for(const property of ['streetAddress','addressLocality','addressCountry','postalCode','addressRegion'])assert.ok(typeof address[property]==='string'&&address[property],`Clinic PostalAddress missing ${property}`);
const geo=requireNode(byId,GEO,'Clinic GeoCoordinates');
assert.ok(typeof geo.latitude==='number'&&Number.isFinite(geo.latitude),'Clinic latitude must be a native Number');
assert.ok(typeof geo.longitude==='number'&&Number.isFinite(geo.longitude),'Clinic longitude must be a native Number');

const dataset=requireNode(byId,DATASET,'Public knowledge graph Dataset');
exact(types(dataset),['Dataset'],'Dataset page type drift');
for(const property of ['name','description','license','version','datePublished','dateModified','distribution','creator','publisher','identifier','includedInDataCatalog'])assert.ok(Object.hasOwn(dataset,property),`Dataset missing ${property}`);
assert.ok(isDate(dataset.datePublished),'Dataset datePublished must be Date');
assert.ok(isDate(dataset.dateModified)||isDateTime(dataset.dateModified),'Dataset dateModified must be Date or DateTime');
exact(refs(dataset.creator),[PHYSICIAN],'Dataset creator drift');
exact(refs(dataset.publisher),[PHYSICIAN],'Dataset publisher drift');
exact(refs(dataset.includedInDataCatalog),[CATALOG],'Dataset catalog relation drift');
for(const forbidden of ['citation','provider','hasPart'])assert.ok(!Object.hasOwn(dataset,forbidden),`Google Dataset projection must omit canonical-only ${forbidden}`);
const distributions=refs(dataset.distribution);
assert.ok(distributions.length>=12,`Dataset exposes too few direct distributions: ${distributions.length}`);
for(const id of distributions){
  const distribution=requireNode(byId,id,'Dataset DataDownload');
  assert.ok(types(distribution).includes('DataDownload'),`Dataset distribution is not DataDownload: ${id}`);
  assert.ok(typeof distribution.contentUrl==='string'&&/^https:\/\//.test(distribution.contentUrl),`DataDownload contentUrl invalid: ${id}`);
  assert.ok(asArray(distribution.encodingFormat).length>=1,`DataDownload encodingFormat missing: ${id}`);
  assert.ok(typeof distribution.name==='string'||asArray(distribution.name).every(value=>typeof value==='string'),`DataDownload name invalid: ${id}`);
}
const catalog=requireNode(byId,CATALOG,'DataCatalog');
exact(types(catalog),['DataCatalog'],'DataCatalog type drift');
exact(refs(catalog.dataset),[DATASET],'DataCatalog dataset relation drift');

const videos=pageNodes.filter(node=>types(node).includes('VideoObject'));
assert.equal(videos.length,4,'Expected four visible VideoObject projections');
const clips=pageNodes.filter(node=>types(node).includes('Clip'));
for(const video of videos){
  for(const property of ['name','description','contentUrl','thumbnailUrl','uploadDate','duration','url'])assert.ok(Object.hasOwn(video,property),`VideoObject missing ${property}: ${video['@id']}`);
  assert.ok(isDate(video.uploadDate)||isDateTime(video.uploadDate),`Video uploadDate invalid: ${video['@id']}`);
  const duration=durationSeconds(video.duration);assert.ok(duration>0,`Video duration invalid: ${video['@id']}`);
  const videoClips=clips.filter(clip=>refs(clip.isPartOf).includes(video['@id']));
  if(duration<30){assert.equal(videoClips.length,0,`Sub-30-second video must not expose Clip: ${video['@id']}`);assert.ok(!Object.hasOwn(video,'hasPart'),`Sub-30-second video must omit hasPart: ${video['@id']}`);continue;}
  assert.ok(videoClips.length>=1,`Eligible video has no Clip: ${video['@id']}`);
  const starts=[];
  for(const clip of videoClips){
    assert.ok(Number.isInteger(clip.startOffset)&&clip.startOffset>=0,`Clip startOffset invalid: ${clip['@id']}`);
    assert.ok(Number.isInteger(clip.endOffset)&&clip.endOffset>clip.startOffset&&clip.endOffset<=duration,`Clip endOffset invalid: ${clip['@id']}`);
    assert.ok(typeof clip.name==='string'||asArray(clip.name).every(value=>typeof value==='string'),`Clip name invalid: ${clip['@id']}`);
    assert.ok(typeof clip.url==='string'&&/^https:\/\//.test(clip.url),`Clip URL invalid: ${clip['@id']}`);
    starts.push(clip.startOffset);
  }
  assert.equal(new Set(starts).size,starts.length,`Video Clip startOffset values must be unique: ${video['@id']}`);
  exact(refs(video.hasPart),videoClips.map(clip=>clip['@id']),`Video hasPart/Clip closure drift: ${video['@id']}`);
}
assert.equal(clips.length,13,'Expected thirteen valid Clip projections');

const images=pageNodes.filter(node=>types(node).includes('ImageObject'));
assert.ok(images.length>=9,'Too few page ImageObject projections');
for(const image of images)for(const property of ['license','acquireLicensePage','creditText','copyrightNotice'])assert.ok(Object.hasOwn(image,property),`ImageObject missing ${property}: ${image['@id']}`);

assert.equal(pageNodes.filter(node=>types(node).includes('EducationEvent')||types(node).includes('Event')).length,0,'Historical workshop must not masquerade as a Google Event without exact dates');
assert.equal(pageNodes.filter(node=>types(node).includes('ScholarlyArticle')).length,0,'Supporting publications must not masquerade as article landing pages');
const scholarlySupport=pageNodes.filter(node=>asArray(node.additionalType).includes('https://schema.org/ScholarlyArticle'));
assert.equal(scholarlySupport.length,2,'Expected two non-eligible scholarly support works');
for(const forbiddenType of ['Product','Review','AggregateRating','QAPage','FAQPage'])assert.equal(pageNodes.filter(node=>types(node).includes(forbiddenType)).length,0,`Unsupported Google surface leaked into page graph: ${forbiddenType}`);

const microdata=deriveGooglePageMicrodata(head,PAGE);
assert.equal(microdata.itemType,'https://schema.org/ProfilePage','DOM ProfilePage Microdata drift');
assert.equal(microdata.mainEntityItemType,'https://schema.org/Person','DOM physician Microdata drift');
assert.equal(microdata.mainEntityId,PHYSICIAN,'DOM physician identity drift');

console.log(JSON.stringify({
  stage:'GOOGLE_STRUCTURED_DATA_2026',
  canonicalNodes:canonicalNodes.length,
  headNodes:head['@graph'].length,
  supportNodes:support['@graph'].length,
  pageTopLevelIdsUnique:true,
  nativeScalarProjection:true,
  profilePage:'PASS',
  physicianEntity:'ONE_CANONICAL_ID',
  clinicAsset:'DISTINCT_STRONGLY_LINKED',
  dataset:{status:'PASS',directDistributions:distributions.length,catalog:'PASS'},
  video:{objects:videos.length,clips:clips.length,sub30SecondClipSuppression:'PASS'},
  imageRights:{objects:images.length,status:'PASS'},
  nonEligibleSupport:{scholarlyWorks:scholarlySupport.length,historicalEventDowngraded:true},
  unsupportedRichResultSurfacesAbsent:true,
  retiredWikidataAbsent:true,
  integrity:'PASS'
},null,2));
