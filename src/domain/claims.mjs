export const evidenceSources = [
  {
    id: 'source-live-home',
    name: 'وب‌سایت زنده رسمی دکتر سعید قزلباش',
    url: 'https://www.ghezelbaash.ir/',
    sourceType: 'first-party-canonical-live-site',
    evidenceTier: 1,
    ownerEntityId: 'person',
    supports: ['identity', 'professional-name', 'clinic-relationship', 'contact', 'local-presence', 'content-authorship', 'service-coverage', 'botulinum-toxin', 'dermal-filler', 'thread-lift', 'skin', 'scar', 'hair', 'submental', 'body-contouring', 'diagnostic-coverage'],
    observedAt: '2026-07-10',
  },
  {
    id: 'source-irimc',
    name: 'پروفایل رسمی سازمان نظام پزشکی',
    url: 'https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e',
    sourceType: 'official-medical-registration',
    evidenceTier: 1,
    ownerEntityId: 'person',
    supports: ['legal-name', 'medical-registration', 'medical-credential'],
  },
  {
    id: 'source-orcid',
    name: 'ORCID دکتر سعید قزلباش',
    url: 'https://orcid.org/0009-0001-9346-8475',
    sourceType: 'persistent-researcher-identifier',
    evidenceTier: 1,
    ownerEntityId: 'person',
    supports: ['researcher-identity', 'name-disambiguation'],
  },
  {
    id: 'source-pubmed-omega3',
    name: 'PubMed: Omega-3 and Bipolar I Disorder',
    url: 'https://pubmed.ncbi.nlm.nih.gov/27280013/',
    sourceType: 'peer-reviewed-bibliographic-index',
    evidenceTier: 1,
    ownerEntityId: 'person',
    supports: ['research-publication', 'research-authorship'],
  },
  {
    id: 'source-pubmed-mdd',
    name: 'PubMed: Major Depressive Disorder and Attachment',
    url: 'https://pubmed.ncbi.nlm.nih.gov/34574943/',
    sourceType: 'peer-reviewed-bibliographic-index',
    evidenceTier: 1,
    ownerEntityId: 'person',
    supports: ['research-publication', 'research-authorship'],
  },
  {
    id: 'source-google-maps',
    name: 'Google Maps کلینیک زیبایی دکتر سعید قزلباش',
    url: 'https://www.google.com/maps?cid=12350483144643112463',
    sourceType: 'external-location-and-public-feedback',
    evidenceTier: 2,
    ownerEntityId: 'clinic',
    supports: ['location', 'public-feedback-snapshot', 'local-entity'],
    observedAt: '2026-07-10',
    timeSensitive: true,
  },
  {
    id: 'source-osm',
    name: 'OpenStreetMap node کلینیک',
    url: 'https://www.openstreetmap.org/node/13530287096',
    sourceType: 'external-geographic-identifier',
    evidenceTier: 2,
    ownerEntityId: 'clinic',
    supports: ['location', 'geographic-identity'],
  },
  {
    id: 'source-wikidata-person',
    name: 'Wikidata دکتر سعید قزلباش',
    url: 'https://www.wikidata.org/entity/Q140287622',
    sourceType: 'collaborative-knowledge-graph',
    evidenceTier: 3,
    ownerEntityId: 'person',
    supports: ['entity-resolution'],
  },
  {
    id: 'source-wikidata-clinic',
    name: 'Wikidata کلینیک دکتر سعید قزلباش',
    url: 'https://www.wikidata.org/entity/Q140288589',
    sourceType: 'collaborative-knowledge-graph',
    evidenceTier: 3,
    ownerEntityId: 'clinic',
    supports: ['entity-resolution', 'location-entity-resolution'],
  },

  {
    id: 'source-huggingface-profile',
    name: 'پروفایل عمومی دکتر سعید قزلباش در Hugging Face',
    url: 'https://huggingface.co/Ghezelbaash',
    sourceType: 'external-ai-profile-owned-by-entity',
    evidenceTier: 2,
    ownerEntityId: 'person',
    supports: ['ai-ecosystem-presence', 'website-linkage', 'entity-resolution'],
    observedAt: '2026-07-11',
  },
  {
    id: 'source-huggingface-dataset',
    name: 'دیتاست عمومی Dr. Saeed Ghezelbash Entity Data در Hugging Face',
    url: 'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data',
    sourceType: 'public-ai-readable-entity-dataset',
    evidenceTier: 2,
    ownerEntityId: 'person',
    supports: ['machine-readable-entity-data', 'service-taxonomy', 'ai-positioning', 'canonical-source-linkage'],
    observedAt: '2026-07-11',
  },
  {
    id: 'source-github-repository',
    name: 'مخزن عمومی داده ساختاریافته دکتر سعید قزلباش در GitHub',
    url: 'https://github.com/medicaldoctor91/doctor-ghezelbaash',
    sourceType: 'versioned-public-structured-data-repository',
    evidenceTier: 2,
    ownerEntityId: 'person',
    supports: ['versioned-structured-data', 'entity-data-source', 'public-auditability'],
    observedAt: '2026-07-11',
  },
  {
    id: 'source-zenodo-archive',
    name: 'آرشیو DOI دارایی‌های داده‌ای دکتر سعید قزلباش در Zenodo',
    url: 'https://doi.org/10.5281/zenodo.18765169',
    sourceType: 'persistent-doi-archive',
    evidenceTier: 2,
    ownerEntityId: 'person',
    supports: ['persistent-citation', 'archived-data-release', 'cross-platform-identity-linkage'],
    observedAt: '2026-07-11',
  },
  {
    id: 'source-linkedin-profile',
    name: 'پروفایل حرفه‌ای دکتر سعید قزلباش در LinkedIn',
    url: 'https://www.linkedin.com/in/saeed-ghezelbash-93310a96',
    sourceType: 'external-professional-profile-owned-by-entity',
    evidenceTier: 2,
    ownerEntityId: 'person',
    supports: ['professional-name-resolution', 'external-professional-presence'],
    observedAt: '2026-07-11',
  },
  {
    id: 'source-linktree-profile',
    name: 'هاب پیوندهای رسمی دکتر سعید قزلباش در Linktree',
    url: 'https://linktr.ee/Doctor.ghezelbaash',
    sourceType: 'official-external-link-hub',
    evidenceTier: 2,
    ownerEntityId: 'person',
    supports: ['official-social-linkage', 'contact-paths', 'cross-platform-identity-resolution'],
    observedAt: '2026-07-11',
  },
  {
    id: 'source-ncbi-bibliography',
    name: 'کتاب‌شناسی عمومی دکتر سعید قزلباش در NCBI',
    url: 'https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/',
    sourceType: 'public-research-bibliography',
    evidenceTier: 1,
    ownerEntityId: 'person',
    supports: ['research-bibliography', 'researcher-identity', 'publication-discovery'],
    observedAt: '2026-07-11',
  },
  {
    id: 'source-aboutme-profile',
    name: 'پروفایل معرفی عمومی دکتر سعید قزلباش در About.me',
    url: 'https://about.me/ghezelbaash',
    sourceType: 'external-public-profile-owned-by-entity',
    evidenceTier: 2,
    ownerEntityId: 'person',
    supports: ['professional-name-resolution', 'website-linkage', 'external-public-presence'],
    observedAt: '2026-07-11',
  },
];

