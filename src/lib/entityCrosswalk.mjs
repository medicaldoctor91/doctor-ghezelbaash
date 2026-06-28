import { absoluteUrl } from '../data/site.mjs';
import { authoritySignals } from '../data/authoritySignals.mjs';
import { services } from '../data/services.mjs';
import { aestheticServiceConcepts } from '../data/aestheticScope.mjs';
import {
  canUseAsSameAs,
  getSignalsForEntity
} from './sourceClassifier.mjs';
import { officialOfferCatalogId, officialServiceId } from './officialOfferGraph.mjs';
import { scholarlyArticleReferences } from './researchGraph.mjs';

const crosswalkBase = '/kg/entity-crosswalk';

export const wikidataLikeRelationMappings = [
  { key: 'instance-of', name: 'instance of', schemaProperty: '@type', description: 'Entity class declaration in the Schema.org graph.' },
  { key: 'exact-identity', name: 'exact identity', schemaProperty: 'sameAs', description: 'Direct identity, official profile, repository, dataset, or local map identity only.' },
  { key: 'external-identifier', name: 'external identifier', schemaProperty: 'identifier', description: 'External identifiers such as IRIMC, ORCID, DOI, PMID, PMCID, Google CID, Place ID, or map IDs.' },
  { key: 'described-by-source', name: 'described by source', schemaProperty: 'subjectOf', description: 'Editorial, media, interview, directory, forum, or research pages that describe the entity without asserting identity.' },
  { key: 'main-subject', name: 'main subject', schemaProperty: 'about', description: 'Subject relationship from pages, datasets, articles, and terms back to the entity graph.' },
  { key: 'citation', name: 'cites work', schemaProperty: 'citation', description: 'Scholarly, dataset, and evidence citations.' },
  { key: 'part-of', name: 'part of', schemaProperty: 'isPartOf', description: 'Part-whole relationship for articles, term sets, and knowledge graph components.' },
  { key: 'has-part', name: 'has part', schemaProperty: 'hasPart', description: 'Reverse part-whole relationship for the knowledge graph dataset.' },
  { key: 'provider', name: 'provider', schemaProperty: 'provider', description: 'Service provider relationship from official services to the clinic.' },
  { key: 'founder', name: 'founder', schemaProperty: 'founder', description: 'Clinic founder relationship to the person entity.' },
  { key: 'member', name: 'member / employee', schemaProperty: 'member/employee', description: 'Clinic and physician organizational relation.' },
  { key: 'located-at', name: 'located at', schemaProperty: 'address/geo/containedInPlace', description: 'Local entity location, address, coordinates, and place containment.' },
  { key: 'map-link', name: 'map link', schemaProperty: 'hasMap', description: 'Map profiles for local entity corroboration.' },
  { key: 'service-catalog', name: 'service catalog', schemaProperty: 'hasOfferCatalog', description: 'Official service catalog limited to current public services.' },
  { key: 'actual-offer', name: 'actual offer', schemaProperty: 'Offer', description: 'Offer nodes only for current official services.' },
  { key: 'knowledge-scope', name: 'knowledge-only service concept', schemaProperty: 'DefinedTerm/knowsAbout/category', description: 'Broad aesthetic medicine concepts that must not become offers unless promoted to official service data.' }
];

