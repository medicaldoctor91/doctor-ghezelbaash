import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');
const index = read('dist/index.html');
const notFound = read('dist/404.html');
const graph = JSON.parse(read('dist/knowledge-graph.jsonld'));
const headers = read('dist/_headers');
const redirects = read('dist/_redirects');
const manifest = JSON.parse(read('dist/site.webmanifest'));
const entities = read('src/domain/entities.ts');
const history = JSON.parse(read('data/clinic-reputation-history.json'));
const homeHeader = read('src/components/home/HomeHeader.astro');
const services = read('src/components/home/Services.astro');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const ids = new Set([...index.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]));
const nodes = new Map((graph['@graph'] ?? []).filter((node) => node?.['@id']).map((node) => [node['@id'], node]));
const site = 'https://www.ghezelbaash.ir/';
const clinic = nodes.get(`${site}#dr-saeed-ghezelbash-aesthetic-clinic`);
const person = nodes.get(`${site}#mohammad-saeed-ghezelbash`);

check(!/<meta\b[^>]*name="generator"/iu.test(index), 'Astro generator metadata must not be exposed');
check(index.includes('/assets/brand/doctor-hand-syringe-logo-192.png'), 'right-sized 192px brand logo is missing');
check(!index.includes('/assets/brand/doctor-hand-syringe-logo.png'), 'oversized 1024px brand logo remains in initial HTML');
check(homeHeader.includes('data-section-link'), 'progressive section navigation markers are missing');
check(homeHeader.includes("aria-current', 'location'"), 'active navigation aria-current synchronization is missing');
check(homeHeader.includes("window.addEventListener('hashchange'"), 'hashchange focus synchronization is missing');
check(homeHeader.includes('IntersectionObserver'), 'active section observation is missing');

