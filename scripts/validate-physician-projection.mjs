import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deriveGooglePageMicrodata} from '../src/lib/google-page-microdata.mjs';
import {projectNode} from '../src/lib/semantic-projection.mjs';

const PHYSICIAN='https://www.ghezelbaash.ir/#saeed-ghezelbash';
const CLINIC='https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const SPECIALTY='https://www.ghezelbaash.ir/#medical-specialty-aesthetic-medicine';
const IRAN='https://www.ghezelbaash.ir/#country-iran';
const IRAQ='https://www.ghezelbaash.ir/#country-iraq';
const WEBPAGE='https://www.ghezelbaash.ir/#webpage';
const UNIVERSITY='https://www.ghezelbaash.ir/#kermanshah-university-of-medical-sciences';
const WPA_EVENT='https://www.ghezelbaash.ir/#event-wpa-xvii-world-congress-psychiatry-2017';
const EXPECTED_AREAS=[IRAN,IRAQ];
const WIKIDATA_FIELDS=['Q3332453','Q3745388','Q4095199','Q17081562','Q7049059','Q537918','Q613879','Q3675172','Q4936963','Q2276095','Q2697787','Q685286','Q2559992','Q3267987','Q16949888','Q305190','Q1641068','Q26967','Q840929','Q825490','Q1423937','Q851186','Q935781','Q133823','Q7439446','Q79928','Q5133849','Q2752427'].map(qid=>`https://www.wikidata.org/entity/${qid}`);
const WIKIDATA_IDENTITY_URLS=[
  'https://www.wikidata.org/entity/Q140287622',
  'https://commons.wikimedia.org/wiki/Category:Saeed_Ghezelbash',
  'https://commons.wikimedia.org/wiki/Creator:Saeed_Ghezelbash',
  'https://en.wikisource.org/wiki/Author:Mohammad_Saeed_Ghezelbash',
  'https://www.pinterest.com/qezelbaash/',
  'https://www.tiktok.com/@ghezelbaash',
  'https://www.youtube.com/channel/UCAiLkR6O3k9aDU9CYSeXPWQ',
];
const WIKIDATA_PERSON_SUBJECTS=[
  'https://www.ghezelbaash.ir/#evidence-magiran-author',
  'https://www.ghezelbaash.ir/#evidence-wikimedia-commons-creator',
  'https://www.ghezelbaash.ir/#evidence-wikisource-author',
  'https://www.ghezelbaash.ir/#video-jalupro-vs-profhilo',
  'https://www.ghezelbaash.ir/#wikiversity-individualized-botulinum-toxin-focused-review',
  'https://www.ghezelbaash.ir/#wikiversity-botulinum-toxin-aesthetic-medicine',
  'https://www.ghezelbaash.ir/#wikiversity-facial-assessment-before-aesthetic-botulinum-toxin',
];

const asArray=value=>Array.isArray(value)?value:(value==null?[]:[value]);
const types=node=>asArray(node?.['@type']);
const refId=value=>typeof value==='string'?value:value?.['@id'];
const refs=value=>asArray(value).map(refId).filter(Boolean);
const sortedUnique=values=>[...new Set(values)].sort();
const assertExact=(actual,expected,label)=>assert.deepEqual(sortedUnique(actual),sortedUnique(expected),label);
const requireNode=(byId,id,label)=>{
  const node=byId.get(id);
  assert.ok(node,`${label} missing: ${id}`);
  return node;
};

const [graphDocument,headProfile,headIds]=await Promise.all([
  readFile('src/data/semantic/knowledge-graph.jsonld','utf8').then(JSON.parse),
  readFile('src/data/semantic/head-profile.json','utf8').then(JSON.parse),
  readFile('src/data/semantic/head-ids.json','utf8').then(JSON.parse),
]);
const graph=graphDocument['@graph'];
assert.ok(Array.isArray(graph),'Canonical graph lacks @graph');
const byId=new Map(graph.filter(node=>node?.['@id']).map(node=>[node['@id'],node]));
assert.equal(byId.size,graph.filter(node=>node?.['@id']).length,'Canonical graph contains duplicate @id values');
assert.equal(new Set(headIds).size,headIds.length,'Head selection contains duplicate IDs');

const physician=requireNode(byId,PHYSICIAN,'Canonical physician');
const clinic=requireNode(byId,CLINIC,'Canonical clinic');
const specialty=requireNode(byId,SPECIALTY,'Canonical medical specialty');
const iran=requireNode(byId,IRAN,'Canonical Iran area');
const iraq=requireNode(byId,IRAQ,'Canonical Iraq area');
const webpage=requireNode(byId,WEBPAGE,'Canonical ProfilePage');

