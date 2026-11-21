/**
 * Preserve truthful physician–Service attribution while making editorial
 * relationships as strong (but no stronger) than the authored page evidence.
 *
 * subjectOf is the inverse of Article.about; incidental discussion instead
 * uses CreativeWork.mentions. No new services, offers, URLs or clinical claims.
 */
const many = value => value == null ? [] : Array.isArray(value) ? value : [value];
const idOf = value => typeof value === 'string' ? value : value?.['@id'];
const ref = id => ({'@id': id});
const hasType = (node, type) => many(node?.['@type']).includes(type);
const uniqueIds = values => [...new Set(values.map(idOf))].filter(Boolean);

const contextualWorks = Object.freeze([
  // The filler guide explicitly discusses hyaluronic vs non-hyaluronic filler.
  ['procedure-hyaluronic-acid-dermal-filler', '/filler', 'about'],
  // The acne / pigmentation guide explicitly evaluates "مزوتراپی لک".
  ['procedure-mesotherapy-pigmentation', '/acne-pigmentation-and-scars', 'about'],
  // The active-acne guide cautions against aggressive cleansing in active acne,
  // but is NOT a service guide about cleansing itself.
  ['procedure-skin-cleansing', '/active-acne', 'mentions'],
  // The rejuvenation guide discusses mesogel and under-eye assessment in
  // separate passages, not a dedicated under-eye mesogel treatment protocol.
  ['procedure-mesogel-under-eye', '/skin-rejuvenation', 'mentions'],
]);

export function validateAndCorrectPhysicianServiceAttribution(graph, physician, origin) {
  if (!Array.isArray(graph) || !physician?.['@id'] || !origin)
    throw new TypeError('Expected canonical graph, physician and origin');
  const physicianId = physician['@id'];
  const nodes = new Map(graph.map(n => [n['@id'], n]));
  if (nodes.size !== graph.length) throw new Error('Duplicate canonical node IDs');
  const services = graph.filter(n => hasType(n, 'Service'));
  const offers = graph.filter(n => hasType(n, 'Offer'));
  const serviceIds = new Set(services.map(n => n['@id']));
  const personOfferIds = uniqueIds(many(physician.makesOffer));

  if (personOfferIds.length !== services.length ||
      offers.length !== services.length ||
      personOfferIds.some(id => !hasType(nodes.get(id), 'Offer')))
    throw new Error('Person.makesOffer inventory differs from physician clinical Service inventory');
  for (const service of services) {
    const providerIds = uniqueIds(many(service.provider));
    if (providerIds.length !== 1 || providerIds[0] !== physicianId)
      throw new Error('Service.provider does not uniquely point to physician: ' + service['@id']);
    const offerIds = uniqueIds(many(service.offers));
    if (offerIds.length !== 1 || !personOfferIds.includes(offerIds[0]))
      throw new Error('Missing direct physician Offer for ' + service['@id']);
    const offer = nodes.get(offerIds[0]);
    if (idOf(offer.itemOffered) !== service['@id'] ||
        idOf(offer.offeredBy) !== physicianId)
      throw new Error('Offer/service/provider loop not reciprocal: ' + service['@id']);
  }

  // availableService's declared schema.org range is MedicalProcedure /
  // MedicalTest / MedicalTherapy, and its domain is Physician / MedicalClinic /
  // Hospital, NOT Person with generic Service values. The 121 misleading
  // Person -> Service edges should not be expanded to 124.
  const oldAvailable = uniqueIds(many(physician.availableService));
  const legacyMigraine = origin + '/procedure-botulinum-toxin-chronic-migraine';
  const nonServices = oldAvailable.filter(id => !serviceIds.has(id));
  if (nonServices.some(id => id !== legacyMigraine || !hasType(nodes.get(id),'MedicalTherapy')))
    throw new Error('Unrecognized historical availableService edge: ' + nonServices.join(','));
  // Keep the one legitimately distinct MedicalTherapy connected without
  // representing it as another offer or independent Service.
  if (nonServices.includes(legacyMigraine) &&
      !many(physician['dcterms:relation']).some(v => idOf(v) === legacyMigraine))
    physician['dcterms:relation'] = [...many(physician['dcterms:relation']), ref(legacyMigraine)];

  delete physician.availableService;
  if (physician.availableService !== undefined)
    throw new Error('Incompatible Person.availableService survived');
  if (!physician.hasOfferCatalog)
    throw new Error('Physician offer catalog unexpectedly absent');
  return {
    serviceCount: services.length,
    offerCount: offers.length,
    removedNonconformingAvailableService: oldAvailable.length,
    retainedMigraineMedicalTherapy: nonServices.includes(legacyMigraine),
    personMakesOfferCount: personOfferIds.length,
  };
}

export function connectEvidenceScopedServiceWorks(graph, physician, origin) {
  const nodes = new Map(graph.map(n => [n['@id'], n]));
  const physicianId = physician['@id'];
  const results = [];
  for (const [serviceSlug, path, relationship] of contextualWorks) {
    const service = nodes.get(origin + '/' + serviceSlug);
    const article = nodes.get(origin + path + '#article');
    const page = nodes.get(origin + path + '#webpage');
    if (!hasType(service, 'Service') ||
        !many(service.provider).some(x => idOf(x) === physicianId) ||
        !hasType(article, 'Article') ||
        !many(article.author).some(x => idOf(x) === physicianId) ||
        !many(page?.['@type']).some(t => ['WebPage','MedicalWebPage'].includes(t)) ||
        !many(page.author).some(x => idOf(x) === physicianId) ||
        article.url !== origin + path || page.url !== origin + path)
      throw new Error('Missing authored, physician-provided evidence for ' + serviceSlug);
    // A work's incidental discussion is not an Article.about relationship,
    // so it must not silently create Service.subjectOf.
    for (const work of [article, page]) {
      if (!many(work[relationship]).some(x => idOf(x) === service['@id']))
        work[relationship] = [...many(work[relationship]), ref(service['@id'])];
    }
    results.push({service: service['@id'], article: article['@id'],
      relationship, page: page['@id']});
  }
  return results;
}
