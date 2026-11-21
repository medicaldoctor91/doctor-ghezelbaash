import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE } from '../src/canonical/source.mjs';
import { buildRetrievalRecords, serializeAnswersText } from '../src/lib/retrieval-output.mjs';

const PERSON = 'https://www.ghezelbaash.ir/#saeed-ghezelbash';
const CLINIC = 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const values = v => v == null ? [] : Array.isArray(v) ? v : [v];
const ids = v => values(v).map(x => typeof x === 'string' ? x : x?.['@id']).filter(Boolean);
const graph = SOURCE.graph['@graph'];
const node = id => graph.find(n => n['@id'] === id);
const services = graph.filter(n => values(n['@type']).some(t => t === 'Service' || t === 'https://schema.org/Service'));

test('approved plan: physician is the sole clinical Service provider', () => {
  assert.equal(services.length, 124);
  for (const service of services) assert.deepEqual(ids(service.provider), [PERSON], service['@id']);
  assert.ok(ids(node(PERSON).practicesAt).includes(CLINIC));
});

test('the clinic describes the place of care and retains its separate local identity', () => {
  const origin = SOURCE.canonicalOrigin;
  const clinic = node(CLINIC);
  assert.ok(clinic);
  for (const property of ['medicalSpecialty', 'availableService', 'hasOfferCatalog', 'areaServed']) {
    assert.equal(values(clinic[property]).length, 0, 'forbidden clinic property: ' + property);
  }
  assert.deepEqual(ids(clinic.owner), [PERSON]);
  assert.ok(clinic.address && clinic.geo && clinic.hasMap && clinic.openingHoursSpecification);
  assert.deepEqual(ids(node(PERSON).medicalSpecialty), [origin + '/medical-specialty-aesthetic-medicine']);
  assert.deepEqual(ids(node(PERSON).areaServed), [origin + '/country-iran', origin + '/country-iraq']);
  const googleIdentifiers = entity => ids(entity.identifier).map(node)
    .map(identifier => identifier?.value).filter(value => typeof value === 'string' && value.startsWith('/g/'));
  assert.deepEqual(googleIdentifiers(clinic), ['/g/11r3rzdtb3']);
  assert.deepEqual(googleIdentifiers(node(PERSON)), ['/g/11nqdfk76c']);
  assert.match(values(clinic.description).find(entry => entry['@language'] === 'en')['@value'],
    /in-person care location of Dr\. Saeed Ghezelbash/);
  assert.match(node(origin + '/in-person-clinic-service-channel').description, /provided by Dr\. Saeed Ghezelbash/);
  const practicePage = node(CLINIC + '#webpage');
  assert.deepEqual(ids(practicePage.mainEntity), [CLINIC]);
  assert.deepEqual(ids(practicePage.about), [CLINIC, PERSON]);
  assert.equal(practicePage.specialty, undefined);
  for (const slug of ['profile-instagram-doctor-ghezelbaash', 'evidence-instagram']) {
    const profile = node(origin + '/' + slug);
    assert.deepEqual(ids(profile.mainEntity), [PERSON]);
    assert.deepEqual(new Set(ids(profile.about)), new Set([PERSON, CLINIC]));
  }
});

test('separate physician OfferCatalog is hierarchical; clinic never makes offers', () => {
  const origin=SOURCE.canonicalOrigin;
  const root=node(origin+'/physician-clinical-offer-catalog');
  assert.equal(root['@type'],'OfferCatalog');
  assert.deepEqual(ids(node(PERSON).hasOfferCatalog),[root['@id']]);
  assert.equal(values(node(CLINIC).hasOfferCatalog).length,0);
  assert.equal(root.numberOfItems,values(root.itemListElement).length);
  const groups=ids(root.itemListElement).map(node);
  const listed=groups.flatMap(group=>values(group.itemListElement).map(item=>item.item['@id']));
  assert.equal(new Set(listed).size,services.length);
  assert.deepEqual(new Set(listed),new Set(ids(node(PERSON).makesOffer)));
  assert.ok(groups.length>=6);
  for(const group of groups) {
    assert.equal(group['@type'],'OfferCatalog');
    assert.equal(group.numberOfItems,group.itemListElement.length);
  }
  assert.equal(node(CLINIC).makesOffer,undefined);
});

test('each physician-provided service has one service offer without inventing terms', () => {
  const offers = graph.filter(entry => values(entry['@type']).includes('Offer'));
  assert.equal(offers.length, services.length);
  assert.deepEqual(new Set(offers.flatMap(offer => ids(offer.itemOffered))),
    new Set(services.map(service => service['@id'])));
  assert.deepEqual(new Set(ids(node(PERSON).makesOffer)), new Set(offers.map(offer => offer['@id'])));
  assert.equal(node(CLINIC).makesOffer, undefined);
  const originalOffers = new Set(['free-online-aesthetic-initial-consultation-offer', 'aesthetic-revision-and-second-opinion-offer']
    .map(slug => SOURCE.canonicalOrigin + '/' + slug));
  for (const offer of offers) {
    assert.deepEqual(ids(offer.offeredBy), [PERSON], offer['@id']);
    assert.equal(ids(offer.itemOffered).length, 1, offer['@id']);
    assert.deepEqual(ids(offer.businessFunction), ['http://purl.org/goodrelations/v1#ProvideService']);
    assert.deepEqual(ids(node(ids(offer.itemOffered)[0]).offers), [offer['@id']]);
    if (!originalOffers.has(offer['@id'])) {
      for (const field of ['price', 'priceCurrency', 'priceSpecification', 'availability']) {
        assert.ok(!(field in offer), offer['@id'] + ' ' + field);
      }
    }
  }
  assert.ok([...originalOffers].every(id => node(id)));
});

