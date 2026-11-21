import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'parse5';
import {SOURCE} from '../src/canonical/source.mjs';
import {
  reconcilePhysicianAvailableServices,
  connectEvidenceScopedServiceWorks,
} from '../src/lib/physician-service-entity-consistency.mjs';

const ORIGIN='https://www.ghezelbaash.ir';
const PERSON=ORIGIN+'/#saeed-ghezelbash';
const legacyMigraine=ORIGIN+'/procedure-botulinum-toxin-chronic-migraine';
const asArray=x=>x==null?[]:Array.isArray(x)?x:[x];
const id=x=>typeof x==='string'?x:x?.['@id'];
const ids=x=>asArray(x).map(id);
const types=x=>asArray(x?.['@type']);
const graph=SOURCE.graph['@graph'];
const byId=new Map(graph.map(n=>[n['@id'],n]));
const physician=byId.get(PERSON);
const directCases=[
  ['procedure-hyaluronic-acid-dermal-filler','/filler',['هیالورونیک']],
  ['procedure-mesotherapy-pigmentation','/acne-pigmentation-and-scars',['مزوتراپی لک']],
];
const incidentalCases=[
  ['procedure-skin-cleansing','/active-acne',['پاکسازی تهاجمی']],
  ['procedure-mesogel-under-eye','/skin-rejuvenation',['مزوژل','زیر چشم']],
];
const allCases=[...directCases,...incidentalCases];

function textContent(node) {
  const here=node.nodeName==='#text'?node.value:'';
  return here + (node.childNodes||[]).map(textContent).join('');
}
function findTag(node,tag) {
  if(node.tagName===tag)return node;
  for(const c of node.childNodes||[]){const x=findTag(c,tag);if(x)return x;}
  return null;
}

test('all 124 offered physician Services are in Person.availableService, no misleading MedicalTherapy',()=>{
  assert.equal(types(physician).includes('Person'),true);
  const services=graph.filter(n=>types(n).includes('Service'));
  const offered=graph.filter(n=>types(n).includes('Offer'));
  assert.equal(services.length,124);
  assert.equal(offered.length,124);
  const providerIds=services.map(n=>{
    assert.deepEqual(ids(n.provider),[PERSON],n['@id']+' must have single Person provider');
    return n['@id'];
  });
  const available=ids(physician.availableService);
  assert.equal(available.length,124);
  assert.equal(new Set(available).size,124);
  assert.deepEqual(new Set(available),new Set(providerIds));
  assert.ok(!available.includes(legacyMigraine),'MedicalTherapy must not masquerade as Service');
  assert.ok(ids(physician.knowsAbout).includes(legacyMigraine),
    'Keep medically relevant legacy MedicalTherapy in subject-knowledge relation');
  assert.equal(ids(physician.makesOffer).length,124);
  assert.equal(offered.filter(n=>n.url).length,10);
  assert.ok(physician.hasOfferCatalog,'Existing user-approved offer catalog is preserved');
  const clinic=byId.get(ORIGIN+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah');
  assert.equal(clinic.availableService,undefined);
  assert.equal(clinic.hasOfferCatalog,undefined);
});

test('authorial subjectOf is inverse of about; incidental mentions do not invent subjectOf',()=>{
  for(const [slug,path,needles] of directCases) {
    const service=byId.get(ORIGIN+'/'+slug),article=byId.get(ORIGIN+path+'#article');
    const page=byId.get(ORIGIN+path+'#webpage');
    assert.ok(types(service).includes('Service'));
    assert.ok(types(article).includes('Article'));
    assert.ok(ids(article.author).includes(PERSON));
    assert.ok(ids(page.author).includes(PERSON));
    assert.ok(ids(article.about).includes(service['@id']));
    assert.ok(ids(page.about).includes(service['@id']));
    assert.ok(ids(service.subjectOf).includes(article['@id']),
      'Direct subject must have reciprocal authored backlink: '+slug);
    for(const n of needles)assert.ok(n);
  }
  for(const [slug,path] of incidentalCases) {
    const service=byId.get(ORIGIN+'/'+slug),article=byId.get(ORIGIN+path+'#article');
    const page=byId.get(ORIGIN+path+'#webpage');
    assert.ok(ids(article.mentions).includes(service['@id']),
      'Article must name the risk/context-only treatment');
    assert.ok(ids(page.mentions).includes(service['@id']));
    assert.ok(!ids(article.about).includes(service['@id']),
      'Incidental mention must not be incorrectly marked Article.about');
    assert.ok(!ids(service.subjectOf).includes(article['@id']),
      'Incidental mention must not be incorrectly marked subjectOf');
  }
  const noSubject=graph.filter(n=>types(n).includes('Service')&&!asArray(n.subjectOf).length);
  assert.deepEqual(new Set(noSubject.map(n=>n['@id'])),
    new Set(incidentalCases.map(([slug])=>ORIGIN+'/'+slug)));
});

test('actual authored HTML supports each relationship; no fabricated topic endorsements',()=>{
  for(const [slug,path,needles] of allCases) {
    const file=new URL('../dist'+path+'.html',import.meta.url);
    const html=readFileSync(file,'utf8');
    const document=parse(html);
    const main=findTag(document,'main');
    assert.ok(main,'Rendered main missing for '+path);
    const visible=textContent(main);
    for(const needle of needles)
      assert.ok(visible.includes(needle),
        'Visible authored page lacks required text '+JSON.stringify(needle)+' for '+slug);
  }
});

test('reconciliation is idempotent, preserves all canonical IDs and refuses unknown non-Services',()=>{
  const cloned=structuredClone(graph);
  const nodes=new Map(cloned.map(n=>[n['@id'],n]));
  const P=nodes.get(PERSON);
  const beforeIds=cloned.map(n=>n['@id']);
  const result=reconcilePhysicianAvailableServices(cloned,P,ORIGIN);
  assert.deepEqual(result.added,[]);
  assert.deepEqual(result.migratedLegacy,[]);
  assert.equal(result.availableServiceCount,124);
  assert.deepEqual(cloned.map(n=>n['@id']),beforeIds);
  const context=connectEvidenceScopedServiceWorks(cloned,P,ORIGIN);
  assert.equal(context.length,4);
  assert.equal(context.filter(x=>x.relationship==='about').length,2);
  assert.equal(context.filter(x=>x.relationship==='mentions').length,2);
  assert.deepEqual(cloned,graph,'Repeat should make no changes to graph');
  const bad=structuredClone(graph);
  const badPhysician=bad.find(n=>n['@id']===PERSON);
  badPhysician.availableService.push({'@id':ORIGIN+'/unknown-extra-service'});
  assert.throws(()=>reconcilePhysicianAvailableServices(bad,badPhysician,ORIGIN),
    /Unexpected non-Service/);
});

test('graph and full HTML schema keep 1.3.6 DOI, exact Person identity and complete catalog',()=>{
  assert.equal(SOURCE.version,'1.3.6');
  assert.equal(byId.size,1916);
  assert.equal(ids(byId.get(ORIGIN+'/clinical-services-offer-catalog').itemListElement).length,0);
  const index=byId.get(ORIGIN+'/clinical-services-offer-catalog');
  assert.equal(index.numberOfItems,124);
  assert.equal(asArray(index.itemListElement).length,124);
  const data=byId.get(ORIGIN+'/graph.jsonld/dataset');
  assert.ok(JSON.stringify(data).includes('10.5281/zenodo.24354791'));
});
