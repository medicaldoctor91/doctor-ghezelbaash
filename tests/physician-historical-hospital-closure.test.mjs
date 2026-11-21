import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {linkHistoricAriaHospital} from '../src/lib/physician-historical-hospital-closure.mjs';

const ROOT='https://www.ghezelbaash.ir';
const DOCTOR=ROOT+'/#saeed-ghezelbash';
const ROLE=ROOT+'/role-former-hospital-medical-technical-director';
const HOSPITAL='https://maps.app.goo.gl/cknJK2yufL2e9idHA';
const graph=SOURCE.graph['@graph'];
const byId=new Map(graph.map(n=>[n['@id'],n]));
const physician=byId.get(DOCTOR);
const role=byId.get(ROLE);

test('named Aria Hospital is a typed Hospital, explicitly disambiguated as Kermanshah institution',()=>{
  const hospital=physician.hospitalAffiliation;
  assert.equal(hospital['@id'],HOSPITAL);
  assert.equal(hospital['@type'],'Hospital');
  assert.equal(hospital.name,'بیمارستان آریا');
  assert.equal(hospital.alternateName,'Aria Hospital');
  assert.equal(hospital.identifier,'/g/1tdyd345');
  assert.equal(hospital.address.addressLocality,'کرمانشاه');
  assert.equal(hospital.address.addressCountry,'IR');
  assert.equal(hospital.geo.latitude,34.3006168);
  assert.equal(hospital.geo.longitude,47.0527056);
  assert.equal(graph.length,1916,'Hospital is an external resource, not an invented canonical local WebPage');
  assert.equal(byId.has(HOSPITAL),false);
});

test('2020–2021 medical technical director historical role binds to the same Hospital, not current employment',()=>{
  assert.ok(physician.holdsProfessionalRole.some(x=>x['@id']===ROLE));
  assert.deepEqual(role.roleHolder,{'@id':DOCTOR});
  assert.equal(role['dcterms:temporal'],'2020–2021');
  assert.deepEqual(role.roleContext,{'@id':HOSPITAL});
  assert.equal(physician.worksFor,undefined);
  const clinic=byId.get(ROOT+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah');
  assert.equal(clinic.employee,undefined);
  assert.equal(clinic.medicalSpecialty,undefined);
  assert.equal(clinic.hospitalAffiliation,undefined);
});

test('18 @vocab schema term definitions retain IRI-typed coercions with no semantic changes',()=>{
  const ctx=SOURCE.graph['@context'];
  assert.equal(ctx['@vocab'],'https://schema.org/');
  assert.equal(ctx.schema,'https://schema.org/');
  const implicit=Object.entries(ctx).filter(([k,v])=>v&&typeof v==='object'&&
    !Array.isArray(v)&&v['@id']===undefined&&v['@type']==='@id'&&!k.startsWith('@'));
  assert.equal(implicit.length,18);
  assert.equal(ctx.url['@type'],'@id');
  assert.equal(ctx.url['@id'],undefined);
  assert.equal(ctx.hasMap['@type'],'@id');
  assert.equal(ctx.sameAs['@id'],undefined);
  assert.equal(ctx.roleContext['@id'],'kg:roleContext');
});

test('hospital closure is idempotent and rejects wrong hospital and wrong historical role',()=>{
  const copy=structuredClone(SOURCE);
  const person=copy.graph['@graph'].find(n=>n['@id']===DOCTOR);
  const before=JSON.stringify(copy);
  const out=linkHistoricAriaHospital(copy,person);
  assert.deepEqual(out,{
    hospital:HOSPITAL,role:ROLE,historicalPeriod:'2020–2021',
    hospitalAdded:false,roleContextAdded:false,compactedSchemaTerms:0
  });
  assert.equal(JSON.stringify(copy),before);

  const wrongHospital=structuredClone(SOURCE);
  const p=wrongHospital.graph['@graph'].find(n=>n['@id']===DOCTOR);
  p.hospitalAffiliation={'@id':'https://maps.app.goo.gl/unrelated','@type':'Hospital'};
  assert.throws(()=>linkHistoricAriaHospital(wrongHospital,p),/Unexpected hospital identity/);

  const wrongRole=structuredClone(SOURCE);
  const q=wrongRole.graph['@graph'].find(n=>n['@id']===DOCTOR);
  const r=wrongRole.graph['@graph'].find(n=>n['@id']===ROLE);
  r['dcterms:temporal']='2024–2025';
  assert.throws(()=>linkHistoricAriaHospital(wrongRole,q),/Historical 2020–2021/);
});
