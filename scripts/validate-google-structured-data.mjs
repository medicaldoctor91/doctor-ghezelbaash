import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deriveGooglePageMicrodata} from '../src/lib/google-page-microdata.mjs';

const ROOT='https://www.ghezelbaash.ir/';
const PHYSICIAN=`${ROOT}#saeed-ghezelbash`;
const CLINIC=`${ROOT}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`;
const PAGE=`${ROOT}#webpage`;
const DATASET=`${ROOT}graph.jsonld#dataset`;
const HF_DATASET=`${ROOT}#project-huggingface-dataset`;
const ZENODO_DATASET=`${ROOT}#project-zenodo-release`;
const GITHUB_SOURCE=`${ROOT}#project-github-source`;
const ADDRESS=`${ROOT}#clinic-postal-address`;
const GEO=`${ROOT}#clinic-geo`;
const SPECIALTY=`${ROOT}#medical-specialty-aesthetic-medicine`;
const IRAN=`${ROOT}#country-iran`;
const IRAQ=`${ROOT}#country-iraq`;
const RETIRED=['Q140','304972'].join('');
const ALLOWED_CROSS_BLOCK_REUSE=new Set([SPECIALTY,IRAN,IRAQ]);
const asArray=value=>Array.isArray(value)?value:(value==null?[]:[value]);
const types=node=>asArray(node?.['@type']);
const refId=value=>typeof value==='string'?value:value?.['@id'];
const refs=value=>asArray(value).map(refId).filter(Boolean);
const unique=values=>[...new Set(values)];
const exact=(actual,expected,label)=>assert.deepEqual(unique(actual).sort(),unique(expected).sort(),label);
const isDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value));
const isDateTime=value=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(String(value));
const durationSeconds=value=>{const match=String(value??'').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);return match?(Number(match[1]||0)*3600)+(Number(match[2]||0)*60)+Number(match[3]||0):null};
const mergeNode=(left,right)=>{
  const out=structuredClone(left);
  for(const [key,value] of Object.entries(right)){
    if(key==='@id')continue;
    if(!Object.hasOwn(out,key)){out[key]=structuredClone(value);continue;}
    const values=[...asArray(out[key]),...asArray(value)];
    const seen=new Set();
    const merged=values.filter(item=>{const token=JSON.stringify(item);if(seen.has(token))return false;seen.add(token);return true});
    out[key]=merged.length===1?merged[0]:merged;
  }
  return out;
};
const indexGraph=document=>new Map(document['@graph'].filter(node=>typeof node?.['@id']==='string').map(node=>[node['@id'],node]));
const requireNode=(byId,id,label)=>{const node=byId.get(id);assert.ok(node,`${label} missing: ${id}`);return node};

const [canonical,head,support]=await Promise.all([
  readFile('src/data/semantic/knowledge-graph.jsonld','utf8').then(JSON.parse),
  readFile('.generated/semantic/head-graph.json','utf8').then(JSON.parse),
  readFile('.generated/semantic/support-graph.json','utf8').then(JSON.parse),
]);
for(const [label,document] of [['canonical',canonical],['head',head],['support',support]])assert.ok(Array.isArray(document['@graph']),`${label} graph lacks @graph`);
assert.ok(!JSON.stringify(canonical).includes(RETIRED),'Retired Wikidata identifier exists in canonical graph');
assert.ok(!JSON.stringify([head,support]).includes(RETIRED),'Retired Wikidata identifier exists in page structured data');

const canonicalById=indexGraph(canonical);
assert.equal(canonicalById.size,canonical['@graph'].length,'Canonical graph contains duplicate @id values');
const headById=indexGraph(head),supportById=indexGraph(support);
assert.equal(headById.size,head['@graph'].length,'Head graph contains duplicate top-level @id values');
assert.equal(supportById.size,support['@graph'].length,'Support graph contains duplicate top-level @id values');
const crossBlockReuse=[...headById.keys()].filter(id=>supportById.has(id)).sort();
exact(crossBlockReuse,[...ALLOWED_CROSS_BLOCK_REUSE],'Unexpected cross-block @id reuse');
const pageById=new Map(headById);
for(const [id,node] of supportById)pageById.set(id,pageById.has(id)?mergeNode(pageById.get(id),node):node);
const pageNodes=[...pageById.values()];

