import {strengthenPhysicianAuthority} from './clinical-authority-extension.mjs';
const values = value => value == null ? [] : Array.isArray(value) ? value : [value];
const ref = id => ({'@id': id});
const provideService = ref('http://purl.org/goodrelations/v1#ProvideService');

// These focused pages describe a specific service the physician provides.
// They still contain a separately attributable authored Article.
const servicePages = {
  '/blepharoplasty-for-excess-eyelid-skin-and-fat': 'procedure-blepharoplasty',
  '/body-filler': 'procedure-body-dermal-filler',
  '/botox': 'procedure-botulinum-toxin-aesthetic-treatment',
  '/buccal-fat-removal-facial-fullness-assessment': 'procedure-buccal-fat-removal',
  '/central-lip-lift-for-long-upper-lip': 'procedure-central-lip-lift',
  '/filler': 'procedure-facial-and-lip-dermal-filler',
  '/submental-liposuction-for-fat-dominant-fullness': 'procedure-submental-liposuction',
  '/thread-lift': 'procedure-thread-lift',
};

const fillerSafety = 'https://www.fda.gov/medical-devices/aesthetic-cosmetic-devices/dermal-fillers-soft-tissue-fillers';
const threadLiftReview = 'https://pubmed.ncbi.nlm.nih.gov/41988336/';
// These are citations already linked in the visible clinical guides.
const clinicalCitations = {
  '/acne-scars': ['https://pubmed.ncbi.nlm.nih.gov/30856634/'],
  '/aesthetic-treatment-failure-from-diagnostic-error': ['https://pmc.ncbi.nlm.nih.gov/articles/PMC11702150/', fillerSafety],
  '/body-filler': ['https://www.fda.gov/consumers/consumer-updates/dermal-filler-dos-and-donts-wrinkles-lips-and-more'],
  '/chin-jawline-and-facial-contouring': ['https://www.fda.gov/drugs/buying-using-medicine-safely/using-fat-dissolving-injections-are-not-fda-approved-can-be-harmful'],
  '/collagen-stimulation-sculptra-and-liquid-thread': ['https://pubmed.ncbi.nlm.nih.gov/40118148/', 'https://www.fda.gov/medical-devices/recently-approved-devices/sculptra-p030050s039'],
  '/filler': [fillerSafety],
  '/filler-complications-correction-and-aftercare': [fillerSafety],
  '/filler-treatment-exclusion-criteria': ['https://www.fda.gov/medical-devices/aesthetic-cosmetic-devices/fda-approved-dermal-fillers'],
  '/hair-loss-diagnostic-assessment-before-prp-and-mesotherapy': ['https://pubmed.ncbi.nlm.nih.gov/38284294/'],
  '/hyaluronidase-filler-dissolution-limitations': ['https://pubmed.ncbi.nlm.nih.gov/34840662/', 'https://pubmed.ncbi.nlm.nih.gov/41517528/'],
  '/subcision-for-tethered-acne-scars': ['https://pubmed.ncbi.nlm.nih.gov/36315903/'],
  '/thread-lift-complications-preparation-and-aftercare': ['https://pmc.ncbi.nlm.nih.gov/articles/PMC11702150/', threadLiftReview],
  '/thread-lift-pre-treatment-assessment': [threadLiftReview],
};

export function clinicalArticleForPage(page, content, {isPrimary = true} = {}) {
  const article = {
    '@id': page.url + '#article',
    '@type': 'Article',
    url: page.url,
    headline: structuredClone(page.name),
    inLanguage: structuredClone(page.inLanguage),
  };
  if (isPrimary) article.mainEntityOfPage = page.url;
  for (const property of ['description', 'author', 'publisher', 'about', 'citation', 'datePublished', 'dateModified']) {
    if (property in page) article[property] = structuredClone(page[property]);
  }
  if (content.length) article.hasPart = structuredClone(content);
  return article;
}

function connectPhysicianServices(graph, physician, origin) {
  const physicianId = physician['@id'];
  const services = graph.filter(node => values(node['@type']).includes('Service'));
  const existing = new Map();
  for (const offer of graph) {
    if (!values(offer['@type']).includes('Offer') || offer.offeredBy?.['@id'] !== physicianId) continue;
    const item = offer.itemOffered?.['@id'];
    if (existing.has(item)) throw new Error('Duplicate physician offer for ' + item);
    existing.set(item, offer);
  }

  const clinicalTopics = new Set(values(physician.availableService).map(item => item['@id']));
  const knownTopics = new Set(values(physician.knowsAbout).map(item => typeof item === 'string' ? item : item['@id']));
  // The physician's existing subcision skill already names the same topic.
  if (knownTopics.has(origin + '/skill-subcision')) clinicalTopics.delete(origin + '/procedure-subcision');
  const newTopics = [];
  const offerIds = [];
  const graphIds = new Set(graph.map(node => node['@id']));
  for (const service of services) {
    const id = service['@id'];
    const providers = values(service.provider);
    if (providers.length !== 1 || providers[0]['@id'] !== physicianId) continue;
    if (clinicalTopics.has(id) && !knownTopics.has(id)) newTopics.push(ref(id));

    let offer = existing.get(id);
    if (!offer) {
      const offerId = id + '-offer';
      if (graphIds.has(offerId)) throw new Error('Clinical offer identifier already exists: ' + offerId);
      offer = {'@id': offerId, '@type': 'Offer', itemOffered: ref(id), offeredBy: ref(physicianId)};
      graph.push(offer);
      graphIds.add(offerId);
    }
    offer.businessFunction ??= structuredClone(provideService);
    offerIds.push(ref(offer['@id']));
    service.offers = ref(offer['@id']);
  }
  physician.knowsAbout = [...values(physician.knowsAbout), ...newTopics];
  const mergedOffers = new Map([...values(physician.makesOffer), ...offerIds].map(offer => [offer['@id'], offer]));
  physician.makesOffer = [...mergedOffers.values()];
}

