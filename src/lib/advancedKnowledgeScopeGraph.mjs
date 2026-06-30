import { absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';
import { advancedKnowledgeScopeTerms } from '../data/advancedKnowledgeScope.mjs';
import { procedureKnowledgeScopeTerms } from '../data/procedureKnowledgeScope.mjs';

const termSetId = absoluteUrl('/kg/advanced-knowledge-scope#term-set');
const datasetId = absoluteUrl('/kg/advanced-knowledge-scope#dataset');
const allAdvancedKnowledgeTerms = [...advancedKnowledgeScopeTerms, ...procedureKnowledgeScopeTerms];

function serviceForPillar(pillar) {
  return services.find((service) => service.key === pillar);
}

function pageRefs(term) {
  const service = serviceForPillar(term.pillar);
  const refs = [{ '@id': datasetId }];
  if (service) refs.push({ '@id': absoluteUrl('/' + service.slug + '/#webpage') });
  return refs;
}

export function advancedKnowledgeTermId(term) {
  return absoluteUrl('/kg/advanced-knowledge-scope#' + term.key);
}

export function advancedKnowledgeTermReferences() {
  return allAdvancedKnowledgeTerms.map((term) => ({ '@id': advancedKnowledgeTermId(term) }));
}

export function buildAdvancedKnowledgeTermSet() {
  return {
    '@type': 'DefinedTermSet',
    '@id': termSetId,
    name: 'Advanced knowledge scope for Dr. Saeed Ghezelbash',
    inLanguage: ['fa-IR', 'en'],
    about: [
      { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      { '@id': absoluteUrl('/#physician') },
      { '@id': absoluteUrl('/#clinic') }
    ],
    hasDefinedTerm: advancedKnowledgeTermReferences()
  };
}

export function buildAdvancedKnowledgeTerms() {
  return allAdvancedKnowledgeTerms.map((term) => ({
    '@type': 'DefinedTerm',
    '@id': advancedKnowledgeTermId(term),
    name: term.nameFa,
    alternateName: [term.nameEn, term.key, ...(term.aliasesFa || []), ...(term.aliasesEn || [])],
    termCode: term.key,
    category: term.category,
    inDefinedTermSet: { '@id': termSetId },
    isPartOf: { '@id': termSetId },
    about: [
      { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      { '@id': absoluteUrl('/#physician') },
      { '@id': absoluteUrl('/#clinic') }
    ],
    subjectOf: pageRefs(term)
  }));
}
