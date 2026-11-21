import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {enrichMedicalResearchAndSpecialtyGraph} from '../src/lib/medical-research-specialty-graph.mjs';
const ORIGIN='https://www.ghezelbaash.ir';
const PERSON=ORIGIN+'/#saeed-ghezelbash';
const arr=x=>x==null?[]:Array.isArray(x)?x:[x];
const id=x=>typeof x==='string'?x:x?.['@id'];
const ids=x=>arr(x).map(id);
const t=n=>arr(n?.['@type']);
const nodes=SOURCE.graph['@graph'];
const map=new Map(nodes.map(n=>[n['@id'],n]));
const physician=map.get(PERSON);
const RESEARCH=[
 ['biomedical-concept-major-depressive-disorder','article-mdd-attachment-dissociation-trauma-2021'],
 ['biomedical-concept-bipolar-disorder','article-omega-3-bipolar-i-2016']
];

test('two already authored disease research subjects are typed MedicalCondition and reciprocally connected, never offered clinic treatments',()=>{
  assert.equal(nodes.length,1916,'No fabricated extra nodes');
  const med=nodes.filter(n=>t(n).includes('MedicalCondition'));
  assert.equal(med.length,10);
  assert.equal(med.filter(n=>ids(n.possibleTreatment).length).length,8);
  assert.equal(ids(physician.knowsAbout).length,231);
  const liveOffers=new Set(ids(physician.availableService));
  const rawOfferIds=new Set(ids(physician.makesOffer));
  assert.equal(liveOffers.size,113);
  assert.equal(rawOfferIds.size,124);
  for(const [conceptSlug,articleSlug] of RESEARCH){
    const c=map.get(ORIGIN+'/'+conceptSlug);
    const article=map.get(ORIGIN+'/'+articleSlug);
    assert.ok(t(c).includes('DefinedTerm'));
    assert.ok(t(c).includes('MedicalCondition'));
    assert.deepEqual(ids(c.subjectOf),[article['@id']]);
    assert.ok(t(article).includes('ScholarlyArticle'));
    assert.deepEqual(ids(article.author),[PERSON]);
    assert.ok(ids(article.about).includes(c['@id']));
    assert.ok(ids(physician.authoredWork).includes(article['@id']));
    assert.ok(ids(physician.knowsAbout).includes(c['@id']));
    assert.ok(!ids(c.possibleTreatment).length,'Research paper is not a clinic treatment');
    assert.equal(c.relevantSpecialty,undefined,'Do not misrepresent psychiatric research as aesthetic specialty');
    assert.ok(!liveOffers.has(c['@id']));
    assert.ok(!rawOfferIds.has(c['@id']));
  }
});

test('clinical relevantSpecialty is grounded and bounded: 20 therapies, six diagnostic procedures, eight treated conditions',()=>{
  const specialty=ORIGIN+'/medical-specialty-aesthetic-medicine';
  assert.equal(id(physician.medicalSpecialty),specialty);
  assert.ok(t(map.get(specialty)).includes('MedicalSpecialty'));
  const available=new Set(ids(physician.availableService));
  const relevant=nodes.filter(n=>ids(n.relevantSpecialty).includes(specialty));
  assert.equal(relevant.length,34,'Avoid overspecifying specialty on all 112 procedures');
  const therapyAndDiagnostics=relevant.filter(n=>t(n).includes('Service'));
  const conditions=relevant.filter(n=>t(n).includes('MedicalCondition'));
  assert.equal(therapyAndDiagnostics.length,26);
  assert.equal(conditions.length,8);
  assert.equal(therapyAndDiagnostics.filter(n=>t(n).includes('MedicalTherapy')).length,20);
  assert.equal(therapyAndDiagnostics.filter(n=>t(n).includes('DiagnosticProcedure')).length,6);
  for(const n of therapyAndDiagnostics){
    assert.ok(available.has(n['@id']));
    assert.ok(t(n).includes('MedicalTherapy')||t(n).includes('DiagnosticProcedure'));
    assert.deepEqual(ids(n.provider),[PERSON]);
    assert.deepEqual(ids(n.relevantSpecialty),[specialty]);
  }
  for(const n of conditions){
    assert.ok(ids(n.possibleTreatment).length);
    assert.deepEqual(ids(n.relevantSpecialty),[specialty]);
  }
  assert.equal(map.get(ORIGIN+'/procedure-botulinum-toxin-chronic-migraine').relevantSpecialty,undefined);
});

test('SHACL distinguishes eight clinician-treated conditions and two research-only conditions',()=>{
  const sh=SOURCE.validation.shaclSupplement;
  assert.ok(sh.includes('ex:MedicalConditionTreatmentShape a sh:NodeShape'));
  assert.ok(sh.includes('ex:ResearchOnlyMedicalConditionShape a sh:NodeShape'));
  assert.ok(sh.includes('ex:BoundedClinicalRelevantSpecialtyShape a sh:NodeShape'));
  assert.ok(!sh.includes('sh:targetClass schema:MedicalCondition ;'));
  assert.ok(sh.includes('sh:path schema:possibleTreatment ; sh:maxCount 0'));
  assert.ok(sh.includes('sh:path schema:relevantSpecialty ; sh:maxCount 0'));
  assert.ok(sh.includes('sh:class schema:ScholarlyArticle'));
});

test('graph-only research/specialty enrichment is idempotent and fails closed if authorship or service scope drifts',()=>{
  const copy=structuredClone(SOURCE);
  const p=copy.graph['@graph'].find(n=>n['@id']===PERSON);
  const before=JSON.stringify(copy);
  const result=enrichMedicalResearchAndSpecialtyGraph(copy,p,ORIGIN);
  assert.deepEqual({clinical:result.clinicalConditions,research:result.researchConditions,
    therapyDiagnostics:result.medicallySpecializedServices,conditions:result.medicallySpecializedConditions},
    {clinical:8,research:2,therapyDiagnostics:26,conditions:8});
  assert.equal(JSON.stringify(copy),before,'Re-running must preserve output exactly');
  const modified=structuredClone(SOURCE);
  const q=modified.graph['@graph'].find(n=>n['@id']===PERSON);
  const paper=modified.graph['@graph'].find(n=>n['@id']===ORIGIN+'/'+RESEARCH[0][1]);
  paper.author={'@id':ORIGIN+'/different-person'};
  assert.throws(()=>enrichMedicalResearchAndSpecialtyGraph(modified,q,ORIGIN),/Study-to-condition author attribution missing/);
  const weakened=structuredClone(SOURCE);
  const wp=weakened.graph['@graph'].find(n=>n['@id']===PERSON);
  weakened.validation.shaclSupplement=weakened.validation.shaclSupplement.replace(
    'sh:path schema:possibleTreatment ; sh:maxCount 0','sh:path schema:possibleTreatment ; sh:minCount 1');
  assert.throws(()=>enrichMedicalResearchAndSpecialtyGraph(weakened,wp,ORIGIN),
    /Compiled clinical vs research SHACL contract was weakened/);
});