test('physician topics include distinct clinical services and preserve the existing subcision topic', () => {
  const known = ids(node(PERSON).knowsAbout);
  const origin = SOURCE.canonicalOrigin;
  assert.ok(known.length > services.length);
  assert.equal(known.length, new Set(known).size);
  assert.ok(known.includes(origin + '/skill-subcision'));
  assert.ok(!known.includes(origin + '/procedure-subcision'));
  assert.ok(!known.includes(origin + '/free-online-aesthetic-initial-consultation'));
  assert.ok(known.includes(origin + '/procedure-botulinum-toxin-palmar-hyperhidrosis'));
});

test('approved plan: in-person service channel locates the practice', () => {
  const channel = node('https://www.ghezelbaash.ir/in-person-clinic-service-channel');
  assert.ok(channel);
  assert.deepEqual(ids(channel.serviceLocation), [CLINIC]);
  for (const service of services) {
    const online = service['@id'].endsWith('/free-online-aesthetic-initial-consultation');
    const expected = online ? 'https://www.ghezelbaash.ir/online-consultation-channel' : channel['@id'];
    assert.deepEqual(ids(service.availableChannel), [expected], service['@id']);
    assert.deepEqual(ids(node(expected).serviceLocation), online ? [] : [CLINIC], service['@id']);
    for (const areaId of ids(service.areaServed)) {
      assert.ok(!values(node(areaId)?.['@type']).includes('City'), service['@id'] + ' uses its channel for city-level location');
    }
  }
});

test('approved plan: general clinical-services catalog is an ItemList with unique service references', () => {
  const catalog = graph.find(n => String(n['@id'] || '').includes('clinical-services-offer-catalog'));
  assert.ok(catalog);
  assert.ok(values(catalog['@type']).includes('ItemList'));
  assert.ok(!values(catalog['@type']).includes('OfferCatalog'));
  assert.deepEqual(ids(catalog['dcterms:subject']), [PERSON]);
  const items = values(catalog.itemListElement);
  const refs = items.map(item => ids(item.item)[0] || ids(item)[0]).filter(Boolean);
  assert.equal(refs.length, new Set(refs).size, 'duplicate service references');
  assert.equal(catalog.numberOfItems, services.length);
  assert.deepEqual(new Set(refs), new Set(services.map(service => service['@id'])));
  assert.deepEqual(items.map(item => item.position), items.map((_, index) => index + 1));
});

test('clinical performance and patient access use the matching physician and location roles', () => {
  const origin = SOURCE.canonicalOrigin;
  const performance = node(origin + '/clinical-performance-dataset');
  assert.deepEqual(ids(performance.about), [PERSON]);
  assert.deepEqual(ids(performance.spatialCoverage), [CLINIC]);
  assert.equal(ids(performance['prov:hadMember']).length, 16);
  for (const id of ids(performance['prov:hadMember'])) assert.deepEqual(ids(node(id).observationAbout), [PERSON]);
  assert.ok(!ids(node(CLINIC).subjectOf).includes(origin + '/webpage'));
  const channel = node(origin + '/online-consultation-channel');
  assert.equal(channel.serviceUrl, 'https://ig.me/m/doctor.ghezelbaash');
  assert.equal(channel.servicePhone, undefined);
  assert.match(node(ids(node(CLINIC).contactPoint)[0]).contactType, /appointment scheduling/);
  assert.equal(node(origin + '/review-kurdish-patient-experience').reviewRating, undefined);
});

test('clinical answer introductions expose the physician and preserve the authored answer', () => {
  const records = buildRetrievalRecords(SOURCE).filter(record => record.answerLead);
  assert.equal(records.length, 8);
  assert.deepEqual(new Set(records.map(record => record.language.split('-')[0])), new Set(['fa', 'en', 'ar', 'ckb']));
  for (const record of records) assert.equal(record.clinicalProviderId, PERSON);
  const english = records.find(record => record.questionId.endsWith('available-en'));
  assert.match(english.answerLead, /^Dr\. Saeed Ghezelbash/);
  assert.match(english.answer, /^Botox, dermal fillers/);
  assert.ok(serializeAnswersText([english]).includes(
    `Answer introduction: ${JSON.stringify(english.answerLead)}\nAnswer: ${JSON.stringify(english.answer)}`));
});

test('extended skill and clinical knowledge registry are evidence-scoped, unique, resolved and distinct from specialty',()=>{
  const origin=SOURCE.canonicalOrigin;
  const p=node(PERSON);
  const skills=ids(p.skills),topics=ids(p.knowsAbout);
  assert.ok(skills.length>=80,'Curated skills total');
  assert.ok(topics.length>=200,'Clinical knowledge topic total');
  assert.equal(new Set(skills).size,skills.length);
  assert.equal(new Set(topics).size,topics.length);
  const allServiceIds=new Set(services.map(n=>n['@id']));
  for(const id of [...skills,...topics].filter(id=>id.startsWith(origin+'/'))) {
    const term=node(id);
    assert.ok(term,id+' resolves');
    assert.ok(term['@type']?.includes?.('DefinedTerm') || term['@type']==='DefinedTerm' ||
      term['@type']?.includes?.('Service') || term['@type']?.includes?.('MedicalProcedure'),id);
    if(id.includes('/clinical-topic-')||id.includes('/skill-')&&term['dcterms:relation']) {
      assert.ok(allServiceIds.has(ids(term['dcterms:relation'])[0]),id+' maps to authored Service');
    }
  }
  assert.equal(ids(p.medicalSpecialty).length,1,'No invented professional specialty');
});
