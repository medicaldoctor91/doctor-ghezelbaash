import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  homepageContentRegistry,
  homepageEntityIds,
  homepageToc,
  homepageSections,
  homepageTocSections,
  articleHomepageSections,
  homepageArticleGroups,
  homepageArticleSubsections,
  homepageArticleSubsectionById,
  homepageSubsectionAnchorRegistry,
  homepageVideoPlacements,
} from '../src/domain/homepage-content-registry.mjs';

const root = process.cwd();
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const unique = (values) => new Set(values).size === values.length;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const allowedKinds = new Set(['component', 'article']);
const allowedAbout = new Set(['person', 'clinic', 'services', 'medical-content', 'data']);
const allowedGeography = new Set(['Kermanshah', 'Iran', 'Global']);

const expectedEntityIds = {
  person: 'mohammad-saeed-ghezelbash',
  clinic: 'dr-saeed-ghezelbash-aesthetic-clinic',
  website: 'website',
  webpage: 'webpage',
};
const expectedSectionIds = [
  'best-aesthetic-doctor-kermanshah',
  'aesthetic-services-kermanshah',
  'aesthetic-treatment-selection',
  'injectable-aesthetic-treatments',
  'lifting-and-facial-aging',
  'skin-scar-rejuvenation',
  'hair-loss-and-restoration',
  'submental-and-body-contouring',
  'aesthetic-surgery-and-referral',
  'revision-complications-and-safety',
  'aesthetic-cost-and-consultation',
  'aesthetic-faq-kermanshah-iran',
  'medical-research-and-education',
  'clinic-information-kermanshah',
  'knowledge-graph-and-datasets',
  'sources-contact-and-appointment',
];

check(homepageContentRegistry.version === 2, 'central Homepage content registry version must be 2');
check(homepageContentRegistry.entities === homepageEntityIds, 'central registry must expose the canonical entity object by reference');
check(homepageContentRegistry.toc === homepageToc, 'central registry must expose the canonical TOC object by reference');
check(homepageContentRegistry.sections === homepageSections, 'central registry must expose the canonical H2 array by reference');
check(homepageContentRegistry.selectedH3 === homepageArticleSubsections, 'central registry must expose the canonical selected H3 array by reference');
check(homepageContentRegistry.videoPlacements === homepageVideoPlacements, 'central registry must expose the canonical video-placement array by reference');

check(same(homepageEntityIds, expectedEntityIds), `entity contract changed: ${JSON.stringify(homepageEntityIds)}`);
check(homepageToc.id === 'content-table', 'Content Table ID must remain #content-table');
check(homepageToc.headingId === 'content-table-title', 'Content Table heading ID must remain #content-table-title');
check(Boolean(homepageToc.title?.trim()), 'Content Table title is missing');
check(homepageToc.groups.length === 5, `Content Table must contain five groups; found ${homepageToc.groups.length}`);
check(unique(homepageToc.groups.map((group) => group.id)), 'duplicate Content Table group IDs exist');
check(unique(homepageToc.groups.map((group) => group.title)), 'duplicate Content Table group titles exist');

check(homepageSections.length === 16, `central H2 registry must contain 16 sections; found ${homepageSections.length}`);
check(same(homepageSections.map((section) => section.id), expectedSectionIds), 'canonical H2 order or IDs changed');
check(unique(homepageSections.map((section) => section.id)), 'duplicate H2 IDs exist');
check(unique(homepageSections.map((section) => section.title)), 'duplicate H2 titles exist');
check(same(homepageSections.map((section) => section.order), Array.from({ length: 16 }, (_, index) => index + 1)), 'H2 order values must be contiguous from 1 through 16');

const tocGroupIds = new Set(homepageToc.groups.map((group) => group.id));
for (const section of homepageSections) {
  check(slugPattern.test(section.id), `invalid canonical H2 slug: ${section.id}`);
  check(Boolean(section.title?.trim()), `missing canonical H2 title: ${section.id}`);
  check(allowedKinds.has(section.kind), `invalid section kind for ${section.id}: ${section.kind}`);
  check(tocGroupIds.has(section.tocGroup), `unknown TOC group for ${section.id}: ${section.tocGroup}`);
  check(Array.isArray(section.intentClass) && section.intentClass.length > 0, `Search Intent is missing for ${section.id}`);
  check(unique(section.intentClass), `duplicate Search Intent values for ${section.id}`);
  check(Array.isArray(section.geographyScope) && section.geographyScope.length > 0, `geography scope is missing for ${section.id}`);
  check(section.geographyScope.every((scope) => allowedGeography.has(scope)), `invalid geography scope for ${section.id}`);
  check(allowedAbout.has(section.about), `invalid topic entity for ${section.id}: ${section.about}`);
  check(section.includeInToc === true, `${section.id} must be included in the Content Table`);
  check(section.includeInGraph === true, `${section.id} must be included in Graph output`);
}

check(homepageTocSections.length === 16, `TOC destination list must contain 16 sections; found ${homepageTocSections.length}`);
check(same(homepageTocSections.map((section) => section.id), expectedSectionIds), 'TOC destinations are not generated in canonical order');
for (const group of homepageToc.groups) {
  check(homepageTocSections.some((section) => section.tocGroup === group.id), `TOC group is empty: ${group.id}`);
}

