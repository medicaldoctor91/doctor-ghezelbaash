import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'dist');
const homePath = join(root, 'index.html');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const html = readFileSync(homePath, 'utf8');

const profile = 'https://www.instagram.com/doctor.ghezelbaash/';
const reels = 'https://www.instagram.com/doctor.ghezelbaash/reels/';
const direct = 'https://ig.me/m/doctor.ghezelbaash';
const irimc = 'https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e';
const wikidata = 'https://www.wikidata.org/entity/Q140287622';
const huggingFace = 'https://huggingface.co/Ghezelbaash';

check(html.includes(`href="${direct}"`), 'homepage direct-message CTA missing');
check(html.includes('مشاوره مستقیم با پزشک'), 'homepage direct-message CTA label missing');
check(html.includes(`href="${reels}"`), 'homepage Reels CTA missing');
check(html.includes('دیدن نمونه‌کارها'), 'homepage Reels CTA label missing');

const directAnchors = [...html.matchAll(new RegExp(`<a\\b[^>]*href="${direct.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 'g'))].map((match) => match[0]);
const reelsAnchors = [...html.matchAll(new RegExp(`<a\\b[^>]*href="${reels.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 'g'))].map((match) => match[0]);
check(directAnchors.length >= 1 && directAnchors.every((anchor) => !/\brel="[^"]*\bme\b/.test(anchor)), 'direct-message links must not use rel=me');
check(reelsAnchors.length >= 1 && reelsAnchors.every((anchor) => !/\brel="[^"]*\bme\b/.test(anchor)), 'Reels links must not use rel=me');

const conversionDock = html.match(/<nav id="conversion-dock"[\s\S]*?<\/nav>/i)?.[0] ?? '';
check(conversionDock.includes(`href="${profile}"`), 'sticky conversion dock must point to the main Instagram profile');
check(!conversionDock.includes(direct), 'sticky conversion dock must not point to Instagram Direct');
check(!conversionDock.includes(reels), 'sticky conversion dock must not point to Reels');

const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const meHrefs = [...head.matchAll(/<link rel="me" href="([^"]+)"/g)].map((match) => match[1]);
for (const required of [
  'https://orcid.org/0009-0001-9346-8475',
  profile,
  'https://github.com/Medicaldoctor91',
  huggingFace,
]) check(meHrefs.includes(required), `head rel=me missing: ${required}`);
for (const forbidden of [irimc, wikidata, direct, reels]) {
  check(!meHrefs.includes(forbidden), `head rel=me should not include registry, knowledge-base, or action URL: ${forbidden}`);
}

check(html.includes('id="knowledge-resources"'), 'homepage Knowledge & AI section missing');
check(html.includes(`href="${irimc}"`), 'Knowledge & AI section must expose IRIMC verification');
check(html.includes(`href="${wikidata}"`), 'Knowledge & AI section must expose physician Wikidata');
check(html.includes(`href="${huggingFace}`), 'Knowledge & AI section must expose Hugging Face resources');

const blocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
check(blocks.length === 1, `homepage expected one JSON-LD block, found ${blocks.length}`);
if (blocks[0]) {
  try {
    const data = JSON.parse(blocks[0][1]);
    const nodes = data['@graph'] ?? [];
    const person = nodes.find((node) => node['@id'] === 'https://www.ghezelbaash.ir/#person');
    const clinic = nodes.find((node) => node['@id'] === 'https://www.ghezelbaash.ir/#clinic');
    const dock = nodes.find((node) => node['@id'] === 'https://www.ghezelbaash.ir/#conversion-dock');

    for (const url of [irimc, 'https://orcid.org/0009-0001-9346-8475', wikidata, huggingFace]) {
      check(person?.sameAs?.includes(url), `Person.sameAs missing ${url}`);
    }
    check(!person?.sameAs?.includes(profile), 'Person.sameAs must not conflate the physician with the Google Local Instagram assignment');
    check(clinic?.sameAs?.includes('https://www.wikidata.org/entity/Q140288589'), 'Clinic.sameAs missing clinic Wikidata entity');
    check(clinic?.sameAs?.includes(profile), 'Clinic.sameAs missing official Instagram profile');

    const actions = person?.potentialAction ?? [];
    check(actions.some((action) => action['@type'] === 'CommunicateAction' && action.name === 'مشاوره مستقیم با پزشک' && action.target === direct), 'Person direct consultation action missing');
    check(actions.some((action) => action['@type'] === 'ViewAction' && action.target === reels), 'Person Reels view action missing');
    check(actions.some((action) => action['@type'] === 'FollowAction' && action.target === profile), 'Person Instagram follow action missing');

    const dockActions = dock?.potentialAction ?? [];
    check(dockActions.some((action) => action['@type'] === 'FollowAction' && action.target === profile), 'conversion-dock schema must point to main Instagram profile');
    check(!dockActions.some((action) => action.target === direct || action.target === reels), 'conversion-dock schema must not conflate profile, Direct, and Reels');
  } catch (error) {
    failures.push(`invalid homepage JSON-LD: ${error.message}`);
  }
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  instagramProfile: profile,
  instagramDirect: direct,
  instagramReels: reels,
  stickyTarget: 'profile',
  registryLinksScopedToKnowledgeSection: true,
  identitySignals: {
    head: ['ORCID', 'Instagram', 'GitHub', 'Hugging Face profile'],
    schema: ['IRIMC', 'ORCID', 'Wikidata person', 'Wikidata clinic', 'Google KG person', 'Google Local KG clinic', 'Instagram clinic', 'Hugging Face profile'],
  },
}, null, 2));
