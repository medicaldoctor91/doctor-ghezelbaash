import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {enforcePhysicianOfferShaclContract} from '../src/lib/physician-offer-shacl-contract.mjs';
import {buildShaclTurtle} from '../src/lib/shacl-output.mjs';

const PERSON='https://www.ghezelbaash.ir/#saeed-ghezelbash';
const many=x=>x==null?[]:Array.isArray(x)?x:[x];
const id=x=>typeof x==='string'?x:x?.['@id'];

test('published SHACL rejects out-of-domain Person.availableService and requires exact 124 clinical Offers',()=>{
  const sh=SOURCE.validation.shaclSupplement;
  assert.ok(sh.includes('sh:path schema:availableService ; sh:maxCount 0'));
  assert.ok(sh.includes('sh:path schema:makesOffer ; sh:class schema:Offer ; sh:minCount 124 ; sh:maxCount 124'));
  assert.ok(sh.includes('sh:path schema:hasOfferCatalog ; sh:class schema:OfferCatalog ; sh:minCount 1 ; sh:maxCount 1'));
  assert.ok(sh.includes('ex:PhysicianOfferProviderLoopShape a sh:NodeShape'));
  assert.ok(sh.includes('sh:targetObjectsOf schema:makesOffer'));
  assert.ok(!sh.includes('ex:AvailableServiceProviderShape a sh:NodeShape'));
  assert.ok(!sh.includes('sh:targetObjectsOf schema:availableService'));
  const exported=buildShaclTurtle(SOURCE);
  assert.ok(exported.includes('PhysicianOfferProviderLoopShape'));
  assert.ok(!exported.includes('AvailableServiceProviderShape'));
  const graph=SOURCE.graph['@graph'];
  const p=graph.find(n=>n['@id']===PERSON);
  assert.equal(p.availableService,undefined);
  assert.equal(many(p.makesOffer).length,124);
  assert.equal(many(p.hasOfferCatalog).length,1);
  const services=graph.filter(n=>many(n['@type']).includes('Service'));
  const offers=graph.filter(n=>many(n['@type']).includes('Offer'));
  assert.equal(services.length,124);
  assert.equal(offers.length,124);
  assert.ok(services.every(n=>many(n.provider).map(id).length===1 && id(many(n.provider)[0])===PERSON));
  assert.ok(offers.every(n=>id(n.offeredBy)===PERSON && many(n.itemOffered).length===1));
});

test('SHACL migration is idempotent and refuses unknown stale or weakened shape contracts',()=>{
  const src=structuredClone(SOURCE);
  assert.equal(enforcePhysicianOfferShaclContract(src),false,'build-time migration must be idempotent');
  assert.deepEqual(src.validation.shaclSupplement,SOURCE.validation.shaclSupplement);
  const stale=structuredClone(SOURCE);
  stale.validation.shaclSupplement=stale.validation.shaclSupplement.replace(
    'sh:path schema:availableService ; sh:maxCount 0',
    'sh:path schema:availableService ; sh:minCount 1');
  assert.throws(()=>enforcePhysicianOfferShaclContract(stale),/Unknown SHACL baseline/);
  const omitted=structuredClone(SOURCE);
  omitted.validation.shaclSupplement=omitted.validation.shaclSupplement.replace(
    'sh:path schema:makesOffer ; sh:class schema:Offer ; sh:minCount 124 ; sh:maxCount 124',
    'sh:path schema:makesOffer ; sh:maxCount 1');
  assert.throws(()=>enforcePhysicianOfferShaclContract(omitted),/Unknown SHACL baseline/);
});