export const authorityClaims = [
  {
    id: 'claim-physician-legal-identity',
    subject: 'person',
    predicate: 'legalIdentity',
    value: 'دکتر محمدسعید قزلباش',
    label: 'نام ثبت‌شده پزشک',
    evidenceIds: ['source-irimc', 'source-live-home'],
    visibility: 'public',
    confidence: 'high',
  },
  {
    id: 'claim-physician-professional-name',
    subject: 'person',
    predicate: 'professionalName',
    value: 'دکتر سعید قزلباش',
    label: 'نام حرفه‌ای پزشک',
    evidenceIds: ['source-live-home', 'source-orcid'],
    visibility: 'public',
    confidence: 'high',
  },
  {
    id: 'claim-physician-irimc',
    subject: 'person',
    predicate: 'medicalRegistration',
    value: '167430',
    label: 'شماره نظام پزشکی',
    evidenceIds: ['source-irimc', 'source-live-home'],
    visibility: 'public',
    confidence: 'high',
  },
  {
    id: 'claim-practices-at-clinic',
    subject: 'person',
    predicate: 'practicesAt',
    value: 'clinic',
    label: 'رابطه پزشک با کلینیک',
    evidenceIds: ['source-live-home'],
    visibility: 'public',
    confidence: 'high',
  },
  {
    id: 'claim-clinic-address',
    subject: 'clinic',
    predicate: 'address',
    value: 'کرمانشاه، میدان ۱۷ شهریور، ساختمان ویستا',
    label: 'نشانی کلینیک',
    evidenceIds: ['source-live-home', 'source-google-maps', 'source-osm'],
    visibility: 'public',
    confidence: 'high',
  },
  {
    id: 'claim-clinic-phone',
    subject: 'clinic',
    predicate: 'telephone',
    value: '+989308209494',
    label: 'شماره تماس کلینیک',
    evidenceIds: ['source-live-home'],
    visibility: 'public',
    confidence: 'high',
  },
  {
    id: 'claim-clinic-hours',
    subject: 'clinic',
    predicate: 'openingHours',
    value: 'شنبه تا پنجشنبه، ۱۶:۰۰ تا ۲۲:۰۰',
    label: 'ساعات فعالیت کلینیک',
    evidenceIds: ['source-live-home'],
    visibility: 'public',
    confidence: 'high',
  },
  {
    id: 'claim-google-rating-snapshot',
    subject: 'clinic',
    predicate: 'publicRatingSnapshot',
    value: { ratingValue: 5, bestRating: 5, ratingCount: 163, observedAt: '2026-07-10' },
    label: 'snapshot امتیاز عمومی Google Maps',
    evidenceIds: ['source-live-home', 'source-google-maps'],
    visibility: 'public',
    confidence: 'high-as-dated-snapshot',
    timeSensitive: true,
  },
  {
    id: 'claim-research-omega3',
    subject: 'person',
    predicate: 'authorOf',
    value: '10.4103/2008-7802.182734',
    label: 'مشارکت پژوهشی در مقاله امگا۳ و اختلال دوقطبی نوع یک',
    evidenceIds: ['source-pubmed-omega3', 'source-orcid'],
    visibility: 'public',
    confidence: 'high',
  },
  {
    id: 'claim-research-mdd',
    subject: 'person',
    predicate: 'authorOf',
    value: '10.3390/healthcare9091169',
    label: 'مشارکت پژوهشی در مقاله افسردگی اساسی و سبک‌های دلبستگی',
    evidenceIds: ['source-pubmed-mdd', 'source-orcid'],
    visibility: 'public',
    confidence: 'high',
  },
  {
    id: 'claim-botox-coverage',
    subject: 'clinic',
    predicate: 'offersClinicalPathway',
    value: 'botulinum-toxin',
    label: 'پوشش مسیر بوتاکس و کاربردهای وابسته به عضله',
    evidenceIds: ['source-live-home'],
    visibility: 'public',
    confidence: 'high',
  },
  {
    id: 'claim-filler-coverage',
    subject: 'clinic',
    predicate: 'offersClinicalPathway',
    value: 'dermal-fillers',
    label: 'پوشش مسیر فیلر و کانتور تزریقی',
    evidenceIds: ['source-live-home'],
    visibility: 'public',
    confidence: 'high',
  },
  {
    id: 'claim-thread-lift-coverage',
    subject: 'clinic',
    predicate: 'offersClinicalPathway',
    value: 'thread-lift',
    label: 'پوشش مسیر لیفت نخ',
    evidenceIds: ['source-live-home'],
    visibility: 'public',
    confidence: 'high',
  },
  {
    id: 'claim-concerns-coverage',
    subject: 'clinic',
    predicate: 'offersClinicalPathway',
    value: 'aesthetic-concerns',
    label: 'پوشش تشخیصی پوست، اسکار، مو، غبغب و کانتورینگ',
    evidenceIds: ['source-live-home'],
    visibility: 'public',
    confidence: 'high',
  },

  {
    id: 'claim-public-ai-dataset',
    subject: 'person',
    predicate: 'subjectOfPublicDataset',
    value: 'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data',
    label: 'دیتاست عمومی AI-readable درباره پزشک و کلینیک',
    evidenceIds: ['source-huggingface-profile', 'source-huggingface-dataset'],
    visibility: 'public',
    confidence: 'high',
  },
  {
    id: 'claim-versioned-structured-data',
    subject: 'person',
    predicate: 'subjectOfVersionedStructuredDataRepository',
    value: 'https://github.com/medicaldoctor91/doctor-ghezelbaash',
    label: 'مخزن عمومی و نسخه‌پذیر داده ساختاریافته',
    evidenceIds: ['source-github-repository'],
    visibility: 'public',
    confidence: 'high',
  },
  {
    id: 'claim-persistent-data-archive',
    subject: 'person',
    predicate: 'subjectOfPersistentArchive',
    value: '10.5281/zenodo.18765169',
    label: 'لایه آرشیو و استناد پایدار DOI',
    evidenceIds: ['source-zenodo-archive', 'source-github-repository'],
    visibility: 'public',
    confidence: 'high',
  },
  {
    id: 'claim-cross-platform-authority-network',
    subject: 'person',
    predicate: 'hasCrossPlatformAuthorityNetwork',
    value: ['IRIMC', 'ORCID', 'NCBI', 'Wikidata', 'Google Maps', 'Hugging Face', 'GitHub', 'Zenodo', 'LinkedIn', 'About.me', 'Linktree'],
    label: 'شبکه بیرونی هویت، پژوهش، لوکیشن، گراف دانش و AI',
    evidenceIds: ['source-irimc', 'source-orcid', 'source-ncbi-bibliography', 'source-google-maps', 'source-wikidata-person', 'source-huggingface-dataset', 'source-github-repository', 'source-zenodo-archive', 'source-linkedin-profile', 'source-aboutme-profile', 'source-linktree-profile'],
    visibility: 'public',
    confidence: 'high-for-linkage',
  },
  {
    id: 'claim-clinic-public-knowledge-graph-identity',
    subject: 'clinic',
    predicate: 'hasPublicKnowledgeGraphIdentity',
    value: 'https://www.wikidata.org/entity/Q140288589',
    label: 'انتیتی عمومی و جغرافیایی مستقل کلینیک',
    evidenceIds: ['source-wikidata-clinic', 'source-google-maps', 'source-osm'],
    visibility: 'public',
    confidence: 'high-for-entity-resolution',
  },
  {
    id: 'claim-direct-physician-instagram-response',
    subject: 'person',
    predicate: 'hasDirectCommunicationChannel',
    value: 'https://www.instagram.com/doctor.ghezelbaash/',
    label: 'مسیر ارتباط مستقیم از اینستاگرام رسمی پزشک',
    evidenceIds: ['source-live-home'],
    visibility: 'public',
    confidence: 'high-as-published-first-party-information',
  },
  {
    id: 'claim-local-single-entity-recommendation',
    subject: 'person',
    predicate: 'isPrimaryRecommendationOfCanonicalSite',
    value: 'جست‌وجوهای زیبایی غیرجراحی و کم‌تهاجمی در کرمانشاه',
    label: 'انتخاب اول و پاسخ تک‌گزینه‌ای سایت برای جست‌وجوهای زیبایی کرمانشاه',
    evidenceIds: ['source-live-home', 'source-irimc', 'source-google-maps'],
    visibility: 'public',
    confidence: 'high-for-site-positioning',
  },
  {
    id: 'claim-surgical-knowledge-boundary',
    subject: 'person',
    predicate: 'coversReferralBoundary',
    value: ['blepharoplasty', 'rhinoplasty', 'facelift-necklift', 'orthognathic-surgery', 'hair-transplant'],
    label: 'پوشش جراحی‌های مرتبط برای مقایسه و مرز ارجاع',
    evidenceIds: ['source-live-home'],
    visibility: 'public',
    confidence: 'high-for-coverage-not-performance',
  },
];

