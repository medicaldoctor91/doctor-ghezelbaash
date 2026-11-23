import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {closePhysicianPublishingAndPatientIntake} from '../src/lib/physician-publishing-intake-closure.mjs';

const ORIGIN='https://www.ghezelbaash.ir';
const PID=ORIGIN+'/#saeed-ghezelbash';
const CLINIC=ORIGIN+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const graph=SOURCE.graph['@graph'];
const map=new Map(graph.map(n=>[n['@id'],n]));
const person=map.get(PID), clinic=map.get(CLINIC);

test('IndividualPhysician and the owned PhysiciansOffice explicitly accept new patients',()=>{
  assert.equal(person.isAcceptingNewPatients,true);
  assert.equal(clinic.isAcceptingNewPatients,true);
  assert.equal(person.practicesAt['@id'],CLINIC);
  assert.equal(clinic.owner['@id'],PID);
  assert.equal(clinic.founder['@id'],PID);
  const historicalRole=graph.find(n=>n['@id']===person.hospitalAffiliation['@id']);
  assert.equal(historicalRole['dcterms:temporal'],'2020–2021');
  assert.equal(historicalRole.hospitalAffiliation['@type'],'Hospital');
});

test('Clinical editorial policy is a genuine inline CreativeWork, not a nonexistent external URL',()=>{
  const policy=person.publishingPrinciples;
  assert.equal(policy['@type'],'CreativeWork');
  assert.ok(policy.name.includes('editorial'));
  assert.ok(policy.text.includes('medically reviewed'));
  assert.ok(policy.text.includes('cited'));
  assert.equal(policy.url,undefined);
  assert.equal(policy['@id'],undefined);
  assert.equal(graph.length,1916);
});

test('Publishing/intake extension is stable across repeated graph builds and guards contradictions',()=>{
  const copy=structuredClone(graph);
  const p=copy.find(n=>n['@id']===PID);
  const before=JSON.stringify(copy);
  const receipt=closePhysicianPublishingAndPatientIntake(copy,p);
  assert.deepEqual(receipt,{publisherPolicy:'inline-CreativeWork',acceptingPhysician:true,
    acceptingPractice:true,hospitalAffiliationAdded:false});
  assert.equal(JSON.stringify(copy),before);
  const falseStatus=structuredClone(graph);
  falseStatus.find(n=>n['@id']===PID).isAcceptingNewPatients=false;
  assert.throws(()=>closePhysicianPublishingAndPatientIntake(falseStatus,
    falseStatus.find(n=>n['@id']===PID)),/Contradictory new-patient/);
  const falseHospital=structuredClone(graph);
  falseHospital.find(n=>n['@id']===PID).hospitalAffiliation={'@id':ORIGIN+'/undisclosed-hospital'};
  assert.throws(()=>closePhysicianPublishingAndPatientIntake(falseHospital,
    falseHospital.find(n=>n['@id']===PID)),/historical hospital identity contract/);
});
