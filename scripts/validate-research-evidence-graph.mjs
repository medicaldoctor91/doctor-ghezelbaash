import { absoluteUrl } from '../src/data/site.mjs';
import { researchProfile } from '../src/data/research.mjs';
import { buildGlobalGraph } from '../src/lib/globalGraph.mjs';
import { scholarlyArticleId } from '../src/lib/researchGraph.mjs';
import { publicationEvidenceLinkMap } from '../src/lib/researchEvidenceGraph.mjs';

let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function refs(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function refIds(value) {
  return refs(value).map((item) => item?.['@id']).filter(Boolean);
}

function hasRef(entity, property, id) {
  return refIds(entity?.[property]).includes(id);
}

function visit(value, callback) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) visit(item, callback);
    return;
  }

  callback(value);
  for (const child of Object.values(value)) visit(child, callback);
}

const graph = buildGlobalGraph();
const nodes = graph?.['@graph'] || [];
const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
const dataset = byId.get(absoluteUrl('/kg/#dataset'));
const collection = byId.get(absoluteUrl('/research/#collection'));
const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
const physician = byId.get(absoluteUrl('/#physician'));

const forbiddenPlanningKeys = new Set([
  'status',
  'risk',
  'action',
  'verified',
  'unverified',
  'exact',
  'related',
  'pending',
  'addNow',
  'addLater'
]);

visit(graph, (item) => {
  for (const key of Object.keys(item)) {
    if (forbiddenPlanningKeys.has(key)) fail(`planning metadata key leaked into research evidence graph: ${key}`);
  }
});

const requiredEvidenceNodes = new Map([
  ['/kg/research-evidence#term-set', 'DefinedTermSet'],
  ['/kg/research-method#peer-reviewed-publication', 'DefinedTerm'],
  ['/kg/research-method#doi-indexed-publication', 'DefinedTerm'],
  ['/kg/research-method#pubmed-indexed-publication', 'DefinedTerm'],
  ['/kg/research-topic#psychiatry-research', 'DefinedTerm'],
  ['/kg/research-topic#mental-health-research', 'DefinedTerm'],
  ['/kg/research-topic#major-depressive-disorder', 'MedicalCondition'],
  ['/kg/research-topic#attachment-style', 'DefinedTerm'],
  ['/kg/research-topic#dissociative-identity-symptoms', 'MedicalCondition'],
  ['/kg/research-topic#adult-traumatic-events', 'DefinedTerm'],
  ['/kg/research-topic#bipolar-i-disorder', 'MedicalCondition'],
  ['/kg/research-topic#omega-3-supplementation', 'MedicalTherapy']
]);

for (const [path, expectedType] of requiredEvidenceNodes) {
  const id = absoluteUrl(path);
  const node = byId.get(id);
  if (!node) {
    fail(`missing research evidence node ${id}`);
    continue;
  }
  if (!refs(node['@type']).includes(expectedType)) fail(`research evidence node ${id} missing type ${expectedType}`);
}

for (const entity of [person, physician].filter(Boolean)) {
  for (const id of [
    absoluteUrl('/kg/research-evidence#term-set'),
    absoluteUrl('/kg/research#medical-research-literacy'),
    absoluteUrl('/kg/research#scientific-publication'),
    absoluteUrl('/kg/research#clinical-reasoning')
  ]) {
    if (!hasRef(entity, 'knowsAbout', id)) fail(`${entity['@id']} missing research evidence knowsAbout ${id}`);
  }
}

if (!collection) fail('missing research collection');
if (collection) {
  for (const id of [
    absoluteUrl('/kg/research-evidence#term-set'),
    absoluteUrl('/kg/research#medical-research-literacy'),
    absoluteUrl('/kg/research#scientific-publication'),
    absoluteUrl('/kg/research#clinical-reasoning')
  ]) {
    if (!hasRef(collection, 'about', id) && !hasRef(collection, 'mentions', id) && !hasRef(collection, 'hasPart', id)) {
      fail(`research collection missing research evidence reference ${id}`);
    }
  }
}

if (!dataset) fail('missing dataset');
if (dataset) {
  if (!hasRef(dataset, 'hasPart', absoluteUrl('/kg/research-evidence#term-set'))) fail('dataset.hasPart missing research evidence term set');
  if (!hasRef(dataset, 'mentions', absoluteUrl('/kg/research-topic#major-depressive-disorder'))) fail('dataset.mentions missing MDD research topic');
  if (!hasRef(dataset, 'mentions', absoluteUrl('/kg/research-topic#bipolar-i-disorder'))) fail('dataset.mentions missing bipolar research topic');
}

const articleTopicMap = publicationEvidenceLinkMap();
const forbiddenAestheticTopicIds = [
  absoluteUrl('/kg/medical-knowledge#aesthetic-medicine'),
  absoluteUrl('/kg/aesthetic-scope#term-set'),
  absoluteUrl('/kg/medical-procedure#cosmetic-botulinum-toxin-injection'),
  absoluteUrl('/kg/medical-procedure#dermal-filler-injection'),
  absoluteUrl('/kg/medical-procedure#thread-lift'),
  absoluteUrl('/kg/medical-procedure#submental-liposuction')
];

for (const publication of researchProfile.publications) {
  const article = byId.get(scholarlyArticleId(publication));
  if (!article) {
    fail(`missing scholarly article ${publication.key}`);
    continue;
  }

  const expectedTopics = articleTopicMap[publication.key] || [];
  for (const id of expectedTopics) {
    if (!hasRef(article, 'about', id) && !hasRef(article, 'mentions', id)) fail(`article ${publication.key} missing evidence topic ${id}`);
  }

  for (const forbiddenId of forbiddenAestheticTopicIds) {
    if (hasRef(article, 'about', forbiddenId) || hasRef(article, 'mentions', forbiddenId)) {
      fail(`article ${publication.key} must not overclaim aesthetic topic ${forbiddenId}`);
    }
  }

  if (!hasRef(article, 'subjectOf', absoluteUrl('/kg/research-evidence#term-set'))) fail(`article ${publication.key} missing subjectOf research evidence set`);
  if (!refs(article.keywords).some((keyword) => typeof keyword === 'string' && keyword.includes('/kg/research-topic#'))) fail(`article ${publication.key} missing research-topic keyword reference`);
}

if (failed) process.exit(1);
console.log('Research evidence graph validation passed');
