import { absoluteUrl, site } from '../data/site.mjs';
import { location } from '../data/location.mjs';
import { services } from '../data/services.mjs';
import { aestheticServiceConcepts } from '../data/aestheticScope.mjs';
import { authoritySignals } from '../data/authoritySignals.mjs';
import { aestheticConceptId } from './aestheticScopeGraph.mjs';
import { officialOfferCatalogId, officialOfferId, officialServiceId } from './officialOfferGraph.mjs';
import { aestheticMedicineSpecialtyId, kermanshahPlaceId } from './primaryGraphCompletion.mjs';

const personId = () => absoluteUrl('/#dr-saeed-ghezelbash');
const physicianId = () => absoluteUrl('/#physician');
const clinicId = () => absoluteUrl('/#clinic');
const websiteId = () => absoluteUrl('/#website');
const datasetId = () => absoluteUrl('/kg/#dataset');
const contactPointId = () => absoluteUrl('/kg/contact#primary-phone');

export const primaryGraphFinalPolicyId = () => absoluteUrl('/kg/policy#primary-graph-final-layer');
export const expertiseTermSetId = () => absoluteUrl('/kg/expertise#term-set');
export const localAudienceId = () => absoluteUrl('/kg/audience#aesthetic-consultation-kermanshah');
export const localAestheticMarketId = () => absoluteUrl('/kg/place#kermanshah-aesthetic-medicine-market');

const expertiseTerms = [
  ['aesthetic-medicine-consultation', 'مشاوره پزشکی زیبایی', 'Aesthetic medicine consultation'],
  ['patient-selection', 'انتخاب بیمار', 'Patient selection'],
  ['facial-anatomy-safety', 'ایمنی آناتومی صورت', 'Facial anatomy safety'],
  ['natural-result-design', 'طراحی نتیجه طبیعی', 'Natural result design'],
  ['risk-communication', 'ارتباط ریسک', 'Risk communication'],
  ['evidence-based-aesthetic-medicine', 'پزشکی زیبایی مبتنی بر شواهد', 'Evidence-based aesthetic medicine'],
  ['research-literacy', 'سواد پژوهشی', 'Research literacy'],
  ['local-aesthetic-authority-kermanshah', 'مرجعیت محلی زیبایی در کرمانشاه', 'Local aesthetic authority in Kermanshah'],
  ['nap-consistency', 'یکپارچگی نام، نشانی و تلفن', 'NAP consistency'],
  ['official-contact-path', 'مسیر تماس رسمی', 'Official contact path']
];

const personAliases = [
  'دکتر سعید قزلباش',
  'دکتر محمد سعید قزلباش',
  'دکتر محمدسعید قزلباش',
  'دکتر قزلباش',
  'سعید قزلباش',
  'محمد سعید قزلباش',
  'محمدسعید قزلباش',
  'Dr. Saeed Ghezelbash',
  'Dr. Saeed Ghezelbaash',
  'Dr. Mohammad Saeed Ghezelbash',
  'Dr. Mohammad Saeed Ghazlbash',
  'Saeed Ghezelbash',
  'Saeed Ghezelbaash',
  'Mohammad Saeed Ghezelbash',
  'Mohammad Saeed Ghazlbash',
  'Mohammadsaeed Ghezelbash',
  'Saeed Qezlbash'
];

const clinicAliases = [
  'کلینیک زیبایی دکتر سعید قزلباش',
  'کلینیک زیبایی دکتر قزلباش',
  'کلینیک دکتر سعید قزلباش',
  'کلینیک دکتر قزلباش',
  'کلینیک زیبایی دکتر محمد سعید قزلباش',
  'Doctor Ghezelbaash Aesthetic Clinic',
  'Dr. Saeed Ghezelbash Aesthetic Clinic',
  'Dr. Saeed Ghezelbaash Clinic',
  'Ghezelbaash Aesthetic Clinic',
  'Doctor.Ghezelbaash'
];

