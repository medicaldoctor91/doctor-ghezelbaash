import { absoluteUrl } from '../data/site.mjs';
import { advancedKnowledgeScopeTerms } from '../data/advancedKnowledgeScope.mjs';

const termSetId = absoluteUrl('/kg/advanced-knowledge-scope#term-set');

export function advancedKnowledgeTermId(term) {
  return absoluteUrl(`/kg/advanced-knowledge-scope#${term.key}`);
}

export function advancedKnowledgeTermReferences() {
  return advancedKnowledgeScopeTerms.map((term) => ({ '@id': advancedKnowledgeTermId(term) }));
}

export function buildAdvancedKnowledgeTermSet() {
  return {
    '@type': 'DefinedTermSet',
    '@id': termSetId,
    name: 'Advanced aesthetic medicine safety and knowledge scope for Dr. Saeed Ghezelbash',
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
  return advancedKnowledgeScopeTerms.map((term) => ({
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
    subjectOf: { '@id': absoluteUrl('/kg/advanced-knowledge-scope#dataset') }
  }));
}
