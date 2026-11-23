import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {closeNativePhysicianAuthoritySchema} from '../src/lib/physician-schema-native-closure.mjs';

const BASE='https://www.ghezelbaash.ir';
const PERSON=BASE+'/#saeed-ghezelbash';
const CLINIC=BASE+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const SCHOOL=BASE+'/kermanshah-university-of-medical-sciences';
const SPECIALTY=BASE+'/medical-specialty-aesthetic-medicine';
const arr=x=>x==null?[]:Array.isArray(x)?x:[x];
const id=x=>typeof x==='string'?x:x?.['@id'];
const ids=x=>arr(x).map(id);
const nodes=SOURCE.graph['@graph'];
const byId=new Map(nodes.map(n=>[n['@id'],n]));
const physician=byId.get(PERSON);

test('solo-practice clinical attribution preserves owner/founder/practicesAt, not invented employee or clinic specialty',()=>{
  const clinic=byId.get(CLINIC);
  assert.equal(physician.worksFor,undefined);
  assert.deepEqual(ids(physician.practicesAt),[CLINIC]);
  assert.deepEqual(ids(physician.workLocation).slice(0,1),[CLINIC]);
  assert.equal(clinic.employee,undefined);
  assert.deepEqual(ids(clinic.owner),[PERSON]);
  assert.deepEqual(ids(clinic.founder),[PERSON]);
  assert.equal(clinic.medicalSpecialty,undefined);
  assert.deepEqual(ids(physician.medicalSpecialty),[SPECIALTY]);
});

test('Real existing organization memberships are reciprocal, not invented',()=>{
  const orgs=ids(physician.memberOf);
  assert.equal(orgs.length,4);
  assert.deepEqual(new Set(ids(physician.affiliation)),new Set(orgs));
  for(const orgId of orgs){
    const node=byId.get(orgId);
    assert.ok(arr(node?.['@type']).includes('Organization'),'Missing existing member organization');
    assert.ok(ids(node.member).includes(PERSON),'Organization.member lacks reciprocal Person.memberOf');
  }
});

test('University.alumni and Person.contactPoint are reciprocally grounded',()=>{
  const university=byId.get(SCHOOL);
  const clinic=byId.get(CLINIC);
  assert.ok(ids(physician.alumniOf).includes(SCHOOL));
  assert.ok(ids(university.alumni).includes(PERSON));
  assert.deepEqual(ids(physician.contactPoint).filter(Boolean),ids(clinic.contactPoint));
  assert.equal(arr(physician.contactPoint).length,2,'Physician retains office reception plus his online consultation contact');
  assert.deepEqual(ids(physician.hasCredential).includes(BASE+'/credential-doctor-of-medicine'),true);
  assert.equal(physician.honorificSuffix,'M.D.');
  assert.equal(physician.occupationalCategory,'Physician');
  assert.equal(nodes.length,1916,'Never invent or delete canonical nodes');
});

test('Schema.org native closure is deterministic, idempotent and fail closed on false employment/membership',()=>{
  const clone=structuredClone(nodes);
  const q=clone.find(n=>n['@id']===PERSON);
  const before=JSON.stringify(clone);
  const again=closeNativePhysicianAuthoritySchema(clone,q);
  assert.equal(again.totalNewEdges,0);
  assert.equal(JSON.stringify(clone),before);
  const invalid=structuredClone(nodes);
  const p=invalid.find(n=>n['@id']===PERSON);
  p.practicesAt={'@id':BASE+'/other-clinic'};
  assert.throws(()=>closeNativePhysicianAuthoritySchema(invalid,p),/Canonical employer/);
  const badMembership=structuredClone(nodes);
  const m=badMembership.find(n=>n['@id']===PERSON);
  m.affiliation={'@id':BASE+'/unrelated-organization'};
  assert.throws(()=>closeNativePhysicianAuthoritySchema(badMembership,m),/Incomplete native Schema.org authority closure|Canonical employer/);
});