const aestheticGroups = [
  ['injectables', 'تزریقات زیبایی', 'Injectables', ['neuromodulator', 'therapeutic-neuromodulator', 'injectable-filler', 'skin-rejuvenation', 'regenerative-aesthetics']],
  ['neuromodulators', 'نورومدولاتورها', 'Neuromodulators', ['neuromodulator', 'therapeutic-neuromodulator']],
  ['fillers', 'فیلرها', 'Fillers', ['injectable-filler']],
  ['threads', 'نخ‌های لیفت', 'Threads', ['thread-lift', 'thread-lift-material']],
  ['skin-rejuvenation', 'جوانسازی پوست', 'Skin rejuvenation', ['skin-rejuvenation', 'skin-care', 'regenerative-aesthetics', 'scar-treatment', 'pigmentation-care']],
  ['hair-rejuvenation', 'جوانسازی مو', 'Hair rejuvenation', ['hair-restoration']],
  ['submental-contouring', 'کانتورینگ زیر چانه', 'Submental contouring', ['submental-contouring', 'fat-reduction', 'fat-transfer']],
  ['safety-and-correction', 'ایمنی و اصلاح عوارض', 'Safety and correction', ['clinical-governance']],
  ['surgery-adjacent-knowledge', 'دانش مجاور جراحی زیبایی', 'Surgery-adjacent knowledge', ['cosmetic-surgery-knowledge']]
];

function ref(id) {
  return { '@id': id };
}

function keyOf(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value['@id'] || value.url || JSON.stringify(value);
}

function refs(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function appendRefs(currentValue, additions = []) {
  const current = refs(currentValue);
  const seen = new Set(current.map(keyOf));
  const merged = [...current];
  for (const addition of additions.filter(Boolean)) {
    const key = keyOf(addition);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(addition);
  }
  return merged;
}

function setOrAppend(entity, property, additions) {
  entity[property] = appendRefs(entity[property], additions);
}

function mergeStrings(currentValue, additions = []) {
  const current = refs(currentValue);
  const seen = new Set(current);
  for (const addition of additions) {
    if (addition && !seen.has(addition)) {
      current.push(addition);
      seen.add(addition);
    }
  }
  return current;
}

function faqPageId(service) {
  return absoluteUrl(`/${service.slug}/#faq`);
}

function faqQuestionId(service, index) {
  return absoluteUrl(`/${service.slug}/#faq-question-${index + 1}`);
}

function servicePageId(service) {
  return absoluteUrl(`/${service.slug}/#webpage`);
}

function buildFaqLayerNodes() {
  const nodes = [];
  for (const service of services) {
    const questionRefs = (service.faq || []).map((_, index) => ref(faqQuestionId(service, index)));
    nodes.push({
      '@type': 'FAQPage',
      '@id': faqPageId(service),
      url: faqPageId(service),
      name: `پرسش‌های متداول ${service.title}`,
      inLanguage: 'fa-IR',
      isPartOf: ref(servicePageId(service)),
      about: [ref(officialServiceId(service)), ref(clinicId()), ref(physicianId())],
      mainEntity: questionRefs
    });

    (service.faq || []).forEach(([question, answer], index) => {
      nodes.push({
        '@type': 'Question',
        '@id': faqQuestionId(service, index),
        name: question,
        inLanguage: 'fa-IR',
        isPartOf: ref(faqPageId(service)),
        about: ref(officialServiceId(service)),
        acceptedAnswer: {
          '@type': 'Answer',
          text: answer,
          inLanguage: 'fa-IR'
        }
      });
    });
  }
  return nodes;
}

function expertiseTermId(code) {
  return absoluteUrl(`/kg/expertise#${code}`);
}

function expertiseRefs() {
  return [ref(expertiseTermSetId()), ...expertiseTerms.map(([code]) => ref(expertiseTermId(code)))];
}

function buildExpertiseNodes() {
  const termRefs = expertiseTerms.map(([code]) => ref(expertiseTermId(code)));
  return [
    {
      '@type': 'DefinedTermSet',
      '@id': expertiseTermSetId(),
      name: 'Physician expertise, safety, research, and local authority terms for Dr. Saeed Ghezelbash',
      inLanguage: ['fa-IR', 'en'],
      about: [ref(personId()), ref(physicianId()), ref(clinicId()), ref(aestheticMedicineSpecialtyId())],
      hasDefinedTerm: termRefs
    },
    ...expertiseTerms.map(([code, nameFa, nameEn]) => ({
      '@type': 'DefinedTerm',
      '@id': expertiseTermId(code),
      name: nameFa,
      alternateName: nameEn,
      termCode: code,
      inDefinedTermSet: ref(expertiseTermSetId()),
      isPartOf: ref(expertiseTermSetId()),
      about: [ref(personId()), ref(physicianId()), ref(clinicId()), ref(aestheticMedicineSpecialtyId())]
    }))
  ];
}

function signalWebPage(signal) {
  const page = {
    '@type': 'WebPage',
    name: signal.title || signal.publisher || signal.key,
    url: signal.url
  };
  if (signal.publisher) page.publisher = { '@type': 'Organization', name: signal.publisher };
  if (signal.identifier) page.identifier = { '@type': 'PropertyValue', propertyID: signal.key, value: signal.identifier };
  if (signal.language) page.inLanguage = signal.language;
  if (signal.datePublished) page.datePublished = signal.datePublished;
  if (Array.isArray(signal.about)) page.about = signal.about.map((name) => ({ '@type': 'Thing', name }));
  return page;
}

function evidenceListNode(key, name, description, signals) {
  return {
    '@type': 'ItemList',
    '@id': absoluteUrl(`/kg/evidence#${key}`),
    name,
    description,
    numberOfItems: signals.length,
    itemListElement: signals.map((signal, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: signal.title || signal.publisher || signal.key,
      url: signal.url,
      item: signalWebPage(signal)
    }))
  };
}