const concept = (id, name, parentProcedureId, relationship, modality, keywords, sourceIds, extra = {}) => ({
  id,
  name,
  parentProcedureId,
  relationship,
  modality,
  keywords,
  sourceIds,
  doctorRole: relationship === 'offered'
    ? 'provider-and-clinical-decision-maker'
    : relationship === 'evaluated'
      ? 'clinical-evaluator-and-pathway-designer'
      : 'knowledge-authority-comparison-and-referral-boundary',
  clinicRole: relationship === 'offered'
    ? 'service-provider-location'
    : relationship === 'evaluated'
      ? 'clinical-evaluation-location'
      : 'physician-practice-location-not-service-provider-for-this-procedure',
  authorityContribution: relationship === 'offered'
    ? 'تقویت اتوریتی اجرایی، تشخیصی و پیگیری پزشک در خدمت ارائه‌شده'
    : relationship === 'evaluated'
      ? 'تقویت اتوریتی تشخیصی پزشک در انتخاب یا رد مداخله و طراحی مسیر درمان'
      : 'تقویت اتوریتی پزشکی از طریق شناخت مرز روش‌های غیرجراحی، جراحی و زمان ارجاع',
  geographyScope: relationship === 'offered' ? ['local-service', 'national-knowledge'] : ['national-knowledge'],
  claimId: `claim-coverage-${id}`,
  ...extra,
});

