import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {enrichEvidenceBoundedMedicalAuthority} from '../src/lib/clinical-medical-authority.mjs';

const origin='https://www.ghezelbaash.ir';
const personId=origin+'/#saeed-ghezelbash';
const values=x=>x==null?[]:Array.isArray(x)?x:[x];
const id=x=>typeof x==='string'?x:x?.['@id'];
const ids=x=>values(x).map(id);
const types=x=>values(x?.['@type']);
const graph=SOURCE.graph['@graph'];
const byId=new Map(graph.map(x=>[x['@id'],x]));
const physician=byId.get(personId);
const conditions=graph.filter(n=>types(n).includes('MedicalCondition') && ids(n.possibleTreatment).length);
const eligibleTypes=['MedicalProcedure','DiagnosticProcedure','MedicalTherapy','MedicalTest'];

test('113 IndividualPhysician.availableService values are genuine, sourced, non-surgical medical services',()=>{
  assert.ok(types(physician).includes('IndividualPhysician'));
  assert.equal(ids(physician.availableService).length,113);
  assert.equal(new Set(ids(physician.availableService)).size,113);
  assert.equal(graph.filter(n=>types(n).includes('Service')).length,124);
  assert.equal(graph.filter(n=>types(n).includes('MedicalTherapy')).length,21);
  assert.equal(graph.filter(n=>types(n).includes('MedicalProcedure')).length,97);
  assert.equal(graph.filter(n=>types(n).includes('DiagnosticProcedure')).length,6);
  const noSurgery=[
    'procedure-blepharoplasty','procedure-central-lip-lift','procedure-buccal-fat-removal',
    'procedure-submental-liposuction','procedure-rhinoplasty','procedure-facelift',
    'procedure-neck-lift','procedure-body-aesthetic-surgery',
    'procedure-autologous-fat-grafting','procedure-cryolipolysis-localized-fat-reduction',
  ].map(s=>origin+'/'+s);
  const available=new Set(ids(physician.availableService));
  for(const surgery of noSurgery)assert.ok(!available.has(surgery),'Do not advertise unprovided surgery '+surgery);
  const migraine=origin+'/procedure-botulinum-toxin-chronic-migraine';
  assert.ok(available.has(migraine));
  for(const medicalId of available) {
    const n=byId.get(medicalId);
    assert.ok(n,medicalId+' must resolve');
    assert.ok(eligibleTypes.some(t=>types(n).includes(t)),medicalId+' must have medical rather than generic Service type');
    if(medicalId!==migraine){
      assert.ok(types(n).includes('Service'),medicalId+' must be offered clinical Service');
      assert.deepEqual(ids(n.provider),[personId]);
      assert.equal(ids(n.offers).length,1);
    }
  }
});

test('eight clinically treated MedicalConditions retain exact authored Article backlinks',()=>{
  assert.equal(conditions.length,8);
  assert.equal(ids(physician.knowsAbout).length,231);
  const knowledge=new Set(ids(physician.knowsAbout));
  let backlinks=0,articles=0;
  for(const condition of conditions) {
    assert.ok(knowledge.has(condition['@id']),condition['@id']);
    const related=ids(condition.possibleTreatment);
    assert.ok(related.length,condition['@id']+' must have documented therapy');
    for(const treatment of related){
      const target=byId.get(treatment);
      assert.ok(target,'Unresolved treatment '+treatment);
      assert.ok(eligibleTypes.some(t=>types(target).includes(t)));
      assert.deepEqual(ids(target.provider),[personId]);
    }
    for(const workRef of ids(condition.subjectOf)){
      const article=byId.get(workRef);
      assert.ok(article,'Unresolved cited clinical Article '+workRef);
      assert.ok(types(article).includes('Article'));
      assert.ok(article.url.startsWith(origin+'/'));
      assert.ok(ids(article.author).includes(personId));
      assert.ok(ids(article.about).includes(condition['@id']),
        'subjectOf cannot overclaim incidental mentions');
      backlinks++;
    }
    articles += graph.filter(n=>types(n).includes('Article') &&
      ids(n.author).includes(personId) &&
      ids(n.about).includes(condition['@id'])).length;
  }
  assert.equal(backlinks,18,'Only reciprocal authored condition work links');
  assert.equal(articles,18,'No authored Article.about edge left unlinked');
  assert.equal(ids(byId.get(origin+'/biomedical-concept-androgenetic-alopecia').subjectOf).length,0,
    'No manufactured authored Article about this specific diagnosis');
  assert.equal(ids(byId.get(origin+'/biomedical-concept-melasma').subjectOf).length,0,
    'Do not overstate condition article specificity');
});

test('medical authority enrichment is idempotent and rejects fabricated surgical availability',()=>{
  const cloned=structuredClone(graph);
  const P=cloned.find(n=>n['@id']===personId);
  const result=enrichEvidenceBoundedMedicalAuthority(cloned,P,origin);
  assert.equal(result.eligibleMedicalServices,112);
  assert.equal(result.selectedAvailableService,113);
  assert.equal(result.conditionKnowledgeAdded,0);
  assert.equal(result.conditionSubjectOfEdgesAdded,0);
  assert.deepEqual(cloned,graph,'Repeated enrichment must be bitwise JSON-stable');
  const modified=structuredClone(graph);
  const doctor=modified.find(n=>n['@id']===personId);
  doctor.availableService.push({'@id':origin+'/procedure-rhinoplasty'});
  assert.throws(()=>enrichEvidenceBoundedMedicalAuthority(modified,doctor,origin),
    /Unexpected out-of-scope physician.availableService/);
});
