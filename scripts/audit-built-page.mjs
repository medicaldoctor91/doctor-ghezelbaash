import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'parse5';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const SITE_URL = 'https://www.ghezelbaash.ir/';
const TITLE = 'دکتر سعید قزلباش | پزشک زیبایی در کرمانشاه';
const DESCRIPTION =
  'وب‌سایت رسمی دکتر سعید قزلباش در کرمانشاه؛ راهنمای جامع و تشخیص‌محور پزشکی زیبایی، بوتاکس، فیلر، لیفت نخ، پوست، مو، کانتورینگ و عوارض درمان‌های زیبایی.';
const DOCTOR_ID = `${SITE_URL}#saeed-ghezelbash-aesthetic-medicine`;
const CLINIC_ID = `${SITE_URL}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`;
const REPOSITORY_ID = `${SITE_URL}#doctor-ghezelbaash-structured-data-repository`;
const DOCTOR_WIKIDATA = 'https://www.wikidata.org/wiki/Q140287622';
const CLINIC_WIKIDATA = 'https://www.wikidata.org/wiki/Q140288589';
const REPOSITORY_WIKIDATA = 'https://www.wikidata.org/wiki/Q140304972';
const REPOSITORY_URL = 'https://github.ghezelbaash.ir/';
const SOURCE_CODE_REPOSITORY =
  'https://github.com/medicaldoctor91/doctor-ghezelbaash';
const REPOSITORY_DOI = 'https://doi.org/10.5281/zenodo.18765169';
const REPOSITORY_DATASET =
  'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data';
const DOCTOR_KG_ID = '/g/11nqdfk76c';
const CLINIC_KG_ID = '/g/11r3rzdtb3';
const CONTENT_SOURCE_SHA256 =
  'e2655ee593569877411807b2e1b15db9e485565824f86cbc2a45f3aad2a06030';
const RENDERED_ARTICLE_TEXT_SHA256 =
  'eace8f8d1dfb96ba93cacd31da9b4c1e3b2f06e7ca077793f74c3dfd8a9d4f19';
const PAGE_SECTION_IDS = [
  'diagnosis-before-aesthetic-treatment-selection',
  'facial-aging-differential-diagnosis',
  'botox',
  'filler',
  'thread-lift',
  'acne-pigmentation-and-scars',
  'skin-rejuvenation',
  'hair-loss',
  'chin-jawline-and-facial-contouring',
  'aesthetic-treatment-selection',
  'aesthetic-treatment-candidacy',
  'complications-aftercare-and-follow-up',
  'saeed-ghezelbash-diagnostic-philosophy',
  'aesthetic-treatment-failure-from-diagnostic-error',
  'dr-saeed-ghezelbash-aesthetic-clinic-kermanshah',
];

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const contentSource = await readFile(path.join(ROOT, 'src/pages/index.md'));
const contentSourceHash = createHash('sha256').update(contentSource).digest('hex');
assert(
  contentSourceHash === CONTENT_SOURCE_SHA256,
  'src/pages/index.md changed. Visible content is immutable unless the owner explicitly approves a new baseline.',
);

const htmlPath = path.join(DIST, 'index.html');
const html = await readFile(htmlPath, 'utf8');
const document = parse(html);

const elements = [];
const visit = (node) => {
  if (node.tagName) elements.push(node);
  for (const child of node.childNodes ?? []) visit(child);
};
visit(document);

const byTag = (tagName) => elements.filter((node) => node.tagName === tagName);
const attr = (node, name) =>
  node?.attrs?.find((attribute) => attribute.name === name)?.value;
const textContent = (node) => {
  if (typeof node.value === 'string') return node.value;
  return (node.childNodes ?? []).map(textContent).join('');
};
const normalizeText = (value) => value.replace(/\s+/gu, ' ').trim();
const pageText = normalizeText(textContent(document));

const htmlElement = byTag('html')[0];
assert(htmlElement, 'The document must contain an html element.');
assert(attr(htmlElement, 'lang') === 'fa-IR', 'Root lang must be fa-IR.');
assert(attr(htmlElement, 'dir') === 'rtl', 'Root dir must be rtl.');

const headings = elements.filter((node) => /^h[1-6]$/.test(node.tagName));
const h1s = headings.filter((node) => node.tagName === 'h1');
assert(h1s.length === 1, `Expected exactly one H1; found ${h1s.length}.`);