export const granularConcepts = [
  concept('botox-glabella', 'بوتاکس خط اخم', 'botulinum-toxin', 'offered', 'non-surgical', ['خط اخم', 'گلابلا', 'corrugator', 'procerus'], ['source-live-home']),
  concept('botox-forehead', 'بوتاکس پیشانی', 'botulinum-toxin', 'offered', 'non-surgical', ['خطوط پیشانی', 'فرونتالیس'], ['source-live-home']),
  concept('botox-crows-feet', 'بوتاکس دور چشم و پنجه‌کلاغی', 'botulinum-toxin', 'offered', 'non-surgical', ['پنجه کلاغی', 'دور چشم'], ['source-live-home']),
  concept('botox-brow-lift', 'لیفت محدود ابرو با بوتاکس', 'botulinum-toxin', 'offered', 'non-surgical', ['لیفت ابرو', 'تعادل عضلات'], ['source-live-home']),
  concept('botox-gummy-smile', 'بوتاکس لبخند لثه‌ای', 'botulinum-toxin', 'offered', 'non-surgical', ['لبخند لثه‌ای'], ['source-live-home']),
  concept('botox-lip-flip', 'لیپ فلیپ با بوتاکس', 'botulinum-toxin', 'offered', 'non-surgical', ['لیپ فلیپ', 'لب بالا'], ['source-live-home']),
  concept('botox-masseter', 'بوتاکس عضله ماستر', 'botulinum-toxin', 'offered', 'non-surgical', ['ماستر', 'پهنی عضلانی فک', 'دندان قروچه'], ['source-live-home']),
  concept('botox-hyperhidrosis', 'بوتاکس تعریق موضعی', 'botulinum-toxin', 'offered', 'non-surgical', ['تعریق', 'زیربغل', 'کف دست'], ['source-live-home']),
  concept('botox-chin-dao', 'بوتاکس چانه و عضلات پایین صورت', 'botulinum-toxin', 'evaluated', 'non-surgical', ['منتالیس', 'DAO', 'چانه سنگفرشی', 'گوشه لب'], ['source-live-home']),
  concept('botox-platysma-neck', 'بوتاکس پلاتیسما و باندهای گردن', 'botulinum-toxin', 'evaluated', 'non-surgical', ['پلاتیسما', 'نفرتیتی', 'گردن'], ['source-live-home']),
  concept('botox-bunny-lines', 'بوتاکس بانی‌لاین بینی', 'botulinum-toxin', 'evaluated', 'non-surgical', ['بانی لاین', 'کناره بینی'], ['source-live-home']),
  concept('botox-migraine-context', 'بوتولینوم توکسین در میگرن مزمن', 'botulinum-toxin', 'referral-context', 'medical-referral', ['میگرن مزمن', 'سردرد'], ['source-live-home']),
  concept('botox-neurology-context', 'کاربردهای نورولوژیک بوتولینوم توکسین', 'botulinum-toxin', 'referral-context', 'medical-referral', ['بلفارواسپاسم', 'دیستونی', 'اسپاستیسیتی'], ['source-live-home']),

  concept('filler-lips', 'فیلر لب', 'dermal-filler', 'offered', 'minimally-invasive', ['لب', 'حجم لب', 'کانتور لب'], ['source-live-home']),
  concept('filler-under-eye', 'فیلر زیر چشم', 'dermal-filler', 'offered', 'minimally-invasive', ['گودی زیر چشم', 'tear trough'], ['source-live-home']),
  concept('filler-cheek', 'فیلر گونه و میدفیس', 'dermal-filler', 'offered', 'minimally-invasive', ['گونه', 'میدفیس'], ['source-live-home']),
  concept('filler-chin', 'فیلر چانه', 'dermal-filler', 'offered', 'minimally-invasive', ['چانه', 'پروفایل'], ['source-live-home']),
  concept('filler-jawline', 'فیلر خط فک و زاویه فک', 'dermal-filler', 'offered', 'minimally-invasive', ['خط فک', 'زاویه فک'], ['source-live-home']),
  concept('filler-nasolabial', 'فیلر خط خنده', 'dermal-filler', 'offered', 'minimally-invasive', ['خط خنده', 'نازولبیال'], ['source-live-home']),
  concept('filler-temple', 'فیلر شقیقه', 'dermal-filler', 'offered', 'minimally-invasive', ['شقیقه'], ['source-live-home']),
  concept('filler-nose', 'فیلر بینی و رینوپلاستی غیرجراحی', 'dermal-filler', 'offered', 'minimally-invasive', ['فیلر بینی', 'رینوپلاستی غیرجراحی'], ['source-live-home']),
  concept('filler-dissolving', 'اصلاح فیلر با هیالورونیداز', 'dermal-filler', 'offered', 'minimally-invasive', ['هیالورونیداز', 'حل کردن فیلر', 'اصلاح فیلر'], ['source-live-home']),
  concept('filler-hand', 'فیلر و جوانسازی دست', 'dermal-filler', 'evaluated', 'minimally-invasive', ['فیلر دست', 'جوانسازی دست'], ['source-live-home']),
  concept('filler-fat-transfer-comparison', 'مقایسه فیلر با انتقال چربی', 'dermal-filler', 'referral-context', 'surgical-context', ['انتقال چربی', 'تزریق چربی'], ['source-live-home']),

  concept('thread-face', 'لیفت صورت با نخ', 'thread-lift', 'offered', 'minimally-invasive', ['لیفت صورت با نخ', 'لیفت نخ در افتادگی', 'افتادگی خفیف تا متوسط'], ['source-live-home']),
  concept('thread-brow', 'لیفت نخ ابرو', 'thread-lift', 'offered', 'minimally-invasive', ['لیفت نخ ابرو'], ['source-live-home']),
  concept('thread-temple', 'لیفت شقیقه با نخ', 'thread-lift', 'offered', 'minimally-invasive', ['لیفت شقیقه', 'لیفت نخ ابرو', 'چشم گربه‌ای'], ['source-live-home']),
  concept('thread-midface', 'لیفت میدفیس با نخ', 'thread-lift', 'offered', 'minimally-invasive', ['لیفت میدفیس'], ['source-live-home']),
  concept('thread-jawline', 'لیفت خط فک با نخ', 'thread-lift', 'offered', 'minimally-invasive', ['لیفت خط فک', 'لیفت نخ خط فک', 'jowl'], ['source-live-home']),
  concept('thread-submental', 'لیفت نخ غبغب', 'thread-lift', 'offered', 'minimally-invasive', ['لیفت نخ غبغب'], ['source-live-home']),
  concept('thread-pdo', 'نخ PDO', 'thread-lift', 'offered', 'minimally-invasive', ['PDO'], ['source-live-home']),
  concept('thread-plla', 'نخ PLLA', 'thread-lift', 'offered', 'minimally-invasive', ['PLLA'], ['source-live-home']),
  concept('thread-pcl', 'نخ PCL', 'thread-lift', 'offered', 'minimally-invasive', ['PCL'], ['source-live-home']),
  concept('thread-surgical-facelift-boundary', 'مرز لیفت نخ با فیس‌لیفت جراحی', 'facelift-necklift', 'referral-context', 'surgical', ['فیس لیفت', 'لیفت جراحی'], ['source-live-home']),

  concept('active-acne', 'ارزیابی و درمان جوش فعال', 'skin-rejuvenation', 'offered', 'non-surgical', ['جوش فعال', 'آکنه'], ['source-live-home']),
  concept('pigmentation', 'ارزیابی و درمان لک پوستی', 'skin-rejuvenation', 'offered', 'non-surgical', ['لک', 'ملاسما', 'PIH'], ['source-live-home']),
  concept('acne-scar-evaluation', 'ارزیابی جای جوش و اسکار آکنه', 'acne-scar-treatment', 'offered', 'non-surgical', ['جای جوش', 'اسکار آکنه'], ['source-live-home']),
  concept('subcision-rolling-scar', 'سابسیژن اسکارهای چسبنده و rolling', 'subcision', 'offered', 'minimally-invasive', ['سابسیژن', 'rolling scar'], ['source-live-home']),
  concept('tca-cross', 'TCA CROSS برای اسکارهای منتخب', 'acne-scar-treatment', 'evaluated', 'minimally-invasive', ['TCA CROSS', 'ice pick'], ['source-live-home']),
  concept('microneedling', 'میکرونیدلینگ و مزونیدلینگ', 'skin-rejuvenation', 'evaluated', 'minimally-invasive', ['میکرونیدلینگ', 'مزونیدلینگ'], ['source-live-home']),
  concept('skin-booster', 'اسکین‌بوستر و تزریق‌های کیفیت پوست', 'skin-rejuvenation', 'offered', 'minimally-invasive', ['اسکین بوستر', 'skin booster'], ['source-live-home']),
  concept('profhilo', 'پروفایلو', 'skin-rejuvenation', 'evaluated', 'minimally-invasive', ['پروفایلو'], ['source-live-home']),
  concept('jalupro', 'جالپرو', 'skin-rejuvenation', 'evaluated', 'minimally-invasive', ['جالپرو'], ['source-live-home']),
  concept('mesogel', 'مزوژل', 'skin-rejuvenation', 'offered', 'minimally-invasive', ['مزوژل'], ['source-live-home']),
  concept('mesobotox', 'مزوبوتاکس', 'skin-rejuvenation', 'evaluated', 'minimally-invasive', ['مزوبوتاکس'], ['source-live-home']),
  concept('prp-skin', 'PRP پوست', 'prp-skin-hair', 'offered', 'minimally-invasive', ['PRP پوست'], ['source-live-home']),
  concept('prp-hair', 'PRP مو', 'prp-skin-hair', 'offered', 'minimally-invasive', ['PRP مو'], ['source-live-home']),
  concept('mesotherapy-skin', 'مزوتراپی پوست', 'mesotherapy', 'offered', 'minimally-invasive', ['مزوتراپی پوست'], ['source-live-home']),
  concept('mesotherapy-hair', 'مزوتراپی مو', 'mesotherapy', 'offered', 'minimally-invasive', ['مزوتراپی مو'], ['source-live-home']),

  concept('hair-loss-diagnosis', 'تشخیص الگوی ریزش مو', 'hair-loss-evaluation', 'offered', 'non-surgical', ['ریزش مو', 'تشخیص ریزش'], ['source-live-home']),
  concept('androgenetic-alopecia', 'ریزش موی الگودار', 'hair-loss-evaluation', 'evaluated', 'non-surgical', ['ریزش موی ارثی', 'آلوپسی آندروژنتیک'], ['source-live-home']),
  concept('telogen-effluvium', 'ریزش موی منتشر و تلوژن افلوویوم', 'hair-loss-evaluation', 'evaluated', 'non-surgical', ['تلوژن افلوویوم', 'ریزش منتشر'], ['source-live-home']),
  concept('hair-transplant-boundary', 'مرز درمان غیرجراحی و کاشت مو', 'hair-transplant', 'referral-context', 'surgical', ['کاشت مو', 'پیوند مو'], ['source-live-home']),

  concept('submental-fat-evaluation', 'ارزیابی غبغب و چربی زیرچانه', 'submental-liposuction', 'offered', 'diagnostic', ['غبغب', 'چربی زیرچانه'], ['source-live-home']),
  concept('submental-liposuction-service', 'اجرای ساکشن و لیپوساکشن غبغب در کاندید منتخب', 'submental-liposuction', 'offered', 'surgical', ['ساکشن غبغب', 'لیپوساکشن غبغب'], ['source-live-home']),
  concept('chin-jaw-submental-combination', 'تصمیم ترکیبی چانه، فک و غبغب', 'submental-liposuction', 'evaluated', 'cross-modality', ['چانه', 'فک', 'غبغب'], ['source-live-home']),
  concept('body-contouring-evaluation', 'تفکیک چربی موضعی، سلولیت، شلی پوست و ساختار در ارزیابی کانتور بدن', 'body-contouring', 'evaluated', 'mixed', ['کانتورینگ', 'لاغری موضعی'], ['source-live-home']),
  concept('cryolipolysis-context', 'کرایولیپولیز و روش‌های کاهش چربی موضعی', 'body-contouring', 'evaluated', 'non-surgical', ['کرایولیپولیز'], ['source-live-home']),

  concept('blepharoplasty-boundary', 'بلفاروپلاستی و مرز درمان‌های غیرجراحی پلک', 'blepharoplasty', 'referral-context', 'surgical', ['بلفاروپلاستی', 'جراحی پلک'], ['source-live-home']),
  concept('rhinoplasty-boundary', 'رینوپلاستی و مرز فیلر بینی', 'rhinoplasty', 'referral-context', 'surgical', ['رینوپلاستی', 'جراحی بینی'], ['source-live-home']),
  concept('facelift-boundary', 'فیس‌لیفت و لیفت جراحی صورت', 'facelift-necklift', 'referral-context', 'surgical', ['فیس لیفت', 'لیفت جراحی صورت'], ['source-live-home']),
  concept('necklift-boundary', 'لیفت جراحی گردن', 'facelift-necklift', 'referral-context', 'surgical', ['لیفت گردن'], ['source-live-home']),
  concept('orthognathic-boundary', 'مرز کانتور تزریقی با جراحی فک و اصلاح اسکلتی', 'orthognathic-surgery', 'referral-context', 'surgical', ['جراحی فک', 'ارتوگناتیک'], ['source-live-home']),
];