function uniqueById(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.filter(Boolean)) {
    const key = typeof value === 'string' ? value : value['@id'] || value.url || JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function appendUniqueReferences(currentValue, additions = []) {
  const current = Array.isArray(currentValue) ? currentValue : [currentValue].filter(Boolean);
  return uniqueById([...current, ...additions]);
}

function relationTermId(mapping) {
  return absoluteUrl(`${crosswalkBase}#${mapping.key}`);
}

export function entityCrosswalkDatasetId() {
  return absoluteUrl(`${crosswalkBase}#dataset`);
}

export function entityRelationTermSetId() {
  return absoluteUrl(`${crosswalkBase}#relation-set`);
}

export function entityRelationTermReferences() {
  return wikidataLikeRelationMappings.map((mapping) => ({ '@id': relationTermId(mapping) }));
}

export function buildEntityRelationTermSet() {
  return {
    '@type': 'DefinedTermSet',
    '@id': entityRelationTermSetId(),
    name: 'Schema.org implementation of Wikidata-like entity relationships for Dr. Saeed Ghezelbash knowledge graph',
    alternateName: 'Wikidata-like Schema.org relationship crosswalk',
    inLanguage: ['en', 'fa-IR'],
    about: [
      { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      { '@id': absoluteUrl('/#physician') },
      { '@id': absoluteUrl('/#clinic') },
      { '@id': absoluteUrl('/kg/#dataset') }
    ],
    hasDefinedTerm: entityRelationTermReferences()
  };
}

export function buildEntityRelationTerms() {
  return wikidataLikeRelationMappings.map((mapping) => ({
    '@type': 'DefinedTerm',
    '@id': relationTermId(mapping),
    name: mapping.name,
    alternateName: mapping.schemaProperty,
    termCode: mapping.key,
    description: mapping.description,
    inDefinedTermSet: { '@id': entityRelationTermSetId() },
    isPartOf: { '@id': entityRelationTermSetId() },
    about: [
      { '@id': absoluteUrl('/kg/#dataset') },
      { '@id': absoluteUrl('/graph-ghezelbaash-final.jsonld') }
    ]
  }));
}

export function buildEntityCrosswalkDataset() {
  const sameAsSignals = authoritySignals.filter(canUseAsSameAs);
  const subjectOfSignals = authoritySignals.filter((signal) => signal.useAs?.includes('subjectOf') || signal.useAs?.includes('citation'));
  const mapSignals = getSignalsForEntity(authoritySignals, 'clinic').filter((signal) => signal.useAs?.includes('hasMap'));

  return {
    '@type': 'Dataset',
    '@id': entityCrosswalkDatasetId(),
    name: 'Entity relationship crosswalk for Dr. Saeed Ghezelbash knowledge graph',
    description: 'Machine-readable policy layer mapping Wikidata-like relationship ideas to Schema.org properties while preserving strict sameAs boundaries.',
    url: absoluteUrl('/graph-ghezelbaash-final.jsonld'),
    creator: { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
    isPartOf: { '@id': absoluteUrl('/kg/#dataset') },
    about: [
      { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      { '@id': absoluteUrl('/#physician') },
      { '@id': absoluteUrl('/#clinic') },
      { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') },
      { '@id': officialOfferCatalogId() },
      { '@id': entityRelationTermSetId() }
    ],
    hasPart: [
      { '@id': entityRelationTermSetId() },
      { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') },
      { '@id': officialOfferCatalogId() },
      { '@id': absoluteUrl('/research/#collection') },
      ...services.map((service) => ({ '@id': officialServiceId(service) })),
      ...scholarlyArticleReferences()
    ],
    measurementTechnique: 'Schema.org relationship crosswalk for Wikidata-like entity modeling',
    variableMeasured: wikidataLikeRelationMappings.map((mapping) => mapping.schemaProperty),
    additionalProperty: [
      {
        '@type': 'PropertyValue',
        propertyID: 'sameAsSignalCount',
        value: sameAsSignals.length
      },
      {
        '@type': 'PropertyValue',
        propertyID: 'subjectOfOrCitationSignalCount',
        value: subjectOfSignals.length
      },
      {
        '@type': 'PropertyValue',
        propertyID: 'mapSignalCount',
        value: mapSignals.length
      },
      {
        '@type': 'PropertyValue',
        propertyID: 'sameAsPolicy',
        value: 'sameAs is restricted to direct identity, official profile, repository, dataset, and local map identity sources. Media, interview, forum, tag, editorial, and general-topic pages are subjectOf/citation/mentions signals.'
      }
    ]
  };
}

export function buildEntityCrosswalkGraphNodes() {
  return [
    buildEntityCrosswalkDataset(),
    buildEntityRelationTermSet(),
    ...buildEntityRelationTerms()
  ];
}

export function applyEntityCrosswalk(nodes) {
  const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
  const knowledgeGraphDataset = byId.get(absoluteUrl('/kg/#dataset'));

  if (knowledgeGraphDataset) {
    knowledgeGraphDataset.hasPart = appendUniqueReferences(knowledgeGraphDataset.hasPart, [
      { '@id': entityCrosswalkDatasetId() },
      { '@id': entityRelationTermSetId() },
      { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') },
      { '@id': officialOfferCatalogId() },
      { '@id': absoluteUrl('/research/#collection') },
      ...services.map((service) => ({ '@id': officialServiceId(service) }))
    ]);
  }

  return nodes;
}
