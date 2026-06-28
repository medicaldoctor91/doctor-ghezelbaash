import { absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';
import { aestheticServiceConcepts, aestheticScopePolicy } from '../data/aestheticScope.mjs';

export function aestheticConceptId(concept) {
  return absoluteUrl(`/kg/aesthetic-scope#${concept.key}`);
}

export function aestheticConceptReferences(concepts = aestheticServiceConcepts) {
  return concepts.map((concept) => ({ '@id': aestheticConceptId(concept) }));
}

export function aestheticConceptsForService(serviceKey) {
  return aestheticServiceConcepts.filter((concept) => concept.pillar === serviceKey);
}

export function aestheticConceptProjection(concept) {
  return {
    ...concept,
    node: aestheticConceptId(concept),
    graphUse: ['DefinedTerm', 'knowsAbout', 'category', 'about', 'subjectOf'],
    offerBoundary: 'knowledge-scope-only'
  };
}

export function aestheticScopeByCategory() {
  return aestheticServiceConcepts.reduce((groups, concept) => {
    const category = concept.category || 'aesthetic-medicine';
    if (!groups[category]) groups[category] = [];
    groups[category].push(aestheticConceptProjection(concept));
    return groups;
  }, {});
}

export function buildAestheticScopeTermSet() {
  return {
    '@type': 'DefinedTermSet',
    '@id': absoluteUrl('/kg/aesthetic-scope#term-set'),
    name: 'Aesthetic medicine, injectable treatments, rejuvenation, contouring, hair, submental, surgery-adjacent, and safety knowledge scope for Dr. Saeed Ghezelbash',
    alternateName: [
      'Medical aesthetics knowledge graph scope',
      'Aesthetic medicine service concept ontology',
      'قلمرو دانش پزشکی زیبایی دکتر سعید قزلباش'
    ],
    inLanguage: ['fa-IR', 'en'],
    about: [
      { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      { '@id': absoluteUrl('/#physician') },
      { '@id': absoluteUrl('/#clinic') }
    ],
    hasDefinedTerm: aestheticConceptReferences(),
    additionalProperty: [
      {
        '@type': 'PropertyValue',
        propertyID: 'scopePolicy',
        value: aestheticScopePolicy.schema
      },
      {
        '@type': 'PropertyValue',
        propertyID: 'offerBoundary',
        value: aestheticScopePolicy.offerBoundary
      }
    ]
  };
}

export function buildAestheticScopeTerms() {
  return aestheticServiceConcepts.map((concept) => {
    const parentService = services.find((service) => service.key === concept.pillar);
    const aliases = [
      ...(concept.aliasesFa || []),
      ...(concept.aliasesEn || []),
      concept.nameEn,
      concept.key
    ].filter(Boolean);

    return {
      '@type': 'DefinedTerm',
      '@id': aestheticConceptId(concept),
      name: concept.nameFa,
      alternateName: aliases,
      termCode: concept.key,
      inDefinedTermSet: { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') },
      isPartOf: { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') },
      category: concept.category || 'aesthetic-medicine',
      additionalProperty: [
        {
          '@type': 'PropertyValue',
          propertyID: 'offerStatus',
          value: concept.offerStatus || 'knowledge-scope'
        },
        {
          '@type': 'PropertyValue',
          propertyID: 'routingPillar',
          value: concept.pillar
        }
      ],
      about: [
        { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
        { '@id': absoluteUrl('/#physician') },
        { '@id': absoluteUrl('/#clinic') }
      ],
      subjectOf: parentService ? { '@id': `${absoluteUrl(`/${parentService.slug}/`)}#webpage` } : { '@id': absoluteUrl('/services/#webpage') }
    };
  });
}