check(/<meta\b[^>]*name="robots"[^>]*content="noindex,follow"/iu.test(notFound), '404 noindex meta is missing');
check(!/<link\b[^>]*rel="canonical"/iu.test(notFound), '404 must not publish a misleading canonical');
check(!notFound.includes('rel="preload" as="image"'), '404 must not preload the Homepage hero');
check(!notFound.includes('#clinical-guide'), '404 still links to the obsolete clinical-guide fragment');
check((notFound.match(/href="\/#/gu) ?? []).length >= 5, '404 recovery navigation is too narrow');
check(/href="tel:\+98/u.test(notFound), '404 direct phone recovery action is missing');
for (const fragment of [...notFound.matchAll(/href="\/#([^"]+)"/gu)].map((match) => match[1])) {
  check(ids.has(fragment), `404 recovery fragment does not exist on Homepage: ${fragment}`);
}
check(Buffer.byteLength(notFound) < 20_000, `404 HTML is unexpectedly heavy: ${Buffer.byteLength(notFound)} bytes`);

check(redirects.trim() === '/index.html / 301', 'Cloudflare /index.html consolidation redirect is missing or ambiguous');
check(headers.includes('https://doctor-ghezelbaash.pages.dev/*'), 'Cloudflare project preview noindex rule is missing');
check(headers.includes('https://*.doctor-ghezelbaash.pages.dev/*'), 'Cloudflare branch preview noindex rule is missing');
check((headers.match(/X-Robots-Tag: noindex, nofollow/gu) ?? []).length >= 2, 'Cloudflare Preview X-Robots-Tag contract is incomplete');
for (const header of ['Strict-Transport-Security:', 'Content-Security-Policy:', 'X-Content-Type-Options: nosniff', 'Referrer-Policy:', 'Permissions-Policy:']) {
  check(headers.includes(header), `security header contract missing: ${header}`);
}

const shortcutUrls = (manifest.shortcuts ?? []).map((item) => item.url);
for (const obsolete of ['/#clinical-guide', '/#doctor', '/#services']) check(!shortcutUrls.includes(obsolete), `obsolete manifest shortcut remains: ${obsolete}`);
for (const shortcut of shortcutUrls) {
  const fragment = shortcut.match(/^\/#(.+)$/u)?.[1];
  if (fragment) check(ids.has(fragment), `manifest shortcut fragment does not exist: ${fragment}`);
}
check(shortcutUrls.includes('/#mohammad-saeed-ghezelbash'), 'manifest Person shortcut is missing');
check(shortcutUrls.includes('/#aesthetic-services-kermanshah'), 'manifest aesthetic topic shortcut is missing');

check(!services.includes('خدمات ارائه‌شده پس از ارزیابی پزشکی'), 'medical topics remain split by offered/not-offered presentation');
check(!services.includes('service-card__badge'), 'separate referral badge remains in medical topic architecture');
check(services.includes('یک Knowledge Domain؛ نه منوی فروش'), 'unified medical knowledge-domain framing is missing');
check(services.includes('حکم آناتومی'), 'diagnostic boundary language is missing from surgical topics');

const profileMatch = entities.match(/googleBusinessProfile:\s*\{([\s\S]*?)\n\s*\},\n\s*sourceTruthObservedAt:/u);
check(Boolean(profileMatch), 'typed central Google Business Profile snapshot is missing');
const profile = profileMatch?.[1] ?? '';
const numberField = (field) => Number(profile.match(new RegExp(`${field}:\\s*([0-9.]+)`, 'u'))?.[1]);
const stringField = (field) => profile.match(new RegExp(`${field}:\\s*'([^']+)'`, 'u'))?.[1] ?? '';
const snapshot = {
  ratingValue: numberField('ratingValue'),
  bestRating: numberField('bestRating'),
  ratingCount: numberField('ratingCount'),
  observedAt: stringField('observedAt'),
  sourceUrl: stringField('sourceUrl'),
};
const latest = history.at(-1);
check(Array.isArray(history) && history.length >= 1, 'clinic reputation change log is empty');
check(latest?.ratingValue === snapshot.ratingValue, 'reputation history ratingValue differs from typed source');
check(latest?.ratingCount === snapshot.ratingCount, 'reputation history ratingCount differs from typed source');
check(latest?.observedAt === snapshot.observedAt, 'reputation history observedAt differs from typed source');
check(latest?.sourceUrl === snapshot.sourceUrl, 'reputation history sourceUrl differs from typed source');
check(clinic?.aggregateRating?.ratingValue === snapshot.ratingValue, 'Clinic graph ratingValue differs from typed source');
check(clinic?.aggregateRating?.ratingCount === snapshot.ratingCount, 'Clinic graph ratingCount differs from typed source');
check(clinic?.aggregateRating?.reviewCount === snapshot.ratingCount, 'Clinic graph reviewCount differs from typed source');
check(!person?.aggregateRating, 'Clinic reputation leaked onto Person');
check(index.includes(`data-rating-value="${snapshot.ratingValue}"`), 'visible ratingValue differs from typed source');
check(index.includes(`data-rating-count="${snapshot.ratingCount}"`), 'visible ratingCount differs from typed source');
check(index.includes(`datetime="${snapshot.observedAt}"`), 'visible rating observation date differs from typed source');

if (failures.length) {
  console.error(JSON.stringify({ stage: 11, status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  stage: 11,
  status: 'pass',
  cloudflarePreviewNoindexRules: 2,
  duplicateIndexRedirect: '/index.html -> / (301)',
  notFoundBytes: Buffer.byteLength(notFound),
  notFoundRecoveryLinks: (notFound.match(/href="\/#/gu) ?? []).length,
  manifestShortcuts: shortcutUrls.length,
  navigationEnhancement: 'progressive',
  medicalTopicArchitecture: 'unified-knowledge-domain',
  clinicRatingValue: snapshot.ratingValue,
  clinicRatingCount: snapshot.ratingCount,
  reputationHistoryEntries: history.length,
  personAggregateRating: false,
}, null, 2));
