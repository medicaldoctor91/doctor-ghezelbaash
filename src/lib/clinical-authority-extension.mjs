/**
 * Evidence-bounded clinical authority extension for the physician entity.
 * Every new skill/topic is mapped to an already-authored clinical Service.
 * The labels describe self-declared knowledge or competence; they do not imply
 * independently verified credentials, results or an officially recognized specialty.
 */
const values = value => value == null ? [] : Array.isArray(value) ? value : [value];
const ref = id => ({'@id': id});
const originSlug = (origin, slug) => origin + '/' + slug;
const relatedService = (origin, slug) => ref(originSlug(origin, slug));

const skillRows = [
  [
    "glabellar-botulinum-injection",
    "Glabellar botulinum toxin injection",
    "procedure-botox-glabella"
  ],
  [
    "forehead-botulinum-injection",
    "Forehead botulinum toxin injection",
    "procedure-botox-forehead"
  ],
  [
    "periocular-botulinum-injection",
    "Periocular botulinum toxin targeting",
    "procedure-botox-crows-feet"
  ],
  [
    "brow-elevation-botulinum",
    "Botulinum toxin brow elevation planning",
    "procedure-botox-brow-lift"
  ],
  [
    "gummy-smile-botulinum",
    "Gummy smile treatment with botulinum toxin",
    "procedure-botox-gummy-smile"
  ],
  [
    "lip-flip-botulinum",
    "Perioral lip-flip injection technique",
    "procedure-botox-lip-flip"
  ],
  [
    "masseter-botulinum",
    "Masseter botulinum toxin treatment planning",
    "procedure-botox-masseter"
  ],
  [
    "hyperhidrosis-botulinum",
    "Focal hyperhidrosis botulinum toxin treatment",
    "procedure-botox-hyperhidrosis"
  ],
  [
    "lower-face-botulinum",
    "Lower-face muscular injection planning",
    "procedure-botox-chin-dao"
  ],
  [
    "platysma-botulinum",
    "Platysma and neck band treatment planning",
    "procedure-botox-platysma-neck"
  ],
  [
    "bunny-line-botulinum",
    "Bunny-line botulinum toxin injection",
    "procedure-botox-bunny-lines"
  ],
  [
    "nefertiti-neck-botulinum",
    "Nefertiti neck contour injection planning",
    "procedure-botulinum-toxin-nefertiti-lift"
  ],
  [
    "trapezius-botulinum",
    "Trapezius botulinum toxin treatment planning",
    "procedure-botulinum-toxin-trapezius"
  ],
  [
    "palmar-hyperhidrosis-injection",
    "Palmar hyperhidrosis injection planning",
    "procedure-botulinum-toxin-palmar-hyperhidrosis"
  ],
  [
    "plantar-hyperhidrosis-injection",
    "Plantar hyperhidrosis injection planning",
    "procedure-botulinum-toxin-plantar-hyperhidrosis"
  ],
  [
    "axillary-hyperhidrosis-injection",
    "Axillary hyperhidrosis injection planning",
    "procedure-botulinum-toxin-axillary-hyperhidrosis"
  ],
  [
    "lip-volume-and-shape-injection",
    "Lip filler placement and aesthetic proportion assessment",
    "procedure-filler-lips"
  ],
  [
    "tear-trough-filler-candidacy",
    "Tear trough filler candidacy and risk assessment",
    "procedure-filler-under-eye"
  ],
  [
    "midface-filler-volume",
    "Midface and cheek volumization with dermal filler",
    "procedure-filler-cheek"
  ],
  [
    "chin-filler-shaping",
    "Chin augmentation with dermal filler",
    "procedure-filler-chin"
  ],
  [
    "jawline-filler-contouring",
    "Jawline contouring with dermal filler",
    "procedure-filler-jawline"
  ],
  [
    "nasolabial-filler-placement",
    "Nasolabial fold filler planning",
    "procedure-filler-nasolabial"
  ],
  [
    "temple-filler-risk-assessment",
    "Temporal hollowing filler candidacy assessment",
    "procedure-filler-temple"
  ],
  [
    "nose-filler-risk-assessment",
    "Nasal filler risk and candidate assessment",
    "procedure-filler-nose"
  ],
  [
    "hand-filler-rejuvenation",
    "Hand dermal filler rejuvenation",
    "procedure-filler-hand"
  ],
  [
    "lip-asymmetry-filler-revision",
    "Lip filler asymmetry assessment and correction",
    "procedure-lip-filler-asymmetry-correction"
  ],
  [
    "atrophic-scar-filler",
    "Filler treatment planning for atrophic acne scars",
    "procedure-acne-scar-filler"
  ],
  [
    "marionette-line-filler",
    "Marionette line filler treatment planning",
    "procedure-marionette-line-filler"
  ],
  [
    "full-face-filler-harmony",
    "Full-face proportion and filler harmony planning",
    "procedure-full-face-filler-contouring"
  ],
  [
    "neck-filler-evaluation",
    "Neck dermal filler treatment assessment",
    "procedure-neck-dermal-filler"
  ],
  [
    "gluteal-body-filler-evaluation",
    "Body and gluteal filler candidacy assessment",
    "procedure-gluteal-body-filler"
  ],
  [
    "facial-thread-vector-planning",
    "Facial thread lift vector planning",
    "procedure-thread-face"
  ],
  [
    "brow-thread-lift-planning",
    "Brow thread lift planning",
    "procedure-thread-brow"
  ],
  [
    "temporal-thread-lift-planning",
    "Temporal thread lift planning",
    "procedure-thread-temple"
  ],
  [
    "midface-thread-lift-planning",
    "Midface thread lift planning",
    "procedure-thread-midface"
  ],
  [
    "jawline-thread-lift-planning",
    "Jawline thread lift planning",
    "procedure-thread-jawline"
  ],
  [
    "submental-thread-lift-planning",
    "Submental thread lift planning",
    "procedure-thread-submental"
  ],
  [
    "nose-thread-lift-evaluation",
    "Nose thread lift candidacy assessment",
    "procedure-nose-thread-lift"
  ],
  [
    "neck-thread-lift-planning",
    "Neck thread lift planning",
    "procedure-neck-thread-lift"
  ],
  [
    "thread-material-selection",
    "PDO thread material and technique selection",
    "procedure-thread-pdo"
  ],
  [
    "silhouette-thread-planning",
    "Silhouette thread lift planning",
    "procedure-silhouette-thread-lift"
  ],
  [
    "barbed-thread-selection",
    "Barbed and cog thread selection",
    "procedure-cog-barbed-thread-lift"
  ],
  [
    "collagen-stimulation-thread-planning",
    "Collagen-stimulating thread treatment planning",
    "procedure-collagen-stimulating-thread-treatment"
  ],
  [
    "microneedling-treatment-planning",
    "Microneedling treatment planning",
    "procedure-microneedling"
  ],
  [
    "chemical-peel-selection",
    "Chemical peel selection and risk assessment",
    "procedure-chemical-peel"
  ],
  [
    "acne-scar-tca-cross-planning",
    "TCA CROSS candidate selection",
    "procedure-tca-cross"
  ],
  [
    "acne-scar-punch-excision-assessment",
    "Punch excision candidate assessment for acne scars",
    "procedure-punch-excision-acne-scar"
  ],
  [
    "fractional-radiofrequency-planning",
    "Fractional radiofrequency skin treatment planning",
    "procedure-fractional-radiofrequency-skin-treatment"
  ],
  [
    "laser-rejuvenation-candidacy",
    "Laser skin rejuvenation candidate evaluation",
    "procedure-laser-skin-rejuvenation"
  ],
  [
    "facial-prp-planning",
    "Facial platelet-rich plasma treatment planning",
    "procedure-prp-facial-skin"
  ],
  [
    "hair-prp-planning",
    "Hair platelet-rich plasma treatment planning",
    "procedure-platelet-rich-plasma-hair-treatment"
  ],
  [
    "under-eye-mesotherapy-planning",
    "Periorbital mesotherapy candidate assessment",
    "procedure-mesotherapy-under-eye"
  ],
  [
    "pigmentation-mesotherapy-assessment",
    "Pigmentation mesotherapy candidate assessment",
    "procedure-mesotherapy-pigmentation"
  ],
  [
    "melasma-multimodal-planning",
    "Melasma treatment planning",
    "procedure-melasma-treatment"
  ],
  [
    "post-inflammatory-hyperpigmentation-planning",
    "Post-inflammatory hyperpigmentation treatment planning",
    "procedure-post-inflammatory-hyperpigmentation-treatment"
  ],
  [
    "androgenetic-alopecia-evaluation",
    "Androgenetic alopecia assessment",
    "procedure-androgenetic-alopecia"
  ],
  [
    "telogen-effluvium-evaluation",
    "Telogen effluvium assessment",
    "procedure-telogen-effluvium"
  ],
  [
    "skin-biostimulation-treatment-planning",
    "Injectable skin biostimulation planning",
    "procedure-injectable-biostimulator"
  ],
  [
    "sculptra-treatment-planning",
    "Sculptra injection treatment planning",
    "procedure-sculptra-injectable-biostimulator"
  ],
  [
    "blepharoplasty-candidacy-evaluation",
    "Blepharoplasty candidacy evaluation",
    "procedure-blepharoplasty"
  ],
  [
    "lip-lift-candidacy-evaluation",
    "Central lip lift candidacy assessment",
    "procedure-central-lip-lift"
  ],
  [
    "buccal-fat-removal-evaluation",
    "Buccal fat removal candidacy assessment",
    "procedure-buccal-fat-removal"
  ],
  [
    "submental-liposuction-evaluation",
    "Submental liposuction candidacy assessment",
    "procedure-submental-liposuction"
  ],
  [
    "fat-grafting-candidacy-evaluation",
    "Autologous fat grafting candidacy assessment",
    "procedure-autologous-fat-grafting"
  ]
];
const knowledgeRows = [
  [
    "facial-muscle-patterns",
    "Facial expression muscle patterns relevant to neuromodulator treatment",
    "procedure-botox-glabella"
  ],
  [
    "glabellar-muscle-anatomy",
    "Glabellar complex anatomy and aesthetic treatment planning",
    "procedure-botox-glabella"
  ],
  [
    "periorbital-muscular-anatomy",
    "Periorbital muscle anatomy for aesthetic injectables",
    "procedure-botox-crows-feet"
  ],
  [
    "neuromuscular-junction-botulinum",
    "Botulinum toxin effects at the neuromuscular junction",
    "procedure-botulinum-toxin-aesthetic-treatment"
  ],
  [
    "botulinum-adverse-effect-patterns",
    "Botulinum toxin aesthetic adverse-effect patterns",
    "procedure-botulinum-toxin-result-correction"
  ],
  [
    "neuromodulator-treatment-duration",
    "Clinical duration and limitations of neuromodulator treatment",
    "procedure-botulinum-toxin-aesthetic-treatment"
  ],
  [
    "masseter-function-and-hypertrophy",
    "Masseter anatomy, function and enlargement",
    "procedure-botox-masseter"
  ],
  [
    "platysma-and-cervical-bands",
    "Platysma anatomy and cervical band evaluation",
    "procedure-botox-platysma-neck"
  ],
  [
    "eccrine-sweat-gland-physiology",
    "Eccrine sweat gland physiology in focal hyperhidrosis",
    "procedure-botox-hyperhidrosis"
  ],
  [
    "hyperhidrosis-candidate-assessment",
    "Clinical assessment of focal hyperhidrosis",
    "procedure-botulinum-toxin-palmar-hyperhidrosis"
  ],
  [
    "dermal-filler-rheology",
    "Dermal filler rheology and tissue interaction",
    "procedure-facial-and-lip-dermal-filler"
  ],
  [
    "facial-vascular-architecture",
    "Facial vascular anatomy relevant to filler safety",
    "procedure-filler-cheek"
  ],
  [
    "periorbital-injection-risk",
    "Periorbital injectable treatment risk assessment",
    "procedure-filler-under-eye"
  ],
  [
    "nasal-injection-vascular-risk",
    "Nasal injectable vascular risk",
    "procedure-filler-nose"
  ],
  [
    "hyaluronidase-mechanism",
    "Hyaluronidase mechanism and therapeutic limits",
    "procedure-hyaluronidase-and-filler-revision"
  ],
  [
    "vascular-occlusion-early-recognition",
    "Early recognition of injectable-related vascular occlusion",
    "procedure-hyaluronidase-and-filler-revision"
  ],
  [
    "filler-delayed-complications",
    "Delayed inflammatory and other filler complications",
    "procedure-hyaluronidase-and-filler-revision"
  ],
  [
    "facial-fat-compartment-anatomy",
    "Facial fat compartments and volumetric aging",
    "procedure-full-face-filler-contouring"
  ],
  [
    "lip-proportions-and-symmetry",
    "Lip proportion, symmetry and aesthetic assessment",
    "procedure-filler-lips"
  ],
  [
    "temporal-hollowing-assessment",
    "Clinical assessment of temporal hollowing",
    "procedure-filler-temple"
  ],
  [
    "chin-jawline-skeletal-soft-tissue-balance",
    "Skeletal and soft-tissue contributions to chin and jawline appearance",
    "procedure-filler-jawline"
  ],
  [
    "cicatricial-adhesion-mechanisms",
    "Mechanisms of tethered atrophic acne scars",
    "procedure-subcision"
  ],
  [
    "acne-scar-morphology",
    "Morphological classification of atrophic acne scars",
    "procedure-acne-scar-evaluation"
  ],
  [
    "rolling-scar-differentiation",
    "Rolling acne scar differentiation and treatment selection",
    "procedure-subcision-rolling-scar"
  ],
  [
    "ice-pick-scar-selection",
    "Ice-pick scar treatment selection and limitations",
    "procedure-tca-cross"
  ],
  [
    "scar-remodeling-response",
    "Dermal remodeling after acne scar treatment",
    "procedure-microneedling"
  ],
  [
    "tca-cross-safety",
    "TCA CROSS adverse effects and patient selection",
    "procedure-tca-cross"
  ],
  [
    "post-inflammatory-pigmentary-risk",
    "Post-inflammatory pigmentary risk in aesthetic procedures",
    "procedure-post-inflammatory-hyperpigmentation-treatment"
  ],
  [
    "melasma-relapse-and-photoprotection",
    "Melasma recurrence and photoprotection",
    "procedure-melasma-treatment"
  ],
  [
    "skin-barrier-and-irritancy",
    "Skin barrier function and irritation in rejuvenation care",
    "procedure-energy-based-skin-treatment"
  ],
  [
    "collagen-remodeling-biology",
    "Collagen remodeling biology in skin rejuvenation",
    "procedure-injectable-biostimulator"
  ],
  [
    "platelet-rich-plasma-evidence",
    "Evidence and limitations of platelet-rich plasma treatments",
    "procedure-prp-facial-skin"
  ],
  [
    "thread-material-biocompatibility",
    "Thread material biocompatibility and biodegradation",
    "procedure-thread-pdo"
  ],
  [
    "thread-lift-vectors-and-tension",
    "Thread lift vector design and tissue tension",
    "procedure-thread-face"
  ],
  [
    "thread-lift-complication-patterns",
    "Thread lift complication and correction patterns",
    "procedure-thread-lift-result-correction"
  ],
  [
    "androgenetic-alopecia-pathophysiology",
    "Androgenetic alopecia pathophysiology",
    "procedure-androgenetic-alopecia"
  ],
  [
    "telogen-effluvium-causes",
    "Telogen effluvium triggers and differential diagnosis",
    "procedure-telogen-effluvium"
  ],
  [
    "hair-loss-diagnostic-differential",
    "Hair-loss differential diagnosis before procedural treatment",
    "procedure-hair-loss-evaluation-and-treatment"
  ],
  [
    "aesthetic-candidacy-risk-stratification",
    "Aesthetic procedure candidacy and risk stratification",
    "aesthetic-medical-consultation"
  ],
  [
    "aesthetic-treatment-contraindications",
    "Contraindications across aesthetic procedures",
    "aesthetic-medical-consultation"
  ],
  [
    "patient-expectation-alignment",
    "Patient expectation alignment and achievable outcomes",
    "aesthetic-revision-and-second-opinion"
  ],
  [
    "treatment-sequencing-and-combination",
    "Sequencing and combining aesthetic treatments",
    "aesthetic-medical-consultation"
  ],
  [
    "aesthetic-procedure-informed-consent",
    "Informed consent for aesthetic procedures",
    "aesthetic-medical-consultation"
  ],
  [
    "clinical-referral-thresholds",
    "Clinical referral thresholds for aesthetic and surgical procedures",
    "procedure-hair-transplant-candidacy-assessment"
  ],
  [
    "revision-versus-nonintervention",
    "Aesthetic revision versus non-intervention decision-making",
    "aesthetic-revision-and-second-opinion"
  ]
];

