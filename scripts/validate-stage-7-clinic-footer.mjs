import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homepageExternalDirectoryContract } from '../src/domain/homepage-external-directory.mjs';
import { videos } from '../src/domain/media.mjs';

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const root = process.cwd();
const homepage = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
const entitiesSource = readFileSync(join(root, 'src', 'domain', 'entities.ts'), 'utf8');
const footerSource = readFileSync(join(root, 'src', 'components', 'home', 'HomeFooter.astro'), 'utf8');

const expectedGroups = [
  ['medical-registration', 'ثبت و اعتبار پزشکی'],
  ['research-identifiers', 'پژوهش و شناسه‌های علمی'],
  ['official-networks', 'شبکه‌های رسمی'],
  ['clinic-location', 'موقعیت و کلینیک'],
  ['machine-data', 'Dataset و ماشین‌خوان'],
];

const sourceString = (key) => {
  const match = entitiesSource.match(new RegExp(`\\b${key}:\\s*"([^"]+)"`, 'u'));
  if (!match) failures.push(`Stage 7 cannot resolve site string from entities.ts: ${key}`);
  return match?.[1] ?? '';
};
const sourceNumber = (key) => {
  const match = entitiesSource.match(new RegExp(`\\b${key}:\\s*(\\d+(?:\\.\\d+)?)`, 'u'));
  if (!match) failures.push(`Stage 7 cannot resolve site number from entities.ts: ${key}`);
  return Number(match?.[1] ?? Number.NaN);
};
const toFaDigits = (value) => String(value).replace(/\d/gu, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const stripTags = (value) => value.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();
const attr = (attributes, name) => attributes.match(new RegExp(`\\b${name}="([^"]*)"`, 'u'))?.[1];
const hasRelToken = (value, token) => (value ?? '').split(/\s+/u).includes(token);

check(homepageExternalDirectoryContract.length === expectedGroups.length, `Stage 7 requires exactly ${expectedGroups.length} Footer groups`);
check(
  homepageExternalDirectoryContract.every((group, index) => group.id === expectedGroups[index]?.[0] && group.title === expectedGroups[index]?.[1]),
  'Stage 7 Footer group IDs, titles or order differ from the approved contract',
);

const contractLinks = homepageExternalDirectoryContract.flatMap((group) => group.links.map((link) => ({ ...link, groupId: group.id })));
const linkIds = contractLinks.map((link) => link.id);
const labels = contractLinks.map((link) => link.label);
check(new Set(linkIds).size === linkIds.length, 'Stage 7 directory contains duplicate link IDs');
check(new Set(labels).size === labels.length, 'Stage 7 directory contains duplicate anchor labels');
check(contractLinks.every((link) => link.label.trim().length >= 18), 'Stage 7 directory contains a non-descriptive short anchor label');
check(contractLinks.every((link) => !/^(اینجا|بیشتر|مشاهده|کلیک|لینک)$/u.test(link.label.trim())), 'Stage 7 directory contains generic anchor text');
check(contractLinks.every((link) => !link.sitePath?.includes('instagramDirect')), 'Instagram Direct must not enter the Stage 7 directory registry');

const groupById = new Map(homepageExternalDirectoryContract.map((group) => [group.id, group]));
check(groupById.get('medical-registration')?.links.every((link) => ['official-registration', 'authority-identifier'].includes(link.relation)), 'official registration and non-authority profiles are mixed');
check(groupById.get('research-identifiers')?.links.every((link) => link.relation.startsWith('research-')), 'research group contains a non-research relation');
check(groupById.get('official-networks')?.links.every((link) => link.relation === 'owned-profile' && link.entity === 'person' && link.relMe === true), 'official network group must contain only owned Person profiles with rel=me');
check(groupById.get('clinic-location')?.links.every((link) => link.entity === 'clinic' && link.relMe !== true), 'clinic group must contain only Clinic links without rel=me');
check(groupById.get('machine-data')?.links.every((link) => link.entity === 'dataset' && link.relMe !== true), 'machine-data group must contain only Dataset resources without rel=me');
check(footerSource.includes('resolveHomepageExternalDirectory(site)'), 'HomeFooter must render from the Stage 7 registry');

const clinicId = 'clinic-information-kermanshah';
const graphId = 'knowledge-graph-and-datasets';
const contactId = 'sources-contact-and-appointment';
const clinicStart = homepage.indexOf(`id="${clinicId}"`);
const graphStart = homepage.indexOf(`id="${graphId}"`);
const contactStart = homepage.indexOf(`id="${contactId}"`);
const footerStart = homepage.indexOf('<footer');
const footerEnd = homepage.indexOf('</footer>', footerStart);
check(clinicStart >= 0, 'Stage 7 Clinic section is absent from built HTML');
check(graphStart > clinicStart, 'machine-data section must follow Clinic information');
check(contactStart > graphStart, 'contact section must follow machine-data section');
check(footerStart > contactStart, 'Footer must follow the contact section');
check(footerEnd > footerStart, 'Footer closing tag is absent');

const clinicBlock = homepage.slice(clinicStart, graphStart);
const graphBlock = homepage.slice(graphStart, contactStart);
const contactBlock = homepage.slice(contactStart, footerStart);
const footerBlock = homepage.slice(footerStart, footerEnd + 9);

const siteUrl = sourceString('url');
const clinicEntityId = 'dr-saeed-ghezelbash-aesthetic-clinic';
const clinicName = sourceString('clinicName');
const address = sourceString('address');
const phone = sourceString('phone');
const hours = sourceString('hours');
const maps = sourceString('maps');
const openStreetMap = sourceString('openStreetMap');
const placeWikidata = sourceString('placeWikidata');
const instagramDirect = sourceString('instagramDirect');
const observedAt = sourceString('observedAt');
const ratingValue = sourceNumber('ratingValue');
const bestRating = sourceNumber('bestRating');
const ratingCount = sourceNumber('ratingCount');

check(clinicBlock.includes('data-stage-seven-clinic'), 'Clinic section lacks the Stage 7 marker');
check(clinicBlock.includes('data-entity-kind="clinic"'), 'Clinic section does not visibly declare the Clinic entity kind');
check(clinicBlock.includes(`id="${clinicEntityId}"`), 'canonical Clinic entity anchor is absent from the Clinic section');
check(clinicBlock.includes('data-canonical-clinic-entity'), 'canonical Clinic entity marker is absent');
check(clinicBlock.includes(clinicName), 'visible Clinic name differs from the central entity data');
check(clinicBlock.includes(address), 'visible Clinic address differs from the central entity data');
check(clinicBlock.includes(`href="tel:${phone}"`), 'visible Clinic phone link differs from the central entity data');
check(clinicBlock.includes(hours), 'visible Clinic hours differ from the central entity data');
check(clinicBlock.includes(`datetime="${observedAt}"`), 'dated Google Maps rating provenance is absent');
check(clinicBlock.includes(`${ratingValue.toFixed(1)} / ${bestRating}`), 'visible Clinic rating value differs from the central entity data');
check(clinicBlock.includes(`${toFaDigits(ratingCount)} ارزیابی`), 'visible Clinic rating count differs from the central entity data');
for (const field of ['rating', 'address', 'phone', 'hours', 'rating-observed-at']) {
  check(clinicBlock.includes(`data-clinic-field="${field}"`), `Clinic fact is not explicitly marked: ${field}`);
}
check(clinicBlock.includes(`href="${maps}"`) && clinicBlock.includes('data-clinic-source="google-maps"'), 'Google Maps Clinic source is absent or unmarked');
check(clinicBlock.includes(`href="${openStreetMap}"`) && clinicBlock.includes('data-clinic-source="openstreetmap"'), 'OpenStreetMap Clinic source is absent or unmarked');
check(clinicBlock.includes(`href="${placeWikidata}"`) && clinicBlock.includes('data-clinic-source="wikidata"'), 'Wikidata Clinic source is absent or unmarked');

const clinicVideos = videos.filter((video) => video.sectionId === clinicId);
check(clinicVideos.length === 1, `Stage 7 requires exactly one Clinic video; found ${clinicVideos.length}`);
const clinicVideo = clinicVideos[0];
if (clinicVideo) {
  check(clinicVideo.subsectionId == null, 'Clinic video must target the Clinic H2 directly');
  check(clinicBlock.includes(`id="video-${clinicVideo.id}"`), 'Clinic testimonial video is not physically inside the Clinic section');
  check(clinicBlock.includes(clinicVideo.title), 'Clinic testimonial title differs from the media registry');
  check(clinicBlock.includes('data-video-section="clinic-information-kermanshah"'), 'Clinic testimonial lacks its explicit H2 destination marker');
}

check(graphBlock.includes('data-stage-seven-machine-data'), 'machine-data section lacks the Stage 7 marker');
for (const link of groupById.get('machine-data')?.links ?? []) {
  check(graphBlock.includes(`data-machine-resource="${link.id}"`), `machine-data section omits registered resource: ${link.id}`);
}
check(contactBlock.includes('data-stage-seven-contact'), 'contact section lacks the Stage 7 marker');
check(contactBlock.includes('data-contact-cta="phone"'), 'phone CTA is absent from the contact section');
check(contactBlock.includes('data-contact-cta="instagram-direct"'), 'Instagram Direct CTA is absent from the contact section');

check(footerBlock.includes('data-stage-seven-footer'), 'Footer lacks the Stage 7 marker');
check(footerBlock.includes('id="external-entity-directory"'), 'external entity directory is absent from Footer');
check(footerBlock.includes('data-stage-seven-directory'), 'Footer directory lacks the Stage 7 marker');
check(!footerBlock.includes(instagramDirect), 'Instagram Direct must remain a CTA and must not appear in Footer directory content');

const renderedGroupIds = [...footerBlock.matchAll(/data-footer-group="([^"]+)"/gu)].map((match) => match[1]);
check(JSON.stringify(renderedGroupIds) === JSON.stringify(expectedGroups.map(([id]) => id)), `built Footer group order mismatch: ${renderedGroupIds.join(', ')}`);
for (const [id, title] of expectedGroups) {
  check(footerBlock.includes(`id="footer-group-${id}"`), `Footer group heading ID is absent: ${id}`);
  check(footerBlock.includes(title), `Footer group title is absent: ${title}`);
}

const footerAnchors = [...footerBlock.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gu)].map((match) => ({
  attributes: match[1],
  label: stripTags(match[2]),
}));
const directoryAnchors = footerAnchors.filter((anchor) => attr(anchor.attributes, 'data-footer-link'));
check(directoryAnchors.length === contractLinks.length, `built Footer directory link count mismatch: expected ${contractLinks.length}, found ${directoryAnchors.length}`);
const renderedHrefs = [];
for (const link of contractLinks) {
  const matches = directoryAnchors.filter((anchor) => attr(anchor.attributes, 'data-footer-link') === link.id);
  check(matches.length === 1, `Footer link must render exactly once: ${link.id}`);
  const rendered = matches[0];
  if (!rendered) continue;
  const href = attr(rendered.attributes, 'href') ?? '';
  const target = attr(rendered.attributes, 'target');
  const rel = attr(rendered.attributes, 'rel');
  renderedHrefs.push(href);
  check(rendered.label === link.label, `Footer anchor label mismatch: ${link.id}`);
  check(attr(rendered.attributes, 'data-footer-relation') === link.relation, `Footer relation marker mismatch: ${link.id}`);
  check(attr(rendered.attributes, 'data-footer-entity') === link.entity, `Footer entity marker mismatch: ${link.id}`);
  const external = !href.startsWith('/') && !href.startsWith('tel:');
  if (external) {
    check(target === '_blank', `external Footer link must open a new tab: ${link.id}`);
    for (const token of ['noopener', 'noreferrer', 'external']) check(hasRelToken(rel, token), `external Footer link is missing rel=${token}: ${link.id}`);
  } else {
    check(target === undefined, `internal or telephone Footer link must not set target: ${link.id}`);
  }
  if (link.relMe) check(hasRelToken(rel, 'me'), `Person profile Footer link must expose rel=me: ${link.id}`);
  else check(!hasRelToken(rel, 'me'), `non-Person-profile Footer link must not expose rel=me: ${link.id}`);
}
check(new Set(renderedHrefs).size === renderedHrefs.length, 'Footer directory contains duplicate destinations');

