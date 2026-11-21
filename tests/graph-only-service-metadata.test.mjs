import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
const v=x=>x==null?[]:Array.isArray(x)?x:[x];
const id=x=>typeof x==='string'?x:x?.['@id'];
const graph=SOURCE.graph['@graph'];
const nodes=new Map(graph.map(n=>[n['@id'],n]));
const origin=SOURCE.canonicalOrigin;
const person=nodes.get(origin+'/#saeed-ghezelbash');
const ss=graph.filter(n=>v(n['@type']).includes('Service'));
const os=graph.filter(n=>v(n['@type']).includes('Offer'));
test('all 124 existing physician services gain meaningful typed bilingual descriptions and stable category references',()=>{
  assert.equal(ss.length,124);
  const taxonomy=nodes.get(origin+'/clinical-service-category-vocabulary');
  assert.equal(taxonomy['@type'],'DefinedTermSet');
  let categoryIds=new Set();
  for(const s of ss){
    assert.deepEqual(v(s.provider).map(id),[person['@id']]);
    const languages=v(s.description).map(x=>x['@language']);
    assert.ok(languages.includes('fa')&&languages.includes('en'),s['@id']);
    assert.ok(v(s.description).every(x=>x['@value'].length>50),s['@id']);
    assert.equal(typeof s.serviceType,'string',s['@id']);
    assert.ok(s.serviceType.length>12,s['@id']);
    const matching=v(s.category).map(id).filter(x=>x?.startsWith(origin+'/clinical-service-category-'));
    if(s['@id']===origin+'/service-botulinum-toxin-chronic-migraine'){
      assert.ok(v(s.category).length>=1,'Immutable migraine classification preserved');
      continue;
    }
    assert.equal(matching.length,1,s['@id']);
    const term=nodes.get(matching[0]);
    assert.equal(term?.['@type'],'DefinedTerm');
    assert.equal(id(term.inDefinedTermSet),taxonomy['@id']);
    categoryIds.add(matching[0]);
  }
  assert.equal(categoryIds.size,9);
});
test('offers only gain page URLs for services which really are primary subjects of the linked pages',()=>{
  assert.equal(os.length,124);
  const pages=graph.filter(n=>v(n['@type']).some(x=>['WebPage','MedicalWebPage','ProfilePage'].includes(x)));
  const canon=new Set(ss.map(s=>s['@id']));
  let pageOffers=0;
  for(const offer of os){
    assert.equal(id(offer.offeredBy),person['@id']);
    const service=nodes.get(id(offer.itemOffered));
    assert.ok(canon.has(service['@id']));
    assert.equal(id(service.offers),offer['@id']);
    if(!offer.url)continue;
    if(service['@id'].includes('free-online-aesthetic-initial-consultation') ||
      service['@id'].includes('aesthetic-revision-and-second-opinion'))continue;
    pageOffers++;
    assert.equal(service.url,offer.url);
    assert.ok(pages.some(p=>p.url===offer.url&&v(p.mainEntity).map(id).includes(service['@id'])),offer['@id']);
  }
  assert.equal(pageOffers,8);
  assert.equal(os.filter(x=>x.url).length,10);
});
test('graph enrichment does not change physician authority coverage or clinic provider role',()=>{
  assert.equal(v(person.makesOffer).length,124);
  assert.equal(v(person.skills).length,85);
  assert.equal(v(person.knowsAbout).length,244);
  assert.equal(v(person.medicalSpecialty).length,1);
  assert.equal(v(person.availableService).length,113,'IndividualPhysician inherits medically typed availableService from Physician');
  assert.equal(v(person.makesOffer).length,124);
  const clinic=nodes.get(origin+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah');
  for(const k of ['medicalSpecialty','hasOfferCatalog','makesOffer','availableService'])assert.equal(clinic[k],undefined);
});