const groups = [
  ['neuromodulators', 'Botulinum toxin and neuromodulator services', 'بوتولینوم توکسین و نورومدولاتورها',
   /botox|botulinum|migraine/i],
  ['hair', 'Hair loss, scalp and hair treatments', 'ارزیابی و درمان مو',
   /hair|alopecia|telogen/i],
  ['threads', 'Thread lifting and related treatments', 'لیفت و درمان با نخ',
   /thread/i],
  ['fillers', 'Dermal filler, volumization and fat grafting', 'فیلر و حجم‌دهی',
   /filler|fat-grafting|hydrogel/i],
  ['acne-scars', 'Acne, scar and pigmentary assessment and treatment', 'آکنه، اسکار و لک',
   /acne|scar|tca-cross|melasma|pigment/i],
  ['skin-rejuvenation', 'Skin rejuvenation and regenerative procedures', 'جوان‌سازی و درمان پوست',
   /skin|meso|platelet|prp|laser|micro|peel|radiofrequency|profhilo|jalupro|sune[kc]os|biostimul|sculptra|exosome|prostrolane/i],
  ['surgical-assessment', 'Aesthetic surgery and related assessment', 'جراحی و ارزیابی زیبایی',
   /blepharoplasty|lip-lift|buccal|liposuction|rhinoplasty|facelift|neck-lift|surg|fat-removal/i],
  ['consultation-and-correction', 'Consultation, assessment and treatment correction', 'مشاوره، ارزیابی و اصلاح درمان',
   /consult|opinion|assessment|evaluation|revision|correction|complication/i],
  ['other-clinical-services', 'Other physician clinical services', 'سایر خدمات بالینی', /./]
];

