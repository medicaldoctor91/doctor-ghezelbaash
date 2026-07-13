import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { procedures } from '../src/domain/concepts.mjs';
import { videos } from '../src/domain/media.mjs';
import { serviceUrlRegistry, videoClipId, videoEntityId, videoWebPageId } from '../src/domain/url-architecture.mjs';

const dist = join(process.cwd(), 'dist');
const site = 'https://www.ghezelbaash.ir/';
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const homepage = readFileSync(join(dist, 'index.html'), 'utf8');
const full = JSON.parse(readFileSync(join(dist, 'knowledge-graph.jsonld'), 'utf8'));
const inline = JSON.parse([...homepage.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)][0][1]);

function auditGraph(label, value) {
  const nodes = value['@graph'] ?? [];
  const ids = nodes.map((node) => node['@id']).filter(Boolean);
  const defined = new Set(ids);
  const refs = new Set();
  const walk = (item) => {
    if (Array.isArray(item)) return item.forEach(walk);
    if (!item || typeof item !== 'object') return;
    if (typeof item['@id'] === 'string' && item['@id'].startsWith(site)) refs.add(item['@id']);
    Object.values(item).forEach(walk);
  };
  nodes.forEach(walk);
  check(ids.length === defined.size, `${label}: duplicate @id values`);
  const dangling = [...refs].filter((id) => !defined.has(id));
  check(dangling.length === 0, `${label}: dangling same-site references: ${dangling.slice(0, 10).join(', ')}`);
  const page = nodes.find((node) => node['@id'] === `${site}#webpage`);
  check(page?.mainEntity?.['@id'] === `${site}#person`, `${label}: Person must be the sole page mainEntity`);
  check(!Array.isArray(page?.mainEntity), `${label}: page mainEntity must not be an array`);
  return { nodes, defined };
}

const fullAudit = auditGraph('full graph', full);
const inlineAudit = auditGraph('inline graph', inline);
check(fullAudit.nodes.length >= 800, `full graph unexpectedly narrow: ${fullAudit.nodes.length} nodes`);
for (const id of inlineAudit.defined) check(fullAudit.defined.has(id) || id.startsWith('https://membersearch.irimc.org/'), `inline @id absent from canonical graph: ${id}`);

const procedureIds = procedures.map((item) => item.id);
const registryIds = serviceUrlRegistry.map((item) => item.id);
check(procedureIds.length === registryIds.length && procedureIds.every((id) => registryIds.includes(id)), 'service URL registry does not exactly cover procedures');
for (const item of serviceUrlRegistry) {
  check((homepage.match(new RegExp(`\\sid="${item.anchor}"`, 'g')) ?? []).length === 1, `homepage must render one service anchor ${item.anchor}`);
}

for (const video of videos) {
  const entityId = videoEntityId(site, video.id);
  const entity = fullAudit.nodes.find((node) => node['@id'] === entityId);
  check(entity?.url === entityId, `${video.id}: VideoObject URL must be its homepage anchor`);
  check(entity?.mainEntityOfPage?.['@id'] === videoWebPageId(site, video.id), `${video.id}: VideoObject mainEntityOfPage mismatch`);
  check((entity?.hasPart ?? []).length === 3, `${video.id}: VideoObject must reference three clips`);
  for (let index = 1; index <= 3; index += 1) check(fullAudit.defined.has(videoClipId(site, video.id, index)), `${video.id}: clip ${index} missing`);
}

const headers = readFileSync(join(dist, '_headers'), 'utf8');
check(/\/\n(?:  .*\n)*  Link: <\/knowledge-graph\.jsonld>; rel="describedby"; type="application\/ld\+json"/m.test(headers), 'root HTTP Link describedby header missing');
check(!existsSync(join(dist, '_redirects')), '_redirects must be absent for pre-launch removed routes');

if (failures.length) { console.error(JSON.stringify({ status: 'fail', failures }, null, 2)); process.exit(1); }
console.log(JSON.stringify({ status: 'pass', fullGraphNodes: fullAudit.nodes.length, inlineGraphNodes: inlineAudit.nodes.length, services: serviceUrlRegistry.length, videos: videos.length, mainEntity: `${site}#person`, describedby: true }, null, 2));
