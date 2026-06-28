import { researchProfile } from '../data/research.mjs';
import { absoluteUrl } from '../data/site.mjs';
import { buildGlobalGraph as buildSchemaGlobalGraph } from './schema.mjs';
import {
  buildAestheticScopeTermSet,
  buildAestheticScopeTerms
} from './aestheticScopeGraph.mjs';
import {
  applyEntityCrosswalk,
  buildEntityCrosswalkGraphNodes
} from './entityCrosswalk.mjs';
import {
  buildOfficialOfferCatalogEntity,
  buildOfficialOfferEntities,
  officialOfferCatalogId
} from './officialOfferGraph.mjs';
import {
  buildResearchCollectionEntity,
  buildScholarlyArticleEntities,
  scholarlyArticleReferences
} from './researchGraph.mjs';
import {
  applySchemaPropertyExpansion,
  buildSchemaPropertyExpansionNodes
} from './schemaPropertyExpansion.mjs';

function refKey(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value['@id'] || value.url || JSON.stringify(value);
  return String(value);
}

function appendUniqueReferences(currentValue, additions = []) {
  const current = Array.isArray(currentValue) ? currentValue : [currentValue].filter(Boolean);
  const seen = new Set(current.map(refKey));
  const merged = [...current];

  for (const addition of additions) {
    const key = refKey(addition);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(addition);
  }

  return merged;
}

function orcidIdentifier() {
  return {
    '@type': 'PropertyValue',
    propertyID: 'ORCID',
    value: researchProfile.orcid.replace('https://orcid.org/', ''),
    url: researchProfile.orcid
  };
}

function ncbiIdentifier() {
  return {
    '@type': 'PropertyValue',
    propertyID: 'NCBI Bibliography',
    value: 'saeed.ghezelbash.1',
    url: researchProfile.bibliographyUrl
  };
}

function appendResearchIdentity(entity) {
  if (!entity) return;
  entity.sameAs = appendUniqueReferences(entity.sameAs, [researchProfile.orcid, researchProfile.bibliographyUrl]);
  entity.identifier = appendUniqueReferences(entity.identifier, [orcidIdentifier(), ncbiIdentifier()]);
  entity.subjectOf = appendUniqueReferences(entity.subjectOf, [
    { '@id': absoluteUrl('/research/#collection') },
    ...scholarlyArticleReferences()
  ]);
}

function mergeNodeList(nodes, additions) {
  const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));

  for (const addition of additions) {
    const id = addition['@id'];
    if (!id || !byId.has(id)) {
      nodes.push(addition);
      if (id) byId.set(id, addition);
      continue;
    }

    Object.assign(byId.get(id), addition);
  }

  return byId;
}

function attachOfficialOfferCatalog(nodes) {
  const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
  const catalogReference = { '@id': officialOfferCatalogId() };
  const clinic = byId.get(absoluteUrl('/#clinic'));
  const physician = byId.get(absoluteUrl('/#physician'));

  if (clinic) clinic.hasOfferCatalog = catalogReference;
  if (physician) physician.hasOfferCatalog = catalogReference;

  for (const node of nodes) {
    if (node['@type'] !== 'Service' || !node.url) continue;
    const servicePath = new URL(node.url).pathname;
    const offerId = absoluteUrl(`${servicePath.replace(/\/$/, '')}/#offer`);
    node.offers = { '@id': offerId };
  }
}

export function buildGlobalGraph() {
  const baseGraph = buildSchemaGlobalGraph();
  const nodes = JSON.parse(JSON.stringify(baseGraph['@graph'] || []));
  const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
  const researchReferences = scholarlyArticleReferences();
  const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
  const physician = byId.get(absoluteUrl('/#physician'));
  const dataset = byId.get(absoluteUrl('/kg/#dataset'));

  appendResearchIdentity(person);
  appendResearchIdentity(physician);

  if (dataset) {
    dataset.citation = appendUniqueReferences(dataset.citation, researchReferences);
    dataset.about = appendUniqueReferences(dataset.about, [
      { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      { '@id': absoluteUrl('/#physician') },
      { '@id': absoluteUrl('/#clinic') },
      { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') },
      { '@id': absoluteUrl('/research/#collection') }
    ]);
    dataset.mentions = appendUniqueReferences(dataset.mentions, [
      { '@id': absoluteUrl('/research/#collection') },
      ...researchReferences
    ]);
  }

  mergeNodeList(nodes, [
    buildAestheticScopeTermSet(),
    ...buildAestheticScopeTerms(),
    buildOfficialOfferCatalogEntity(),
    ...buildOfficialOfferEntities(),
    ...buildEntityCrosswalkGraphNodes(),
    ...buildSchemaPropertyExpansionNodes(),
    buildResearchCollectionEntity(),
    ...buildScholarlyArticleEntities()
  ]);

  attachOfficialOfferCatalog(nodes);
  applyEntityCrosswalk(nodes);
  applySchemaPropertyExpansion(nodes);

  return {
    ...baseGraph,
    '@graph': nodes
  };
}
