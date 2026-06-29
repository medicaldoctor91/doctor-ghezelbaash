import { absoluteUrl } from '../data/site.mjs';
import { researchProfile } from '../data/research.mjs';
import { scholarlyArticleId, scholarlyArticleReferences } from './researchGraph.mjs';

function ref(path) {
  return { '@id': absoluteUrl(path) };
}

function ids(paths) {
  return paths.map(ref);
}

function refs(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function refKey(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value['@id'] || value.url || `${value.propertyID || ''}:${value.value || value.codeValue || ''}`;
  return String(value);
}

function appendUnique(currentValue, additions = []) {
  const seen = new Set(refs(currentValue).map(refKey));
  const merged = [...refs(currentValue)];
  for (const addition of additions) {
    const key = refKey(addition);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(addition);
  }
  return merged;
}

function node(path, type, fields = {}) {
  return {
    '@id': absoluteUrl(path),
    '@type': type,
    ...fields
  };
}

export const researchEvidenceTermSetId = () => absoluteUrl('/kg/research-evidence#term-set');

const researchEvidenceSetPath = '/kg/research-evidence#term-set';

const researchTopicDefinitions = [
  {
    path: '/kg/research-evidence#term-set',
    type: 'DefinedTermSet',
    name: 'Publication topic and research evidence layer for Dr. Saeed Ghezelbash',
    alternateName: ['لایه موضوعات پژوهشی و شواهد علمی دکتر سعید قزلباش'],
    terms: [
      '/kg/research-method#peer-reviewed-publication',
      '/kg/research-method#doi-indexed-publication',
      '/kg/research-method#pubmed-indexed-publication',
      '/kg/research-method#open-review-report',
      '/kg/research-topic#psychiatry-research',
      '/kg/research-topic#mental-health-research',
      '/kg/research-topic#major-depressive-disorder',
      '/kg/research-topic#attachment-style',
      '/kg/research-topic#dissociative-identity-symptoms',
      '/kg/research-topic#adult-traumatic-events',
      '/kg/research-topic#bipolar-i-disorder',
      '/kg/research-topic#omega-3-supplementation'
    ]
  },
  {
    path: '/kg/research-method#peer-reviewed-publication',
    type: 'DefinedTerm',
    name: 'Peer-reviewed scientific publication',
    alternateName: ['انتشار علمی داوری‌شده'],
    inSet: researchEvidenceSetPath
  },
  {
    path: '/kg/research-method#doi-indexed-publication',
    type: 'DefinedTerm',
    name: 'DOI-indexed publication',
    alternateName: ['انتشار علمی دارای DOI'],
    inSet: researchEvidenceSetPath
  },
  {
    path: '/kg/research-method#pubmed-indexed-publication',
    type: 'DefinedTerm',
    name: 'PubMed-indexed publication',
    alternateName: ['انتشار علمی نمایه‌شده در پاب‌مد'],
    inSet: researchEvidenceSetPath
  },
  {
    path: '/kg/research-method#open-review-report',
    type: 'DefinedTerm',
    name: 'Open peer-review report',
    alternateName: ['گزارش داوری باز'],
    inSet: researchEvidenceSetPath
  },
  {
    path: '/kg/research-topic#psychiatry-research',
    type: 'DefinedTerm',
    name: 'Psychiatry research',
    alternateName: ['پژوهش روان‌پزشکی'],
    inSet: researchEvidenceSetPath
  },
  {
    path: '/kg/research-topic#mental-health-research',
    type: 'DefinedTerm',
    name: 'Mental health research',
    alternateName: ['پژوهش سلامت روان'],
    inSet: researchEvidenceSetPath
  },
  {
    path: '/kg/research-topic#major-depressive-disorder',
    type: 'MedicalCondition',
    name: 'Major depressive disorder',
    alternateName: ['اختلال افسردگی اساسی'],
    inSet: researchEvidenceSetPath,
    related: ['/kg/research-topic#psychiatry-research', '/kg/research-topic#mental-health-research']
  },
  {
    path: '/kg/research-topic#attachment-style',
    type: 'DefinedTerm',
    name: 'Attachment style',
    alternateName: ['سبک دلبستگی'],
    inSet: researchEvidenceSetPath,
    related: ['/kg/research-topic#mental-health-research']
  },
  {
    path: '/kg/research-topic#dissociative-identity-symptoms',
    type: 'MedicalCondition',
    name: 'Dissociative identity symptoms',
    alternateName: ['علائم هویت تجزیه‌ای'],
    inSet: researchEvidenceSetPath,
    related: ['/kg/research-topic#psychiatry-research']
  },
  {
    path: '/kg/research-topic#adult-traumatic-events',
    type: 'DefinedTerm',
    name: 'Adult traumatic events',
    alternateName: ['رویدادهای تروماتیک بزرگسالی'],
    inSet: researchEvidenceSetPath,
    related: ['/kg/research-topic#mental-health-research']
  },
  {
    path: '/kg/research-topic#bipolar-i-disorder',
    type: 'MedicalCondition',
    name: 'Bipolar I disorder',
    alternateName: ['اختلال دوقطبی نوع یک'],
    inSet: researchEvidenceSetPath,
    related: ['/kg/research-topic#psychiatry-research', '/kg/research-topic#mental-health-research']
  },
  {
    path: '/kg/research-topic#omega-3-supplementation',
    type: 'MedicalTherapy',
    name: 'Omega-3 supplementation',
    alternateName: ['مکمل امگا ۳'],
    inSet: researchEvidenceSetPath,
    related: ['/kg/research-topic#bipolar-i-disorder']
  }
];

const publicationEvidenceLinks = {
  'healthcare-2021-1169': [
    '/kg/research-method#peer-reviewed-publication',
    '/kg/research-method#doi-indexed-publication',
    '/kg/research-method#pubmed-indexed-publication',
    '/kg/research-method#open-review-report',
    '/kg/research-topic#major-depressive-disorder',
    '/kg/research-topic#attachment-style',
    '/kg/research-topic#dissociative-identity-symptoms',
    '/kg/research-topic#adult-traumatic-events',
    '/kg/research-topic#psychiatry-research',
    '/kg/research-topic#mental-health-research',
    '/kg/research#medical-research-literacy',
    '/kg/research#scientific-publication',
    '/kg/research#clinical-reasoning'
  ],
  'ijpm-2016-77': [
    '/kg/research-method#peer-reviewed-publication',
    '/kg/research-method#doi-indexed-publication',
    '/kg/research-method#pubmed-indexed-publication',
    '/kg/research-topic#bipolar-i-disorder',
    '/kg/research-topic#omega-3-supplementation',
    '/kg/research-topic#psychiatry-research',
    '/kg/research-topic#mental-health-research',
    '/kg/research#medical-research-literacy',
    '/kg/research#scientific-publication',
    '/kg/research#clinical-reasoning'
  ]
};

const allResearchEvidencePaths = [
  ...researchTopicDefinitions.map((definition) => definition.path),
  ...Object.values(publicationEvidenceLinks).flat()
];

function buildEvidenceTermSet(definition) {
  return node(definition.path, 'DefinedTermSet', {
    name: definition.name,
    alternateName: definition.alternateName,
    inLanguage: ['fa-IR', 'en'],
    about: [
      ref('/#dr-saeed-ghezelbash'),
      ref('/#physician'),
      ref('/research/#collection')
    ],
    hasDefinedTerm: ids(definition.terms)
  });
}

function buildEvidenceTerm(definition) {
  const isDefinedTerm = definition.type === 'DefinedTerm';
  return node(definition.path, definition.type, {
    name: definition.name,
    alternateName: definition.alternateName,
    ...(isDefinedTerm && definition.inSet ? { inDefinedTermSet: ref(definition.inSet), isPartOf: ref(definition.inSet) } : {}),
    ...(!isDefinedTerm && definition.inSet ? { subjectOf: ref(definition.inSet) } : {}),
    ...(definition.related ? { isRelatedTo: ids(definition.related) } : {})
  });
}

export function researchEvidenceReferences(paths = allResearchEvidencePaths) {
  return ids([...new Set(paths)]);
}

export function publicationEvidenceReferences(publicationKey) {
  return ids(publicationEvidenceLinks[publicationKey] || []);
}

export function publicationEvidenceLinkMap() {
  return Object.fromEntries(
    Object.entries(publicationEvidenceLinks).map(([key, linkedPaths]) => [
      key,
      linkedPaths.map((linkedPath) => absoluteUrl(linkedPath))
    ])
  );
}

export function buildResearchEvidenceGraphNodes() {
  return researchTopicDefinitions.map((definition) => {
    if (definition.type === 'DefinedTermSet') return buildEvidenceTermSet(definition);
    return buildEvidenceTerm(definition);
  });
}

export function applyResearchEvidenceGraph(nodes) {
  const byId = new Map(nodes.map((item) => [item['@id'], item]).filter(([id]) => Boolean(id)));
  const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
  const physician = byId.get(absoluteUrl('/#physician'));
  const dataset = byId.get(absoluteUrl('/kg/#dataset'));
  const researchCollection = byId.get(absoluteUrl('/research/#collection'));

  const researchEvidenceCore = [
    ref('/kg/research-evidence#term-set'),
    ref('/kg/research#medical-research-literacy'),
    ref('/kg/research#scientific-publication'),
    ref('/kg/research#clinical-reasoning')
  ];

  for (const entity of [person, physician].filter(Boolean)) {
    entity.knowsAbout = appendUnique(entity.knowsAbout, researchEvidenceCore);
    entity.subjectOf = appendUnique(entity.subjectOf, [ref('/research/#collection'), ...scholarlyArticleReferences()]);
  }

  if (researchCollection) {
    researchCollection.about = appendUnique(researchCollection.about, researchEvidenceCore);
    researchCollection.mentions = appendUnique(researchCollection.mentions, researchEvidenceReferences());
    researchCollection.hasPart = appendUnique(researchCollection.hasPart, [
      ...scholarlyArticleReferences(),
      ref('/kg/research-evidence#term-set'),
      ...researchEvidenceReferences()
    ]);
  }

  if (dataset) {
    dataset.about = appendUnique(dataset.about, researchEvidenceCore);
    dataset.mentions = appendUnique(dataset.mentions, researchEvidenceReferences());
    dataset.hasPart = appendUnique(dataset.hasPart, [
      ref('/kg/research-evidence#term-set'),
      ...researchEvidenceReferences()
    ]);
  }

  for (const publication of researchProfile.publications) {
    const article = byId.get(scholarlyArticleId(publication));
    if (!article) continue;
    const links = publicationEvidenceReferences(publication.key);
    article.about = appendUnique(article.about, links);
    article.mentions = appendUnique(article.mentions, links);
    article.keywords = appendUnique(article.keywords, links.map((item) => item['@id']));
    if (!article.isPartOf) article.isPartOf = ref('/research/#collection');
    article.subjectOf = appendUnique(article.subjectOf, [ref('/kg/research-evidence#term-set')]);
  }

  return nodes;
}