const articles = byTag('article');
assert(articles.length === 1, `Expected exactly one article; found ${articles.length}.`);
const article = articles[0];
if (article) {
  const renderedTextHash = createHash('sha256')
    .update(textContent(article))
    .digest('hex');
  assert(
    renderedTextHash === RENDERED_ARTICLE_TEXT_SHA256,
    'Rendered article text changed during the build.',
  );

  const pageSections = (article.childNodes ?? []).filter(
    (node) =>
      node.tagName === 'section' &&
      (attr(node, 'class') ?? '').split(/\s+/u).includes('page-section'),
  );
  const sectionHeadingIds = pageSections.map((section) =>
    attr(
      (section.childNodes ?? []).find((node) => node.tagName === 'h2'),
      'id',
    ),
  );
  assert(
    JSON.stringify(sectionHeadingIds) === JSON.stringify(PAGE_SECTION_IDS),
    'The 15 main content sections are missing, reordered or malformed.',
  );
}

for (let index = 1; index < headings.length; index += 1) {
  const previousLevel = Number(headings[index - 1].tagName.slice(1));
  const currentLevel = Number(headings[index].tagName.slice(1));
  assert(
    currentLevel <= previousLevel + 1,
    `Heading level skips from ${headings[index - 1].tagName} to ${headings[index].tagName} at #${attr(headings[index], 'id') ?? '(no id)'}.`,
  );
}

const idOwners = new Map();
for (const element of elements) {
  const id = attr(element, 'id');
  if (!id) continue;
  if (!idOwners.has(id)) idOwners.set(id, []);
  idOwners.get(id).push(element);
}
const duplicateIds = [...idOwners.entries()]
  .filter(([, owners]) => owners.length > 1)
  .map(([id]) => id);
assert(
  duplicateIds.length === 0,
  `Duplicate IDs found: ${duplicateIds.join(', ')}`,
);
assert(
  idOwners.has(DOCTOR_ID.split('#')[1]),
  'Doctor JSON-LD @id fragment must resolve to visible page content.',
);
assert(
  idOwners.has(CLINIC_ID.split('#')[1]),
  'Clinic JSON-LD @id fragment must resolve to visible page content.',
);
assert(
  idOwners.has(REPOSITORY_ID.split('#')[1]),
  'Repository JSON-LD @id fragment must resolve to visible page content.',
);

const fragmentLinks = byTag('a')
  .map((node) => attr(node, 'href'))
  .filter((href) => href?.startsWith('#'));
const brokenFragments = fragmentLinks.filter((href) => {
  if (href === '#') return true;
  try {
    return !idOwners.has(decodeURIComponent(href.slice(1)));
  } catch {
    return true;
  }
});
assert(
  brokenFragments.length === 0,
  `Broken fragment links found: ${[...new Set(brokenFragments)].join(', ')}`,
);

const canonicalLinks = byTag('link').filter((node) =>
  (attr(node, 'rel') ?? '').split(/\s+/u).includes('canonical'),
);
assert(
  canonicalLinks.length === 1 && attr(canonicalLinks[0], 'href') === SITE_URL,
  `Canonical must occur once and equal ${SITE_URL}.`,
);
assert(
  !/(?:\.pages\.dev|localhost|127\.0\.0\.1)/iu.test(html),
  'Preview or local domains must not occur in production HTML.',
);

const headTitle = byTag('title').map(textContent);
assert(
  headTitle.length === 1 && headTitle[0] === TITLE,
  'The final title is missing or changed.',
);
const metas = byTag('meta');
const metaValues = (attributeName, key) =>
  metas
    .filter((node) => attr(node, attributeName) === key)
    .map((node) => attr(node, 'content'));
assert(
  metaValues('name', 'description').length === 1 &&
    metaValues('name', 'description')[0] === DESCRIPTION,
  'The final meta description is missing or changed.',
);
assert(
  metaValues('name', 'robots').length === 1 &&
    metaValues('name', 'robots')[0]?.startsWith('index, follow'),
  'The homepage robots directive must be index, follow.',
);

const requiredOpenGraph = {
  'og:title': TITLE,
  'og:description': DESCRIPTION,
  'og:type': 'profile',
  'og:url': SITE_URL,
  'og:image': `${SITE_URL}media/images/physician/saeed-ghezelbash-portrait-1600.webp`,
  'og:image:width': '1600',
  'og:image:height': '1067',
};
for (const [property, expected] of Object.entries(requiredOpenGraph)) {
  const values = metaValues('property', property);
  assert(
    values.length === 1 && values[0] === expected,
    `${property} must occur once with its approved value.`,
  );
}
for (const property of ['og:image:alt', 'og:locale', 'og:site_name']) {
  const values = metaValues('property', property);
  assert(values.length === 1 && values[0], `${property} must occur once.`);
}
for (const name of [
  'twitter:card',
  'twitter:title',
  'twitter:description',
  'twitter:image',
  'twitter:image:alt',
]) {
  const values = metaValues('name', name);
  assert(values.length === 1 && values[0], `${name} must occur once.`);
}