function buildEvidenceNodes() {
  const byUse = (use) => authoritySignals.filter((signal) => signal.useAs?.includes(use));
  return [
    evidenceListNode('identity-sameas-list', 'Identity sameAs evidence list', 'Identity, profile, map, repository and dataset signals used as high-confidence sameAs references.', byUse('sameAs')),
    evidenceListNode('medical-directory-list', 'Medical directory evidence list', 'Medical and local directory profiles used as subject/evidence style signals.', byUse('directoryProfile')),
    evidenceListNode('local-map-list', 'Local map evidence list', 'Map profiles that corroborate local clinic presence and NAP consistency.', byUse('hasMap')),
    evidenceListNode('research-authority-list', 'Research authority evidence list', 'Research profiles, scholarly records and citations connected to the physician entity.', authoritySignals.filter((signal) => signal.useAs?.includes('researchProfile') || signal.useAs?.includes('citation'))),
    evidenceListNode('media-coverage-list', 'Media coverage evidence list', 'Media, interviews, forum discussions and topical mentions kept outside sameAs.', authoritySignals.filter((signal) => ['mediaMention', 'mediaInterview', 'forumDiscussion', 'topicalTag'].includes(signal.type)))
  ];
}

function evidenceRefs() {
  return ['identity-sameas-list', 'medical-directory-list', 'local-map-list', 'research-authority-list', 'media-coverage-list'].map((key) => ref(absoluteUrl(`/kg/evidence#${key}`)));
}

function occupationRefs() {
  return [ref(absoluteUrl('/kg/occupation#aesthetic-physician')), ref(absoluteUrl('/kg/occupation#medical-researcher'))];
}

function buildOccupationNodes() {
  return [
    {
      '@type': 'Occupation',
      '@id': absoluteUrl('/kg/occupation#aesthetic-physician'),
      name: 'پزشک زیبایی',
      alternateName: 'Aesthetic physician',
      description: 'Physician-led aesthetic medicine role for official aesthetic consultation and services in Kermanshah.',
      about: [ref(personId()), ref(physicianId()), ref(clinicId())]
    },
    {
      '@type': 'Occupation',
      '@id': absoluteUrl('/kg/occupation#medical-researcher'),
      name: 'پژوهشگر پزشکی',
      alternateName: 'Medical researcher',
      description: 'Medical researcher role connected to the physician’s PubMed-indexed research identity.',
      about: [ref(personId()), ref(physicianId())]
    }
  ];
}

function buildLocalNodes() {
  return [
    {
      '@type': 'Audience',
      '@id': localAudienceId(),
      name: 'مخاطب مشاوره زیبایی در کرمانشاه',
      audienceType: 'Local aesthetic consultation audience in Kermanshah',
      inLanguage: 'fa-IR'
    },
    {
      '@type': 'Place',
      '@id': localAestheticMarketId(),
      name: 'بازار محلی پزشکی زیبایی کرمانشاه',
      alternateName: 'Kermanshah aesthetic medicine market',
      address: { '@type': 'PostalAddress', addressLocality: location.addressLocality || 'Kermanshah', addressRegion: location.addressRegion, addressCountry: location.addressCountry || site.country },
      description: 'Local service area for physician-led aesthetic medicine and official clinic consultation in Kermanshah.'
    }
  ];
}

function groupId(key) {
  return absoluteUrl(`/kg/aesthetic-scope#group-${key}`);
}

function buildAestheticGroupNodes() {
  return aestheticGroups.map(([key, nameFa, nameEn, categories]) => {
    const children = aestheticServiceConcepts.filter((concept) => categories.includes(concept.category)).map((concept) => ref(aestheticConceptId(concept)));
    return {
      '@type': 'DefinedTerm',
      '@id': groupId(key),
      name: nameFa,
      alternateName: nameEn,
      termCode: key,
      inDefinedTermSet: ref(absoluteUrl('/kg/aesthetic-scope#term-set')),
      isPartOf: ref(absoluteUrl('/kg/aesthetic-scope#term-set')),
      hasPart: children,
      hasDefinedTerm: children,
      about: [ref(personId()), ref(physicianId()), ref(clinicId())]
    };
  });
}

