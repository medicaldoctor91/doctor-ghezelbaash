const values = value => value == null ? [] : Array.isArray(value) ? value : [value];
const ref = id => ({'@id': id});

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

export function clinicalArticleForPage(page, content) {
  const article = {
    '@id': page.url + '#article',
    '@type': 'Article',
    url: page.url,
    headline: structuredClone(page.name),
    inLanguage: structuredClone(page.inLanguage),
    mainEntityOfPage: page.url,
  };
  for (const property of ['description', 'author', 'publisher', 'about', 'datePublished', 'dateModified']) {
    if (property in page) article[property] = structuredClone(page[property]);
  }
  if (content.length) article.hasPart = structuredClone(content);
  return article;
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

  for (const property of ['medicalSpecialty', 'availableService', 'hasOfferCatalog']) delete clinic[property];
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
      const article = clinicalArticleForPage(page, content);
      graph.push(article);
      const service = get(servicePages[route.path]);
      page.mainEntity = ref((service ?? article)['@id']);
      if (service) page.hasPart = [...values(page.hasPart), ref(article['@id'])];
    } else if (route.pagePurpose === 'professional-biography') {
      page['@type'] = ['ProfilePage', route.pageType];
      page.mainEntity = ref(physician['@id']);
    } else if (route.pagePurpose === 'clinic-contact') {
      page.mainEntity = ref(clinic['@id']);
      page.about = [...values(page.about), ref(consultation['@id']), ref(online['@id'])];
    }
  }
  source.machineProjection.discoveryGuide += '\n\nDr. Saeed Ghezelbash is the sole provider of the listed clinical services. For in-person services, follow the service channel to the Kermanshah practice.';
}
