import { site, absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';
import { serviceTaxonomy } from '../data/serviceTaxonomy.mjs';
import { aestheticScopePolicy } from '../data/aestheticScope.mjs';
import {
  aestheticConceptProjection,
  aestheticConceptsForService,
  aestheticScopeByCategory
} from '../lib/aestheticScopeGraph.mjs';

const contentBlocksRequired = [
  'summary_answer',
  'who_it_is_for',
  'service_scope',
  'process_overview',
  'results_and_duration',
  'aftercare',
  'risk_signals',
  'cost_factors',
  'selection_criteria',
  'faq',
  'conversion_cta'
];

const validationChecklist = [
  'index_follow_meta',
  'sitemap_inclusion',
  'canonical_www_url',
  'visible_best_intent_section',
  'visible_faq_before_schema',
  'internal_links_to_person_clinic_contact',
  'instagram_phone_maps_cta',
  'schema_consistent_with_visible_content'
];

const machineSupportAssets = [
  '/brand-kb.ghezelbaash.ai-public.json',
  '/sameas.json',
  '/location.json',
  '/regulatory.json',
  '/authority-signals.json',
  '/service-taxonomy.json',
  '/aesthetic_medicine_knowledge_kermanshah_fa.json',
  '/entity-hardening-index.json'
];

export function GET() {
  const broadAestheticConcepts = Object.values(aestheticScopeByCategory()).flat();
  const body = {
    schema: 'ghezelbaash.service_architecture.astro.v4.aesthetic_scope_builder',
    dateModified: '2026-06-28',
    canonicalWebsite: site.canonicalBase + '/',
    stage: 'production-indexable-services-broad-scope-graph-builder',
    indexingPolicy: {
      servicePages: 'index,follow',
      includeServicePagesInSitemap: true,
      keepCurrentPublicServicePages: true,
      broadScopeConceptsInSchemaGraph: true,
      nonOfficialConceptsAreKnowledgeScopeOnly: true
    },
    intentPolicy: {
      preserveLocalCommercialIntent: true,
      useCriteriaBasedBestSections: true,
      avoidUnsupportedRankingClaims: true,
      connectServiceIntentToPersonClinicLocationAndEvidence: true
    },
    broadScopePolicy: aestheticScopePolicy,
    contentBlocksRequired,
    validationChecklist,
    machineSupportAssets: machineSupportAssets.map((path) => absoluteUrl(path)),
    broadAestheticConcepts,
    broadAestheticConceptsByCategory: aestheticScopeByCategory(),
    parentServicePages: services.map((service) => {
      const taxonomy = serviceTaxonomy[service.key] || null;
      const scopeConcepts = aestheticConceptsForService(service.key).map(aestheticConceptProjection);
      return {
        key: service.key,
        slug: service.slug,
        title: service.title,
        description: service.description,
        url: absoluteUrl(`/${service.slug}/`),
        robots: 'index,follow',
        sitemap: true,
        canonicalOwner: {
          person: absoluteUrl(site.pages.person),
          clinic: absoluteUrl(site.pages.clinic),
          location: absoluteUrl('/location.json'),
          regulatory: absoluteUrl('/regulatory.json')
        },
        bestIntentAnchor: absoluteUrl(`/${service.slug}/#${service.bestIntentAnchor}`),
        bestIntentTitle: service.bestIntentTitle,
        intentExamples: service.intentExamples,
        taxonomy,
        supportingIntents: [
          ...(taxonomy ? taxonomy.childIntents : []),
          ...scopeConcepts.map((concept) => concept.nameFa),
          ...scopeConcepts.map((concept) => concept.nameEn),
          ...scopeConcepts.flatMap((concept) => [...(concept.aliasesFa || []), ...(concept.aliasesEn || [])])
        ].filter(Boolean),
        serviceType: taxonomy ? taxonomy.serviceType : service.title,
        scopeConcepts,
        requiredPageBlocks: contentBlocksRequired,
        validationChecklist,
        machineSupportAssets: machineSupportAssets.map((path) => absoluteUrl(path))
      };
    })
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