function buildPolicyNode() {
  return {
    '@type': 'CreativeWork',
    '@id': primaryGraphFinalPolicyId(),
    name: 'Primary graph final layer policy',
    description: 'Machine-readable governance policy for the final primary graph layer.',
    inLanguage: ['fa-IR', 'en'],
    mainEntity: ref(datasetId()),
    isPartOf: ref(datasetId()),
    about: [ref(websiteId()), ref(personId()), ref(physicianId()), ref(clinicId()), ref(datasetId())],
    additionalProperty: [
      { '@type': 'PropertyValue', propertyID: 'graphConsolidationBoundary', value: 'Only one generated standalone primary JSON-LD graph is published.' },
      { '@type': 'PropertyValue', propertyID: 'officialOfferBoundary', value: 'Only current official services are represented as Offer nodes; knowledge-only concepts remain DefinedTerm nodes.' },
      { '@type': 'PropertyValue', propertyID: 'sameAsBoundary', value: 'sameAs is reserved for high-confidence identity/profile/map/dataset references; directory, editorial, media and forum URLs remain evidence signals.' },
      { '@type': 'PropertyValue', propertyID: 'visibleContentBoundary', value: 'Graph claims are limited to official visible content and verified public authority signals.' },
      { '@type': 'PropertyValue', propertyID: 'noRankingGuaranteeBoundary', value: 'Structured data improves entity clarity but does not guarantee rankings, AI Overview inclusion or rich result eligibility.' },
      { '@type': 'PropertyValue', propertyID: 'privateDataRedactionBoundary', value: 'Private credential identifiers, private addresses, birth dates and private email addresses are excluded.' }
    ]
  };
}

export function buildPrimaryGraphFinalLayerNodes() {
  return [
    ...buildFaqLayerNodes(),
    ...buildExpertiseNodes(),
    ...buildEvidenceNodes(),
    ...buildOccupationNodes(),
    ...buildLocalNodes(),
    ...buildAestheticGroupNodes(),
    buildPolicyNode()
  ];
}

function finalLayerRefs() {
  return [
    ref(primaryGraphFinalPolicyId()),
    ref(expertiseTermSetId()),
    ...expertiseTerms.map(([code]) => ref(expertiseTermId(code))),
    ...evidenceRefs(),
    ...occupationRefs(),
    ref(localAudienceId()),
    ref(localAestheticMarketId()),
    ...aestheticGroups.map(([key]) => ref(groupId(key))),
    ...services.flatMap((service) => [ref(faqPageId(service)), ...(service.faq || []).map((_, index) => ref(faqQuestionId(service, index)))])
  ];
}

