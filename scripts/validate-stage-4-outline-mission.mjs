import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homepageSections, homepageToc, homepageArticleSubsections } from '../src/domain/homepage-content-registry.mjs';
import { localServiceIntentAnswers, nationalAuthorityAnswers } from '../src/domain/homepage-mission-lock.mjs';

const root = process.cwd();
const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
const tocSource = readFileSync(join(root, 'src/components/home/ContentTable.astro'), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const textOf = (value) => value
  .replace(/<script\b[\s\S]*?<\/script>/giu, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/giu, ' ')
  .replace(/<[^>]+>/gu, ' ')
  .replace(/&zwnj;|&#8204;/giu, '\u200c')
  .replace(/&nbsp;|&#160;/giu, ' ')
  .replace(/&#(\d+);/gu, (_, number) => String.fromCodePoint(Number(number)))
  .replace(/&[a-z0-9#]+;/giu, ' ')
  .replace(/\s+/gu, ' ')
  .trim();

const main = html.match(/<main\b[^>]*id="main-content"[^>]*>([\s\S]*?)<\/main>/iu)?.[1] ?? '';
check(Boolean(main), 'main#main-content is missing');

const tagsWithIds = [...html.matchAll(/<([a-z][a-z0-9:-]*)\b[^>]*\sid="([^"]+)"[^>]*>/giu)]
  .map((match) => ({ tag: match[1].toLowerCase(), id: match[2], raw: match[0] }));
const ids = tagsWithIds.map((entry) => entry.id);
const idCounts = new Map(ids.map((value) => [value, ids.filter((candidate) => candidate === value).length]));
check(new Set(ids).size === ids.length, `duplicate IDs: ${[...idCounts].filter(([, count]) => count > 1).map(([value]) => value).join(', ')}`);

const tocAt = main.indexOf(`id="${homepageToc.id}"`);
const tocOpen = main.lastIndexOf('<nav', tocAt);
const tocClose = main.indexOf('</nav>', tocAt);
const toc = tocOpen >= 0 && tocClose > tocOpen ? main.slice(tocOpen, tocClose + 6) : '';
check(Boolean(toc), 'Content Table nav is missing');
check((toc.match(/<details\b/gu) ?? []).length === homepageToc.groups.length, 'Content Table group count mismatch');
check(!/<script\b|\bonclick=|javascript:/iu.test(tocSource), 'Content Table depends on JavaScript');
const tocHrefs = [...toc.matchAll(/<a\b[^>]*href="#([^"]+)"/giu)].map((match) => match[1]);
check(JSON.stringify(tocHrefs) === JSON.stringify(homepageSections.map((section) => section.id)), 'Content Table destinations/order mismatch');

const h2Matches = [...main.matchAll(/<h2\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/giu)]
  .map((match) => ({ id: match[1], text: textOf(match[2]) }));
const expectedH2Ids = [homepageToc.headingId, ...homepageSections.map((section) => `${section.id}-title`)];
check(h2Matches.length === expectedH2Ids.length, `H2 count ${h2Matches.length}`);
check(JSON.stringify(h2Matches.map((entry) => entry.id)) === JSON.stringify(expectedH2Ids), 'H2 IDs/order mismatch');
for (const section of homepageSections) {
  check(new RegExp(`<section\\b[^>]*id="${section.id}"[^>]*aria-labelledby="${section.id}-title"`, 'iu').test(main), `canonical H2 section missing: ${section.id}`);
  check(h2Matches.find((entry) => entry.id === `${section.id}-title`)?.text === section.title, `H2 title mismatch: ${section.id}`);
}

const coreIds = [
  'best-aesthetic-doctor-selection-criteria',
  'doctor-clinic-operator-difference',
  'when-aesthetic-doctor-rejects-treatment',
];
const serviceComponentIds = [
  'botox-kermanshah',
  'dermal-filler-kermanshah',
  'thread-lift-kermanshah',
  'acne-scar-subcision-kermanshah',
  'skin-rejuvenation-kermanshah',
  'hair-loss-prp-kermanshah',
  'submental-liposuction-kermanshah',
  'aesthetic-surgery-evaluation-kermanshah',
];
const expectedH3Ids = [
  ...coreIds,
  ...localServiceIntentAnswers.map((entry) => entry.id),
  ...nationalAuthorityAnswers.map((entry) => entry.id),
  ...serviceComponentIds,
  ...homepageArticleSubsections.map((entry) => entry.id),
];
const h3Matches = [...main.matchAll(/<h3\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h3>/giu)]
  .map((match) => ({ id: match[1].endsWith('-title') ? match[1].slice(0, -6) : match[1], text: textOf(match[2]) }));
check(JSON.stringify(h3Matches.map((entry) => entry.id)) === JSON.stringify(expectedH3Ids), `H3 order/IDs mismatch: ${JSON.stringify(h3Matches.map((entry) => entry.id))}`);
for (const entry of h3Matches) check(Boolean(entry.text), `empty H3: ${entry.id}`);
for (const expectedId of expectedH3Ids) {
  const section = tagsWithIds.find((entry) => entry.tag === 'section' && entry.id === expectedId)?.raw ?? '';
  check(Boolean(section), `H3 destination is not a section: ${expectedId}`);
  check(section.includes(`aria-labelledby="${expectedId}-title"`), `aria-labelledby mismatch: ${expectedId}`);
}

const fragmentLinks = [...html.matchAll(/<a\b[^>]*href="#([^"]+)"/giu)].map((match) => match[1]);
for (const fragment of fragmentLinks) check(idCounts.get(fragment) === 1, `broken fragment: #${fragment}`);
for (const reference of [...html.matchAll(/\baria-labelledby="([^"]+)"/giu)].flatMap((match) => match[1].split(/\s+/u))) {
  check(idCounts.get(reference) === 1, `broken aria-labelledby: ${reference}`);
}

const cleanMain = main.replace(/<script\b[\s\S]*?<\/script>/giu, '').replace(/<style\b[\s\S]*?<\/style>/giu, '').replace(/<svg\b[\s\S]*?<\/svg>/giu, '');
const headingLevels = [...cleanMain.matchAll(/<h([1-6])\b/giu)].map((match) => Number(match[1]));
for (let index = 1; index < headingLevels.length; index += 1) check(headingLevels[index] <= headingLevels[index - 1] + 1, `heading jump H${headingLevels[index - 1]}→H${headingLevels[index]}`);
check(headingLevels.includes(4), 'H4 hierarchy is missing');

if (failures.length) {
  console.error(JSON.stringify({ stage: 4, status: 'fail', failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  stage: 4,
  status: 'pass',
  contentTableGroups: homepageToc.groups.length,
  primaryH2Sections: homepageSections.length,
  canonicalH3Sections: expectedH3Ids.length,
  localServiceIntentPassages: localServiceIntentAnswers.length,
  nationalAuthorityPassages: nationalAuthorityAnswers.length,
  duplicateIds: 0,
  brokenFragments: 0,
}, null, 2));
