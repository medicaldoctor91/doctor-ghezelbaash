import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {maximizeCanonicalPhysicianGraphAttribution} from '../src/lib/physician-max-attribution.mjs';

const ORIGIN='https://www.ghezelbaash.ir';
const PERSON=ORIGIN+'/#saeed-ghezelbash';
const many=x=>x==null?[]:Array.isArray(x)?x:[x];
const id=x=>typeof x==='string'?x:x?.['@id'];
const ids=x=>many(x).map(id);
const typed=(x,t)=>many(x?.['@type']).includes(t);
const nodes=SOURCE.graph['@graph'];
const byId=new Map(nodes.map(x=>[x['@id'],x]));
const person=byId.get(PERSON);

test('Every authored Article is now directly reachable through Person.authoredWork, without invented authorship',()=>{
  const authoredArticles=nodes.filter(n=>typed(n,'Article')&&ids(n.author).includes(PERSON));
  const authoredIds=new Set(ids(person.authoredWork));
  assert.equal(authoredArticles.length,65);
  assert.equal(authoredIds.size,68,'Six legacy authored works plus 62 existing canonical Articles');
  for(const article of authoredArticles)
    assert.ok(authoredIds.has(article['@id']),article['@id']+' must be Person.authoredWork');
  for(const workId of authoredIds){
    const work=byId.get(workId);
    assert.ok(work,'authoredWork missing local identity');
    assert.ok(ids(work.author).includes(PERSON),'No invented physician author for '+workId);
  }
});

test('All original authored Article medical about-topics become physician knowsAbout, excluding clinic, location and self',()=>{
  const authored=nodes.filter(n=>typed(n,'Article')&&ids(n.author).includes(PERSON));
  const knowledge=new Set(ids(person.knowsAbout));
  assert.equal(knowledge.size,244,'231 medically reviewed knowledge references plus 13 authored medical subjects');
  const topicTypes=['DefinedTerm','MedicalSpecialty','MedicalProcedure','MedicalTherapy','MedicalCondition'];
  for(const article of authored)
    for(const topicId of ids(article.about)){
      const topic=byId.get(topicId);
      if(topic&&topicTypes.some(t=>typed(topic,t)))
        assert.ok(knowledge.has(topicId),article['@id']+' about '+topicId);
    }
  for(const incidental of [PERSON,ORIGIN+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah',ORIGIN+'/city-kermanshah'])
    assert.ok(!knowledge.has(incidental),'Person and clinic/place are not medical topic expertise');
});

test('Every eligible medically typed Service is annotated relevantSpecialty with existing physician MedicalSpecialty',()=>{
  const specialty=ORIGIN+'/medical-specialty-aesthetic-medicine';
  assert.equal(id(person.medicalSpecialty),specialty);
  const eligible=new Set(ids(person.availableService));
  const services=nodes.filter(n=>eligible.has(n['@id'])&&typed(n,'Service')&&
    ['MedicalProcedure','MedicalTherapy','DiagnosticProcedure','MedicalTest'].some(t=>typed(n,t)));
  assert.equal(services.length,112);
  const medicalSpecialtyTargets=nodes.filter(n=>ids(n.relevantSpecialty).includes(specialty));
  assert.equal(medicalSpecialtyTargets.length,120,'112 Services and eight clinical conditions');
  for(const service of services){
    assert.deepEqual(ids(service.provider),[PERSON],service['@id']);
    assert.deepEqual(ids(service.relevantSpecialty),[specialty],service['@id']);
  }
  const psychiatricResearch=['biomedical-concept-major-depressive-disorder','biomedical-concept-bipolar-disorder'];
  for(const slug of psychiatricResearch){
    assert.equal(byId.get(ORIGIN+'/'+slug).relevantSpecialty,undefined,'Research is not cosmetic-treatment specialty');
  }
});

test('Specialty.subjectOf is the exact inverse of physician-authored Article.about for this specialty',()=>{
  const specialty=byId.get(ORIGIN+'/medical-specialty-aesthetic-medicine');
  const referenced=ids(specialty.subjectOf);
  assert.equal(referenced.length,12);
  assert.equal(new Set(referenced).size,12);
  const authoredAbout=nodes.filter(n=>typed(n,'Article')&&ids(n.author).includes(PERSON)&&
    ids(n.about).includes(specialty['@id']));
  assert.deepEqual(new Set(referenced),new Set(authoredAbout.map(x=>x['@id'])));
});

test('Exhaustive graph authority closure is deterministic, idempotent and fail-closed',()=>{
  const copy=structuredClone(SOURCE);
  const p=copy.graph['@graph'].find(x=>x['@id']===PERSON);
  const before=JSON.stringify(copy);
  const metrics=maximizeCanonicalPhysicianGraphAttribution(copy,p,ORIGIN);
  assert.deepEqual(metrics,{
    articleAuthorCount:65,
    directPhysicianAuthoredWorkAdded:0,
    personAuthoredWork:68,
    additionalPhysicianKnowsAbout:0,
    personKnowsAbout:244,
    actualMedicalServiceSpecialtyAdded:0,
    attributedMedicalServices:112,
    physicianAuthoredSpecialtyBacklinksAdded:0,
    specialtySubjectOf:12,
    graphNodeCount:1916
  });
  assert.equal(JSON.stringify(copy),before);

  const invalid=structuredClone(SOURCE);
  const wrong=invalid.graph['@graph'].find(x=>x['@id']===PERSON);
  const article=invalid.graph['@graph'].find(x=>x['@id']===ORIGIN+'/botox#article');
  article.author={'@id':ORIGIN+'/unknown-physician'};
  assert.throws(()=>maximizeCanonicalPhysicianGraphAttribution(invalid,wrong,ORIGIN),
    /Published author\/research portfolio cardinality drift/);
});
