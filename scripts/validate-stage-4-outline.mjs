import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  homepageSections,
  homepageToc,
  homepageArticleSubsections,
} from '../src/domain/homepage-content-registry.mjs';

const root = process.cwd();
const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
const tocSource = readFileSync(join(root, 'src/components/home/ContentTable.astro'), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const count = (value, pattern) => (value.match(pattern) ?? []).length;
const unique = (values) => new Set(values).size === values.length;
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'iu'))?.[1] ?? null;
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

const mainMatch = html.match(/<main\b[^>]*id="main-content"[^>]*>([\s\S]*?)<\/main>/iu);
const main = mainMatch?.[1] ?? '';
check(Boolean(main), 'main#main-content is missing');

const tagsWithIds = [...html.matchAll(/<([a-z][a-z0-9:-]*)\b[^>]*\bid="([^"]+)"[^>]*>/giu)]
  .map((match) => ({ tag: match[1].toLowerCase(), id: match[2], raw: match[0] }));
const ids = tagsWithIds.map((entry) => entry.id);
const idCounts = new Map(ids.map((id) => [id, ids.filter((candidate) => candidate === id).length]));
check(unique(ids), `duplicate HTML IDs exist: ${[...idCounts].filter(([, amount]) => amount > 1).map(([id]) => id).join(', ')}`);

const tocIdAt = main.indexOf(`id="${homepageToc.id}"`);
const tocOpen = main.lastIndexOf('<nav', tocIdAt);
const tocClose = main.indexOf('</nav>', tocIdAt);
const toc = tocOpen >= 0 && tocClose > tocOpen ? main.slice(tocOpen, tocClose + 6) : '';
check(Boolean(toc), 'real Content Table nav is missing');
check(new RegExp(`<nav\\b[^>]*id="${homepageToc.id}"[^>]*aria-labelledby="${homepageToc.headingId}"`, 'iu').test(toc), 'Content Table nav identity is invalid');
check(new RegExp(`<h2\\b[^>]*id="${homepageToc.headingId}"[^>]*>`, 'iu').test(toc), 'Content Table H2 is missing');
check(textOf(toc.match(new RegExp(`<h2\\b[^>]*id="${homepageToc.headingId}"[^>]*>([\\s\\S]*?)<\\/h2>`, 'iu'))?.[1] ?? '') === homepageToc.title, 'Content Table title differs from the registry');
check(count(toc, /<details\b/gu) === 5, `Content Table must contain five native details groups; found ${count(toc, /<details\b/gu)}`);
check(count(toc, /<summary\b/gu) === 5, `Content Table must contain five native summaries; found ${count(toc, /<summary\b/gu)}`);
check(!/<script\b|\bonclick=|javascript:/iu.test(tocSource), 'Content Table navigation must not depend on JavaScript');

const tocHrefs = [...toc.matchAll(/<a\b[^>]*href="#([^"]+)"[^>]*>/giu)].map((match) => match[1]);
const expectedH2Ids = homepageSections.map((section) => section.id);
check(JSON.stringify(tocHrefs) === JSON.stringify(expectedH2Ids), `Content Table destinations/order mismatch: ${JSON.stringify(tocHrefs)}`);
check(!tocHrefs.includes('mohammad-saeed-ghezelbash'), 'Person introduction must not appear in the Content Table');

const h2Matches = [...main.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/giu)].map((match) => ({
  tag: match[0],
  attrs: match[1],
  id: attr(match[0], 'id'),
  text: textOf(match[2]),
  index: match.index ?? -1,
}));
const expectedH2HeadingIds = [homepageToc.headingId, ...homepageSections.map((section) => `${section.id}-title`)];
check(h2Matches.length === 17, `main must contain Content Table H2 plus 16 primary H2s; found ${h2Matches.length}`);
check(JSON.stringify(h2Matches.map((heading) => heading.id)) === JSON.stringify(expectedH2HeadingIds), `H2 order/IDs mismatch: ${JSON.stringify(h2Matches.map((heading) => heading.id))}`);
check(h2Matches[0]?.text === homepageToc.title, 'Content Table must be the first H2 in main');

let previousSectionPosition = tocClose;
for (const section of homepageSections) {
  const sectionPattern = new RegExp(`<section\\b[^>]*\\bid="${section.id}"[^>]*\\baria-labelledby="${section.id}-title"[^>]*>`, 'iu');
  const sectionMatch = main.match(sectionPattern);
  const sectionPosition = sectionMatch?.index ?? -1;
  const heading = h2Matches.find((candidate) => candidate.id === `${section.id}-title`);
  check(sectionPosition >= 0, `canonical H2 section is missing or lacks aria-labelledby: ${section.id}`);
  check(sectionPosition > previousSectionPosition, `canonical H2 section order is incorrect at ${section.id}`);
  check(Boolean(heading), `canonical H2 heading is missing: ${section.id}-title`);
  check(heading?.text === section.title, `canonical H2 title mismatch: ${section.id}`);
  check((heading?.index ?? -1) > sectionPosition, `H2 heading must occur inside/after its section start: ${section.id}`);
  previousSectionPosition = sectionPosition;
}

