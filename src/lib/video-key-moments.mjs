/**
 * Google Search key-moment eligibility for canonical VideoObject data.
 *
 * Google's Clip / SeekToAction guidelines require >=30 seconds duration.
 * Shorter videos remain videos with their original media, transcript, visible
 * HTML chapters and truthful duration; only unsupported structured-data
 * key-moment entities are omitted. No encoded media or watch URLs are edited.
 */
const many = v => v == null ? [] : Array.isArray(v) ? v : [v];
const idOf = v => typeof v === 'string' ? v : v?.['@id'];
const isType = (node, type) => many(node?.['@type']).includes(type);

export function durationSeconds(value) {
  if (typeof value !== 'string') return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
  if (!match || !match.slice(1).some(Boolean)) return null;
  const seconds = Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
  return Number.isFinite(seconds) ? seconds : null;
}

function refersTo(value, iri) {
  if (Array.isArray(value)) return value.some(item => refersTo(item, iri));
  if (!value || typeof value !== 'object') return false;
  if (value['@id'] === iri) return true;
  return Object.entries(value).some(([key, part]) => key !== '@id' && refersTo(part, iri));
}

export function enforceVideoKeyMomentEligibility(graph) {
  if (!Array.isArray(graph)) throw new TypeError('Expected canonical @graph array');
  const byId = new Map(graph.map(node => [node['@id'], node]));
  const removeIds = new Set();
  const affectedVideos = [];
  for (const video of graph.filter(node => isType(node, 'VideoObject'))) {
    const sections = many(video.hasPart);
    if (!sections.length) continue;
    const duration = durationSeconds(video.duration);
    if (duration === null) throw new Error('Video chapters require parseable ISO 8601 duration: ' + video['@id']);
    if (duration >= 30) continue;
    const ids = sections.map(idOf);
    if (ids.some(id => !id || !isType(byId.get(id), 'Clip') ||
        idOf(byId.get(id)?.isPartOf) !== video['@id'])) {
      throw new Error('Invalid short-video chapter ownership: ' + video['@id']);
    }
    for (const id of ids) {
      const foreign = graph.some(node => node !== video && !ids.includes(node['@id']) && 
        Object.entries(node).some(([key, value]) => key !== '@id' && refersTo(value, id)));
      if (foreign) throw new Error('A chapter has a foreign reference and cannot be removed: ' + id);
    }
    delete video.hasPart;
    for (const id of ids) removeIds.add(id);
    affectedVideos.push(video['@id']);
  }
  if (removeIds.size) {
    for (let index = graph.length - 1; index >= 0; index--)
      if (removeIds.has(graph[index]['@id'])) graph.splice(index, 1);
  }
  return { affectedVideos, removedClipIds: [...removeIds] };
}