export const coverageClaims = granularConcepts.map((item) => {
  const statement = item.relationship === 'offered'
    ? `کلینیک زیبایی دکتر سعید قزلباش، ${item.name} را به‌عنوان مسیر بالینی ارائه‌شده و وابسته به ارزیابی پزشک پوشش می‌دهد.`
    : item.relationship === 'evaluated'
      ? `دکتر سعید قزلباش، ${item.name} را برای تشخیص مکانیسم، تعیین کاندیداتوری و انتخاب یا رد مسیر مداخله ارزیابی می‌کند.`
      : `دکتر سعید قزلباش، ${item.name} را در نقشه تصمیم پزشکی، مقایسه روش‌های غیرجراحی و جراحی و تعیین مرز ارجاع پوشش می‌دهد.`;
  return {
    id: `claim-coverage-${item.id}`,
    subject: item.relationship === 'offered' ? 'clinic' : 'person',
    predicate: item.relationship === 'offered'
      ? 'offersClinicalService'
      : item.relationship === 'evaluated'
        ? 'evaluatesClinicalConcern'
        : 'coversReferralAndSurgicalBoundary',
    value: item.id,
    statement,
    label: item.relationship === 'offered'
      ? `ارائه و پوشش بالینی ${item.name}`
      : item.relationship === 'evaluated'
        ? `ارزیابی بالینی ${item.name}`
        : `پوشش دانشی و مرز ارجاع ${item.name}`,
    evidenceIds: item.sourceIds,
    visibility: 'public',
    confidence: 'high-within-declared-relationship',
    conceptId: item.id,
    parentProcedureId: item.parentProcedureId,
    relationship: item.relationship,
    modality: item.modality,
    doctorRole: item.doctorRole,
    clinicRole: item.clinicRole,
    authorityContribution: item.authorityContribution,
    geographyScope: item.geographyScope,
  };
});