const componentH3Ids = [
  'best-aesthetic-doctor-selection-criteria',
  'doctor-clinic-operator-difference',
  'when-aesthetic-doctor-rejects-treatment',
  'best-botox-doctor-kermanshah',
  'best-filler-doctor-kermanshah',
  'best-thread-lift-doctor-kermanshah',
  'best-acne-scar-doctor-kermanshah',
  'best-skin-rejuvenation-doctor-kermanshah',
  'best-hair-loss-doctor-kermanshah',
  'best-submental-liposuction-doctor-kermanshah',
  'botox-kermanshah',
  'dermal-filler-kermanshah',
  'thread-lift-kermanshah',
  'acne-scar-subcision-kermanshah',
  'skin-rejuvenation-kermanshah',
  'hair-loss-prp-kermanshah',
  'submental-liposuction-kermanshah',
  'aesthetic-surgery-evaluation-kermanshah',
];
const expectedH3Ids = [...componentH3Ids, ...homepageArticleSubsections.map((subsection) => subsection.id)];
const h3Matches = [...main.matchAll(/<h3\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h3>/giu)]
  .map((match) => ({ headingId: match[1], text: textOf(match[2]), index: match.index ?? -1 }));
const actualH3Ids = h3Matches.map((heading) => heading.headingId.endsWith('-title') ? heading.headingId.slice(0, -6) : heading.headingId);
check(expectedH3Ids.length === 75, `Stage 4 contract must define 75 canonical H3s; found ${expectedH3Ids.length}`);
check(h3Matches.length === 75, `main must contain exactly 75 canonical H3s; found ${h3Matches.length}`);
check(JSON.stringify(actualH3Ids) === JSON.stringify(expectedH3Ids), `H3 order/IDs mismatch: ${JSON.stringify(actualH3Ids)}`);
for (const id of expectedH3Ids) {
  const sectionTag = tagsWithIds.find((entry) => entry.tag === 'section' && entry.id === id)?.raw ?? '';
  const heading = h3Matches.find((entry) => entry.headingId === `${id}-title`);
  check(Boolean(sectionTag), `canonical H3 destination must be a section: ${id}`);
  check(attr(sectionTag, 'aria-labelledby') === `${id}-title`, `canonical H3 section aria-labelledby mismatch: ${id}`);
  check(Boolean(heading), `canonical H3 heading is missing: ${id}-title`);
  check(Boolean(heading?.text), `canonical H3 title is empty: ${id}`);
}

const cleanMain = main
  .replace(/<script\b[\s\S]*?<\/script>/giu, '')
  .replace(/<style\b[\s\S]*?<\/style>/giu, '')
  .replace(/<svg\b[\s\S]*?<\/svg>/giu, '');
const headings = [...cleanMain.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/giu)]
  .map((match) => ({ level: Number(match[1]), text: textOf(match[2]) }));
for (let index = 1; index < headings.length; index += 1) {
  const previous = headings[index - 1];
  const current = headings[index];
  check(current.level <= previous.level + 1, `heading hierarchy jumps from H${previous.level} “${previous.text}” to H${current.level} “${current.text}”`);
}
check(headings.some((heading) => heading.level === 4), 'H4 hierarchy is missing for questions, treatment details or videos');

const fragmentLinks = [...html.matchAll(/<a\b[^>]*href="#([^"]*)"[^>]*>/giu)]
  .map((match) => match[1]);
check(fragmentLinks.every(Boolean), 'empty # Fragment link exists');
for (const rawFragment of fragmentLinks) {
  let fragment = rawFragment;
  try { fragment = decodeURIComponent(rawFragment); } catch {}
  check(idCounts.get(fragment) === 1, `internal Fragment target must exist exactly once: #${fragment}`);
}

const ariaReferences = [...html.matchAll(/\baria-labelledby="([^"]+)"/giu)]
  .flatMap((match) => match[1].trim().split(/\s+/u).filter(Boolean));
for (const reference of ariaReferences) check(idCounts.get(reference) === 1, `aria-labelledby target must exist exactly once: ${reference}`);

const forbiddenIds = [
  'article',
  'clinical-guide',
  'services',
  'clinic-reputation',
  'search-intent-hub',
  'priority-answer-hub',
  'knowledge-resources',
  'videos',
  'video-knowledge-hub',
];
for (const id of forbiddenIds) check(!idCounts.has(id), `obsolete alias/anchor remains in rendered HTML: #${id}`);
for (const id of ids) {
  check(!/^legacy-article-\d+$/u.test(id), `legacy fallback ID remains in rendered HTML: #${id}`);
  check(!/^clinical-decision-model-(?:detail|answer|mechanism|comparison|safety|aftercare|duration|candidacy|revision|price|surgery-boundary)(?:-|$)/u.test(id), `numeric/legacy content ID remains in rendered HTML: #${id}`);
}

if (failures.length) {
  console.error(JSON.stringify({ stage: 4, status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  stage: 4,
  status: 'pass',
  contentTableGroups: count(toc, /<details\b/gu),
  contentTableDestinations: tocHrefs.length,
  primaryH2Sections: homepageSections.length,
  mainH2Count: h2Matches.length,
  canonicalH3Sections: h3Matches.length,
  h4Count: headings.filter((heading) => heading.level === 4).length,
  duplicateIds: 0,
  brokenFragments: 0,
  brokenAriaLabels: 0,
  obsoleteAliases: 0,
  javascriptRequiredForToc: false,
}, null, 2));
