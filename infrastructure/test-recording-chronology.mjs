import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {Parser, Store, DataFactory} from 'n3';
import {serializeGraphAsNTriples} from '../src/lib/machine-output.mjs';

const values = value => Array.isArray(value) ? value : value == null ? [] : [value];
const temporal = value => typeof value === 'string' ? value : value?.['@value'];
const eventId = SOURCE.canonicalOrigin + '/advanced-thread-lift-workshop-tehran-1403-11';
const videoId = SOURCE.canonicalOrigin + '/video-thread-lift-workshop';

function eventEarliestInstant(value) {
  const text = temporal(value);
  if (!text) return null;
  // A date-only fact records no time or timezone. Use the earliest possible
  // instant in UTC+14, instead of inventing a midnight/timezone for that event.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return Date.parse(text + 'T00:00:00Z') - 14 * 60 * 60 * 1000;
  if (/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(text)) return Date.parse(text);
  return null;
}

function uploadInstant(value) {
  const text = temporal(value);
  return /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(text ?? '') ? Date.parse(text) : null;
}

function prematureEventRecordings(graph) {
  const byId = new Map(graph['@graph'].map(node => [node['@id'], node]));
  const relations = [];
  for (const node of byId.values()) {
    for (const ref of values(node.recordedIn)) relations.push([node, byId.get(ref?.['@id'])]);
    for (const ref of values(node.recordedAt)) relations.push([byId.get(ref?.['@id']), node]);
  }
  const violations = [];
  for (const [event, recording] of relations) {
    if (!event || !recording || !values(recording['@type']).some(type => ['VideoObject', 'AudioObject'].includes(type))) continue;
    const earliest = eventEarliestInstant(event.startDate), published = uploadInstant(recording.uploadDate);
    if (earliest !== null && published !== null && published < earliest)
      violations.push({event: event['@id'], recording: recording['@id'], startDate: temporal(event.startDate), uploadDate: temporal(recording.uploadDate)});
  }
  return violations;
}

assert.deepEqual(prematureEventRecordings(SOURCE.graph), [],
  'A published event recording cannot predate even the earliest possible start of that event');

const byId = new Map(SOURCE.graph['@graph'].map(node => [node['@id'], node]));
const event = byId.get(eventId), video = byId.get(videoId);
assert(event && video, 'The truthful workshop event and educational video remain separate canonical entities');
assert.equal(temporal(event.startDate), '2025-02-04', 'The recorded event date is preserved');
assert.equal(temporal(video.uploadDate), '2025-01-19T07:01:26.523Z', 'The recorded media publication timestamp is preserved');
assert(values(video.sameAs).includes('https://www.instagram.com/reel/DE_39nRIakj/'), 'The original public educational media evidence remains linked');
assert.deepEqual(event.instructor, {'@id': SOURCE.canonicalOrigin + '/#saeed-ghezelbash'});
assert.deepEqual(event.performer, {'@id': SOURCE.canonicalOrigin + '/#saeed-ghezelbash'});
assert(values(event.teaches).length > 0, 'Existing teaching subject matter is retained');
assert.deepEqual(video.creator, {'@id': SOURCE.canonicalOrigin + '/#saeed-ghezelbash'});
assert.deepEqual(video.publisher, {'@id': SOURCE.canonicalOrigin + '/#saeed-ghezelbash'});
const course = byId.get(SOURCE.canonicalOrigin + '/advanced-thread-lift-workshop-course');
assert(values(course?.subjectOf).some(ref => ref['@id'] === videoId), 'The generic course-to-educational-video relationship is retained');

const stale = structuredClone(SOURCE.graph);
stale['@graph'].find(node => node['@id'] === eventId).recordedIn = {'@id': videoId};
assert(prematureEventRecordings(stale).some(violation => violation.event === eventId && violation.recording === videoId),
  'Restoring the contradicted exact-event association is detected without changing either date');
const reverse = structuredClone(SOURCE.graph);
reverse['@graph'].find(node => node['@id'] === videoId).recordedAt = {'@id': eventId};
assert(prematureEventRecordings(reverse).some(violation => violation.event === eventId && violation.recording === videoId),
  'The inverse recording association cannot bypass chronology validation');

const rdf = new Store(new Parser().parse(serializeGraphAsNTriples(SOURCE.graph)));
const {namedNode} = DataFactory;
assert.equal(rdf.countQuads(namedNode(eventId), namedNode('https://schema.org/recordedIn'), namedNode(videoId), null), 0,
  'The incompatible exact-event recording relation is absent from the actual RDF representation');

console.log('Event recording chronology, preserved dates and generic educational connectivity PASS');
