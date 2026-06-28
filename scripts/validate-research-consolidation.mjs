import fs from 'node:fs';
import { researchProfile } from '../src/data/research.mjs';
import { absoluteUrl } from '../src/data/site.mjs';
import { buildGlobalGraph } from '../src/lib/globalGraph.mjs';

let failed = false;
function fail(message) {
  console.error(message);
  failed = true;
}

function refs(value) {
  return (Array.isArray(value) ? value : [value].filter(Boolean));
}

function refIds(value) {
  return refs(value).map((item) => item?.['@id']).filter(Boolean);
}

function identifierValues(entity, propertyID) {
  return refs(entity?.identifier)
    .filter((identifier) => identifier?.propertyID === propertyID)
    .map((identifier) => identifier.value);
}

if (fs.existsSync('src/pages/research-graph.jsonld.js')) {
  fail('research-graph JSON-LD endpoint must be retired; research semantics belong in the primary graph');
}

const graph = buildGlobalGraph();
const nodes = graph?.['@graph'] || [];
const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
const physician = byId.get(absoluteUrl('/#physician'));
const dataset = byId.get(absoluteUrl('/kg/#dataset'));
const researchCollection = byId.get(absoluteUrl('/research/#collection'));
const articleIds = researchProfile.publications.map((publication) => absoluteUrl(`/research/#${publication.key}`));

if (!person) fail('missing person node');
if (!physician) fail('missing physician node');
if (!dataset) fail('missing dataset node');
if (!researchCollection) fail('missing research collection node');

for (const entity of [person, physician].filter(Boolean)) {
  const sameAs = refs(entity.sameAs);
  const subjectOfIds = refIds(entity.subjectOf);
  if (!sameAs.includes(researchProfile.orcid)) fail(`${entity['@id']} missing ORCID sameAs`);
  if (!sameAs.includes(researchProfile.bibliographyUrl)) fail(`${entity['@id']} missing NCBI bibliography sameAs`);
  if (!identifierValues(entity, 'ORCID').includes(researchProfile.orcid.replace('https://orcid.org/', ''))) fail(`${entity['@id']} missing ORCID identifier`);
  if (!identifierValues(entity, 'NCBI Bibliography').includes('saeed.ghezelbash.1')) fail(`${entity['@id']} missing NCBI bibliography identifier`);
  if (!subjectOfIds.includes(absoluteUrl('/research/#collection'))) fail(`${entity['@id']} missing research collection subjectOf`);
  for (const articleId of articleIds) {
    if (!subjectOfIds.includes(articleId)) fail(`${entity['@id']} missing scholarly article subjectOf: ${articleId}`);
  }
}

if (dataset) {
  const citationIds = refIds(dataset.citation);
  const aboutIds = refIds(dataset.about);
  const mentionsIds = refIds(dataset.mentions);
  if (!aboutIds.includes(absoluteUrl('/research/#collection'))) fail('dataset missing research collection about reference');
  if (!mentionsIds.includes(absoluteUrl('/research/#collection'))) fail('dataset missing research collection mentions reference');
  for (const articleId of articleIds) {
    if (!citationIds.includes(articleId)) fail(`dataset missing article citation: ${articleId}`);
    if (!mentionsIds.includes(articleId)) fail(`dataset missing article mention: ${articleId}`);
  }
}

for (const publication of researchProfile.publications) {
  const article = byId.get(absoluteUrl(`/research/#${publication.key}`));
  if (!article) {
    fail(`missing article node: ${publication.key}`);
    continue;
  }
  if (article['@type'] !== 'ScholarlyArticle') fail(`article must be ScholarlyArticle: ${publication.key}`);
  if (article.author?.['@id'] !== absoluteUrl('/#dr-saeed-ghezelbash')) fail(`article author must point to person: ${publication.key}`);
  if (article.creator?.['@id'] !== absoluteUrl('/#dr-saeed-ghezelbash')) fail(`article creator must point to person: ${publication.key}`);
  if (article.isPartOf?.['@id'] !== absoluteUrl('/research/#collection')) fail(`article must be part of research collection: ${publication.key}`);
  if (!identifierValues(article, 'DOI').includes(publication.doi)) fail(`article missing DOI: ${publication.key}`);
  if (!identifierValues(article, 'PMID').includes(publication.pmid)) fail(`article missing PMID: ${publication.key}`);
  if (!identifierValues(article, 'PMCID').includes(publication.pmcid)) fail(`article missing PMCID: ${publication.key}`);
}

if (failed) process.exit(1);
console.log('Research consolidation validation passed');