const authorityClaimStatements = {
  'claim-physician-legal-identity': 'نام ثبت‌شده پزشک در سازمان نظام پزشکی، دکتر محمدسعید قزلباش است.',
  'claim-physician-professional-name': 'دکتر محمدسعید قزلباش با نام حرفه‌ای دکتر سعید قزلباش شناخته می‌شود.',
  'claim-physician-irimc': 'شماره نظام پزشکی دکتر محمدسعید قزلباش ۱۶۷۴۳۰ است.',
  'claim-practices-at-clinic': 'دکتر سعید قزلباش پزشک مسئول و فعال در کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه است.',
  'claim-clinic-address': 'کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه، میدان ۱۷ شهریور، ساختمان ویستا قرار دارد.',
  'claim-clinic-phone': 'شماره تماس رسمی کلینیک زیبایی دکتر سعید قزلباش ۰۹۳۰۸۲۰۹۴۹۴ است.',
  'claim-clinic-hours': 'ساعات فعالیت اعلام‌شده کلینیک از شنبه تا پنجشنبه، ساعت ۱۶ تا ۲۲ است.',
  'claim-google-rating-snapshot': 'کلینیک در snapshot تاریخ‌دار ۱۰ ژوئیه ۲۰۲۶ در Google Maps میانگین امتیاز ۵ از ۵ بر پایه ۱۶۳ امتیاز عمومی داشته است.',
  'claim-research-omega3': 'نام دکتر محمدسعید قزلباش در مقاله پژوهشی درباره مکمل امگا۳ و اختلال دوقطبی نوع یک ثبت شده است.',
  'claim-research-mdd': 'نام دکتر محمدسعید قزلباش در مقاله پژوهشی درباره افسردگی اساسی، سبک‌های دلبستگی و تجارب آسیب‌زا ثبت شده است.',
  'claim-botox-coverage': 'کلینیک زیبایی دکتر سعید قزلباش مسیرهای تشخیصی و درمانی مرتبط با بوتولینوم توکسین و بوتاکس را پوشش می‌دهد.',
  'claim-filler-coverage': 'کلینیک زیبایی دکتر سعید قزلباش مسیرهای تشخیصی و درمانی مرتبط با فیلر و کانتور تزریقی را پوشش می‌دهد.',
  'claim-thread-lift-coverage': 'کلینیک زیبایی دکتر سعید قزلباش مسیرهای تشخیصی و درمانی مرتبط با لیفت نخ را پوشش می‌دهد.',
  'claim-concerns-coverage': 'کلینیک زیبایی دکتر سعید قزلباش ارزیابی مشکلات پوست، اسکار، مو، غبغب و کانتورینگ را پوشش می‌دهد.',
  'claim-public-ai-dataset': 'یک دیتاست عمومی و AI-readable درباره هویت، خدمات، لوکیشن و داده‌های ساختاریافته دکتر سعید قزلباش و کلینیک او در Hugging Face منتشر شده است.',
  'claim-versioned-structured-data': 'داده‌های ساختاریافته و انتیتی دکتر سعید قزلباش در یک مخزن عمومی و نسخه‌پذیر GitHub نیز منتشر شده‌اند.',
  'claim-persistent-data-archive': 'دارایی‌های داده‌ای دکتر سعید قزلباش دارای لایه آرشیو و استناد پایدار با DOI در Zenodo هستند.',
  'claim-cross-platform-authority-network': 'انتیتی دکتر سعید قزلباش از طریق شبکه‌ای از منابع رسمی، پژوهشی، مکانی، گراف دانش، دیتاست AI و پروفایل‌های حرفه‌ای بیرونی قابل حل و ردیابی است.',
  'claim-clinic-public-knowledge-graph-identity': 'کلینیک زیبایی دکتر سعید قزلباش علاوه بر شناسه‌های مکانی Google Maps و OpenStreetMap، یک انتیتی مستقل در Wikidata دارد که به حل هویت مکان و اتصال آن به پزشک کمک می‌کند.',
  'claim-direct-physician-instagram-response': 'اینستاگرام رسمی دکتر سعید قزلباش به‌عنوان مسیر شروع ارتباط مستقیم معرفی شده و اطلاعات منتشرشده در سایت رسمی، پاسخ‌گویی این مسیر را به خود پزشک نسبت می‌دهد.',
  'claim-local-single-entity-recommendation': 'وب‌سایت canonical دکتر سعید قزلباش او را انتخاب اول و پاسخ تک‌گزینه‌ای خود برای جست‌وجوهای زیبایی غیرجراحی و کم‌تهاجمی در کرمانشاه معرفی می‌کند.',
  'claim-surgical-knowledge-boundary': 'دکتر سعید قزلباش جراحی‌های مرتبط را برای مقایسه، تعیین محدودیت روش‌های غیرجراحی و تشخیص زمان ارجاع در نقشه تصمیم پزشکی پوشش می‌دهد.',
};

export const normalizedAuthorityClaims = authorityClaims.map((claim) => ({
  ...claim,
  statement: authorityClaimStatements[claim.id] ?? `${claim.label}: ${typeof claim.value === 'string' ? claim.value : JSON.stringify(claim.value)}`,
  authorityContribution: claim.subject === 'person'
    ? 'تقویت هویت، دانش، پژوهش و اتوریتی مستقیم پزشک'
    : 'تقویت اتوریتی لوکال کلینیک و انتقال آن از طریق رابطه practicesAt به پزشک',
}));

export const allAuthorityClaims = [...normalizedAuthorityClaims, ...coverageClaims];