assertExact(types(physician),['Person','IndividualPhysician'],'Canonical physician must remain one Person + IndividualPhysician node');
assertExact(graph.filter(node=>types(node).includes('IndividualPhysician')).map(node=>node['@id']),[PHYSICIAN],'A second IndividualPhysician identity would fragment the physician entity');
assertExact(refs(physician.practicesAt),[CLINIC],'practicesAt must resolve to the canonical clinic');
assertExact(refs(physician.medicalSpecialty),[SPECIALTY],'medicalSpecialty must resolve to the canonical specialty');
assertExact(refs(physician.areaServed),EXPECTED_AREAS,'Physician in-person catchment must remain Iran + Iraq');
assert.ok(refs(physician.worksFor).includes(CLINIC),'Physician worksFor relation lost canonical clinic');
assert.ok(refs(physician.affiliation).includes(CLINIC),'Physician affiliation relation lost canonical clinic');
assert.ok(refs(physician.workLocation).includes(CLINIC),'Physician workLocation relation lost canonical clinic');
assert.ok(refs(physician.owns).includes(CLINIC),'Physician ownership relation lost canonical clinic');
assertExact(refs(physician.additionalType),['https://www.wikidata.org/entity/Q5'],'Wikidata human classification drift');
assert.equal(physician.birthDate,'1991-05-29','Wikidata birth date drift');
assertExact(refs(physician.gender),['https://schema.org/Male'],'Wikidata gender drift');
assertExact(refs(physician.nationality),[IRAN],'Wikidata citizenship/nationality drift');
assertExact(asArray(physician.email),['mailto:medicaldoctor91@gmail.com','mailto:doctor@ghezelbaash.ir'],'Wikidata email set drift');
for(const field of WIKIDATA_FIELDS)assert.ok(refs(physician.knowsAbout).includes(field),`Wikidata field-of-work missing from Person: ${field}`);
assert.ok(refs(physician.hasOccupation).includes('https://www.wikidata.org/entity/Q256688'),'Wikidata medical-director position missing from Person');
assert.ok(refs(physician.affiliation).includes(UNIVERSITY),'Wikidata university affiliation missing from Person');
assert.ok(refs(physician.performerIn).includes(WPA_EVENT),'Wikidata WPA congress participation missing from Person');
for(const url of WIKIDATA_IDENTITY_URLS)assert.ok(refs(physician.sameAs).includes(url),`Wikidata identity/sitelink missing from Person: ${url}`);
for(const subject of WIKIDATA_PERSON_SUBJECTS)assert.ok(refs(physician.subjectOf).includes(subject),`Wikidata evidence/work missing from Person: ${subject}`);

assert.ok(types(clinic).includes('MedicalClinic'),'Clinic lost MedicalClinic type');
assertExact(refs(clinic.medicalSpecialty),[SPECIALTY],'Clinic medicalSpecialty must resolve to the canonical specialty');
assertExact(refs(clinic.areaServed),EXPECTED_AREAS,'Clinic catchment must remain Iran + Iraq');
assertExact(refs(clinic.owner),[PHYSICIAN],'Clinic owner must be the canonical physician');
assertExact(refs(clinic.founder),[PHYSICIAN],'Clinic founder must be the canonical physician');
assertExact(refs(clinic.employee),[PHYSICIAN],'Clinic employee must be the canonical physician');
assertExact(types(specialty),['MedicalSpecialty'],'Specialty target must be a MedicalSpecialty');
assert.ok(types(iran).includes('Country')&&types(iran).includes('Place'),'Iran area must remain Country + Place');
assert.ok(types(iraq).includes('Country')&&types(iraq).includes('Place'),'Iraq area must remain Country + Place');
assert.ok(types(webpage).includes('ProfilePage'),'Canonical page lost ProfilePage type');
assertExact(refs(webpage.mainEntity),[PHYSICIAN],'ProfilePage mainEntity must remain the canonical physician');