const images = byTag('img');
for (const image of images) {
  const src = attr(image, 'src') ?? '(missing src)';
  assert(attr(image, 'alt') !== undefined, `Image ${src} is missing alt.`);
  assert(
    /^\d+$/u.test(attr(image, 'width') ?? '') &&
      Number(attr(image, 'width')) > 0,
    `Image ${src} needs a positive numeric width.`,
  );
  assert(
    /^\d+$/u.test(attr(image, 'height') ?? '') &&
      Number(attr(image, 'height')) > 0,
    `Image ${src} needs a positive numeric height.`,
  );
}

const mediaReferences = new Set();
const addMediaReference = (reference) => {
  if (reference) mediaReferences.add(reference);
};
const addSrcset = (srcset) => {
  for (const candidate of srcset?.split(',') ?? []) {
    addMediaReference(candidate.trim().split(/\s+/u)[0]);
  }
};
for (const image of images) {
  addMediaReference(attr(image, 'src'));
  addSrcset(attr(image, 'srcset'));
}
for (const source of byTag('source')) {
  addMediaReference(attr(source, 'src'));
  addSrcset(attr(source, 'srcset'));
}
for (const video of byTag('video')) {
  addMediaReference(attr(video, 'src'));
  addMediaReference(attr(video, 'poster'));
}
for (const track of byTag('track')) addMediaReference(attr(track, 'src'));
addMediaReference(requiredOpenGraph['og:image']);

const missingMedia = [];
await Promise.all(
  [...mediaReferences].map(async (reference) => {
    let url;
    try {
      url = new URL(reference, SITE_URL);
    } catch {
      missingMedia.push(`${reference} (invalid URL)`);
      return;
    }
    if (url.origin !== new URL(SITE_URL).origin) return;
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const outputPath = path.resolve(DIST, relativePath);
    if (!outputPath.startsWith(`${path.resolve(DIST)}${path.sep}`)) {
      missingMedia.push(`${reference} (outside dist)`);
      return;
    }
    try {
      await access(outputPath, fsConstants.R_OK);
    } catch {
      missingMedia.push(reference);
    }
  }),
);
assert(
  missingMedia.length === 0,
  `Missing local media: ${missingMedia.sort().join(', ')}`,
);

const scripts = byTag('script');
const jsonLdScripts = scripts.filter(
  (node) => attr(node, 'type') === 'application/ld+json',
);
assert(scripts.length === 1, `Expected one non-executable JSON-LD script; found ${scripts.length} scripts.`);
assert(jsonLdScripts.length === 1, 'Expected one JSON-LD script.');

let graph;
if (jsonLdScripts.length === 1) {
  try {
    graph = JSON.parse(textContent(jsonLdScripts[0]));
  } catch (error) {
    failures.push(`JSON-LD is not valid JSON: ${error.message}`);
  }
}