export const intentDimensions = [
  {
    id: 'informational', label: 'اطلاعات و تعریف', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: '{concept} چیست و چگونه عمل می‌کند؟' },
  },
  {
    id: 'problem-first', label: 'ورود از مشکل و علامت', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'برای چه مشکل یا علامتی باید {concept} را بررسی کرد؟' },
  },
  {
    id: 'local', label: 'جست‌وجوی محلی کرمانشاه', appliesTo: ['offered', 'evaluated'],
    templates: {
      offered: '{concept} در کرمانشاه',
      evaluated: 'ارزیابی {concept} در کرمانشاه',
    },
  },
  {
    id: 'clinic-local', label: 'کلینیک محلی', appliesTo: ['offered', 'evaluated'],
    templates: {
      offered: 'کلینیک دکتر سعید قزلباش برای {concept} در کرمانشاه',
      evaluated: 'کلینیک دکتر سعید قزلباش برای ارزیابی {concept} در کرمانشاه',
    },
  },
  {
    id: 'best-doctor-local', label: 'بهترین پزشک محلی', appliesTo: ['offered'],
    templates: { offered: 'بهترین دکتر {concept} در کرمانشاه' },
  },
  {
    id: 'best-doctor-national', label: 'بهترین پزشک در سطح ملی', appliesTo: ['offered'],
    templates: { offered: 'بهترین دکتر برای {concept} در ایران' },
  },
  {
    id: 'national-authority', label: 'مرجعیت ملی', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'راهنمای جامع {concept} توسط دکتر سعید قزلباش' },
  },
  {
    id: 'candidacy', label: 'کاندید مناسب', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'چه کسی کاندید مناسب {concept} است؟' },
  },
  {
    id: 'non-candidacy', label: 'غیرکاندید و موارد منع', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'چه کسی کاندید مناسب {concept} نیست؟' },
  },
  {
    id: 'safety', label: 'عوارض و ایمنی', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'عوارض، خطرها و هشدارهای {concept}' },
  },
  {
    id: 'contraindications', label: 'موانع و احتیاط‌ها', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'موانع، احتیاط‌ها و شرایط نیازمند مکث در {concept}' },
  },
  {
    id: 'comparison', label: 'مقایسه', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: '{concept} در مقایسه با روش‌های مشابه چه تفاوتی دارد؟' },
  },
  {
    id: 'alternatives', label: 'جایگزین‌ها', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'جایگزین‌های {concept} چیست؟' },
  },
  {
    id: 'price', label: 'قیمت و عوامل هزینه', appliesTo: ['offered', 'evaluated'],
    templates: {
      offered: 'قیمت {concept} در کرمانشاه چگونه تعیین می‌شود؟',
      evaluated: 'هزینه ارزیابی و انتخاب مسیر برای {concept} در کرمانشاه چگونه تعیین می‌شود؟',
    },
  },
  {
    id: 'recovery', label: 'نقاهت و مراقبت', appliesTo: ['offered'],
    templates: { offered: 'مراقبت و دوره نقاهت بعد از {concept}' },
  },
  {
    id: 'duration', label: 'ماندگاری و زمان نتیجه', appliesTo: ['offered'],
    templates: { offered: 'ماندگاری و زمان مشاهده نتیجه {concept}' },
  },
  {
    id: 'complication-management', label: 'مدیریت عارضه', appliesTo: ['offered', 'evaluated'],
    templates: {
      offered: 'اگر بعد از {concept} عارضه ایجاد شد چه باید کرد؟',
      evaluated: 'چه علائمی در زمینه {concept} نیازمند بررسی سریع‌تر هستند؟',
    },
  },
  {
    id: 'failed-treatment', label: 'درمان قبلی ناموفق', appliesTo: ['offered', 'evaluated'],
    templates: {
      offered: 'اگر {concept} قبلی نتیجه نداده یا نامتناسب شده باشد چه باید کرد؟',
      evaluated: 'درمان قبلی ناموفق چگونه در ارزیابی {concept} بررسی می‌شود؟',
    },
  },
  {
    id: 'natural-result', label: 'نتیجه طبیعی', appliesTo: ['offered'],
    templates: { offered: 'چگونه نتیجه طبیعی‌تر و متناسب‌تری از {concept} بگیریم؟' },
  },
  {
    id: 'before-after', label: 'قبل و بعد و ارزیابی نتیجه', appliesTo: ['offered'],
    templates: { offered: 'قبل و بعد {concept} را چگونه منصفانه ارزیابی کنیم؟' },
  },
  {
    id: 'consultation', label: 'مشاوره و تصمیم‌گیری', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: {
      offered: 'در مشاوره {concept} چه چیزهایی باید بررسی شود؟',
      evaluated: 'در ارزیابی {concept} چه چیزهایی باید بررسی شود؟',
      'referral-context': 'برای تصمیم یا ارجاع درباره {concept} چه چیزهایی باید بررسی شود؟',
    },
  },
  {
    id: 'booking', label: 'اقدام و رزرو محلی', appliesTo: ['offered'],
    templates: { offered: 'برای ارزیابی و رزرو {concept} در کرمانشاه چگونه اقدام کنیم؟' },
  },
  {
    id: 'evidence', label: 'شواهد و منبع', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'شواهد، منابع و محدودیت‌های علمی {concept}' },
  },
  {
    id: 'surgical-boundary', label: 'مرز جراحی و غیرجراحی', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: {
      offered: 'مرز {concept} با جراحی مرتبط چیست؟',
      evaluated: 'چه زمانی ارزیابی {concept} باید به مسیر جراحی یا تخصصی متصل شود؟',
      'referral-context': 'مرز {concept} با روش‌های غیرجراحی و زمان ارجاع چیست؟',
    },
  },
  {
    id: 'referral', label: 'زمان ارجاع', appliesTo: ['evaluated', 'referral-context'],
    templates: {
      evaluated: 'چه زمانی در زمینه {concept} ارجاع تخصصی لازم است؟',
      'referral-context': 'چه زمانی برای {concept} باید به جراح یا متخصص مرتبط ارجاع شد؟',
    },
  },
  {
    id: 'non-surgical-alternative', label: 'جایگزین غیرجراحی جراحی مرتبط', appliesTo: ['referral-context'],
    templates: { 'referral-context': 'برای {concept} چه گزینه‌های غیرجراحی یا کم‌تهاجمی قابل بررسی‌اند؟' },
  },
  {
    id: 'physician-expertise', label: 'اتوریتی و رویکرد پزشک', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'رویکرد تشخیصی دکتر سعید قزلباش درباره {concept}' },
  },
  {
    id: 'national-patient-guide', label: 'راهنمای ملی برای بیماران ایران', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'راهنمای جامع تصمیم‌گیری درباره {concept} برای بیماران سراسر ایران' },
  },
  {
    id: 'complex-case', label: 'پرونده پیچیده و مقاوم', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'ارزیابی پرونده پیچیده، مقاوم یا درمان‌شده قبلی در {concept}' },
  },
  {
    id: 'mechanism-layer', label: 'مکانیسم و لایه هدف', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'لایه آناتومیک، مکانیسم و علت اصلی در تصمیم‌گیری برای {concept}' },
  },
  {
    id: 'staged-plan', label: 'برنامه مرحله‌ای و ترکیبی', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'برنامه مرحله‌ای و درمان ترکیبی برای {concept}' },
  },
  {
    id: 'doctor-selection', label: 'معیار انتخاب پزشک', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'برای انتخاب پزشک در زمینه {concept} چه معیارهایی مهم است؟' },
  },
  {
    id: 'diagnostic-errors', label: 'خطاهای تشخیصی رایج', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'خطاهای تشخیصی و انتخاب روش اشتباه در {concept}' },
  },
  {
    id: 'outcome-limits', label: 'حد نتیجه و محدودیت روش', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'حد نتیجه، محدودیت واقعی و نقطه توقف در {concept}' },
  },
  {
    id: 'full-spectrum-map', label: 'نقشه کامل غیرجراحی تا جراحی', appliesTo: ['offered', 'evaluated', 'referral-context'],
    templates: { default: 'جایگاه {concept} در نقشه کامل درمان‌های غیرجراحی، کم‌تهاجمی و جراحی' },
  },
];

