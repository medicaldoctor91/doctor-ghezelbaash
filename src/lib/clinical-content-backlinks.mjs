/**
 * Add inverse, evidence-grounded content links for physician-provided Services.
 * A content item is eligible only when its existing, authored `about` link names
 * an existing Service. This does not create Offers, booking URLs, services,
 * specialties or claims that a procedure is personally performed.
 */
const asArray = value => value == null ? [] : Array.isArray(value) ? value : [value];
const idOf = value => typeof value === 'string' ? value : value?.['@id'];
const ref = id => ({'@id': id});

export function connectClinicalContentToServices(graph, physicianId, siteOrigin) {
  if (!Array.isArray(graph) || !physicianId || !siteOrigin) {
    throw new TypeError('Expected canonical graph, physician ID and site origin');
  }
  const origin = new URL(siteOrigin).origin;
  const services = new Map(graph.filter(node => asArray(node['@type']).includes('Service'))
    .filter(node => {
      const providers = asArray(node.provider).map(idOf);
      return providers.length === 1 && providers[0] === physicianId;
    }).map(node => [node['@id'], node]));
  let added = 0;
  const linkedServices = new Set();
  const linkedWorks = new Set();
  for (const work of graph) {
    const types = asArray(work['@type']);
    const article = types.includes('Article');
    const video = types.includes('VideoObject');
    if (!article && !video) continue;
    if (typeof work.url !== 'string') continue;
    let workUrl;
    try { workUrl = new URL(work.url); } catch { continue; }
    if (workUrl.origin !== origin) continue;
    const authorRole = article ? 'author' : 'creator';
    if (!asArray(work[authorRole]).some(value => idOf(value) === physicianId)) continue;
    const aboutServices = new Set(asArray(work.about).map(idOf).filter(id => services.has(id)));
    for (const serviceId of aboutServices) {
      const service = services.get(serviceId);
      const existing = asArray(service.subjectOf);
      if (existing.some(value => idOf(value) === work['@id'])) continue;
      service.subjectOf = [...existing, ref(work['@id'])];
      added++;
      linkedServices.add(serviceId);
      linkedWorks.add(work['@id']);
    }
  }
  return {added, servicesLinked: linkedServices.size, authoredWorksLinked: linkedWorks.size};
}
