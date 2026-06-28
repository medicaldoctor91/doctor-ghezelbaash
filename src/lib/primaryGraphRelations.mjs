import { site, absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';
import {
  entityCrosswalkDatasetId,
  entityRelationTermSetId
} from './entityCrosswalk.mjs';
import { officialOfferCatalogId } from './officialOfferGraph.mjs';
import {
  aestheticMedicineSpecialtyId,
  dataCatalogId,
  kermanshahPlaceId,
  medicalCredentialId
} from './primaryGraphCompletion.mjs';

export function primaryGraphGovernancePolicyId() {
  return absoluteUrl('/kg/policy#primary-graph-governance');
}

function ref(id) {
  return { '@id': id };
}

function refs(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function refKey(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value['@id'] || value.url || JSON.stringify(value);
  return String(value);
}

function appendRefs(currentValue, additions = []) {
  const current = refs(currentValue);
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

function serviceRefs(fragment = '#service') {
  return services.map((service) => ref(absoluteUrl(`/${service.slug}/${fragment}`)));
}

function servicePageRefs() {
  return services.map((service) => ref(`${absoluteUrl(`/${service.slug}/`)}#webpage`));
}

function primaryEntityRefs() {
  return [
    ref(absoluteUrl('/#dr-saeed-ghezelbash')),
    ref(absoluteUrl('/#physician')),
    ref(absoluteUrl('/#clinic')),
    ref(absoluteUrl('/#website')),
    ref(absoluteUrl('/#organization')),
    ref(absoluteUrl('/kg/#dataset')),
    ref(dataCatalogId()),
    ref(officialOfferCatalogId()),
    ref(entityCrosswalkDatasetId()),
    ref(entityRelationTermSetId()),
    ref(absoluteUrl('/kg/aesthetic-scope#term-set')),
    ref(absoluteUrl('/research/#collection')),
    ref(medicalCredentialId()),
    ref(kermanshahPlaceId()),
    ref(aestheticMedicineSpecialtyId())
  ];
}

export function buildPrimaryGraphRelationNodes() {
  return [
    {
      '@type': 'CreativeWork',
      '@id': primaryGraphGovernancePolicyId(),
      name: 'Primary graph governance policy for Dr. Saeed Ghezelbash entity graph',
      inLanguage: ['fa-IR', 'en'],
      url: absoluteUrl('/graph-ghezelbaash-final.jsonld'),
      creator: ref(absoluteUrl('/#dr-saeed-ghezelbash')),
      publisher: ref(absoluteUrl('/#clinic')),
      mainEntity: ref(absoluteUrl('/kg/#dataset')),
      about: primaryEntityRefs(),
      mentions: [
        ref(entityCrosswalkDatasetId()),
        ref(officialOfferCatalogId()),
        ref(absoluteUrl('/kg/aesthetic-scope#term-set')),
        ref(absoluteUrl('/research/#collection'))
      ],
      additionalProperty: [
        {
          '@type': 'PropertyValue',
          propertyID: 'graphConsolidationPolicy',
          value: 'The primary graph is the only standalone public JSON-LD endpoint; retired JSON-LD projections are represented as nodes and relationships inside this graph.'
        },
        {
          '@type': 'PropertyValue',
          propertyID: 'offerBoundaryPolicy',
          value: 'Only official current services are represented as Offer nodes; broader aesthetic topics remain knowledge-scope DefinedTerm nodes.'
        },
        {
          '@type': 'PropertyValue',
          propertyID: 'sameAsPolicy',
          value: 'sameAs is reserved for direct identity/profile/repository/dataset/map identity; editorial, media, forum, and topical pages must be represented by subjectOf, citation, or mentions.'
        }
      ]
    }
  ];
}

export function applyPrimaryGraphRelations(nodes) {
  const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
  const website = byId.get(absoluteUrl('/#website'));
  const organization = byId.get(absoluteUrl('/#organization'));
  const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
  const physician = byId.get(absoluteUrl('/#physician'));
  const clinic = byId.get(absoluteUrl('/#clinic'));
  const dataset = byId.get(absoluteUrl('/kg/#dataset'));
  const catalog = byId.get(dataCatalogId());
  const policy = byId.get(primaryGraphGovernancePolicyId());
  const termSet = byId.get(absoluteUrl('/kg/aesthetic-scope#term-set'));
  const offerCatalog = byId.get(officialOfferCatalogId());
  const crosswalkDataset = byId.get(entityCrosswalkDatasetId());
  const researchCollection = byId.get(absoluteUrl('/research/#collection'));
  const primaryGraph = ref(absoluteUrl('/graph-ghezelbaash-final.jsonld'));
  const policyRef = ref(primaryGraphGovernancePolicyId());

  if (website) {
    website.creator = ref(absoluteUrl('/#dr-saeed-ghezelbash'));
    website.maintainer = ref(absoluteUrl('/#clinic'));
    website.accountablePerson = ref(absoluteUrl('/#dr-saeed-ghezelbash'));
    website.publisher = ref(absoluteUrl('/#clinic'));
    website.subjectOf = appendRefs(website.subjectOf, [primaryGraph, policyRef]);
    website.mentions = appendRefs(website.mentions, primaryEntityRefs());
  }

  if (organization) {
    organization.founder = ref(absoluteUrl('/#dr-saeed-ghezelbash'));
    organization.member = appendRefs(organization.member, [ref(absoluteUrl('/#dr-saeed-ghezelbash')), ref(absoluteUrl('/#physician'))]);
    organization.subjectOf = appendRefs(organization.subjectOf, [primaryGraph]);
  }

  if (person) {
    person.knowsLanguage = ['fa-IR', 'en'];
    person.subjectOf = appendRefs(person.subjectOf, [primaryGraph, policyRef]);
    person.mentions = appendRefs(person.mentions, [
      ref(absoluteUrl('/#physician')),
      ref(absoluteUrl('/#clinic')),
      ref(absoluteUrl('/kg/aesthetic-scope#term-set')),
      ref(officialOfferCatalogId()),
      ref(dataCatalogId())
    ]);
  }

  if (physician) {
    physician.knowsLanguage = ['fa-IR', 'en'];
    physician.subjectOf = appendRefs(physician.subjectOf, [primaryGraph, policyRef]);
    physician.mentions = appendRefs(physician.mentions, [
      ref(absoluteUrl('/#dr-saeed-ghezelbash')),
      ref(absoluteUrl('/#clinic')),
      ref(medicalCredentialId()),
      ref(aestheticMedicineSpecialtyId())
    ]);
  }

  if (clinic) {
    clinic.subjectOf = appendRefs(clinic.subjectOf, [primaryGraph, policyRef]);
    clinic.mentions = appendRefs(clinic.mentions, [
      ref(absoluteUrl('/#dr-saeed-ghezelbash')),
      ref(absoluteUrl('/#physician')),
      ref(kermanshahPlaceId()),
      ref(officialOfferCatalogId()),
      ...serviceRefs()
    ]);
  }

  if (dataset) {
    dataset.schemaVersion = 'https://schema.org/version/latest/';
    dataset.creator = ref(absoluteUrl('/#dr-saeed-ghezelbash'));
    dataset.publisher = ref(absoluteUrl('/#clinic'));
    dataset.provider = ref(absoluteUrl('/#clinic'));
    dataset.maintainer = ref(absoluteUrl('/#clinic'));
    dataset.accountablePerson = ref(absoluteUrl('/#dr-saeed-ghezelbash'));
    dataset.subjectOf = appendRefs(dataset.subjectOf, [policyRef]);
    dataset.mentions = appendRefs(dataset.mentions, [
      ...primaryEntityRefs(),
      ...serviceRefs(),
      ...servicePageRefs()
    ]);
    dataset.hasPart = appendRefs(dataset.hasPart, [
      ref(dataCatalogId()),
      ref(primaryGraphGovernancePolicyId()),
      ref(medicalCredentialId()),
      ref(kermanshahPlaceId()),
      ref(aestheticMedicineSpecialtyId())
    ]);
  }

  if (catalog) {
    catalog.mainEntity = ref(absoluteUrl('/kg/#dataset'));
    catalog.hasPart = appendRefs(catalog.hasPart, [
      ref(absoluteUrl('/kg/#dataset')),
      ref(entityCrosswalkDatasetId()),
      ref(officialOfferCatalogId()),
      ref(absoluteUrl('/kg/aesthetic-scope#term-set')),
      ref(absoluteUrl('/research/#collection')),
      ...serviceRefs()
    ]);
    catalog.subjectOf = appendRefs(catalog.subjectOf, [primaryGraph, policyRef]);
  }

  if (policy) {
    policy.isPartOf = ref(absoluteUrl('/kg/#dataset'));
  }

  if (termSet) {
    termSet.subjectOf = appendRefs(termSet.subjectOf, [primaryGraph, policyRef]);
  }

  if (offerCatalog) {
    offerCatalog.subjectOf = appendRefs(offerCatalog.subjectOf, [primaryGraph, policyRef]);
    offerCatalog.about = appendRefs(offerCatalog.about, [ref(absoluteUrl('/#clinic')), ref(absoluteUrl('/#physician'))]);
  }

  if (crosswalkDataset) {
    crosswalkDataset.subjectOf = appendRefs(crosswalkDataset.subjectOf, [primaryGraph, policyRef]);
  }

  if (researchCollection) {
    researchCollection.subjectOf = appendRefs(researchCollection.subjectOf, [primaryGraph, policyRef]);
  }

  for (const service of nodes.filter((node) => node['@type'] === 'Service')) {
    service.subjectOf = appendRefs(service.subjectOf, [primaryGraph, policyRef]);
    service.mentions = appendRefs(service.mentions, [
      ref(absoluteUrl('/#clinic')),
      ref(absoluteUrl('/#physician')),
      ref(officialOfferCatalogId()),
      ref(kermanshahPlaceId())
    ]);
  }

  return nodes;
}