const multilingual = (fa, en) => [
  {'@value': fa, '@language': 'fa'},
  {'@value': en, '@language': 'en'}
];
export function strengthenPhysicianAuthority(graph, physician, origin) {
  const entities = new Map(graph.map(node => [node['@id'], node]));
  const physicianId = physician['@id'];
  const services = graph.filter(node => values(node['@type']).includes('Service')
    && values(node.provider).length === 1 && node.provider['@id'] === physicianId);
  const offers = new Map(graph.filter(node => values(node['@type']).includes('Offer')
    && node.offeredBy?.['@id'] === physicianId).map(node => [node.itemOffered?.['@id'], node]));
  if (services.length !== 124 || offers.size !== services.length)
    throw new Error('Expected one real physician Offer per published Service before catalog construction');

  // Keep the original general-service ItemList unchanged; the offer hierarchy
  // is a separate entity, not an in-place retagging of the legacy list.
  const rootId = originSlug(origin, 'physician-clinical-offer-catalog');
  if (entities.has(rootId)) throw new Error('Clinical offer catalog identifier already used');
  const buckets = new Map(groups.map(([slug]) => [slug, []]));
  for (const service of services) {
    const offer = offers.get(service['@id']);
    if (!offer || !values(service.offers).some(v => v['@id'] === offer['@id']))
      throw new Error('Service/Offer mismatch: ' + service['@id']);
    const slug = service['@id'].slice(origin.length + 1);
    const [bucket] = groups.find(([key, en, fa, pattern]) => pattern.test(slug));
    buckets.get(bucket).push(offer);
  }
  const groupRefs = [];
  for (const [slug, en, fa] of groups) {
    const items = buckets.get(slug);
    if (!items.length) continue;
    const id = rootId + '#' + slug;
    const groupNode = {
      '@id': id, '@type': 'OfferCatalog', name: multilingual(fa,en),
      numberOfItems: items.length,
      itemListElement: items.map((offer,index) => ({'@type': 'ListItem',position:index+1,item:ref(offer['@id'])}))
    };
    graph.push(groupNode);
    groupRefs.push(ref(id));
  }
  const mainCatalog = {
    '@id':rootId, '@type':'OfferCatalog',
    name:multilingual('کاتالوگ پیشنهادهای خدمات بالینی دکتر سعید قزلباش',
      'Dr. Saeed Ghezelbash clinical service offer catalog'),
    description:'Structured catalog of actual services offered by the named physician; no undisclosed price, appointment availability, or clinical-outcome claim is implied.',
    numberOfItems:groupRefs.length,
    itemListElement:groupRefs,
    'dcterms:subject':ref(physicianId)
  };
  graph.push(mainCatalog);
  physician.hasOfferCatalog = ref(rootId);

  const existingSkills = new Set(values(physician.skills).map(item=>item['@id']));
  const skillRefs = [];
  for (const [slug,name,serviceSlug] of skillRows) {
    const serviceId = originSlug(origin,serviceSlug);
    if (!entities.has(serviceId) || !services.some(node=>node['@id']===serviceId))
      throw new Error('Skill lacks published physician-provided service: '+serviceSlug);
    const id = originSlug(origin,'skill-'+slug);
    if (entities.has(id) || existingSkills.has(id)) throw new Error('Duplicate skill '+id);
    graph.push({
      '@id': id, '@type':['DefinedTerm','skos:Concept',originSlug(origin,'ontology/AestheticClinicalSkill')],
      name, termCode:'SKILL-'+slug.toUpperCase().replace(/-/g,'_'),
      inDefinedTermSet:ref(originSlug(origin,'clinical-skill-registry')),
      'skos:inScheme':ref(originSlug(origin,'clinical-skill-registry')),
      description:'Physician-declared clinical competency in the scope of an existing described clinical service; not an independent qualification or outcome certification.',
      'dcterms:relation':relatedService(origin,serviceSlug)
    });
    skillRefs.push(ref(id));
  }
  physician.skills = [...values(physician.skills),...skillRefs];

  const existingTopics = new Set(values(physician.knowsAbout).map(item=>typeof item==='string'?item:item['@id']));
  const topicRefs = [];
  const topicRegistry = originSlug(origin,'clinical-knowledge-topic-registry');
  graph.push({'@id':topicRegistry,'@type':'DefinedTermSet',
    name:'Clinical knowledge concepts referenced by the physician profile',
    description:'Physician-declared knowledge areas, distinct from certification, service delivery, and specialty titles.'});
  for (const [slug,name,serviceSlug] of knowledgeRows) {
    if (!entities.has(originSlug(origin,serviceSlug))) throw new Error('Knowledge topic has no matching source service: '+serviceSlug);
    const id = originSlug(origin,'clinical-topic-'+slug);
    if (entities.has(id) || existingTopics.has(id)) throw new Error('Duplicate topic '+id);
    graph.push({
      '@id':id, '@type':['DefinedTerm','skos:Concept'], name,
      termCode:'TOPIC-'+slug.toUpperCase().replace(/-/g,'_'),
      inDefinedTermSet:ref(topicRegistry),
      description:'Physician-declared area of clinical knowledge relating to a service already described on this website; not a specialty qualification.',
      'dcterms:relation':relatedService(origin,serviceSlug)
    });
    topicRefs.push(ref(id));
  }
  physician.knowsAbout = [...values(physician.knowsAbout),...topicRefs];

  if (new Set(values(physician.skills).map(item=>item['@id'])).size!==values(physician.skills).length)
    throw new Error('Duplicate skills in physician');
  if (new Set(values(physician.knowsAbout).map(item=>typeof item==='string'?item:item['@id'])).size
      !==values(physician.knowsAbout).length)
    throw new Error('Duplicate knowsAbout in physician');
  return {offers:offers.size, offerGroups:groupRefs.length, skills:values(physician.skills).length,
    knowsAbout:values(physician.knowsAbout).length};
}