const hasType = (node, type) =>
  (Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']]).includes(type);
const graphNodes = graph?.['@graph'];
assert(graph?.['@context'] === 'https://schema.org', 'JSON-LD context must be Schema.org.');
assert(Array.isArray(graphNodes), 'JSON-LD must contain one @graph array.');
if (Array.isArray(graphNodes)) {
  const people = graphNodes.filter((node) => hasType(node, 'Person'));
  const clinics = graphNodes.filter((node) => hasType(node, 'MedicalClinic'));
  const pages = graphNodes.filter((node) => hasType(node, 'MedicalWebPage'));
  const datasets = graphNodes.filter((node) => hasType(node, 'Dataset'));
  assert(people.length === 1, `Expected one Person node; found ${people.length}.`);
  assert(clinics.length === 1, `Expected one MedicalClinic node; found ${clinics.length}.`);
  assert(pages.length === 1, `Expected one MedicalWebPage node; found ${pages.length}.`);
  assert(datasets.length === 1, `Expected one Dataset node; found ${datasets.length}.`);

  const doctor = people[0];
  const clinic = clinics[0];
  const page = pages[0];
  const repository = datasets[0];
  assert(doctor?.['@id'] === DOCTOR_ID, 'Doctor @id is incorrect.');
  assert(clinic?.['@id'] === CLINIC_ID, 'Clinic @id is incorrect.');
  assert(repository?.['@id'] === REPOSITORY_ID, 'Repository @id is incorrect.');
  assert(
    new Set([doctor?.['@id'], clinic?.['@id'], repository?.['@id']]).size === 3,
    'Doctor, clinic and repository @id values must all differ.',
  );
  assert(page?.mainEntity?.['@id'] === DOCTOR_ID, 'MedicalWebPage mainEntity must be the doctor.');
  assert(page?.about?.['@id'] === DOCTOR_ID, 'MedicalWebPage about must be the doctor.');
  assert(
    JSON.stringify(page?.mentions?.map((item) => item?.['@id'])) ===
      JSON.stringify([CLINIC_ID, REPOSITORY_ID]),
    'MedicalWebPage mentions must reference the clinic and then the repository.',
  );
  assert(doctor?.worksFor?.['@id'] === CLINIC_ID, 'Doctor worksFor must reference the clinic.');
  assert(doctor?.subjectOf?.['@id'] === REPOSITORY_ID, 'Doctor subjectOf must reference the repository.');
  assert(clinic?.owner?.['@id'] === DOCTOR_ID, 'Clinic owner must reference the doctor.');
  assert(clinic?.employee?.['@id'] === DOCTOR_ID, 'Clinic employee must reference the doctor.');
  assert(clinic?.subjectOf?.['@id'] === REPOSITORY_ID, 'Clinic subjectOf must reference the repository.');
  assert(repository?.name === 'Doctor Ghezelbaash Structured Data Repository', 'Repository name is incorrect.');
  assert(repository?.url === REPOSITORY_URL, 'Repository official project URL is incorrect.');
  assert(repository?.creator?.['@id'] === DOCTOR_ID, 'Repository creator must be the doctor.');
  assert(repository?.maintainer?.['@id'] === DOCTOR_ID, 'Repository maintainer must be the doctor.');
  assert(repository?.owner?.['@id'] === DOCTOR_ID, 'Repository owner must be the doctor.');
  assert(
    JSON.stringify(repository?.about?.map((item) => item?.['@id'])) ===
      JSON.stringify([DOCTOR_ID, CLINIC_ID]),
    'Repository about must reference the doctor and then the clinic.',
  );
  assert(repository?.license === 'https://creativecommons.org/licenses/by/4.0/', 'Repository license is incorrect.');
  assert(repository?.version === '1.0.0', 'Repository version is incorrect.');
  assert(repository?.datePublished === '2026-02-25', 'Repository publication date is incorrect.');
  for (const sameAs of [
    REPOSITORY_WIKIDATA,
    SOURCE_CODE_REPOSITORY,
    REPOSITORY_DOI,
    REPOSITORY_DATASET,
  ]) {
    assert(repository?.sameAs?.includes(sameAs), `Repository sameAs is missing ${sameAs}.`);
  }
  const repositoryDois = (repository?.identifier ?? [])
    .filter((item) => item?.propertyID === 'DOI')
    .map((item) => item?.url);
  assert(
    JSON.stringify(repositoryDois) === JSON.stringify([REPOSITORY_DOI]),
    'Repository DOI is missing or duplicated.',
  );

  const doctorJson = JSON.stringify(doctor);
  const clinicJson = JSON.stringify(clinic);
  const repositoryJson = JSON.stringify(repository);
  assert(doctor?.sameAs?.includes(DOCTOR_WIKIDATA), 'Doctor Wikidata URL is missing from doctor sameAs.');
  assert(!doctorJson.includes(CLINIC_WIKIDATA), 'Clinic Wikidata URL leaked into the doctor node.');
  assert(!doctorJson.includes(REPOSITORY_WIKIDATA), 'Repository Wikidata URL leaked into the doctor node.');
  assert(clinic?.sameAs?.includes(CLINIC_WIKIDATA), 'Clinic Wikidata URL is missing from clinic sameAs.');
  assert(!clinicJson.includes(DOCTOR_WIKIDATA), 'Doctor Wikidata URL leaked into the clinic node.');
  assert(!clinicJson.includes(REPOSITORY_WIKIDATA), 'Repository Wikidata URL leaked into the clinic node.');
  assert(repository?.sameAs?.includes(REPOSITORY_WIKIDATA), 'Repository Wikidata URL is missing from repository sameAs.');
  assert(!repositoryJson.includes(DOCTOR_WIKIDATA), 'Doctor Wikidata URL leaked into the repository node.');
  assert(!repositoryJson.includes(CLINIC_WIKIDATA), 'Clinic Wikidata URL leaked into the repository node.');

  const kgValues = (node) =>
    (node?.identifier ?? [])
      .filter((item) => item?.propertyID === 'Google Knowledge Graph ID')
      .map((item) => item.value);
  assert(
    JSON.stringify(kgValues(doctor)) === JSON.stringify([DOCTOR_KG_ID]),
    'Doctor Google Knowledge Graph ID is missing, duplicated or swapped.',
  );
  assert(
    JSON.stringify(kgValues(clinic)) === JSON.stringify([CLINIC_KG_ID]),
    'Clinic Google Knowledge Graph ID is missing, duplicated or swapped.',
  );

  const prohibitedOfferKeys = new Set([
    'makesOffer',
    'availableService',
    'hasOfferCatalog',
  ]);
  const inspectObject = (value, trail = '$') => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert(!prohibitedOfferKeys.has(key), `Prohibited offer property found at ${trail}.${key}.`);
      inspectObject(child, `${trail}.${key}`);
    }
  };
  inspectObject(graph);
}