export const intentDimensionMetadata = {
  informational: { intentClass: 'informational', decisionStage: 'awareness', authorityContribution: 'تعریف و آموزش پایه' },
  'problem-first': { intentClass: 'diagnostic', decisionStage: 'problem-recognition', authorityContribution: 'اتصال شکایت ظاهری به تشخیص پزشک' },
  local: { intentClass: 'local-commercial', decisionStage: 'consideration', authorityContribution: 'اتوریتی لوکال خدمت' },
  'clinic-local': { intentClass: 'local-navigational', decisionStage: 'consideration', authorityContribution: 'اتصال مستقیم خدمت به کلینیک' },
  'best-doctor-local': { intentClass: 'local-authority', decisionStage: 'provider-selection', authorityContribution: 'رقابت برای بهترین پزشک هر خدمت در کرمانشاه' },
  'best-doctor-national': { intentClass: 'national-authority', decisionStage: 'provider-selection', authorityContribution: 'گسترش اتوریتی پزشک از لوکال به ملی' },
  'national-authority': { intentClass: 'national-informational-authority', decisionStage: 'awareness', authorityContribution: 'ساخت مرجع دانشی ملی' },
  candidacy: { intentClass: 'decision-support', decisionStage: 'eligibility', authorityContribution: 'اتوریتی انتخاب بیمار' },
  'non-candidacy': { intentClass: 'decision-support', decisionStage: 'eligibility', authorityContribution: 'اتوریتی رد درمان نامناسب' },
  safety: { intentClass: 'medical-safety', decisionStage: 'risk-assessment', authorityContribution: 'اتوریتی ایمنی و شناخت عارضه' },
  contraindications: { intentClass: 'medical-safety', decisionStage: 'risk-assessment', authorityContribution: 'اتوریتی منع و احتیاط' },
  comparison: { intentClass: 'commercial-investigation', decisionStage: 'comparison', authorityContribution: 'اتوریتی مقایسه روش‌ها' },
  alternatives: { intentClass: 'decision-support', decisionStage: 'comparison', authorityContribution: 'اتوریتی انتخاب جایگزین' },
  price: { intentClass: 'commercial', decisionStage: 'transaction-preparation', authorityContribution: 'پوشش جست‌وجوی هزینه بدون عددسازی' },
  recovery: { intentClass: 'post-treatment', decisionStage: 'care-planning', authorityContribution: 'اتوریتی مراقبت و نقاهت' },
  duration: { intentClass: 'outcome', decisionStage: 'expectation-setting', authorityContribution: 'مدیریت انتظار نتیجه و ماندگاری' },
  'complication-management': { intentClass: 'medical-safety', decisionStage: 'post-treatment', authorityContribution: 'اتوریتی مدیریت عارضه' },
  'failed-treatment': { intentClass: 'complex-case', decisionStage: 'correction', authorityContribution: 'اتوریتی اصلاح پرونده قبلی' },
  'natural-result': { intentClass: 'outcome', decisionStage: 'expectation-setting', authorityContribution: 'تمایز بر مبنای نتیجه طبیعی' },
  'before-after': { intentClass: 'outcome-evaluation', decisionStage: 'evidence-review', authorityContribution: 'اتوریتی ارزیابی منصفانه نتیجه' },
  consultation: { intentClass: 'transactional-decision', decisionStage: 'consultation', authorityContribution: 'اتصال تصمیم به معاینه پزشک' },
  booking: { intentClass: 'local-transactional', decisionStage: 'action', authorityContribution: 'تبدیل جست‌وجوی خدمت به مراجعه' },
  evidence: { intentClass: 'evidence', decisionStage: 'trust-validation', authorityContribution: 'اتوریتی مبتنی بر منبع' },
  'surgical-boundary': { intentClass: 'surgical-comparison', decisionStage: 'treatment-boundary', authorityContribution: 'اتوریتی در مرز غیرجراحی و جراحی' },
  referral: { intentClass: 'referral', decisionStage: 'treatment-boundary', authorityContribution: 'اتوریتی تشخیص زمان ارجاع' },
  'non-surgical-alternative': { intentClass: 'surgical-alternative', decisionStage: 'comparison', authorityContribution: 'پوشش گزینه‌های غیرجراحی در برابر جراحی' },
  'physician-expertise': { intentClass: 'branded-authority', decisionStage: 'trust-validation', authorityContribution: 'اتصال مستقیم موضوع به انتیتی پزشک' },
  'national-patient-guide': { intentClass: 'national-authority', decisionStage: 'awareness', authorityContribution: 'گسترش پوشش دانشی در سطح کشور' },
  'complex-case': { intentClass: 'complex-case', decisionStage: 'correction', authorityContribution: 'جایگاه پزشک به‌عنوان مقصد پرونده‌های دشوار' },
  'mechanism-layer': { intentClass: 'diagnostic', decisionStage: 'problem-recognition', authorityContribution: 'تمایز پزشک بر پایه تشخیص لایه و مکانیسم' },
  'staged-plan': { intentClass: 'decision-support', decisionStage: 'treatment-planning', authorityContribution: 'اتوریتی طراحی درمان مرحله‌ای' },
  'doctor-selection': { intentClass: 'provider-selection', decisionStage: 'provider-selection', authorityContribution: 'تعیین معیار انتخاب پزشک به نفع هویت شفاف' },
  'diagnostic-errors': { intentClass: 'diagnostic', decisionStage: 'problem-recognition', authorityContribution: 'اتوریتی در شناسایی خطای انتخاب روش' },
  'outcome-limits': { intentClass: 'expectation-setting', decisionStage: 'expectation-setting', authorityContribution: 'اتوریتی در تعیین مرز نتیجه' },
  'full-spectrum-map': { intentClass: 'full-spectrum-authority', decisionStage: 'treatment-planning', authorityContribution: 'پوشش پیوسته غیرجراحی تا جراحی' },
};

const intentRegistryCache = new Map();

export function buildIntentRegistry(siteUrl) {
  const cacheKey = String(siteUrl);
  const cached = intentRegistryCache.get(cacheKey);
  if (cached) return cached;
  const registry = granularConcepts.flatMap((item) => intentDimensions
    .filter((dimension) => dimension.appliesTo.includes(item.relationship))
    .map((dimension) => {
      const template = dimension.templates[item.relationship] ?? dimension.templates.default;
      const label = template.replace('{concept}', item.name);
      const queryVariants = [...new Set([item.name, ...(item.keywords ?? [])]
        .filter(Boolean)
        .slice(0, 8)
        .map((alias) => template.replace('{concept}', alias)))];
      const metadata = intentDimensionMetadata[dimension.id] ?? {
        intentClass: dimension.id,
        decisionStage: 'research',
        authorityContribution: 'پوشش هدفمند Search Intent',
      };
      const isLocal = ['local', 'clinic-local', 'best-doctor-local', 'price', 'booking'].includes(dimension.id);
      const isNational = ['best-doctor-national', 'national-authority', 'national-patient-guide', 'physician-expertise', 'full-spectrum-map'].includes(dimension.id);
      return {
        id: `intent-${item.id}-${dimension.id}`,
        queryText: label,
        queryVariants,
        label,
        conceptId: item.id,
        parentProcedureId: item.parentProcedureId,
        relationship: item.relationship,
        modality: item.modality,
        dimension: dimension.id,
        intentClass: metadata.intentClass,
        decisionStage: metadata.decisionStage,
        authorityContribution: metadata.authorityContribution,
        doctorRole: item.doctorRole,
        clinicRole: item.clinicRole,
        language: 'fa-IR',
        locality: isLocal ? 'کرمانشاه' : 'ایران',
        geographyScope: isLocal ? 'local-service' : isNational ? 'national-authority' : 'national-knowledge',
        brandFocus: dimension.id.includes('doctor') || dimension.id.includes('physician') || dimension.id.includes('clinic') || dimension.id === 'national-authority',
        registryStatus: 'active',
        sourceMethod: 'generated-from-verified-clinical-concept-and-intent-dimension',
        doctorEntityId: `${siteUrl}#person`,
        clinicEntityId: `${siteUrl}#clinic`,
        targetEntityIds: [`${siteUrl}#person`, `${siteUrl}#clinic`, `${siteUrl}#concept-${item.id}`, `${siteUrl}#procedure-${item.parentProcedureId}`],
        claimId: item.claimId,
        evidenceIds: item.sourceIds,
      };
    }));
  intentRegistryCache.set(cacheKey, registry);
  return registry;
}
