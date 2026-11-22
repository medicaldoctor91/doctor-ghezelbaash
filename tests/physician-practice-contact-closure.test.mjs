import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {closePhysicianAndPracticeContactGraph} from '../src/lib/physician-practice-contact-closure.mjs';

const O='https://www.ghezelbaash.ir';
const personId=O+'/#saeed-ghezelbash';
const clinicId=O+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const receptionistId=O+'/online-consultation-contact-point';
const phone='+989308209494',email='doctor@ghezelbaash.ir';
const graph=SOURCE.graph['@graph'],m=new Map(graph.map(x=>[x['@id'],x]));
const person=m.get(personId),clinic=m.get(clinicId);
const all=x=>x==null?[]:Array.isArray(x)?x:[x];
const id=x=>typeof x==='string'?x:x?.['@id'];
const ids=x=>all(x).map(id).filter(Boolean);

test('doctor is directly reachable for online assessment and also via the office reception',()=>{
  assert.equal(graph.length,1916,'No new canonical entity IDs');
  assert.equal(person.telephone,phone);
  assert.equal(clinic.telephone,phone);
  assert.equal(clinic.email,email);
  assert.ok(all(clinic.sameAs).includes('https://yandex.com/maps/org/63459342435/'));
  assert.ok(!all(person.sameAs).includes('https://yandex.com/maps/org/63459342435/'),'A clinic listing cannot become a personal identity');
  assert.deepEqual(ids(clinic.contactPoint),[receptionistId]);
  const contacts=all(person.contactPoint);
  assert.equal(contacts.length,2);
  assert.deepEqual(ids(person.contactPoint),[receptionistId]);
  const doctor=contacts[1];
  assert.equal(doctor['@type'],'ContactPoint');
  assert.equal(doctor['@id'],undefined,'The nested doctor contact is not a fabricated additional entity');
  assert.equal(doctor.telephone,phone,'No second or invented phone number');
  assert.equal(doctor.email,email);
  assert.equal(doctor.url,'https://ig.me/m/doctor.ghezelbaash');
  assert.equal(doctor.contactType,'physician online initial assessment inquiries');
  assert.deepEqual(doctor.availableLanguage,['fa-IR','en']);
  const reception=m.get(receptionistId);
  assert.equal(reception.contactType,'appointment scheduling and reception');
  assert.equal(reception.email,email);
  assert.equal(reception.telephone,phone);
  assert.equal(all(clinic.contactPoint).length,1,'Office is not assigned to doctor-only DM contact');
});

test('communications point to correct Person and office, on-site phone remains the official practice endpoint',()=>{
  assert.deepEqual(ids(m.get(O+'/action-contact-clinic').recipient),[clinicId]);
  assert.deepEqual(ids(m.get(O+'/action-online-initial-consultation').recipient),[personId]);
  assert.deepEqual(ids(m.get(O+'/in-person-clinic-service-channel').servicePhone),[receptionistId]);
  assert.equal(m.get(O+'/online-consultation-channel').servicePhone,undefined);
  assert.equal(m.get(O+'/online-consultation-channel').serviceUrl,'https://ig.me/m/doctor.ghezelbaash');
  assert.deepEqual(ids(m.get(O+'/in-person-clinic-service-channel').serviceLocation),[clinicId]);
  assert.deepEqual(ids(m.get(O+'/action-online-initial-consultation').object),[O+'/free-online-aesthetic-initial-consultation']);
});

test('contact graph closure is bytewise idempotent and rejects fabricated second routes',()=>{
  const cloned=structuredClone(graph);
  const p=cloned.find(x=>x['@id']===personId);
  const before=JSON.stringify(cloned);
  const receipt=closePhysicianAndPracticeContactGraph(cloned,p);
  assert.deepEqual(receipt,{doctorContactModes:2,clinicContactModes:1,sharedTelephone:phone,
    distinctDirectOnlineContact:true,verifiedClinicSameAs:'https://yandex.com/maps/org/63459342435/',additionalGraphEntityIds:0});
  assert.equal(JSON.stringify(cloned),before);
  const wrong=structuredClone(graph);
  const w=wrong.find(x=>x['@id']===personId);
  w.contactPoint[1].telephone='+989000000000';
  assert.throws(()=>closePhysicianAndPracticeContactGraph(wrong,w),/Unexpected preexisting physician contact routes/);
  const wrongOffice=structuredClone(graph);
  const office=wrongOffice.find(x=>x['@id']===clinicId);
  office.telephone='+989999999999';
  assert.throws(()=>closePhysicianAndPracticeContactGraph(wrongOffice,
    wrongOffice.find(x=>x['@id']===personId)),/Unverified person\/clinic contact source/);
});