const directAnchors = [...homepage.matchAll(new RegExp(`<a\\b([^>]*href="${escapeRegExp(instagramDirect)}"[^>]*)>`, 'gu'))].map((match) => match[1]);
check(directAnchors.length >= 2, 'Instagram Direct CTA is unexpectedly absent from primary contact surfaces');
for (const attributes of directAnchors) {
  const className = attr(attributes, 'class') ?? '';
  check(className.split(/\s+/u).includes('button') || attributes.includes('data-contact-cta='), 'Instagram Direct appears outside an explicit CTA surface');
}

const inlineMatch = homepage.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/u);
check(Boolean(inlineMatch), 'Stage 7 cannot locate inline JSON-LD');
const inlineGraph = inlineMatch ? JSON.parse(inlineMatch[1]) : { '@graph': [] };
const fullGraph = JSON.parse(readFileSync(join(root, 'dist', 'knowledge-graph.jsonld'), 'utf8'));
const collectSameAs = (value, output = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSameAs(item, output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  if ('sameAs' in value) {
    const values = Array.isArray(value.sameAs) ? value.sameAs : [value.sameAs];
    for (const item of values) if (typeof item === 'string') output.push(item);
  }
  for (const child of Object.values(value)) collectSameAs(child, output);
  return output;
};
for (const [label, graph] of [['inline graph', inlineGraph], ['canonical graph', fullGraph]]) {
  const sameAs = collectSameAs(graph);
  check(!sameAs.includes(maps), `${label}: Google Maps must use hasMap and must not appear in sameAs`);
  check(!sameAs.includes(instagramDirect), `${label}: Instagram Direct is a CTA and must not appear in sameAs`);
  const nodes = graph['@graph'] ?? [];
  const clinic = nodes.find((node) => node?.['@id'] === `${siteUrl}#${clinicEntityId}`);
  check(clinic?.hasMap === maps, `${label}: Clinic.hasMap must point to the approved Google Maps URL`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', stage: 7, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  stage: 7,
  clinicEntity: `${siteUrl}#${clinicEntityId}`,
  clinicVideo: clinicVideo?.id,
  footerGroups: expectedGroups.length,
  footerLinks: contractLinks.length,
  machineResources: groupById.get('machine-data')?.links.length ?? 0,
  instagramDirectDirectoryLinks: 0,
}, null, 2));