export function applyPrimaryGraphFinalLayer(nodes) {
  const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
  const dataset = byId.get(datasetId());
  const website = byId.get(websiteId());
  const person = byId.get(personId());
  const physician = byId.get(physicianId());
  const clinic = byId.get(clinicId());
  const policyReference = ref(primaryGraphFinalPolicyId());
  const expertiseReferences = expertiseRefs();
  const evidenceReferences = evidenceRefs();
  const occupationReferences = occupationRefs();
  const audienceReference = ref(localAudienceId());
  const marketReference = ref(localAestheticMarketId());
  const kermanshahReference = ref(kermanshahPlaceId());

  if (dataset) {
    dataset.disambiguatingDescription = dataset.disambiguatingDescription || 'Primary generated JSON-LD dataset for Dr. Saeed Ghezelbash, the physician profile, official clinic, research identity and local Kermanshah evidence graph.';
    setOrAppend(dataset, 'hasPart', finalLayerRefs());
    setOrAppend(dataset, 'mentions', [policyReference, ...expertiseReferences, ...evidenceReferences, ...occupationReferences, audienceReference, marketReference]);
    setOrAppend(dataset, 'audience', [audienceReference]);
  }

  if (website) {
    website.disambiguatingDescription = website.disambiguatingDescription || 'Official website for Dr. Saeed Ghezelbash’s Kermanshah aesthetic clinic, public services, research identity and official contact path.';
    setOrAppend(website, 'mentions', [...expertiseReferences, ...evidenceReferences]);
    setOrAppend(website, 'subjectOf', [policyReference]);
  }

  for (const entity of [person, physician].filter(Boolean)) {
    entity.alternateName = mergeStrings(entity.alternateName, personAliases);
    entity.givenName = entity.givenName || 'سعید';
    entity.additionalName = entity.additionalName || 'محمد';
    entity.familyName = entity.familyName || 'قزلباش';
    entity.disambiguatingDescription = entity.disambiguatingDescription || 'Dr. Mohammad Saeed Ghezelbash / دکتر سعید قزلباش: physician-led aesthetic medicine entity in Kermanshah with official clinic relation and public research-profile evidence.';
    setOrAppend(entity, 'knowsAbout', expertiseReferences);
    setOrAppend(entity, 'hasOccupation', occupationReferences);
    setOrAppend(entity, 'subjectOf', [policyReference, ...evidenceReferences]);
    setOrAppend(entity, 'areaServed', [kermanshahReference, marketReference]);
    setOrAppend(entity, 'audience', [audienceReference]);
  }

  if (clinic) {
    clinic.alternateName = mergeStrings(clinic.alternateName, clinicAliases);
    clinic.disambiguatingDescription = clinic.disambiguatingDescription || 'Official Kermanshah aesthetic clinic associated with Dr. Saeed Ghezelbash, with public NAP, map evidence, official service offers and physician relation.';
    setOrAppend(clinic, 'mentions', [...expertiseReferences, ...evidenceReferences]);
    setOrAppend(clinic, 'subjectOf', [policyReference, ...evidenceReferences]);
    setOrAppend(clinic, 'areaServed', [kermanshahReference, marketReference]);
    setOrAppend(clinic, 'audience', [audienceReference]);
  }

  for (const service of services) {
    const serviceNode = byId.get(officialServiceId(service));
    const pageNode = byId.get(servicePageId(service));
    const offerNode = byId.get(officialOfferId(service));
    const questionRefs = (service.faq || []).map((_, index) => ref(faqQuestionId(service, index)));
    const faqRefs = [ref(faqPageId(service)), ...questionRefs];
    const coreExpertise = ['aesthetic-medicine-consultation', 'patient-selection', 'natural-result-design', 'risk-communication', 'official-contact-path'].map((code) => ref(expertiseTermId(code)));

    if (serviceNode) {
      serviceNode.mainEntityOfPage = serviceNode.mainEntityOfPage || ref(servicePageId(service));
      serviceNode.provider = serviceNode.provider || ref(clinicId());
      serviceNode.availableAtOrFrom = serviceNode.availableAtOrFrom || ref(clinicId());
      setOrAppend(serviceNode, 'serviceArea', [kermanshahReference, marketReference]);
      setOrAppend(serviceNode, 'areaServed', [kermanshahReference, marketReference]);
      setOrAppend(serviceNode, 'audience', [audienceReference]);
      setOrAppend(serviceNode, 'hasPart', faqRefs);
      setOrAppend(serviceNode, 'subjectOf', [ref(servicePageId(service)), ref(faqPageId(service))]);
      setOrAppend(serviceNode, 'isRelatedTo', coreExpertise);
      setOrAppend(serviceNode, 'mentions', [ref(contactPointId()), ref(clinicId()), ref(physicianId()), ref(officialOfferCatalogId()), kermanshahReference, marketReference]);
    }

    if (pageNode) {
      setOrAppend(pageNode, 'hasPart', faqRefs);
      setOrAppend(pageNode, 'mentions', faqRefs);
    }

    if (offerNode) {
      offerNode.seller = offerNode.seller || ref(clinicId());
      offerNode.offeredBy = offerNode.offeredBy || ref(clinicId());
      offerNode.availableAtOrFrom = offerNode.availableAtOrFrom || ref(clinicId());
      setOrAppend(offerNode, 'areaServed', [kermanshahReference, marketReference]);
      offerNode.eligibleRegion = offerNode.eligibleRegion || { '@type': 'City', name: location.addressLocality || 'Kermanshah', addressCountry: location.addressCountry || site.country };
      offerNode.audience = offerNode.audience || audienceReference;
      offerNode.subjectOf = offerNode.subjectOf || ref(servicePageId(service));
    }
  }

  for (const [groupKey, , , categories] of aestheticGroups) {
    for (const concept of aestheticServiceConcepts.filter((item) => categories.includes(item.category))) {
      const conceptNode = byId.get(aestheticConceptId(concept));
      if (conceptNode) setOrAppend(conceptNode, 'isPartOf', [ref(groupId(groupKey))]);
    }
  }

  return nodes;
}