const articleSectionIds = articleHomepageSections.map((section) => section.id);
const articleGroupIds = homepageArticleGroups.map((group) => group.id);
check(unique(articleGroupIds), 'duplicate article-group IDs exist');
check(same(articleGroupIds, articleSectionIds), 'article-group order must exactly match canonical article H2 order');

const selectedH3Ids = homepageArticleSubsections.map((subsection) => subsection.id);
const selectedH3Titles = homepageArticleSubsections.map((subsection) => subsection.title);
check(unique(selectedH3Ids), 'duplicate selected H3 IDs exist');
check(unique(selectedH3Titles), 'duplicate selected H3 titles exist');
for (const subsection of homepageArticleSubsections) {
  check(slugPattern.test(subsection.id), `invalid selected H3 slug: ${subsection.id}`);
  check(Boolean(subsection.title?.trim()), `missing selected H3 title: ${subsection.id}`);
  check(articleSectionIds.includes(subsection.parentId), `selected H3 parent is not a canonical article H2: ${subsection.id} -> ${subsection.parentId}`);
  check(Array.isArray(subsection.sources) && subsection.sources.length > 0, `selected H3 has no content source: ${subsection.id}`);
  check(homepageArticleSubsectionById.get(subsection.id) === subsection, `selected H3 map does not return the canonical object: ${subsection.id}`);
  check(homepageSubsectionAnchorRegistry[subsection.title] === subsection.id, `selected H3 title-to-anchor map mismatch: ${subsection.id}`);
}

check(unique(homepageVideoPlacements.map((video) => video.id)), 'duplicate video IDs exist in the placement contract');
for (const video of homepageVideoPlacements) {
  const section = homepageSections.find((candidate) => candidate.id === video.sectionId);
  check(Boolean(section), `video section is absent from the 16-section registry: ${video.id} -> ${video.sectionId}`);
  if (video.subsectionId) {
    const subsection = homepageArticleSubsectionById.get(video.subsectionId);
    check(Boolean(subsection), `video subsection is absent from selected H3 registry: ${video.id} -> ${video.subsectionId}`);
    check(subsection?.parentId === video.sectionId, `video subsection belongs to another H2: ${video.id} -> ${video.sectionId}/${video.subsectionId}`);
  }
}

const componentBindings = [
  ['best-aesthetic-doctor-kermanshah', 'src/components/home/BestDoctorAnswers.astro'],
  ['aesthetic-services-kermanshah', 'src/components/home/Services.astro'],
  ['clinic-information-kermanshah', 'src/components/home/ClinicInformation.astro'],
  ['knowledge-graph-and-datasets', 'src/components/home/KnowledgeGraphSources.astro'],
  ['sources-contact-and-appointment', 'src/components/home/ContactSection.astro'],
];
for (const [sectionId, file] of componentBindings) {
  const source = readFileSync(join(root, file), 'utf8');
  check(source.includes(`homepageSectionById.get('${sectionId}')`), `component H2 does not resolve its identity from the registry: ${file}`);
  check(!source.includes(`<section id="${sectionId}"`), `component hardcodes canonical H2 ID instead of using the registry: ${file}`);
  const title = homepageSections.find((section) => section.id === sectionId)?.title;
  check(!source.includes(`>${title}</h2>`), `component hardcodes canonical H2 title instead of using the registry: ${file}`);
}

const guideSource = readFileSync(join(root, 'src/components/home/HomepageGuideV2.astro'), 'utf8');
check(guideSource.includes('articleHomepageSections'), 'article renderer must consume canonical article H2 definitions');
check(guideSource.includes('{group.title}</h2>'), 'article renderer must render canonical H2 titles from the registry');
const tocSource = readFileSync(join(root, 'src/components/home/ContentTable.astro'), 'utf8');
check(tocSource.includes('homepageToc') && tocSource.includes('homepageTocSections'), 'Content Table must consume the central TOC contract');
check(!tocSource.includes(`>${homepageToc.title}</h2>`), 'Content Table title is hardcoded outside the central contract');

const sourceRoots = ['src/components', 'src/pages', 'src/layouts', 'src/compilers'];
const sourceFiles = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(?:astro|ts|mjs)$/u.test(entry)) sourceFiles.push(path);
  }
};
for (const sourceRoot of sourceRoots) walk(join(root, sourceRoot));
for (const section of homepageSections) {
  for (const path of sourceFiles) {
    const source = readFileSync(path, 'utf8');
    check(!source.includes(section.title), `canonical H2 title is duplicated outside the registry: ${relative(root, path)} -> ${section.id}`);
  }
}

const allCanonicalIds = [
  ...Object.values(homepageEntityIds),
  homepageToc.id,
  ...homepageSections.map((section) => section.id),
  ...homepageArticleSubsections.map((subsection) => subsection.id),
  ...homepageVideoPlacements.map((video) => `video-${video.id}`),
];
check(unique(allCanonicalIds), 'duplicate IDs exist across entity, TOC, H2, selected H3 or video contracts');

if (failures.length > 0) {
  console.error(JSON.stringify({
    stage: 2,
    status: 'fail',
    failures,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  stage: 2,
  status: 'pass',
  entities: Object.keys(homepageEntityIds).length,
  h2: homepageSections.length,
  selectedH3: homepageArticleSubsections.length,
  tocGroups: homepageToc.groups.length,
  tocDestinations: homepageTocSections.length,
  videoPlacements: homepageVideoPlacements.length,
  duplicateCanonicalIds: 0,
  duplicateH2Titles: 0,
}, null, 2));