const scan=(value,path='$')=>{
  if(Array.isArray(value))return value.forEach((nested,index)=>scan(nested,`${path}[${index}]`));
  if(!value||typeof value!=='object')return;
  assert.ok(!Object.hasOwn(value,'@value'),`JSON-LD typed value object leaked into page projection at ${path}`);
  for(const [key,nested] of Object.entries(value)){
    assert.ok(!/^(?:prov|dcterms|skos):/.test(key),`Non-Schema property leaked into page projection at ${path}.${key}`);
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

const page=requireNode(pageById,PAGE,'ProfilePage');
exact(types(page),['ProfilePage'],'Google page node must remain exactly ProfilePage');
exact(refs(page.mainEntity),[PHYSICIAN],'ProfilePage mainEntity drift');
assert.ok(!Object.hasOwn(page,'dateModified')||isDateTime(page.dateModified),'ProfilePage dateModified must be omitted or a genuine DateTime');
const physician=requireNode(pageById,PHYSICIAN,'Physician');
exact(types(physician),['Person','IndividualPhysician'],'Physician type model drift');
assert.ok(asArray(physician.name).length>=1&&asArray(physician.name).every(value=>typeof value==='string'),'Physician name must be page-safe Text');
for(const property of ['practicesAt','worksFor','workLocation','affiliation','owns'])assert.ok(refs(physician[property]).includes(CLINIC),`Physician ${property} lost clinic`);
assert.ok(refs(physician.medicalSpecialty).includes(SPECIALTY),'Physician medicalSpecialty lost defined specialty');
for(const country of [IRAN,IRAQ])assert.ok(refs(physician.areaServed).includes(country),`Physician areaServed lost ${country}`);
assert.ok(asArray(physician.sameAs).includes('https://www.wikidata.org/entity/Q140287622'),'Physician Wikidata identity missing');

const clinic=requireNode(pageById,CLINIC,'Medical clinic');
for(const type of ['MedicalClinic','PhysiciansOffice','LocalBusiness'])assert.ok(types(clinic).includes(type),`Clinic missing ${type}`);
for(const property of ['owner','founder','employee'])exact(refs(clinic[property]),[PHYSICIAN],`Clinic ${property} drift`);
assert.ok(refs(clinic.medicalSpecialty).includes(SPECIALTY),'Clinic medicalSpecialty drift');
for(const country of [IRAN,IRAQ])assert.ok(refs(clinic.areaServed).includes(country),`Clinic areaServed lost ${country}`);
exact(refs(clinic.address),[ADDRESS],'Clinic address identity drift');
exact(refs(clinic.geo),[GEO],'Clinic geo identity drift');
const address=requireNode(pageById,ADDRESS,'Clinic PostalAddress');
for(const property of ['streetAddress','addressLocality','addressCountry','postalCode','addressRegion'])assert.ok(typeof address[property]==='string'&&address[property],`Clinic PostalAddress missing ${property}`);
const geo=requireNode(pageById,GEO,'Clinic GeoCoordinates');
assert.ok(typeof geo.latitude==='number'&&Number.isFinite(geo.latitude),'Clinic latitude must be a native Number');
assert.ok(typeof geo.longitude==='number'&&Number.isFinite(geo.longitude),'Clinic longitude must be a native Number');

assert.ok(!pageById.has(DATASET),'Machine Dataset must not be injected into physician landing-page JSON-LD without a dataset landing-page surface');
const dataset=requireNode(canonicalById,DATASET,'Canonical public knowledge graph Dataset');
assert.ok(types(dataset).includes('Dataset'),'Canonical machine resource lost Dataset type');
for(const property of ['name','description','license','version','datePublished','dateModified','distribution','creator','publisher','identifier'])assert.ok(Object.hasOwn(dataset,property),`Canonical Dataset missing ${property}`);
assert.ok(isDate(dataset.datePublished),'Canonical Dataset datePublished must be Date');
assert.ok(isDate(dataset.dateModified)||isDateTime(dataset.dateModified),'Canonical Dataset dateModified must be Date or DateTime');
assert.ok(refs(dataset.creator).includes(PHYSICIAN),'Canonical Dataset creator lost physician');
assert.ok(refs(dataset.publisher).includes(PHYSICIAN),'Canonical Dataset publisher lost physician');
const canonicalDistributions=refs(dataset.distribution);
assert.ok(canonicalDistributions.length>=12,'Canonical Dataset exposes too few direct DataDownload distributions');
for(const id of canonicalDistributions){
  const distribution=requireNode(canonicalById,id,'Canonical Dataset DataDownload');
  assert.ok(types(distribution).includes('DataDownload'),`Dataset distribution is not DataDownload: ${id}`);
  assert.ok(typeof distribution.contentUrl==='string'&&/^https:\/\//.test(distribution.contentUrl),`DataDownload contentUrl invalid: ${id}`);
  assert.ok(asArray(distribution.encodingFormat).length>=1,`DataDownload encodingFormat missing: ${id}`);
}
for(const externalId of [HF_DATASET,ZENODO_DATASET])assert.ok(!canonicalDistributions.includes(externalId),`External Dataset landing resource leaked into direct distribution: ${externalId}`);
const hfDataset=requireNode(canonicalById,HF_DATASET,'Hugging Face Dataset');
exact(types(hfDataset),['Dataset'],'Hugging Face resource must remain a derived Dataset, not DataDownload');
exact(refs(hfDataset.isBasedOn),[DATASET],'Hugging Face Dataset provenance drift');
assert.ok(!Object.hasOwn(hfDataset,'contentUrl'),'Hugging Face landing page must not masquerade as contentUrl');
assert.ok(typeof hfDataset.url==='string'&&hfDataset.url.startsWith('https://huggingface.co/datasets/'),'Hugging Face Dataset URL drift');
const zenodoDataset=requireNode(canonicalById,ZENODO_DATASET,'Zenodo preservation Dataset');
exact(types(zenodoDataset),['Dataset'],'Zenodo preservation resource must remain a Dataset, not DataDownload');
exact(refs(zenodoDataset.isPartOf),[DATASET],'Zenodo release lineage drift');
exact(refs(zenodoDataset.isBasedOn),[GITHUB_SOURCE],'Zenodo source provenance drift');
assert.ok(!Object.hasOwn(zenodoDataset,'contentUrl'),'Zenodo DOI landing page must not masquerade as contentUrl');
assert.ok(typeof zenodoDataset.url==='string'&&zenodoDataset.url.startsWith('https://doi.org/10.5281/zenodo.'),'Zenodo DOI URL drift');

const videos=pageNodes.filter(node=>types(node).includes('VideoObject'));
assert.equal(videos.length,4,'Expected four page VideoObject projections');
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
    assert.ok(typeof clip.url==='string'&&/^https:\/\//.test(clip.url),`Clip URL invalid: ${clip['@id']}`);
    starts.push(clip.startOffset);
  }
  assert.equal(new Set(starts).size,starts.length,`Video Clip startOffset values must be unique: ${video['@id']}`);
  exact(refs(video.hasPart),videoClips.map(clip=>clip['@id']),`Video hasPart/Clip closure drift: ${video['@id']}`);
}

const images=pageNodes.filter(node=>types(node).includes('ImageObject'));
assert.ok(images.length>=9,'Too few page ImageObject projections');
for(const image of images)for(const property of ['license','acquireLicensePage','creditText','copyrightNotice'])assert.ok(Object.hasOwn(image,property),`ImageObject missing ${property}: ${image['@id']}`);

assert.equal(pageNodes.filter(node=>types(node).includes('EducationEvent')||types(node).includes('Event')).length,0,'Historical workshop must not masquerade as a current Google Event without exact dates');
assert.equal(pageNodes.filter(node=>types(node).includes('ScholarlyArticle')).length,0,'Supporting publications must not masquerade as article landing pages');
const scholarlySupport=pageNodes.filter(node=>asArray(node.additionalType).includes('https://schema.org/ScholarlyArticle'));
assert.equal(scholarlySupport.length,2,'Expected two scholarly support CreativeWorks');
for(const forbiddenType of ['Product','Review','AggregateRating','QAPage','FAQPage'])assert.equal(pageNodes.filter(node=>types(node).includes(forbiddenType)).length,0,`Unsupported Google surface leaked into page graph: ${forbiddenType}`);

const microdata=deriveGooglePageMicrodata(head,PAGE);
assert.equal(microdata.itemType,'https://schema.org/ProfilePage','DOM ProfilePage Microdata drift');
assert.equal(microdata.mainEntityItemType,'https://schema.org/Person','DOM physician Microdata drift');
assert.equal(microdata.mainEntityId,PHYSICIAN,'DOM physician identity drift');

console.log(JSON.stringify({
  stage:'GOOGLE_STRUCTURED_DATA_2026',
  canonicalNodes:canonical['@graph'].length,
  headNodes:head['@graph'].length,
  supportNodes:support['@graph'].length,
  mergedPageNodes:pageNodes.length,
  intentionalCrossBlockIdentityReuse:crossBlockReuse,
  nativeScalarProjection:true,
  profilePage:'PASS',
  physicianEntity:'ONE_CANONICAL_ID',
  clinicAsset:'DISTINCT_STRONGLY_LINKED',
  machineDataset:{status:'PASS',htmlInjected:false,directDistributions:canonicalDistributions.length,huggingFace:'DERIVED_DATASET',zenodo:'VERSIONED_PRESERVATION_DATASET'},
  video:{objects:videos.length,clips:clips.length},
  imageRights:{objects:images.length,status:'PASS'},
  nonEligibleSupport:{scholarlyWorks:scholarlySupport.length,historicalEventDowngraded:true},
  unsupportedRichResultSurfacesAbsent:true,
  retiredWikidataAbsent:true,
  integrity:'PASS'
},null,2));