const multilingualSections = [
  [
    'iraqi-arabic-facial-aesthetic-doctor-section',
    'iraqi-arabic-facial-aesthetic-doctor-summary',
    'iraqi-arabic-facial-aesthetic-doctor-content',
    'ar-IQ',
    'rtl',
  ],
  [
    'english-facial-aesthetic-doctor-section',
    'english-facial-aesthetic-doctor-summary',
    'english-facial-aesthetic-doctor-content',
    'en',
    'ltr',
  ],
  [
    'sorani-kurdish-facial-aesthetic-doctor-section',
    'sorani-kurdish-facial-aesthetic-doctor-summary',
    'sorani-kurdish-facial-aesthetic-doctor-content',
    'ckb-IQ',
    'rtl',
  ],
  [
    'doctor-ghezelbaash-structured-data-section',
    'doctor-ghezelbaash-structured-data-summary',
    'doctor-ghezelbaash-structured-data-content',
    'en',
    'ltr',
  ],
];
for (const [sectionId, summaryId, contentId, lang, dir] of multilingualSections) {
  const section = idOwners.get(sectionId)?.[0];
  const summary = idOwners.get(summaryId)?.[0];
  const content = idOwners.get(contentId)?.[0];
  assert(section?.tagName === 'details', `#${sectionId} must be a details element.`);
  assert(summary?.tagName === 'summary', `#${summaryId} must be a summary element.`);
  assert(content?.tagName === 'div', `#${contentId} must be a div element.`);
  for (const [node, id] of [[section, sectionId], [summary, summaryId], [content, contentId]]) {
    assert(attr(node, 'lang') === lang, `#${id} lang must be ${lang}.`);
    assert(attr(node, 'dir') === dir, `#${id} dir must be ${dir}.`);
  }
}

const repositoryFacts = idOwners.get('doctor-ghezelbaash-structured-data-repository-facts')?.[0];
assert(repositoryFacts?.tagName === 'dl', 'Repository facts must be a dl element.');
const repositoryFactValues = new Map();
if (repositoryFacts) {
  const factElements = (repositoryFacts.childNodes ?? []).filter((node) => node.tagName);
  for (let index = 0; index < factElements.length - 1; index += 1) {
    const term = factElements[index];
    const definition = factElements[index + 1];
    if (term.tagName === 'dt' && definition.tagName === 'dd') {
      repositoryFactValues.set(
        normalizeText(textContent(term)),
        normalizeText(textContent(definition)),
      );
    }
  }
}
for (const [label, value] of [
  ['Official project page', 'Doctor Ghezelbaash Structured Data Repository'],
  ['Project owner', 'Saeed Ghezelbash'],
  ['Named after', 'Saeed Ghezelbash'],
  ['Creator', 'Saeed Ghezelbash'],
  ['Developer', 'Saeed Ghezelbash'],
  ['Maintainer', 'Saeed Ghezelbash'],
  ['Source-code repository', SOURCE_CODE_REPOSITORY],
]) {
  assert(
    repositoryFactValues.get(label) === value,
    `Repository fact ${label} must equal ${value}.`,
  );
}

