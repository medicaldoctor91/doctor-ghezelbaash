import { services } from './services.mjs';

export const globalWritingRules = {
  language: 'fa-IR',
  tone: 'authoritative, clinical, local, conversion-aware, non-hype',
  avoid: [
    'unsupported superiority claims',
    'guaranteed medical outcomes',
    'price promises without verified source',
    'keyword stuffing',
    'generic filler paragraphs'
  ],
  require: [
    'clear local relevance to Kermanshah',
    'criteria-based handling of best-intent queries',
    'visible alignment with structured data and FAQ',
    'explicit next-step route to Instagram, phone, map or contact page',
    'internal links to doctor, clinic, services, evidence and contact where relevant'
  ]
};

export const pageContentBriefs = [
  {
    route: '/dr-saeed-ghezelbash/',
    pageKind: 'person',
    objective: 'Strengthen the canonical person entity and help users verify identity, scope, location and official contact paths.',
    requiredSections: [
      'identity summary',
      'medical council and verification path',
      'local practice context in Kermanshah',
      'service scope map',
      'evidence and source map',
      'decision criteria for choosing an aesthetic doctor',
      'FAQ matching visible and schema questions',
      'conversion route'
    ],
    entityTargets: ['Person', 'Physician', 'ProfilePage', 'FAQPage'],
    internalLinks: ['/dr-saeed-ghezelbash-aesthetic-clinic/', '/services/', '/evidence/', '/contact/'],
    contentGeneratorInstruction: 'Write a Persian professional profile page. Do not invent awards, rankings, prices or outcomes. Keep best-intent language criteria-based. Make identity, NAP, IRIMC, ORCID/NCBI and official contact paths explicit.'
  },
  {
    route: '/dr-saeed-ghezelbash-aesthetic-clinic/',
    pageKind: 'clinic',
    objective: 'Strengthen the canonical clinic entity as a local business and connect it to doctor, address, services, maps and conversion paths.',
    requiredSections: [
      'clinic identity summary',
      'NAP block',
      'map and location route',
      'doctor connection',
      'services overview',
      'trust and verification signals',
      'visit preparation guidance',
      'conversion route'
    ],
    entityTargets: ['MedicalBusiness', 'LocalBusiness', 'Person', 'BreadcrumbList'],
    internalLinks: ['/dr-saeed-ghezelbash/', '/services/', '/evidence/', '/kg/', '/contact/'],
    contentGeneratorInstruction: 'Write a Persian local clinic page. Focus on clear identity, address, map, phone, Instagram and service routing. Avoid unsupported claims. Use Kermanshah context naturally.'
  },
  {
    route: '/services/',
    pageKind: 'services-hub',
    objective: 'Create a decision hub that routes users and crawlers from general service intent to the correct service page.',
    requiredSections: [
      'service category overview',
      'how to choose a service',
      'service comparison grid',
      'criteria before booking',
      'doctor and clinic trust path',
      'FAQ for service selection',
      'conversion route'
    ],
    entityTargets: ['ItemList', 'WebPage', 'BreadcrumbList'],
    internalLinks: services.map((service) => `/${service.slug}/`).concat(['/dr-saeed-ghezelbash/', '/contact/']),
    contentGeneratorInstruction: 'Write a Persian services hub. It should help users choose between services without overpromising. Use internal links and short decision-oriented sections.'
  },
  ...services.map((service) => ({
    route: `/${service.slug}/`,
    pageKind: 'service',
    serviceKey: service.key,
    objective: `Build a local service landing page for ${service.title} that captures Kermanshah commercial intent and routes users to official contact paths.`,
    requiredSections: [
      'quick answer',
      'who this service may be relevant for',
      'clinical decision factors',
      'before visit preparation',
      'process overview',
      'limitations and risk signals',
      'aftercare overview',
      'cost-factor explanation without quoting price',
      'criteria-based best-intent section',
      'FAQ matching schema',
      'doctor and clinic connection',
      'conversion route'
    ],
    entityTargets: ['Service', 'FAQPage', 'WebPage', 'BreadcrumbList'],
    targetIntents: service.intentExamples,
    bestIntentAnchor: service.bestIntentAnchor,
    internalLinks: ['/dr-saeed-ghezelbash/', '/dr-saeed-ghezelbash-aesthetic-clinic/', '/services/', '/evidence/', '/contact/'],
    contentGeneratorInstruction: `Write Persian content for ${service.title}. Preserve local search intent for Kermanshah. Treat best-intent queries as criteria-based selection, not as a factual ranking claim. Do not invent prices, guarantees, before-after outcomes, awards or patient numbers.`
  }))
];

export function contentBriefForRoute(route) {
  return pageContentBriefs.find((brief) => brief.route === route) || null;
}
