import { absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';

function ref(path) {
  return { '@id': absoluteUrl(path) };
}

function ids(paths) {
  return paths.map(ref);
}

function compact(values = []) {
  return values.filter(Boolean);
}

function uniqueByKey(values = [], keyFn = refKey) {
  const seen = new Set();
  const out = [];
  for (const value of values.filter(Boolean)) {
    const key = keyFn(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function refKey(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value['@id'] || value.url || `${value.propertyID || ''}:${value.value || value.codeValue || ''}`;
  return String(value);
}

function refs(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function appendUnique(currentValue, additions = []) {
  return uniqueByKey([...refs(currentValue), ...additions]);
}

function pv(propertyID, value, url) {
  return {
    '@type': 'PropertyValue',
    propertyID,
    value,
    ...(url ? { url } : {})
  };
}

function mesh(value) {
  return pv('MeSH', value, `https://meshb.nlm.nih.gov/record/ui?ui=${value}`);
}

function wikidata(value) {
  return pv('Wikidata', value, `https://www.wikidata.org/wiki/${value}`);
}

function snomedIdentifier(value) {
  return pv('SNOMED CT', value);
}

function code(codingSystem, codeValue) {
  return {
    '@type': 'MedicalCode',
    codingSystem,
    codeValue
  };
}

function node(path, type, fields = {}) {
  return {
    '@id': absoluteUrl(path),
    '@type': type,
    ...fields
  };
}

export const medicalKnowledgeTermSetId = () => absoluteUrl('/kg/medical-knowledge#term-set');
export const dermatologyHairTermSetId = () => absoluteUrl('/kg/dermatology-hair#term-set');

const anatomySetPath = '/kg/anatomy#term-set';
const conditionSetPath = '/kg/medical-condition#term-set';
const procedureSetPath = '/kg/medical-procedure#term-set';
const materialSetPath = '/kg/medical-material#term-set';
const researchSetPath = '/kg/research#medical-term-set';
const localAuthoritySetPath = '/kg/local-authority#term-set';

const termSetDefinitions = [
  {
    path: '/kg/medical-knowledge#term-set',
    name: 'Physician-centered medical knowledge scope for Dr. Saeed Ghezelbash',
    alternateName: ['قلمرو دانش پزشکی دکتر سعید قزلباش', 'Clinical, dermatology, hair, aesthetic, research, safety and local authority ontology'],
    terms: [
      '/kg/medical-knowledge#dermatology',
      '/kg/medical-knowledge#aesthetic-medicine',
      '/kg/medical-knowledge#skin-care',
      '/kg/medical-knowledge#hair-care',
      '/kg/medical-knowledge#physician-led-assessment',
      '/kg/medical-knowledge#patient-selection',
      '/kg/research#evidence-based-aesthetic-medicine',
      '/kg/medical-knowledge#post-procedure-care',
      '/kg/medical-knowledge#contraindications-precautions'
    ]
  },
  {
    path: '/kg/dermatology-hair#term-set',
    name: 'Dermatology, skin, hair, scalp and aesthetic medicine ontology for Dr. Saeed Ghezelbash',
    alternateName: ['قلمرو پوست، مو و پزشکی زیبایی دکتر سعید قزلباش'],
    terms: [
      '/kg/medical-knowledge#dermatology',
      '/kg/medical-knowledge#skin-care',
      '/kg/medical-knowledge#hair-care',
      '/kg/medical-condition#alopecia',
      '/kg/medical-condition#acne-vulgaris',
      '/kg/medical-condition#hyperpigmentation',
      '/kg/medical-condition#skin-aging',
      '/kg/medical-condition#scar'
    ]
  },
  {
    path: anatomySetPath,
    name: 'Skin, hair and facial anatomy reference set',
    alternateName: ['مجموعه آناتومی پوست، مو و صورت'],
    terms: [
      '/kg/anatomy#skin',
      '/kg/anatomy#hair',
      '/kg/anatomy#hair-follicle',
      '/kg/anatomy#scalp',
      '/kg/anatomy#face',
      '/kg/anatomy#forehead',
      '/kg/anatomy#periocular-area',
      '/kg/anatomy#glabella',
      '/kg/anatomy#lips',
      '/kg/anatomy#cheek',
      '/kg/anatomy#chin',
      '/kg/anatomy#jawline',
      '/kg/anatomy#submental-region',
      '/kg/anatomy#nasolabial-fold',
      '/kg/anatomy#masseter-muscle',
      '/kg/anatomy#sebaceous-gland'
    ]
  },
  {
    path: conditionSetPath,
    name: 'Dermatology, hair, pigmentation, acne, aging, sweat, vascular, scar and contour condition set',
    alternateName: ['مجموعه وضعیت‌های پوست، مو، لک، آکنه، اسکار و کانتور'],
    terms: [
      '/kg/medical-condition#alopecia',
      '/kg/medical-condition#androgenetic-alopecia',
      '/kg/medical-condition#alopecia-areata',
      '/kg/medical-condition#telogen-effluvium',
      '/kg/medical-condition#hair-thinning',
      '/kg/medical-condition#dandruff',
      '/kg/medical-condition#seborrheic-dermatitis-scalp',
      '/kg/medical-condition#hyperpigmentation',
      '/kg/medical-condition#melasma',
      '/kg/medical-condition#hypopigmentation',
      '/kg/medical-condition#vitiligo',
      '/kg/medical-condition#periorbital-hyperpigmentation',
      '/kg/medical-condition#acne-vulgaris',
      '/kg/medical-condition#comedone',
      '/kg/medical-condition#inflammatory-acne',
      '/kg/medical-condition#acne-scar',
      '/kg/medical-condition#atrophic-acne-scar',
      '/kg/medical-condition#rolling-acne-scar',
      '/kg/medical-condition#post-inflammatory-hyperpigmentation',
      '/kg/medical-condition#skin-aging',
      '/kg/medical-condition#wrinkle',
      '/kg/medical-condition#dynamic-facial-lines',
      '/kg/medical-condition#static-facial-lines',
      '/kg/medical-condition#glabellar-lines',
      '/kg/medical-condition#forehead-lines',
      '/kg/medical-condition#crows-feet',
      '/kg/medical-condition#facial-volume-loss',
      '/kg/medical-condition#skin-laxity',
      '/kg/medical-condition#facial-ptosis-mild-moderate',
      '/kg/medical-condition#benign-skin-lesions',
      '/kg/medical-condition#seborrheic-keratosis',
      '/kg/medical-condition#enlarged-pores',
      '/kg/medical-condition#hyperhidrosis',
      '/kg/medical-condition#facial-erythema',
      '/kg/medical-condition#rosacea',
      '/kg/medical-condition#scar',
      '/kg/medical-condition#hypertrophic-scar',
      '/kg/medical-condition#keloid',
      '/kg/medical-process#wound-healing',
      '/kg/medical-condition#submental-fullness',
      '/kg/medical-condition#localized-submental-fat',
      '/kg/medical-condition#submental-skin-laxity'
    ]
  },
  {
    path: procedureSetPath,
    name: 'Aesthetic, dermatologic, regenerative, injectable, scar, thread lift and submental procedure set',
    alternateName: ['مجموعه روش‌های پزشکی زیبایی، تزریقی، بازساختی، اسکار، نخ و غبغب'],
    terms: [
      '/kg/medical-procedure#cosmetic-botulinum-toxin-injection',
      '/kg/medical-procedure#dermal-filler-injection',
      '/kg/medical-procedure#lip-filler-contouring',
      '/kg/medical-procedure#cheek-filler',
      '/kg/medical-procedure#chin-filler',
      '/kg/medical-procedure#jawline-filler-contouring',
      '/kg/medical-procedure#tear-trough-filler',
      '/kg/medical-therapy#platelet-rich-plasma',
      '/kg/medical-procedure#prp-hair-restoration',
      '/kg/medical-procedure#prp-skin-rejuvenation',
      '/kg/medical-procedure#mesotherapy',
      '/kg/medical-procedure#hair-mesotherapy',
      '/kg/medical-procedure#skin-mesotherapy',
      '/kg/medical-procedure#subcision',
      '/kg/medical-therapy#combined-acne-scar-treatment',
      '/kg/medical-procedure#thread-lift',
      '/kg/medical-procedure#jawline-thread-lift',
      '/kg/medical-procedure#eyebrow-thread-lift',
      '/kg/medical-procedure#temporal-thread-lift',
      '/kg/medical-procedure#submental-liposuction'
    ]
  },
  {
    path: materialSetPath,
    name: 'Aesthetic medicine drug, device and material reference set',
    alternateName: ['مجموعه دارو، وسیله و ماده در پزشکی زیبایی'],
    terms: [
      '/kg/drug#botulinum-toxin',
      '/kg/drug#hyaluronic-acid',
      '/kg/medical-therapy#hyaluronic-acid-filler',
      '/kg/medical-device#lifting-thread',
      '/kg/medical-device#cannula',
      '/kg/medical-therapy#local-anesthesia',
      '/kg/medical-knowledge#sunscreen'
    ]
  },
  {
    path: researchSetPath,
    name: 'Research literacy, scientific publication, clinical reasoning and risk communication set',
    alternateName: ['مجموعه سواد پژوهشی، انتشار علمی، استدلال بالینی و ارتباط ریسک'],
    terms: [
      '/kg/research#medical-research-literacy',
      '/kg/research#scientific-publication',
      '/kg/research#clinical-reasoning',
      '/kg/research#risk-communication',
      '/kg/research#evidence-based-aesthetic-medicine'
    ]
  },
  {
    path: localAuthoritySetPath,
    name: 'Kermanshah physician and aesthetic medical clinic authority set',
    alternateName: ['مجموعه اعتبار محلی پزشک و کلینیک پزشکی زیبایی در کرمانشاه'],
    terms: [
      '/kg/local-authority#kermanshah-physician',
      '/kg/local-authority#aesthetic-medical-clinic'
    ]
  }
];

const definedTerms = [
  {
    path: '/kg/medical-knowledge#dermatology',
    name: 'Dermatology',
    alternateName: ['درماتولوژی', 'پوست‌شناسی'],
    sameAs: ['https://www.wikidata.org/wiki/Q171171'],
    identifier: [mesh('D003880')],
    inSet: '/kg/medical-knowledge#term-set',
    related: ['/kg/anatomy#skin', '/kg/medical-condition#acne-vulgaris', '/kg/medical-condition#alopecia']
  },
  {
    path: '/kg/medical-knowledge#aesthetic-medicine',
    name: 'Aesthetic medicine',
    alternateName: ['پزشکی زیبایی'],
    sameAs: ['https://www.wikidata.org/wiki/Q3332453'],
    inSet: '/kg/medical-knowledge#term-set',
    related: ['/kg/medical-procedure#cosmetic-botulinum-toxin-injection', '/kg/medical-procedure#dermal-filler-injection', '/kg/medical-procedure#thread-lift']
  },
  {
    path: '/kg/medical-knowledge#skin-care',
    name: 'Skin care',
    alternateName: ['مراقبت پوست'],
    inSet: '/kg/medical-knowledge#term-set',
    related: ['/kg/anatomy#skin', '/kg/medical-condition#hyperpigmentation', '/kg/medical-condition#acne-vulgaris']
  },
  {
    path: '/kg/medical-knowledge#hair-care',
    name: 'Hair care',
    alternateName: ['مراقبت مو'],
    inSet: '/kg/medical-knowledge#term-set',
    related: ['/kg/anatomy#hair', '/kg/anatomy#hair-follicle', '/kg/medical-condition#alopecia']
  },
  {
    path: '/kg/medical-knowledge#physician-led-assessment',
    name: 'Physician-led assessment',
    alternateName: ['ارزیابی پزشک‌محور'],
    inSet: '/kg/medical-knowledge#term-set'
  },
  {
    path: '/kg/medical-knowledge#patient-selection',
    name: 'Patient selection',
    alternateName: ['انتخاب بیمار'],
    inSet: '/kg/medical-knowledge#term-set'
  },
  {
    path: '/kg/research#evidence-based-aesthetic-medicine',
    name: 'Evidence-based aesthetic medicine',
    alternateName: ['طب مبتنی بر شواهد زیبایی'],
    identifier: [wikidata('Q691640'), mesh('D019317')],
    inSet: researchSetPath,
    related: ['/kg/medical-knowledge#aesthetic-medicine', '/kg/research#medical-research-literacy']
  },
  {
    path: '/kg/medical-knowledge#post-procedure-care',
    name: 'Post-procedure care',
    alternateName: ['مراقبت بعد از اقدام'],
    inSet: '/kg/medical-knowledge#term-set'
  },
  {
    path: '/kg/medical-knowledge#contraindications-precautions',
    name: 'Contraindications and precautions',
    alternateName: ['منع مصرف و احتیاط'],
    inSet: '/kg/medical-knowledge#term-set'
  },
  {
    path: '/kg/research#medical-research-literacy',
    name: 'Medical research literacy',
    alternateName: ['سواد پژوهشی پزشکی'],
    inSet: researchSetPath
  },
  {
    path: '/kg/research#scientific-publication',
    name: 'Scientific publication',
    alternateName: ['انتشار علمی'],
    inSet: researchSetPath
  },
  {
    path: '/kg/research#clinical-reasoning',
    name: 'Clinical reasoning',
    alternateName: ['استدلال بالینی'],
    inSet: researchSetPath
  },
  {
    path: '/kg/research#risk-communication',
    name: 'Risk communication',
    alternateName: ['ارتباط ریسک با بیمار'],
    inSet: researchSetPath
  },
  {
    path: '/kg/local-authority#kermanshah-physician',
    name: 'Kermanshah physician',
    alternateName: ['پزشک محلی کرمانشاه'],
    inSet: localAuthoritySetPath
  },
  {
    path: '/kg/local-authority#aesthetic-medical-clinic',
    name: 'Aesthetic medical clinic',
    alternateName: ['کلینیک پزشکی زیبایی'],
    inSet: localAuthoritySetPath
  },
  {
    path: '/kg/medical-condition#dynamic-facial-lines',
    name: 'Dynamic facial lines',
    alternateName: ['خطوط دینامیک صورت'],
    inSet: conditionSetPath,
    related: ['/kg/medical-procedure#cosmetic-botulinum-toxin-injection']
  },
  {
    path: '/kg/medical-condition#static-facial-lines',
    name: 'Static facial lines',
    alternateName: ['خطوط ثابت صورت'],
    inSet: conditionSetPath,
    related: ['/kg/medical-condition#wrinkle', '/kg/medical-procedure#dermal-filler-injection']
  },
  {
    path: '/kg/medical-condition#enlarged-pores',
    name: 'Enlarged pores',
    alternateName: ['منافذ باز'],
    inSet: conditionSetPath,
    related: ['/kg/medical-knowledge#skin-care']
  },
  {
    path: '/kg/medical-knowledge#sunscreen',
    name: 'Sunscreen',
    alternateName: ['ضدآفتاب'],
    sameAs: ['https://www.wikidata.org/wiki/Q827658'],
    inSet: materialSetPath,
    related: ['/kg/medical-knowledge#skin-care', '/kg/medical-condition#hyperpigmentation']
  }
];

const anatomyNodes = [
  {
    path: '/kg/anatomy#skin',
    name: 'Skin',
    alternateName: ['پوست'],
    sameAs: ['https://www.wikidata.org/wiki/Q1074'],
    identifier: [mesh('D012867')],
    code: [code('SNOMED CT', '39937001')]
  },
  {
    path: '/kg/anatomy#hair',
    name: 'Hair',
    alternateName: ['مو'],
    sameAs: ['https://www.wikidata.org/wiki/Q28472'],
    identifier: [mesh('D006197')]
  },
  {
    path: '/kg/anatomy#hair-follicle',
    name: 'Hair follicle',
    alternateName: ['فولیکول مو'],
    sameAs: ['https://www.wikidata.org/wiki/Q866324'],
    identifier: [mesh('D018859')]
  },
  {
    path: '/kg/anatomy#scalp',
    name: 'Scalp',
    alternateName: ['پوست سر'],
    sameAs: ['https://www.wikidata.org/wiki/Q9622'],
    identifier: [mesh('D012535')],
    code: [code('SNOMED CT', '41695006')]
  },
  {
    path: '/kg/anatomy#face',
    name: 'Face',
    alternateName: ['صورت'],
    sameAs: ['https://www.wikidata.org/wiki/Q37017'],
    identifier: [mesh('D005145')],
    code: [code('SNOMED CT', '89545001')]
  },
  {
    path: '/kg/anatomy#forehead',
    name: 'Forehead',
    alternateName: ['پیشانی'],
    sameAs: ['https://www.wikidata.org/wiki/Q41055'],
    identifier: [mesh('D005546')]
  },
  {
    path: '/kg/anatomy#periocular-area',
    name: 'Periocular area',
    alternateName: ['ناحیه دور چشم'],
    identifier: [mesh('D005143'), snomedIdentifier('80243003')]
  },
  {
    path: '/kg/anatomy#glabella',
    name: 'Glabella',
    alternateName: ['گلابلا'],
    sameAs: ['https://www.wikidata.org/wiki/Q1075671'],
    identifier: [pv('FMA', '52851')]
  },
  {
    path: '/kg/anatomy#lips',
    name: 'Lips',
    alternateName: ['لب'],
    sameAs: ['https://www.wikidata.org/wiki/Q15173'],
    identifier: [mesh('D008046')]
  },
  {
    path: '/kg/anatomy#cheek',
    name: 'Cheek',
    alternateName: ['گونه'],
    sameAs: ['https://www.wikidata.org/wiki/Q47038'],
    identifier: [mesh('D002610')]
  },
  {
    path: '/kg/anatomy#chin',
    name: 'Chin',
    alternateName: ['چانه'],
    sameAs: ['https://www.wikidata.org/wiki/Q82714'],
    identifier: [mesh('D002680')]
  },
  {
    path: '/kg/anatomy#jawline',
    name: 'Jawline',
    alternateName: ['خط فک'],
    identifier: [mesh('D007568'), snomedIdentifier('91609006')]
  },
  {
    path: '/kg/anatomy#submental-region',
    name: 'Submental region',
    alternateName: ['زیر چانه', 'Submental triangle'],
    identifier: [wikidata('Q7631656')]
  },
  {
    path: '/kg/anatomy#nasolabial-fold',
    name: 'Nasolabial fold',
    alternateName: ['چین نازولبیال'],
    sameAs: ['https://www.wikidata.org/wiki/Q1425611'],
    identifier: [mesh('D060052')]
  },
  {
    path: '/kg/anatomy#masseter-muscle',
    name: 'Masseter muscle',
    alternateName: ['عضله ماستر'],
    sameAs: ['https://www.wikidata.org/wiki/Q725408'],
    identifier: [mesh('D008406')]
  },
  {
    path: '/kg/anatomy#sebaceous-gland',
    name: 'Sebaceous gland',
    alternateName: ['غده سباسه'],
    sameAs: ['https://www.wikidata.org/wiki/Q212328'],
    identifier: [mesh('D012627')]
  }
];

const conditionNodes = [
  {
    path: '/kg/medical-condition#alopecia',
    name: 'Alopecia',
    alternateName: ['ریزش مو', 'Hair loss'],
    identifier: [mesh('D000505')],
    code: [code('SNOMED CT', '56317004')],
    anatomy: ['/kg/anatomy#hair', '/kg/anatomy#hair-follicle', '/kg/anatomy#scalp'],
    possibleTreatment: ['/kg/medical-procedure#prp-hair-restoration', '/kg/medical-procedure#hair-mesotherapy']
  },
  {
    path: '/kg/medical-condition#androgenetic-alopecia',
    name: 'Androgenetic alopecia',
    alternateName: ['آلوپسی آندروژنتیک', 'Female pattern hair loss', 'Male pattern hair loss'],
    sameAs: ['https://www.wikidata.org/wiki/Q2276095'],
    identifier: [mesh('D000505')],
    code: [code('SNOMED CT', '87872006')],
    anatomy: ['/kg/anatomy#hair-follicle', '/kg/anatomy#scalp'],
    possibleTreatment: ['/kg/medical-procedure#prp-hair-restoration', '/kg/medical-procedure#hair-mesotherapy'],
    related: ['/kg/medical-condition#alopecia']
  },
  {
    path: '/kg/medical-condition#alopecia-areata',
    name: 'Alopecia areata',
    alternateName: ['آلوپسی آره‌آتا', 'ریزش موی سکه‌ای', 'Patchy hair loss'],
    sameAs: ['https://www.wikidata.org/wiki/Q5075435'],
    identifier: [mesh('D000506')],
    code: [code('SNOMED CT', '68225006')],
    anatomy: ['/kg/anatomy#hair', '/kg/anatomy#scalp'],
    related: ['/kg/medical-condition#alopecia']
  },
  {
    path: '/kg/medical-condition#telogen-effluvium',
    name: 'Telogen effluvium',
    alternateName: ['تلوژن افلوویوم'],
    sameAs: ['https://www.wikidata.org/wiki/Q26967'],
    anatomy: ['/kg/anatomy#hair', '/kg/anatomy#scalp'],
    related: ['/kg/medical-condition#alopecia']
  },
  {
    path: '/kg/medical-condition#hair-thinning',
    name: 'Hair thinning',
    alternateName: ['کم‌پشتی مو'],
    identifier: [mesh('D000505'), snomedIdentifier('56317004')],
    anatomy: ['/kg/anatomy#hair'],
    related: ['/kg/medical-condition#alopecia']
  },
  {
    path: '/kg/medical-condition#dandruff',
    name: 'Dandruff',
    alternateName: ['شوره سر'],
    sameAs: ['https://www.wikidata.org/wiki/Q117484'],
    code: [code('SNOMED CT', '200767005')],
    anatomy: ['/kg/anatomy#scalp'],
    related: ['/kg/medical-condition#seborrheic-dermatitis-scalp']
  },
  {
    path: '/kg/medical-condition#seborrheic-dermatitis-scalp',
    name: 'Seborrheic dermatitis of scalp',
    alternateName: ['درماتیت سبورئیک پوست سر'],
    identifier: [wikidata('Q448310'), mesh('D012536'), snomedIdentifier('50563003')],
    anatomy: ['/kg/anatomy#scalp', '/kg/anatomy#sebaceous-gland'],
    related: ['/kg/medical-condition#dandruff']
  },
  {
    path: '/kg/medical-condition#hyperpigmentation',
    name: 'Hyperpigmentation',
    alternateName: ['لک پوستی', 'Skin hyperpigmentation'],
    sameAs: ['https://www.wikidata.org/wiki/Q1641068'],
    identifier: [mesh('D017495')],
    code: [code('SNOMED CT', '49765009')],
    anatomy: ['/kg/anatomy#skin'],
    possibleTreatment: ['/kg/medical-knowledge#sunscreen']
  },
  {
    path: '/kg/medical-condition#melasma',
    name: 'Melasma',
    alternateName: ['ملاسما', 'Chloasma', 'کلواسما'],
    sameAs: ['https://www.wikidata.org/wiki/Q305190'],
    identifier: [mesh('D008548')],
    code: [code('SNOMED CT', '36209000')],
    anatomy: ['/kg/anatomy#skin', '/kg/anatomy#face'],
    related: ['/kg/medical-condition#hyperpigmentation']
  },
  {
    path: '/kg/medical-condition#hypopigmentation',
    name: 'Hypopigmentation',
    alternateName: ['هایپوپیگمنتیشن'],
    sameAs: ['https://www.wikidata.org/wiki/Q1291366'],
    identifier: [mesh('D017496')],
    anatomy: ['/kg/anatomy#skin']
  },
  {
    path: '/kg/medical-condition#vitiligo',
    name: 'Vitiligo',
    alternateName: ['ویتیلیگو'],
    sameAs: ['https://www.wikidata.org/wiki/Q180152'],
    identifier: [mesh('D014820')],
    code: [code('SNOMED CT', '56727007')],
    anatomy: ['/kg/anatomy#skin'],
    related: ['/kg/medical-condition#hypopigmentation']
  },
  {
    path: '/kg/medical-condition#periorbital-hyperpigmentation',
    name: 'Periorbital hyperpigmentation',
    alternateName: ['تیرگی زیر چشم'],
    identifier: [snomedIdentifier('49765009')],
    anatomy: ['/kg/anatomy#periocular-area', '/kg/anatomy#skin'],
    related: ['/kg/medical-condition#hyperpigmentation']
  },
  {
    path: '/kg/medical-condition#acne-vulgaris',
    name: 'Acne vulgaris',
    alternateName: ['آکنه ولگاریس', 'Acne'],
    sameAs: ['https://www.wikidata.org/wiki/Q79928'],
    identifier: [mesh('D000152')],
    code: [code('SNOMED CT', '11381005')],
    anatomy: ['/kg/anatomy#skin', '/kg/anatomy#sebaceous-gland'],
    possibleTreatment: ['/kg/medical-therapy#combined-acne-scar-treatment']
  },
  {
    path: '/kg/medical-condition#comedone',
    name: 'Comedone',
    alternateName: ['کومدون'],
    sameAs: ['https://www.wikidata.org/wiki/Q1146379'],
    anatomy: ['/kg/anatomy#skin', '/kg/anatomy#sebaceous-gland'],
    related: ['/kg/medical-condition#acne-vulgaris']
  },
  {
    path: '/kg/medical-condition#inflammatory-acne',
    name: 'Inflammatory acne',
    alternateName: ['آکنه التهابی'],
    identifier: [wikidata('Q79928'), mesh('D000152'), snomedIdentifier('11381005')],
    anatomy: ['/kg/anatomy#skin'],
    related: ['/kg/medical-condition#acne-vulgaris']
  },
  {
    path: '/kg/medical-condition#acne-scar',
    name: 'Acne scar',
    alternateName: ['جای جوش'],
    identifier: [wikidata('Q206060'), mesh('D002921'), snomedIdentifier('275322007')],
    anatomy: ['/kg/anatomy#skin'],
    possibleTreatment: ['/kg/medical-procedure#subcision', '/kg/medical-therapy#combined-acne-scar-treatment'],
    related: ['/kg/medical-condition#acne-vulgaris', '/kg/medical-condition#scar']
  },
  {
    path: '/kg/medical-condition#atrophic-acne-scar',
    name: 'Atrophic acne scar',
    alternateName: ['اسکار آتروفیک آکنه'],
    identifier: [wikidata('Q206060'), mesh('D002921'), snomedIdentifier('275322007')],
    anatomy: ['/kg/anatomy#skin'],
    possibleTreatment: ['/kg/medical-procedure#subcision', '/kg/medical-therapy#combined-acne-scar-treatment'],
    related: ['/kg/medical-condition#acne-scar']
  },
  {
    path: '/kg/medical-condition#rolling-acne-scar',
    name: 'Rolling acne scar',
    alternateName: ['اسکار رولینگ'],
    anatomy: ['/kg/anatomy#skin'],
    possibleTreatment: ['/kg/medical-procedure#subcision'],
    related: ['/kg/medical-condition#acne-scar']
  },
  {
    path: '/kg/medical-condition#post-inflammatory-hyperpigmentation',
    name: 'Post-inflammatory hyperpigmentation',
    alternateName: ['لک پس از التهاب'],
    identifier: [wikidata('Q1641068'), mesh('D017495'), snomedIdentifier('49765009')],
    anatomy: ['/kg/anatomy#skin'],
    related: ['/kg/medical-condition#hyperpigmentation', '/kg/medical-condition#acne-vulgaris']
  },
  {
    path: '/kg/medical-condition#skin-aging',
    name: 'Skin aging',
    alternateName: ['پیری پوست'],
    identifier: [wikidata('Q3705873'), mesh('D015595')],
    anatomy: ['/kg/anatomy#skin', '/kg/anatomy#face'],
    possibleTreatment: ['/kg/medical-procedure#cosmetic-botulinum-toxin-injection', '/kg/medical-procedure#dermal-filler-injection', '/kg/medical-procedure#thread-lift']
  },
  {
    path: '/kg/medical-condition#wrinkle',
    name: 'Wrinkle',
    alternateName: ['چروک پوست'],
    sameAs: ['https://www.wikidata.org/wiki/Q349185'],
    anatomy: ['/kg/anatomy#skin', '/kg/anatomy#face'],
    possibleTreatment: ['/kg/medical-procedure#cosmetic-botulinum-toxin-injection', '/kg/medical-procedure#dermal-filler-injection']
  },
  {
    path: '/kg/medical-condition#glabellar-lines',
    name: 'Glabellar lines',
    alternateName: ['خط اخم'],
    anatomy: ['/kg/anatomy#glabella', '/kg/anatomy#forehead'],
    possibleTreatment: ['/kg/medical-procedure#cosmetic-botulinum-toxin-injection'],
    related: ['/kg/medical-condition#dynamic-facial-lines', '/kg/medical-condition#wrinkle']
  },
  {
    path: '/kg/medical-condition#forehead-lines',
    name: 'Forehead lines',
    alternateName: ['خطوط پیشانی'],
    anatomy: ['/kg/anatomy#forehead'],
    possibleTreatment: ['/kg/medical-procedure#cosmetic-botulinum-toxin-injection'],
    related: ['/kg/medical-condition#dynamic-facial-lines', '/kg/medical-condition#wrinkle']
  },
  {
    path: '/kg/medical-condition#crows-feet',
    name: "Crow's feet",
    alternateName: ['چروک پنجه‌کلاغی', 'Lateral canthal lines'],
    anatomy: ['/kg/anatomy#periocular-area'],
    possibleTreatment: ['/kg/medical-procedure#cosmetic-botulinum-toxin-injection'],
    related: ['/kg/medical-condition#dynamic-facial-lines', '/kg/medical-condition#wrinkle']
  },
  {
    path: '/kg/medical-condition#facial-volume-loss',
    name: 'Facial volume loss',
    alternateName: ['کاهش حجم صورت'],
    anatomy: ['/kg/anatomy#face', '/kg/anatomy#cheek'],
    possibleTreatment: ['/kg/medical-procedure#dermal-filler-injection'],
    related: ['/kg/medical-condition#skin-aging']
  },
  {
    path: '/kg/medical-condition#skin-laxity',
    name: 'Skin laxity',
    alternateName: ['شلی پوست'],
    anatomy: ['/kg/anatomy#skin', '/kg/anatomy#face'],
    possibleTreatment: ['/kg/medical-procedure#thread-lift', '/kg/medical-procedure#submental-liposuction'],
    related: ['/kg/medical-condition#skin-aging']
  },
  {
    path: '/kg/medical-condition#facial-ptosis-mild-moderate',
    name: 'Mild-to-moderate facial ptosis',
    alternateName: ['افتادگی خفیف صورت'],
    anatomy: ['/kg/anatomy#face'],
    possibleTreatment: ['/kg/medical-procedure#thread-lift'],
    related: ['/kg/medical-condition#skin-laxity']
  },
  {
    path: '/kg/medical-condition#benign-skin-lesions',
    name: 'Benign skin lesions',
    alternateName: ['ضایعات خوش‌خیم پوستی'],
    anatomy: ['/kg/anatomy#skin'],
    related: ['/kg/medical-knowledge#dermatology']
  },
  {
    path: '/kg/medical-condition#seborrheic-keratosis',
    name: 'Seborrheic keratosis',
    alternateName: ['کراتوز سبورئیک'],
    sameAs: ['https://www.wikidata.org/wiki/Q2166371'],
    identifier: [mesh('D017492')],
    code: [code('SNOMED CT', '25499005')],
    anatomy: ['/kg/anatomy#skin'],
    related: ['/kg/medical-condition#benign-skin-lesions']
  },
  {
    path: '/kg/medical-condition#hyperhidrosis',
    name: 'Hyperhidrosis',
    alternateName: ['هایپرهیدروزیس', 'تعریق بیش از حد'],
    sameAs: ['https://www.wikidata.org/wiki/Q935781'],
    identifier: [mesh('D006945')],
    code: [code('SNOMED CT', '312230002')],
    possibleTreatment: ['/kg/medical-procedure#cosmetic-botulinum-toxin-injection']
  },
  {
    path: '/kg/medical-condition#facial-erythema',
    name: 'Facial erythema',
    alternateName: ['اریتم صورت'],
    anatomy: ['/kg/anatomy#face', '/kg/anatomy#skin'],
    related: ['/kg/medical-condition#rosacea']
  },
  {
    path: '/kg/medical-condition#rosacea',
    name: 'Rosacea',
    alternateName: ['روزاسه'],
    sameAs: ['https://www.wikidata.org/wiki/Q831530'],
    identifier: [mesh('D012393')],
    code: [code('SNOMED CT', '398909004')],
    anatomy: ['/kg/anatomy#face', '/kg/anatomy#skin'],
    related: ['/kg/medical-condition#facial-erythema']
  },
  {
    path: '/kg/medical-condition#scar',
    name: 'Scar',
    alternateName: ['اسکار'],
    sameAs: ['https://www.wikidata.org/wiki/Q206060'],
    identifier: [mesh('D002921')],
    code: [code('SNOMED CT', '275322007')],
    anatomy: ['/kg/anatomy#skin'],
    possibleTreatment: ['/kg/medical-therapy#combined-acne-scar-treatment']
  },
  {
    path: '/kg/medical-condition#hypertrophic-scar',
    name: 'Hypertrophic scar',
    alternateName: ['اسکار هیپرتروفیک'],
    sameAs: ['https://www.wikidata.org/wiki/Q1641147'],
    identifier: [mesh('D017439')],
    code: [code('SNOMED CT', '19843006')],
    anatomy: ['/kg/anatomy#skin'],
    related: ['/kg/medical-condition#scar']
  },
  {
    path: '/kg/medical-condition#keloid',
    name: 'Keloid',
    alternateName: ['کلوئید'],
    sameAs: ['https://www.wikidata.org/wiki/Q1131260'],
    identifier: [mesh('D007627')],
    code: [code('SNOMED CT', '33659008')],
    anatomy: ['/kg/anatomy#skin'],
    related: ['/kg/medical-condition#scar']
  },
  {
    path: '/kg/medical-condition#submental-fullness',
    name: 'Submental fullness',
    alternateName: ['غبغب', 'Double chin'],
    anatomy: ['/kg/anatomy#submental-region', '/kg/anatomy#chin'],
    possibleTreatment: ['/kg/medical-procedure#submental-liposuction'],
    related: ['/kg/medical-condition#localized-submental-fat', '/kg/medical-condition#submental-skin-laxity']
  },
  {
    path: '/kg/medical-condition#localized-submental-fat',
    name: 'Localized submental fat',
    alternateName: ['چربی زیر چانه'],
    anatomy: ['/kg/anatomy#submental-region'],
    possibleTreatment: ['/kg/medical-procedure#submental-liposuction'],
    related: ['/kg/medical-condition#submental-fullness']
  },
  {
    path: '/kg/medical-condition#submental-skin-laxity',
    name: 'Submental skin laxity',
    alternateName: ['شلی پوست زیر چانه'],
    anatomy: ['/kg/anatomy#submental-region', '/kg/anatomy#skin'],
    possibleTreatment: ['/kg/medical-procedure#thread-lift'],
    related: ['/kg/medical-condition#skin-laxity', '/kg/medical-condition#submental-fullness']
  }
];

const medicalEntityNodes = [
  {
    path: '/kg/medical-process#wound-healing',
    type: 'MedicalEntity',
    name: 'Wound healing',
    alternateName: ['ترمیم زخم'],
    identifier: [mesh('D014945')],
    related: ['/kg/medical-condition#scar', '/kg/medical-therapy#platelet-rich-plasma']
  },
  {
    path: '/kg/drug#botulinum-toxin',
    type: 'Drug',
    name: 'Botulinum toxin',
    alternateName: ['بوتولینوم توکسین', 'Botulinum toxin type A'],
    sameAs: ['https://www.wikidata.org/wiki/Q208413'],
    identifier: [mesh('D019274')],
    code: [code('SNOMED CT', '372597009')],
    related: ['/kg/medical-procedure#cosmetic-botulinum-toxin-injection']
  },
  {
    path: '/kg/drug#hyaluronic-acid',
    type: 'Drug',
    name: 'Hyaluronic acid',
    alternateName: ['هیالورونیک اسید'],
    sameAs: ['https://www.wikidata.org/wiki/Q337231'],
    identifier: [mesh('D006820')],
    related: ['/kg/medical-therapy#hyaluronic-acid-filler']
  },
  {
    path: '/kg/medical-therapy#hyaluronic-acid-filler',
    type: 'MedicalTherapy',
    name: 'Hyaluronic acid filler',
    alternateName: ['فیلر هیالورونیک اسید', 'Dermal filler material'],
    identifier: [wikidata('Q337231'), mesh('D000067548'), mesh('D006820')],
    related: ['/kg/drug#hyaluronic-acid', '/kg/medical-procedure#dermal-filler-injection']
  },
  {
    path: '/kg/medical-therapy#platelet-rich-plasma',
    type: 'MedicalTherapy',
    name: 'Platelet-rich plasma',
    alternateName: ['PRP', 'پی‌آرپی', 'پلاسمای غنی از پلاکت'],
    sameAs: ['https://www.wikidata.org/wiki/Q613879'],
    identifier: [mesh('D053657')],
    related: ['/kg/medical-procedure#prp-hair-restoration', '/kg/medical-procedure#prp-skin-rejuvenation', '/kg/medical-process#wound-healing']
  },
  {
    path: '/kg/medical-therapy#combined-acne-scar-treatment',
    type: 'MedicalTherapy',
    name: 'Combined acne scar treatment',
    alternateName: ['درمان ترکیبی اسکار آکنه'],
    related: ['/kg/medical-condition#acne-scar', '/kg/medical-procedure#subcision']
  },
  {
    path: '/kg/medical-therapy#local-anesthesia',
    type: 'MedicalTherapy',
    name: 'Local anesthesia',
    alternateName: ['بی‌حسی موضعی'],
    identifier: [mesh('D000772')],
    code: [code('SNOMED CT', '386761002')],
    related: ['/kg/medical-procedure#dermal-filler-injection', '/kg/medical-procedure#submental-liposuction']
  },
  {
    path: '/kg/medical-device#lifting-thread',
    type: 'MedicalDevice',
    name: 'Lifting thread',
    alternateName: ['نخ لیفت'],
    related: ['/kg/medical-procedure#thread-lift']
  },
  {
    path: '/kg/medical-device#cannula',
    type: 'MedicalDevice',
    name: 'Cannula',
    alternateName: ['کانولا'],
    related: ['/kg/medical-procedure#dermal-filler-injection', '/kg/medical-procedure#submental-liposuction']
  }
];

const procedureNodes = [
  {
    path: '/kg/medical-procedure#cosmetic-botulinum-toxin-injection',
    type: 'MedicalProcedure',
    name: 'Cosmetic botulinum toxin injection',
    alternateName: ['تزریق بوتاکس زیبایی', 'Botox injection'],
    identifier: [wikidata('Q4095199'), mesh('D019274'), snomedIdentifier('372597009')],
    bodyLocation: ['/kg/anatomy#face', '/kg/anatomy#forehead', '/kg/anatomy#glabella', '/kg/anatomy#periocular-area'],
    related: ['/kg/drug#botulinum-toxin', '/kg/medical-condition#dynamic-facial-lines', '/kg/medical-condition#hyperhidrosis']
  },
  {
    path: '/kg/medical-procedure#dermal-filler-injection',
    type: 'MedicalProcedure',
    name: 'Dermal filler injection',
    alternateName: ['تزریق فیلر پوستی'],
    identifier: [wikidata('Q3745388'), mesh('D000067548')],
    bodyLocation: ['/kg/anatomy#face', '/kg/anatomy#lips', '/kg/anatomy#cheek', '/kg/anatomy#chin', '/kg/anatomy#jawline'],
    related: ['/kg/medical-therapy#hyaluronic-acid-filler', '/kg/medical-condition#facial-volume-loss']
  },
  {
    path: '/kg/medical-procedure#lip-filler-contouring',
    type: 'MedicalProcedure',
    name: 'Lip filler contouring',
    alternateName: ['کانتورینگ لب با فیلر', 'Lip filler'],
    identifier: [mesh('D000067548')],
    bodyLocation: ['/kg/anatomy#lips'],
    related: ['/kg/medical-procedure#dermal-filler-injection']
  },
  {
    path: '/kg/medical-procedure#cheek-filler',
    type: 'MedicalProcedure',
    name: 'Cheek filler',
    alternateName: ['فیلر گونه'],
    identifier: [mesh('D000067548')],
    bodyLocation: ['/kg/anatomy#cheek'],
    related: ['/kg/medical-procedure#dermal-filler-injection']
  },
  {
    path: '/kg/medical-procedure#chin-filler',
    type: 'MedicalProcedure',
    name: 'Chin filler',
    alternateName: ['فیلر چانه'],
    identifier: [mesh('D000067548')],
    bodyLocation: ['/kg/anatomy#chin'],
    related: ['/kg/medical-procedure#dermal-filler-injection']
  },
  {
    path: '/kg/medical-procedure#jawline-filler-contouring',
    type: 'MedicalProcedure',
    name: 'Jawline filler contouring',
    alternateName: ['زاویه‌سازی فک با فیلر', 'Jawline filler'],
    identifier: [mesh('D000067548')],
    bodyLocation: ['/kg/anatomy#jawline'],
    related: ['/kg/medical-procedure#dermal-filler-injection']
  },
  {
    path: '/kg/medical-procedure#tear-trough-filler',
    type: 'MedicalProcedure',
    name: 'Tear trough filler',
    alternateName: ['فیلر زیر چشم'],
    identifier: [mesh('D000067548')],
    bodyLocation: ['/kg/anatomy#periocular-area'],
    related: ['/kg/medical-procedure#dermal-filler-injection']
  },
  {
    path: '/kg/medical-procedure#prp-hair-restoration',
    type: 'MedicalProcedure',
    name: 'PRP hair restoration',
    alternateName: ['پی‌آرپی مو'],
    identifier: [wikidata('Q613879'), mesh('D053657')],
    bodyLocation: ['/kg/anatomy#scalp', '/kg/anatomy#hair-follicle'],
    related: ['/kg/medical-therapy#platelet-rich-plasma', '/kg/medical-condition#alopecia']
  },
  {
    path: '/kg/medical-procedure#prp-skin-rejuvenation',
    type: 'MedicalProcedure',
    name: 'PRP skin rejuvenation',
    alternateName: ['پی‌آرپی پوست'],
    identifier: [wikidata('Q613879'), mesh('D053657')],
    bodyLocation: ['/kg/anatomy#skin', '/kg/anatomy#face'],
    related: ['/kg/medical-therapy#platelet-rich-plasma', '/kg/medical-condition#skin-aging']
  },
  {
    path: '/kg/medical-procedure#mesotherapy',
    type: 'MedicalProcedure',
    name: 'Mesotherapy',
    alternateName: ['مزوتراپی'],
    sameAs: ['https://www.wikidata.org/wiki/Q537918'],
    identifier: [mesh('D057748')],
    bodyLocation: ['/kg/anatomy#skin', '/kg/anatomy#scalp'],
    related: ['/kg/medical-procedure#hair-mesotherapy', '/kg/medical-procedure#skin-mesotherapy']
  },
  {
    path: '/kg/medical-procedure#hair-mesotherapy',
    type: 'MedicalProcedure',
    name: 'Hair mesotherapy',
    alternateName: ['مزوتراپی مو'],
    identifier: [wikidata('Q537918')],
    bodyLocation: ['/kg/anatomy#scalp', '/kg/anatomy#hair-follicle'],
    related: ['/kg/medical-procedure#mesotherapy', '/kg/medical-condition#alopecia']
  },
  {
    path: '/kg/medical-procedure#skin-mesotherapy',
    type: 'MedicalProcedure',
    name: 'Skin mesotherapy',
    alternateName: ['مزوتراپی پوست'],
    identifier: [wikidata('Q537918')],
    bodyLocation: ['/kg/anatomy#skin'],
    related: ['/kg/medical-procedure#mesotherapy', '/kg/medical-condition#skin-aging']
  },
  {
    path: '/kg/medical-procedure#subcision',
    type: 'MedicalProcedure',
    name: 'Subcision',
    alternateName: ['سابسیژن'],
    bodyLocation: ['/kg/anatomy#skin'],
    related: ['/kg/medical-condition#acne-scar', '/kg/medical-condition#rolling-acne-scar']
  },
  {
    path: '/kg/medical-procedure#thread-lift',
    type: 'MedicalProcedure',
    name: 'Thread lift',
    alternateName: ['لیفت با نخ'],
    bodyLocation: ['/kg/anatomy#face', '/kg/anatomy#jawline'],
    related: ['/kg/medical-device#lifting-thread', '/kg/medical-condition#skin-laxity', '/kg/medical-condition#facial-ptosis-mild-moderate']
  },
  {
    path: '/kg/medical-procedure#jawline-thread-lift',
    type: 'MedicalProcedure',
    name: 'Jawline thread lift',
    alternateName: ['لیفت خط فک با نخ'],
    bodyLocation: ['/kg/anatomy#jawline'],
    related: ['/kg/medical-procedure#thread-lift']
  },
  {
    path: '/kg/medical-procedure#eyebrow-thread-lift',
    type: 'MedicalProcedure',
    name: 'Eyebrow thread lift',
    alternateName: ['لیفت ابرو با نخ'],
    bodyLocation: ['/kg/anatomy#periocular-area', '/kg/anatomy#forehead'],
    related: ['/kg/medical-procedure#thread-lift']
  },
  {
    path: '/kg/medical-procedure#temporal-thread-lift',
    type: 'MedicalProcedure',
    name: 'Temporal thread lift',
    alternateName: ['لیفت شقیقه با نخ'],
    bodyLocation: ['/kg/anatomy#face'],
    related: ['/kg/medical-procedure#thread-lift']
  },
  {
    path: '/kg/medical-procedure#submental-liposuction',
    type: 'MedicalProcedure',
    name: 'Submental liposuction',
    alternateName: ['ساکشن غبغب'],
    bodyLocation: ['/kg/anatomy#submental-region', '/kg/anatomy#chin'],
    related: ['/kg/medical-condition#submental-fullness', '/kg/medical-condition#localized-submental-fat', '/kg/medical-device#cannula']
  }
];

const allConceptPaths = uniqueByKey([
  ...termSetDefinitions.flatMap((set) => set.terms),
  ...definedTerms.map((item) => item.path),
  ...anatomyNodes.map((item) => item.path),
  ...conditionNodes.map((item) => item.path),
  ...medicalEntityNodes.map((item) => item.path),
  ...procedureNodes.map((item) => item.path)
], (value) => value);

const keyMedicalKnowledgePaths = [
  '/kg/medical-knowledge#term-set',
  '/kg/dermatology-hair#term-set',
  '/kg/medical-knowledge#dermatology',
  '/kg/medical-knowledge#aesthetic-medicine',
  '/kg/medical-knowledge#skin-care',
  '/kg/medical-knowledge#hair-care',
  '/kg/medical-condition#acne-vulgaris',
  '/kg/medical-condition#acne-scar',
  '/kg/medical-condition#alopecia',
  '/kg/medical-condition#hyperpigmentation',
  '/kg/medical-condition#melasma',
  '/kg/medical-condition#skin-aging',
  '/kg/medical-condition#hyperhidrosis',
  '/kg/medical-procedure#cosmetic-botulinum-toxin-injection',
  '/kg/medical-procedure#dermal-filler-injection',
  '/kg/medical-therapy#platelet-rich-plasma',
  '/kg/medical-procedure#thread-lift',
  '/kg/medical-procedure#submental-liposuction',
  '/kg/research#medical-research-literacy',
  '/kg/local-authority#kermanshah-physician'
];

const serviceOntologyLinks = {
  botox: [
    '/kg/medical-procedure#cosmetic-botulinum-toxin-injection',
    '/kg/drug#botulinum-toxin',
    '/kg/medical-condition#dynamic-facial-lines',
    '/kg/medical-condition#glabellar-lines',
    '/kg/medical-condition#forehead-lines',
    '/kg/medical-condition#crows-feet',
    '/kg/medical-condition#hyperhidrosis',
    '/kg/anatomy#forehead',
    '/kg/anatomy#glabella',
    '/kg/anatomy#periocular-area'
  ],
  filler: [
    '/kg/medical-procedure#dermal-filler-injection',
    '/kg/medical-therapy#hyaluronic-acid-filler',
    '/kg/drug#hyaluronic-acid',
    '/kg/medical-procedure#lip-filler-contouring',
    '/kg/medical-procedure#cheek-filler',
    '/kg/medical-procedure#chin-filler',
    '/kg/medical-procedure#jawline-filler-contouring',
    '/kg/medical-procedure#tear-trough-filler',
    '/kg/medical-condition#facial-volume-loss',
    '/kg/anatomy#lips',
    '/kg/anatomy#cheek',
    '/kg/anatomy#chin',
    '/kg/anatomy#jawline',
    '/kg/anatomy#nasolabial-fold'
  ],
  'thread-lift': [
    '/kg/medical-procedure#thread-lift',
    '/kg/medical-procedure#jawline-thread-lift',
    '/kg/medical-procedure#eyebrow-thread-lift',
    '/kg/medical-procedure#temporal-thread-lift',
    '/kg/medical-device#lifting-thread',
    '/kg/medical-condition#skin-laxity',
    '/kg/medical-condition#facial-ptosis-mild-moderate',
    '/kg/anatomy#face',
    '/kg/anatomy#jawline'
  ],
  rejuvenation: [
    '/kg/medical-condition#acne-vulgaris',
    '/kg/medical-condition#acne-scar',
    '/kg/medical-condition#atrophic-acne-scar',
    '/kg/medical-condition#rolling-acne-scar',
    '/kg/medical-condition#hyperpigmentation',
    '/kg/medical-condition#melasma',
    '/kg/medical-condition#post-inflammatory-hyperpigmentation',
    '/kg/medical-condition#alopecia',
    '/kg/medical-condition#androgenetic-alopecia',
    '/kg/medical-therapy#platelet-rich-plasma',
    '/kg/medical-procedure#prp-hair-restoration',
    '/kg/medical-procedure#prp-skin-rejuvenation',
    '/kg/medical-procedure#mesotherapy',
    '/kg/medical-procedure#hair-mesotherapy',
    '/kg/medical-procedure#skin-mesotherapy',
    '/kg/medical-procedure#subcision',
    '/kg/medical-therapy#combined-acne-scar-treatment',
    '/kg/medical-process#wound-healing'
  ],
  'double-chin': [
    '/kg/medical-procedure#submental-liposuction',
    '/kg/medical-condition#submental-fullness',
    '/kg/medical-condition#localized-submental-fat',
    '/kg/medical-condition#submental-skin-laxity',
    '/kg/anatomy#submental-region',
    '/kg/anatomy#chin',
    '/kg/anatomy#jawline',
    '/kg/medical-device#cannula'
  ]
};

function buildDefinedTermSet(definition) {
  return node(definition.path, 'DefinedTermSet', {
    name: definition.name,
    alternateName: definition.alternateName,
    inLanguage: ['fa-IR', 'en'],
    about: ids([
      '/#dr-saeed-ghezelbash',
      '/#physician',
      '/#clinic'
    ]),
    hasDefinedTerm: ids(definition.terms)
  });
}

function buildDefinedTerm(definition) {
  return node(definition.path, 'DefinedTerm', {
    name: definition.name,
    alternateName: definition.alternateName,
    termCode: definition.path.split('#').pop(),
    inDefinedTermSet: ref(definition.inSet),
    isPartOf: ref(definition.inSet),
    ...(definition.sameAs ? { sameAs: definition.sameAs } : {}),
    ...(definition.identifier ? { identifier: definition.identifier } : {}),
    ...(definition.related ? { isRelatedTo: ids(definition.related) } : {})
  });
}

function buildAnatomicalStructure(definition) {
  return node(definition.path, 'AnatomicalStructure', {
    name: definition.name,
    alternateName: definition.alternateName,
    ...(definition.sameAs ? { sameAs: definition.sameAs } : {}),
    ...(definition.identifier ? { identifier: definition.identifier } : {}),
    ...(definition.code ? { code: definition.code } : {}),
    isPartOf: ref(anatomySetPath)
  });
}

function buildMedicalCondition(definition) {
  return node(definition.path, 'MedicalCondition', {
    name: definition.name,
    alternateName: definition.alternateName,
    ...(definition.sameAs ? { sameAs: definition.sameAs } : {}),
    ...(definition.identifier ? { identifier: definition.identifier } : {}),
    ...(definition.code ? { code: definition.code } : {}),
    ...(definition.anatomy ? { associatedAnatomy: ids(definition.anatomy) } : {}),
    ...(definition.possibleTreatment ? { possibleTreatment: ids(definition.possibleTreatment) } : {}),
    ...(definition.related ? { isRelatedTo: ids(definition.related) } : {}),
    relevantSpecialty: 'https://schema.org/Dermatologic'
  });
}

function buildMedicalEntity(definition) {
  return node(definition.path, definition.type, {
    name: definition.name,
    alternateName: definition.alternateName,
    ...(definition.sameAs ? { sameAs: definition.sameAs } : {}),
    ...(definition.identifier ? { identifier: definition.identifier } : {}),
    ...(definition.code ? { code: definition.code } : {}),
    ...(definition.related ? { isRelatedTo: ids(definition.related) } : {}),
    relevantSpecialty: 'https://schema.org/Dermatologic'
  });
}

function buildMedicalProcedure(definition) {
  return node(definition.path, definition.type, {
    name: definition.name,
    alternateName: definition.alternateName,
    ...(definition.sameAs ? { sameAs: definition.sameAs } : {}),
    ...(definition.identifier ? { identifier: definition.identifier } : {}),
    ...(definition.code ? { code: definition.code } : {}),
    ...(definition.bodyLocation ? { bodyLocation: ids(definition.bodyLocation) } : {}),
    ...(definition.related ? { isRelatedTo: ids(definition.related) } : {}),
    relevantSpecialty: 'https://schema.org/Dermatologic'
  });
}

export function medicalKnowledgeReferences(paths = keyMedicalKnowledgePaths) {
  return ids(paths);
}

export function medicalOntologyNodeReferences() {
  return ids(allConceptPaths);
}

export function serviceMedicalOntologyReferences(serviceKey) {
  return ids(serviceOntologyLinks[serviceKey] || []);
}

export function buildMedicalKnowledgeGraphNodes() {
  return [
    ...termSetDefinitions.map(buildDefinedTermSet),
    ...definedTerms.map(buildDefinedTerm),
    ...anatomyNodes.map(buildAnatomicalStructure),
    ...conditionNodes.map(buildMedicalCondition),
    ...medicalEntityNodes.map(buildMedicalEntity),
    ...procedureNodes.map(buildMedicalProcedure)
  ];
}

export function approvedMedicalOntologySameAsUrls() {
  return [
    ...definedTerms.flatMap((item) => item.sameAs || []),
    ...anatomyNodes.flatMap((item) => item.sameAs || []),
    ...conditionNodes.flatMap((item) => item.sameAs || []),
    ...medicalEntityNodes.flatMap((item) => item.sameAs || []),
    ...procedureNodes.flatMap((item) => item.sameAs || [])
  ];
}

export function approvedMedicalOntologyCodePairs() {
  return [
    ...anatomyNodes,
    ...conditionNodes,
    ...medicalEntityNodes,
    ...procedureNodes
  ].flatMap((item) => (item.code || []).map((itemCode) => ({
    entity: absoluteUrl(item.path),
    codingSystem: itemCode.codingSystem,
    codeValue: itemCode.codeValue
  })));
}

export function serviceMedicalOntologyLinkMap() {
  return Object.fromEntries(
    Object.entries(serviceOntologyLinks).map(([key, linkedPaths]) => [
      key,
      linkedPaths.map((linkedPath) => absoluteUrl(linkedPath))
    ])
  );
}

export function applyMedicalKnowledgeGraph(nodes) {
  const byId = new Map(nodes.map((item) => [item['@id'], item]).filter(([id]) => Boolean(id)));
  const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
  const physician = byId.get(absoluteUrl('/#physician'));
  const clinic = byId.get(absoluteUrl('/#clinic'));
  const website = byId.get(absoluteUrl('/#website'));
  const dataset = byId.get(absoluteUrl('/kg/#dataset'));

  for (const entity of [person, physician].filter(Boolean)) {
    entity.knowsAbout = appendUnique(entity.knowsAbout, medicalKnowledgeReferences());
    entity.subjectOf = appendUnique(entity.subjectOf, [ref('/kg/medical-knowledge#term-set'), ref('/kg/dermatology-hair#term-set')]);
  }

  if (clinic) {
    clinic.knowsAbout = appendUnique(clinic.knowsAbout, medicalKnowledgeReferences([
      '/kg/medical-knowledge#aesthetic-medicine',
      '/kg/medical-knowledge#dermatology',
      '/kg/medical-knowledge#skin-care',
      '/kg/medical-knowledge#hair-care',
      '/kg/local-authority#aesthetic-medical-clinic'
    ]));
    clinic.mentions = appendUnique(clinic.mentions, medicalKnowledgeReferences([
      '/kg/medical-knowledge#term-set',
      '/kg/dermatology-hair#term-set',
      '/kg/local-authority#kermanshah-physician'
    ]));
  }

  if (website) {
    website.about = appendUnique(website.about, medicalKnowledgeReferences([
      '/kg/medical-knowledge#term-set',
      '/kg/dermatology-hair#term-set',
      '/kg/medical-knowledge#aesthetic-medicine',
      '/kg/medical-knowledge#dermatology'
    ]));
    website.hasPart = appendUnique(website.hasPart, [ref('/kg/medical-knowledge#term-set'), ref('/kg/dermatology-hair#term-set')]);
  }

  if (dataset) {
    dataset.about = appendUnique(dataset.about, medicalKnowledgeReferences());
    dataset.mentions = appendUnique(dataset.mentions, medicalOntologyNodeReferences());
    dataset.hasPart = appendUnique(dataset.hasPart, [
      ref('/kg/medical-knowledge#term-set'),
      ref('/kg/dermatology-hair#term-set'),
      ref(anatomySetPath),
      ref(conditionSetPath),
      ref(procedureSetPath),
      ref(materialSetPath),
      ref(researchSetPath),
      ref(localAuthoritySetPath),
      ...medicalOntologyNodeReferences()
    ]);
  }

  for (const service of services) {
    const serviceNode = byId.get(absoluteUrl(`/${service.slug}/#service`));
    const pageNode = byId.get(absoluteUrl(`/${service.slug}/#webpage`));
    const links = serviceMedicalOntologyReferences(service.key);
    if (!links.length) continue;

    if (serviceNode) {
      serviceNode.isRelatedTo = appendUnique(serviceNode.isRelatedTo, links);
      serviceNode.about = appendUnique(serviceNode.about, links);
      serviceNode.mentions = appendUnique(serviceNode.mentions, links);
      serviceNode.category = appendUnique(serviceNode.category, links);
    }

    if (pageNode) {
      pageNode.about = appendUnique(pageNode.about, links);
      pageNode.mentions = appendUnique(pageNode.mentions, links);
    }
  }

  return nodes;
}
