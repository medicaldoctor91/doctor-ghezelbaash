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

export function reconcilePhysicianAvailableServices(graph, physician, origin) {
  if (!Array.isArray(graph) || !physician?.['@id'] || !origin)
    throw new TypeError('Expected canonical graph, physician and origin');
  const physicianId = physician['@id'];
  const nodes = new Map(graph.map(n => [n['@id'], n]));
  if (nodes.size !== graph.length) throw new Error('Duplicate canonical node IDs');
  const physicianServices = graph.filter(n => hasType(n,'Service') &&
    uniqueIds(many(n.provider)).length === 1 &&
    idOf(many(n.provider)[0]) === physicianId);
  if (physicianServices.length !== graph.filter(n => hasType(n,'Service')).length)
    throw new Error('Service provider conflict: physician cannot claim services of other providers');

  const existing = many(physician.availableService).map(idOf);
  if (new Set(existing).size !== existing.length)
    throw new Error('Duplicate physician.availableService references');
  const physicianServiceIds = new Set(physicianServices.map(n => n['@id']));
  const legacy = existing.filter(id => !physicianServiceIds.has(id));
  const legacyMigraine = origin + '/procedure-botulinum-toxin-chronic-migraine';
  // The legacy object is a MedicalTherapy rather than a Service. It remains
  // accessible as medical subject knowledge, not a misleading Service entry.
  if (legacy.some(id => id !== legacyMigraine || !hasType(nodes.get(id),'MedicalTherapy')))
    throw new Error('Unexpected non-Service in physician.availableService: ' + legacy.join(', '));
  const previous = new Set(existing);
  physician.availableService = [
    ...existing.filter(id => physicianServiceIds.has(id)).map(ref),
    ...physicianServices.filter(n => !previous.has(n['@id'])).map(n => ref(n['@id'])),
  ];
  if (legacy.includes(legacyMigraine) &&
      !many(physician.knowsAbout).some(v => idOf(v) === legacyMigraine)) {
    physician.knowsAbout = [...many(physician.knowsAbout), ref(legacyMigraine)];
  }
  const finalIds = physician.availableService.map(idOf);
  if (new Set(finalIds).size !== physicianServices.length ||
      finalIds.length !== physicianServices.length ||
      finalIds.some(id => !physicianServiceIds.has(id)))
    throw new Error('Physician.availableService does not exactly equal provided Services');
  return {services: physicianServices.length,
    added: finalIds.filter(id => !previous.has(id)),
    migratedLegacy: legacy,
    availableServiceCount: finalIds.length};
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
