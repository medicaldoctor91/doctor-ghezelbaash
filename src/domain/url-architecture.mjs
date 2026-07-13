/**
 * Canonical URL and fragment registry.
 *
 * Service URLs are explicit and must never be inferred from heading text or order.
 * Video watch pages use stable crawlable paths; homepage fragment anchors remain
 * available only for contextual in-article placement.
 */
export const serviceUrlRegistry = Object.freeze([
  { id: 'botulinum-toxin', anchor: 'service-botulinum-toxin', targetHeadingId: 'best-botox-doctor-kermanshah' },
  { id: 'dermal-filler', anchor: 'service-dermal-filler', targetHeadingId: 'best-filler-doctor-kermanshah' },
  { id: 'thread-lift', anchor: 'service-thread-lift', targetHeadingId: 'best-thread-lift-doctor-kermanshah' },
  { id: 'subcision', anchor: 'service-subcision', targetHeadingId: 'best-acne-scar-subcision-doctor-kermanshah' },
  { id: 'acne-scar-treatment', anchor: 'service-acne-scar-treatment', targetHeadingId: 'best-acne-scar-subcision-doctor-kermanshah' },
  { id: 'skin-rejuvenation', anchor: 'service-skin-rejuvenation', targetHeadingId: 'best-skin-rejuvenation-doctor-kermanshah' },
  { id: 'prp-skin-hair', anchor: 'service-prp-skin-hair', targetHeadingId: 'best-hair-loss-prp-doctor-kermanshah' },
  { id: 'mesotherapy', anchor: 'service-mesotherapy', targetHeadingId: 'clinical-decision-model-detail-94' },
  { id: 'hair-loss-evaluation', anchor: 'service-hair-loss-evaluation', targetHeadingId: 'best-hair-loss-prp-doctor-kermanshah' },
  { id: 'submental-liposuction', anchor: 'service-submental-liposuction', targetHeadingId: 'best-submental-liposuction-doctor-kermanshah' },
  { id: 'body-contouring', anchor: 'service-body-contouring', targetHeadingId: 'submental-and-body-contouring-guide' },
  { id: 'blepharoplasty', anchor: 'service-blepharoplasty', targetHeadingId: 'clinical-decision-model-detail-141' },
  { id: 'rhinoplasty', anchor: 'service-rhinoplasty', targetHeadingId: 'clinical-decision-model-detail-142' },
  { id: 'facelift-necklift', anchor: 'service-facelift-necklift', targetHeadingId: 'clinical-decision-model-detail-144' },
  { id: 'orthognathic-surgery', anchor: 'service-orthognathic-surgery', targetHeadingId: 'clinical-decision-model-detail-143' },
  { id: 'hair-transplant', anchor: 'service-hair-transplant', targetHeadingId: 'clinical-decision-model-detail-115' },
]);

const serviceById = new Map(serviceUrlRegistry.map((entry) => [entry.id, entry]));
const aliasesByHeading = new Map();
for (const entry of serviceUrlRegistry) {
  const aliases = aliasesByHeading.get(entry.targetHeadingId) ?? [];
  aliases.push(entry);
  aliasesByHeading.set(entry.targetHeadingId, aliases);
}

export function serviceAnchorFor(procedureId) {
  const entry = serviceById.get(procedureId);
  if (!entry) throw new Error(`Missing canonical service URL registry entry for ${procedureId}`);
  return `#${entry.anchor}`;
}

export function getServiceAnchorMap() {
  return Object.fromEntries(serviceUrlRegistry.map((entry) => [entry.id, `#${entry.anchor}`]));
}

export function serviceAliasesForHeading(headingId) {
  return aliasesByHeading.get(headingId) ?? [];
}

function base(baseUrl) {
  return String(baseUrl).endsWith('/') ? String(baseUrl) : `${baseUrl}/`;
}

export function videoHubUrl(baseUrl) {
  return `${base(baseUrl)}#video-knowledge-hub`;
}

export function videoHubPageId(baseUrl) {
  return `${base(baseUrl)}#video-knowledge-hub`;
}

export function videoWatchPath(slug) {
  return `/videos/${slug}/`;
}

export function videoWatchUrl(baseUrl, slug) {
  return new URL(`videos/${slug}/`, base(baseUrl)).href;
}

export function videoWebPageId(baseUrl, slug) {
  return `${videoWatchUrl(baseUrl, slug)}#webpage`;
}

export function videoEntityId(baseUrl, slug) {
  return `${videoWatchUrl(baseUrl, slug)}#video`;
}

export function videoClipId(baseUrl, slug, index) {
  return `${videoWatchUrl(baseUrl, slug)}#clip-${index}`;
}

export function videoMomentUrl(baseUrl, slug, startOffset) {
  const seconds = Math.max(0, Math.floor(Number(startOffset) || 0));
  return `${videoWatchUrl(baseUrl, slug)}?t=${seconds}`;
}