const kurdishReviewFigures = byTag('figure').filter(
  (node) => attr(node, 'data-media-id') === 'kurdish-patient-review',
);
assert(kurdishReviewFigures.length === 1, 'Expected exactly one Kurdish patient-review figure.');
if (kurdishReviewFigures.length === 1) {
  const figure = kurdishReviewFigures[0];
  let ancestor = figure.parentNode;
  let isInsideKurdishContent = false;
  while (ancestor) {
    if (attr(ancestor, 'id') === 'sorani-kurdish-facial-aesthetic-doctor-content') {
      isInsideKurdishContent = true;
      break;
    }
    ancestor = ancestor.parentNode;
  }
  assert(isInsideKurdishContent, 'Kurdish patient-review video must be inside the Kurdish content block.');
  assert(attr(figure, 'lang') === 'ckb-IQ', 'Kurdish patient-review figure lang must be ckb-IQ.');
  assert(attr(figure, 'dir') === 'rtl', 'Kurdish patient-review figure dir must be rtl.');
  const caption = (figure.childNodes ?? []).find((node) => node.tagName === 'figcaption');
  assert(
    normalizeText(textContent(caption)) ===
      'ڕەزامەندیی مراجعێکی جوانکاری لە خزمەتگوزارییەکانی دکتۆر سەعید قزلباش',
    'Kurdish patient-review caption is missing or changed.',
  );
}

for (const requiredText of [
  'دکتر محمدسعید قزلباش',
  '۱۶۷۴۳۰',
  'کلینیک زیبایی دکتر سعید قزلباش',
  'کرمانشاه، میدان ۱۷ شهریور، ساختمان ویستا',
]) {
  assert(pageText.includes(requiredText), `Required visible content is missing: ${requiredText}`);
}
const hrefs = new Set(byTag('a').map((node) => attr(node, 'href')).filter(Boolean));
for (const requiredHref of [
  'tel:+989308209494',
  'https://www.instagram.com/doctor.ghezelbaash/',
  'https://ig.me/m/doctor.ghezelbaash',
  'https://www.google.com/maps?cid=12350483144643112463',
]) {
  assert(hrefs.has(requiredHref), `Required contact link is missing: ${requiredHref}`);
}

const robotsPath = path.join(DIST, 'robots.txt');
const sitemapPath = path.join(DIST, 'sitemap.xml');
const notFoundPath = path.join(DIST, '404.html');
for (const requiredPath of [robotsPath, sitemapPath, notFoundPath]) {
  try {
    await access(requiredPath, fsConstants.R_OK);
  } catch {
    failures.push(`Required built file is missing: ${path.relative(ROOT, requiredPath)}`);
  }
}

try {
  const robots = await readFile(robotsPath, 'utf8');
  assert(/^User-agent: \*$/mu.test(robots), 'robots.txt must address all crawlers.');
  assert(/^Allow: \/$/mu.test(robots), 'robots.txt must allow the site root.');
  assert(
    /^Sitemap: https:\/\/www\.ghezelbaash\.ir\/sitemap\.xml$/mu.test(robots),
    'robots.txt must declare the canonical sitemap.',
  );
} catch {}

try {
  const sitemap = await readFile(sitemapPath, 'utf8');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(
    (match) => match[1],
  );
  assert(
    JSON.stringify(locations) === JSON.stringify([SITE_URL]),
    `Sitemap must contain only ${SITE_URL}.`,
  );
} catch {}

try {
  const notFoundHtml = await readFile(notFoundPath, 'utf8');
  const notFoundDocument = parse(notFoundHtml);
  const notFoundMetas = [];
  const collectNotFoundMetas = (node) => {
    if (node.tagName === 'meta') notFoundMetas.push(node);
    for (const child of node.childNodes ?? []) collectNotFoundMetas(child);
  };
  collectNotFoundMetas(notFoundDocument);
  const notFoundRobots = notFoundMetas.find(
    (node) => attr(node, 'name') === 'robots',
  );
  assert(
    /noindex/iu.test(attr(notFoundRobots, 'content') ?? ''),
    '404.html must contain a noindex robots directive.',
  );
} catch {}

if (failures.length > 0) {
  console.error(`Built-page audit failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  const byteLength = Buffer.byteLength(html);
  console.log(
    `Built-page audit passed: ${byteLength.toLocaleString('en-US')} bytes, ${elements.length.toLocaleString('en-US')} elements, ${headings.length.toLocaleString('en-US')} headings, ${fragmentLinks.length.toLocaleString('en-US')} fragment links, ${images.length} images, ${mediaReferences.size} media references.`,
  );
}