export function applyClinicalAttribution(source) {
  const origin = source.canonicalOrigin;
  const graph = source.graph['@graph'];
  const nodes = new Map(graph.map(node => [node['@id'], node]));
  const get = slug => nodes.get(origin + '/' + slug);
  const physician = get('#saeed-ghezelbash');
  const clinic = get('dr-saeed-ghezelbash-aesthetic-clinic-kermanshah');
  const catalog = get('clinical-services-offer-catalog');
  const online = get('free-online-aesthetic-initial-consultation');
  const consultation = get('aesthetic-medical-consultation');

  for (const property of ['medicalSpecialty', 'availableService', 'hasOfferCatalog', 'areaServed']) delete clinic[property];
  clinic.description = [
    {'@value': 'مطب شخصی دکتر سعید قزلباش در کرمانشاه؛ محل طبابت و ارائهٔ حضوری خدمات بالینی دکتر قزلباش، تنها پزشک معالج و ارائه‌دهندهٔ خدمات بالینی این مطب.', '@language': 'fa'},
    {'@value': 'The private medical practice and in-person care location of Dr. Saeed Ghezelbash in Kermanshah, Iran. Dr. Ghezelbash is the sole treating physician and clinical service provider at this location.', '@language': 'en'},
  ];
  physician.disambiguatingDescription += ' ایشان تنها پزشک معالج و ارائه‌دهندهٔ خدمات بالینی در مطب شخصی خود در کرمانشاه است.';
  get('in-person-clinic-service-channel').description = 'Physical access to in-person clinical care provided by Dr. Saeed Ghezelbash at his Kermanshah practice.';
  for (const slug of ['profile-instagram-doctor-ghezelbaash', 'evidence-instagram']) {
    get(slug).mainEntity = ref(physician['@id']);
  }
  delete physician.hasOfferCatalog;
  clinic.subjectOf = values(clinic.subjectOf).filter(item => item['@id'] !== get('webpage')['@id']);
  get('online-consultation-contact-point').contactType = 'appointment scheduling and reception';
  delete get('online-consultation-channel').servicePhone;

  catalog['@type'] = 'ItemList';
  catalog['dcterms:subject'] = ref(physician['@id']);
  const itemsByService = new Map();
  for (const item of catalog.itemListElement) {
    const id = item.item['@id'];
    if (values(nodes.get(id)?.['@type']).includes('Service') && !itemsByService.has(id)) itemsByService.set(id, item);
  }
  catalog.itemListElement = [...itemsByService.values()].map((item, index) => ({...item, position: index + 1}));
  catalog.numberOfItems = catalog.itemListElement.length;
  connectPhysicianServices(graph, physician, origin);
  strengthenPhysicianAuthority(graph, physician, origin);

  const medicalDegree = get('credential-doctor-of-medicine');
  const orcidEducation = ref(get('evidence-orcid-education-38054873')['@id']);
  medicalDegree.subjectOf = [...values(medicalDegree.subjectOf), orcidEducation];
  medicalDegree['prov:wasDerivedFrom'] = [...values(medicalDegree['prov:wasDerivedFrom']), orcidEducation];
  const medicalRegistration = get('irimc-credential-167430');
  medicalRegistration['prov:wasDerivedFrom'] = [...values(medicalRegistration['prov:wasDerivedFrom']),
    ref('https://pub.orcid.org/v3.0/0009-0001-9346-8475/qualification/38813233')];

  const performance = get('clinical-performance-dataset');
  performance.about = [ref(physician['@id'])];
  performance.description = 'Machine-readable aggregate of clinical experience, procedure-volume, safety and outcome metrics reported by Dr. Saeed Ghezelbash for his clinical work at his practice.';
  delete get('review-kurdish-patient-experience').reviewRating;

  for (const route of source.routes.resources) {
    if (route.path === '/') continue;
    const page = nodes.get(origin + route.path + '#webpage');
    if (route.pagePurpose === 'clinical-guide') {
      if (route.path === '/filler') {
        const relatedServices = ['procedure-body-dermal-filler', 'procedure-autologous-fat-grafting', 'procedure-gluteal-body-filler'];
        page.about = [...values(page.about), ...relatedServices.map(slug => ref(get(slug)['@id']))];
      }
      const content = values(page.mainEntity).filter(item =>
        values(nodes.get(item['@id'])?.['@type']).some(type => ['WebPageElement', 'Question', 'Answer'].includes(type)));
      const service = get(servicePages[route.path]);
      const article = clinicalArticleForPage(page, content, {isPrimary: !service});
      const citations = clinicalCitations[route.path];
      if (citations) article.citation = citations.map(ref);
      graph.push(article);
      page.mainEntity = ref((service ?? article)['@id']);
      if (service) page.hasPart = [...values(page.hasPart), ref(article['@id'])];
    } else if (route.pagePurpose === 'professional-biography') {
      page['@type'] = ['ProfilePage', route.pageType];
      page.mainEntity = ref(physician['@id']);
    } else if (route.pagePurpose === 'clinic-profile') {
      page.about = [ref(clinic['@id']), ref(physician['@id'])];
      delete page.specialty;
    } else if (route.pagePurpose === 'clinic-contact') {
      page.mainEntity = ref(clinic['@id']);
      page.about = [...values(page.about), ref(consultation['@id']), ref(online['@id'])];
    }
  }
  source.machineProjection.discoveryGuide += '\n\nDr. Saeed Ghezelbash is the sole treating physician and provider of the listed clinical services. His private practice in Kermanshah is the location where he provides in-person clinical care; the service channel links each in-person service to that location.';
}
