import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {enforcePhysicianOfferShaclContract} from '../src/lib/physician-offer-shacl-contract.mjs';
import {buildShaclTurtle} from '../src/lib/shacl-output.mjs';

const PERSON='https://www.ghezelbaash.ir/#saeed-ghezelbash';
const many=x=>x==null?[]:Array.isArray(x)?x:[x];
const id=x=>typeof x==='string'?x:x?.['@id'];

test('published SHACL requires 113 valid IndividualPhysician medical treatments plus all 124 Offers',()=>{
  const sh=SOURCE.validation.shaclSupplement;
  assert.ok(sh.includes('sh:path schema:availableService ; sh:minCount 113 ; sh:maxCount 113'));
  assert.ok(sh.includes('sh:targetObjectsOf schema:availableService'));
  assert.ok(sh.includes('ex:IndividualPhysicianAvailableMedicalCareShape a sh:NodeShape'));
  assert.ok(sh.includes('[ sh:class schema:MedicalProcedure ]'));
  assert.ok(sh.includes('[ sh:class schema:DiagnosticProcedure ]'));
  assert.ok(sh.includes('[ sh:class schema:MedicalTherapy ]'));
  assert.ok(sh.includes('sh:not [ sh:in ( ex:procedure-blepharoplasty'));
  assert.ok(sh.includes('sh:path schema:makesOffer ; sh:class schema:Offer ; sh:minCount 124 ; sh:maxCount 124'));
  assert.ok(sh.includes('sh:path schema:hasOfferCatalog ; sh:class schema:OfferCatalog ; sh:minCount 1 ; sh:maxCount 1'));
  assert.ok(sh.includes('ex:PhysicianOfferProviderLoopShape a sh:NodeShape'));
  assert.ok(sh.includes('sh:targetObjectsOf schema:makesOffer'));
  assert.ok(!sh.includes('ex:AvailableServiceProviderShape a sh:NodeShape'));
  const exported=buildShaclTurtle(SOURCE);
  assert.ok(exported.includes('IndividualPhysicianAvailableMedicalCareShape'));
  assert.ok(exported.includes('PhysicianOfferProviderLoopShape'));
  const graph=SOURCE.graph['@graph'];
  const p=graph.find(n=>n['@id']===PERSON);
  const lookup=new Map(graph.map(n=>[n['@id'],n]));
  assert.ok(many(p['@type']).includes('IndividualPhysician'));
  assert.equal(many(p.availableService).length,113);
  assert.equal(many(p.makesOffer).length,124);
  assert.equal(many(p.hasOfferCatalog).length,1);
  assert.ok(many(p.availableService).every(x=>{
    const target=lookup.get(id(x));
    return target && many(target['@type']).some(t=>['MedicalProcedure','MedicalTherapy','DiagnosticProcedure','MedicalTest'].includes(t));
  }));
  assert.ok(!many(p.availableService).some(x=>/rhinoplasty|facelift|blepharoplasty/.test(id(x))));
  const services=graph.filter(n=>many(n['@type']).includes('Service'));
  const offers=graph.filter(n=>many(n['@type']).includes('Offer'));
  assert.equal(services.length,124);
  assert.equal(offers.length,124);
  assert.ok(services.every(n=>many(n.provider).map(id).length===1 && id(many(n.provider)[0])===PERSON));
  assert.ok(offers.every(n=>id(n.offeredBy)===PERSON && many(n.itemOffered).length===1));
});

test('medical SHACL migration is idempotent and rejects corrupted cardinality/exclusion contracts',()=>{
  const src=structuredClone(SOURCE);
  assert.equal(enforcePhysicianOfferShaclContract(src),false);
  assert.deepEqual(src.validation.shaclSupplement,SOURCE.validation.shaclSupplement);
  for(const phrase of [
    'sh:path schema:availableService ; sh:minCount 113 ; sh:maxCount 113',
    'sh:path schema:makesOffer ; sh:class schema:Offer ; sh:minCount 124 ; sh:maxCount 124',
    'ex:procedure-autologous-fat-grafting'
  ]) {
    const broken=structuredClone(SOURCE);
    broken.validation.shaclSupplement=broken.validation.shaclSupplement.replace(phrase,'BROKEN-CONTRACT');
    assert.throws(()=>enforcePhysicianOfferShaclContract(broken),/Unknown SHACL baseline/);
  }
});