const physicianSpec=headProfile.nodes?.[PHYSICIAN];
const clinicSpec=headProfile.nodes?.[CLINIC];
assert.ok(physicianSpec&&clinicSpec,'Head projection profiles for physician/clinic are missing');
for(const property of ['practicesAt','medicalSpecialty','areaServed']){
  assert.ok(physicianSpec.include?.includes(property),`Physician Head projection dropped ${property}`);
}
assertExact(physicianSpec.valueAllow?.['@type'],['Person','IndividualPhysician'],'Head physician types must preserve Person + IndividualPhysician');
assertExact(physicianSpec.refAllow?.practicesAt,[CLINIC],'Head practicesAt allowlist drift');
assertExact(physicianSpec.refAllow?.medicalSpecialty,[SPECIALTY],'Head physician specialty allowlist drift');
assertExact(physicianSpec.refAllow?.areaServed,EXPECTED_AREAS,'Head physician area allowlist drift');
assertExact(clinicSpec.refAllow?.medicalSpecialty,[SPECIALTY],'Head clinic specialty allowlist drift');
assertExact(clinicSpec.refAllow?.areaServed,EXPECTED_AREAS,'Head clinic area allowlist drift');
assertExact(clinicSpec.refAllow?.owner,[PHYSICIAN],'Head clinic owner allowlist drift');
assertExact(clinicSpec.refAllow?.founder,[PHYSICIAN],'Head clinic founder allowlist drift');
assertExact(clinicSpec.refAllow?.employee,[PHYSICIAN],'Head clinic employee allowlist drift');
for(const id of [PHYSICIAN,CLINIC,SPECIALTY,IRAN,IRAQ,WEBPAGE]){
  assert.ok(headIds.includes(id),`Head reference closure target is not selected: ${id}`);
  assert.ok(headProfile.nodes?.[id],`Head reference closure target lacks projection policy: ${id}`);
}

const projectedNodes=headIds.map(id=>projectNode(requireNode(byId,id,'Head-selected canonical node'),headProfile.nodes?.[id]));
const projectedById=new Map(projectedNodes.map(node=>[node['@id'],node]));
const projectedPhysician=requireNode(projectedById,PHYSICIAN,'Projected physician');
const projectedClinic=requireNode(projectedById,CLINIC,'Projected clinic');
assertExact(types(projectedPhysician),['Person','IndividualPhysician'],'Projected physician types drift');
assertExact(refs(projectedPhysician.practicesAt),[CLINIC],'Projected practicesAt drift');
assertExact(refs(projectedPhysician.medicalSpecialty),[SPECIALTY],'Projected physician specialty drift');
assertExact(refs(projectedPhysician.areaServed),EXPECTED_AREAS,'Projected physician areas drift');
assertExact(refs(projectedClinic.medicalSpecialty),[SPECIALTY],'Projected clinic specialty drift');
assertExact(refs(projectedClinic.areaServed),EXPECTED_AREAS,'Projected clinic areas drift');
for(const node of [projectedPhysician,projectedClinic]){
  for(const property of ['medicalSpecialty','areaServed']){
    for(const id of refs(node[property]))assert.ok(projectedById.has(id),`Projected ${property} target is dangling: ${id}`);
  }
}
for(const id of refs(projectedPhysician.practicesAt))assert.ok(projectedById.has(id),`Projected practicesAt target is dangling: ${id}`);

const projectedPage=requireNode(projectedById,WEBPAGE,'Projected ProfilePage');
const microdata=deriveGooglePageMicrodata({'@graph':[projectedPage,projectedPhysician]},WEBPAGE);
assert.equal(microdata.itemType,'https://schema.org/ProfilePage','DOM page Microdata type drift');
assert.equal(microdata.mainEntityItemType,'https://schema.org/Person','DOM physician Microdata must remain the minimal Person view');
assert.equal(microdata.mainEntityId,PHYSICIAN,'DOM physician Microdata identity drift');

const headDocument={'@context':graphDocument['@context'],'@graph':projectedNodes};
const headBytes=Buffer.byteLength(`${JSON.stringify(headDocument)}\n`);
assert.ok(headBytes<=headProfile.maxBytes,`Head graph ${headBytes} exceeds ${headProfile.maxBytes}`);

console.log(JSON.stringify({
  stage:'PHYSICIAN_SEMANTIC_PROJECTION',
  identityModel:'ONE_CANONICAL_ID',
  jsonLdTypes:['Person','IndividualPhysician'],
  domMicrodataType:'Person',
  practicesAt:'INDIVIDUAL_PHYSICIAN_TO_MEDICAL_CLINIC',
  medicalSpecialty:'PHYSICIAN_AND_CLINIC_TO_DEFINED_MEDICAL_SPECIALTY',
  areaServed:'PHYSICIAN_AND_CLINIC_TO_DEFINED_COUNTRIES',
  keyReferenceClosure:'PASS',
  headNodes:projectedNodes.length,
  headBytes,
  headBudget:headProfile.maxBytes,
  dataLoss:false,
  entityFragmentation:false,
  integrity:'PASS'
},null,2));
