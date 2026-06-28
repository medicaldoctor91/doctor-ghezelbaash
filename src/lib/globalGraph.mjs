import { absoluteUrl } from '../data/site.mjs';
import { buildGlobalGraph as buildSchemaGlobalGraph } from './schema.mjs';
import {
  buildAestheticScopeTermSet,
  buildAestheticScopeTerms
} from './aestheticScopeGraph.mjs';
import {
  buildResearchCollectionEntity,
  buildScholarlyArticleEntities,
  scholarlyArticleReferences
} from './researchGraph.mjs';

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

export function buildGlobalGraph() {
  const baseGraph = buildSchemaGlobalGraph();
  const nodes = JSON.parse(JSON.stringify(baseGraph['@graph'] || []));
  const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
  const researchReferences = scholarlyArticleReferences();
  const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
  const physician = byId.get(absoluteUrl('/#physician'));
  const dataset = byId.get(absoluteUrl('/kg/#dataset'));

  if (person) {
    person.subjectOf = appendUniqueReferences(person.subjectOf, researchReferences);
  }

  if (physician) {
    physician.subjectOf = appendUniqueReferences(physician.subjectOf, researchReferences);
  }

  if (dataset) {
    dataset.citation = appendUniqueReferences(dataset.citation, researchReferences);
    dataset.about = appendUniqueReferences(dataset.about, [
      { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      { '@id': absoluteUrl('/#physician') },
      { '@id': absoluteUrl('/#clinic') },
      { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') }
    ]);
  }

  mergeNodeList(nodes, [
    buildAestheticScopeTermSet(),
    ...buildAestheticScopeTerms(),
    buildResearchCollectionEntity(),
    ...buildScholarlyArticleEntities()
  ]);

  return {
    ...baseGraph,
    '@graph': nodes
  };
}
