export const topicGroups = [
  {
    id: 'clinical-decision-model',
    label: 'تشخیص، لایه‌ها و مدل تصمیم بالینی',
    shortLabel: 'مدل تشخیص',
    matches: ['اسم مشکل، درمان', 'صفحه را از بوتاکس', 'ظاهر، کل واقعیت', 'همهٔ چروک‌ها یکی نیستند', 'فیلر همه‌چیز را درست نمی‌کند', '«جای جوش» یک تشخیص نیست', 'لایه را پیدا کردید', 'تشخیص را میان‌بُر', 'صورت، منوی ناحیه‌ها نیست'],
    intents: ['diagnostic', 'informational', 'decision-support'],
    modalities: ['non-surgical', 'minimally-invasive', 'surgical-context'],
    relatedGroupIds: ['botulinum-toxin', 'dermal-fillers', 'thread-lift', 'surgery-and-referral'],
  },
  {
    id: 'physician-entity-authority',
    label: 'هویت، شواهد و اتوریتی پزشک',
    shortLabel: 'هویت پزشک',
    matches: ['اسم کلینیک مدرک نیست', 'بهترین دکتر زیبایی کرمانشاه', 'پروفایل زیاد، هویت قوی'],
    intents: ['entity', 'local', 'trust', 'navigational'],
    modalities: ['cross-modality'],
    relatedGroupIds: ['visit-and-contact', 'evidence-and-sources', 'clinical-decision-model'],
  },
  {
    id: 'botulinum-toxin',
    label: 'بوتولینوم توکسین و بوتاکس',
    shortLabel: 'بوتاکس',
    matches: ['هر چروکی بوتاکس می‌خواهد'],
    intents: ['informational', 'commercial-investigation', 'local', 'safety', 'comparison'],
    modalities: ['non-surgical'],
    relatedGroupIds: ['clinical-decision-model', 'dermal-fillers', 'complications-and-safety'],
  },
  {
    id: 'dermal-fillers',
    label: 'فیلر، حجم و کانتور صورت',
    shortLabel: 'فیلر',
    matches: ['فیلر صورت را لیفت می‌کند'],
    intents: ['informational', 'commercial-investigation', 'local', 'safety', 'comparison'],
    modalities: ['non-surgical', 'minimally-invasive'],
    relatedGroupIds: ['clinical-decision-model', 'thread-lift', 'surgery-and-referral', 'complications-and-safety'],
  },
  {
    id: 'thread-lift',
    label: 'لیفت نخ و مرز توان آن',
    shortLabel: 'لیفت نخ',
    matches: ['نخ، لیفت بدون جراحی'],
    intents: ['informational', 'commercial-investigation', 'local', 'safety', 'comparison', 'candidacy'],
    modalities: ['minimally-invasive', 'surgical-context'],
    relatedGroupIds: ['dermal-fillers', 'surgery-and-referral', 'complications-and-safety'],
  },
  {
    id: 'acne-scar',
    label: 'جوش، لک و اسکار آکنه',
    shortLabel: 'اسکار و جای جوش',
    matches: ['جای جوش» یک بیماری واحد نیست'],
    intents: ['diagnostic', 'informational', 'comparison', 'safety', 'local'],
    modalities: ['non-surgical', 'minimally-invasive'],
    relatedGroupIds: ['skin-quality-rejuvenation', 'correction-and-combination', 'complications-and-safety'],
  },
  {
    id: 'skin-quality-rejuvenation',
    label: 'کیفیت پوست و جوانسازی',
    shortLabel: 'جوانسازی پوست',
    matches: ['جوانسازی یعنی تزریق بیشتر', 'پوستم را جوان کن'],
    intents: ['diagnostic', 'informational', 'comparison', 'commercial-investigation', 'safety'],
    modalities: ['non-surgical', 'minimally-invasive', 'energy-based'],
    relatedGroupIds: ['acne-scar', 'dermal-fillers', 'correction-and-combination'],
  },
  {
    id: 'hair',
    label: 'ریزش مو، PRP و مزوتراپی مو',
    shortLabel: 'مو',
    matches: ['ریزش مو یعنی ضعف ریشه'],
    intents: ['diagnostic', 'informational', 'comparison', 'local', 'referral'],
    modalities: ['non-surgical', 'minimally-invasive', 'surgical-context'],
    relatedGroupIds: ['clinical-decision-model', 'surgery-and-referral', 'evidence-and-sources'],
  },
  {
    id: 'submental-and-body-contouring',
    label: 'غبغب و کانتورینگ صورت و بدن',
    shortLabel: 'غبغب و کانتور',
    matches: ['غبغب یعنی چربی', 'لاغری موضعی'],
    intents: ['diagnostic', 'informational', 'commercial-investigation', 'local', 'comparison', 'safety'],
    modalities: ['non-surgical', 'minimally-invasive', 'surgical'],
    relatedGroupIds: ['dermal-fillers', 'thread-lift', 'surgery-and-referral', 'complications-and-safety'],
  },
  {
    id: 'correction-and-combination',
    label: 'اصلاح درمان قبلی و درمان ترکیبی',
    shortLabel: 'اصلاح و درمان ترکیبی',
    matches: ['درمان قبلی بد بوده', 'درمان ترکیبی یعنی چند کار'],
    intents: ['diagnostic', 'post-treatment', 'comparison', 'decision-support'],
    modalities: ['cross-modality'],
    relatedGroupIds: ['clinical-decision-model', 'complications-and-safety', 'surgery-and-referral'],
  },
  {
    id: 'surgery-and-referral',
    label: 'جراحی‌های مرتبط و مرز ارجاع',
    shortLabel: 'جراحی و ارجاع',
    matches: ['غیرجراحی بهتر است'],
    intents: ['surgical', 'comparison', 'referral', 'candidacy', 'decision-support'],
    modalities: ['non-surgical', 'minimally-invasive', 'surgical', 'referral-boundary'],
    relatedGroupIds: ['clinical-decision-model', 'thread-lift', 'submental-and-body-contouring', 'complications-and-safety'],
  },
  {
    id: 'complications-and-safety',
    label: 'عوارض، هشدارها و پیگیری فوری',
    shortLabel: 'ایمنی و عوارض',
    matches: ['طبیعی است، صبر کن'],
    intents: ['safety', 'post-treatment', 'urgent-care', 'decision-support'],
    modalities: ['cross-modality'],
    relatedGroupIds: ['botulinum-toxin', 'dermal-fillers', 'thread-lift', 'surgery-and-referral'],
  },
  {
    id: 'visit-and-contact',
    label: 'آمادگی مراجعه و اطلاعات تماس',
    shortLabel: 'مراجعه و تماس',
    matches: ['عکس مدل، شرح حال نیست'],
    intents: ['local', 'transactional', 'navigational', 'candidacy'],
    modalities: ['cross-modality'],
    relatedGroupIds: ['physician-entity-authority', 'clinical-decision-model'],
  },
  {
    id: 'faq',
    label: 'پرسش‌های تصمیم‌ساز',
    shortLabel: 'پرسش‌های مهم',
    matches: ['سؤال سطحی جواب سطحی'],
    intents: ['question-answer', 'comparison', 'local', 'safety', 'commercial-investigation'],
    modalities: ['cross-modality'],
    relatedGroupIds: ['clinical-decision-model', 'visit-and-contact', 'complications-and-safety'],
  },
  {
    id: 'evidence-and-sources',
    label: 'منابع و سلسله‌مراتب شواهد',
    shortLabel: 'منابع',
    matches: ['منبع دارد» کافی نیست'],
    intents: ['evidence', 'trust', 'informational'],
    modalities: ['cross-modality'],
    relatedGroupIds: ['physician-entity-authority', 'clinical-decision-model'],
  },
  {
    id: 'conclusion',
    label: 'قاعدهٔ نهایی تصمیم',
    shortLabel: 'جمع‌بندی',
    matches: ['قاعدهٔ آخر'],
    intents: ['decision-support', 'summary'],
    modalities: ['cross-modality'],
    relatedGroupIds: ['clinical-decision-model', 'visit-and-contact'],
  },
];

export const procedures = [
  {
    id: 'botulinum-toxin', name: 'تزریق بوتولینوم توکسین و بوتاکس', alternateNames: ['بوتاکس', 'توکسین بوتولینوم'],
    modality: 'non-surgical', relationship: 'offered', schemaProcedureType: 'PercutaneousProcedure',
    bodyLocation: 'صورت، گردن و عضلات منتخب', serviceCategory: 'تزریق و تنظیم فعالیت عضله',
    scopeNote: 'خدمت تزریقی ارائه‌شده؛ انتخاب ناحیه و کاندید بر اساس معاینه و عملکرد عضله است.',
    keywords: ['بوتاکس', 'بوتولینوم', 'توکسین', 'ماستر', 'Lip Flip', 'لبخند لثه‌ای'],
  },
  {
    id: 'dermal-filler', name: 'تزریق فیلر و ژل هیالورونیک اسید', alternateNames: ['فیلر', 'ژل', 'فیلر هیالورونیک اسید'],
    modality: 'non-surgical', relationship: 'offered', schemaProcedureType: 'PercutaneousProcedure',
    bodyLocation: 'صورت و نواحی منتخب', serviceCategory: 'تزریق، حجم و کانتور',
    scopeNote: 'خدمت تزریقی ارائه‌شده؛ برای کمبود حجم و حمایت انتخابی، نه جایگزین عمومی جراحی.',
    keywords: ['فیلر', 'ژل', 'هیالورونیداز', 'هیالاز'],
  },
  {
    id: 'thread-lift', name: 'لیفت با نخ', alternateNames: ['لیفت نخ', 'نخ PDO', 'نخ PLLA', 'نخ PCL'],
    modality: 'minimally-invasive', relationship: 'offered', schemaProcedureType: 'PercutaneousProcedure',
    bodyLocation: 'صورت و گردن', serviceCategory: 'کم‌تهاجمی و جابه‌جایی محدود بافت',
    scopeNote: 'خدمت کم‌تهاجمی ارائه‌شده؛ قدرت آن با لیفت جراحی یکسان نیست.',
    keywords: ['لیفت نخ', 'نخ ', 'PDO', 'PLLA', 'PCL'],
  },
  {
    id: 'subcision', name: 'سابسیژن اسکار آکنه', alternateNames: ['سابسیژن جای جوش'],
    modality: 'minimally-invasive', relationship: 'offered', schemaProcedureType: 'PercutaneousProcedure',
    bodyLocation: 'پوست و بافت زیر اسکار', serviceCategory: 'آزادسازی چسبندگی اسکار',
    scopeNote: 'برای اسکارهای چسبنده منتخب؛ درمان رنگدانه یا همه انواع اسکار نیست.',
    keywords: ['سابسیژن', 'rolling scar'],
  },
  {
    id: 'acne-scar-treatment', name: 'ارزیابی و درمان ترکیبی اسکار آکنه', alternateNames: ['درمان جای جوش', 'درمان اسکار آکنه'],
    modality: 'minimally-invasive', relationship: 'offered', schemaProcedureType: 'PercutaneousProcedure',
    bodyLocation: 'پوست صورت و بدن', serviceCategory: 'درمان ترکیبی پوست و اسکار',
    scopeNote: 'خدمت ارائه‌شده پس از تفکیک لک، قرمزی، نوع و عمق اسکار.',
    keywords: ['اسکار', 'جای جوش', 'TCA CROSS', 'میکرونیدلینگ'],
  },
  {
    id: 'skin-rejuvenation', name: 'جوانسازی و بهبود کیفیت پوست', alternateNames: ['جوانسازی پوست', 'اسکین‌بوستر'],
    modality: 'non-surgical', relationship: 'offered', schemaProcedureType: null,
    bodyLocation: 'پوست صورت، گردن و نواحی منتخب', serviceCategory: 'کیفیت پوست و بازسازی',
    scopeNote: 'خدمت ارائه‌شده با انتخاب روش بر اساس کیفیت پوست و مکانیسم غالب.',
    keywords: ['جوانسازی', 'اسکین‌بوستر', 'پروفایلو', 'جالپرو', 'مزوبوتاکس', 'مزوژل'],
  },
  {
    id: 'prp-skin-hair', name: 'PRP پوست و مو', alternateNames: ['پی آر پی پوست', 'پی آر پی مو'],
    modality: 'minimally-invasive', relationship: 'offered', schemaProcedureType: 'PercutaneousProcedure',
    bodyLocation: 'پوست و پوست سر', serviceCategory: 'درمان تزریقی اتولوگ',
    scopeNote: 'خدمت ارائه‌شده؛ جایگزین تشخیص علت ریزش مو یا همه روش‌های جوانسازی نیست.',
    keywords: ['PRP'],
  },
  {
    id: 'mesotherapy', name: 'مزوتراپی پوست و مو', alternateNames: ['مزوتراپی مو', 'مزوتراپی پوست'],
    modality: 'minimally-invasive', relationship: 'offered', schemaProcedureType: 'PercutaneousProcedure',
    bodyLocation: 'پوست و پوست سر', serviceCategory: 'تزریق داخل‌پوستی',
    scopeNote: 'خدمت ارائه‌شده در کاندید منتخب و پس از تعیین هدف و ماده.',
    keywords: ['مزوتراپی'],
  },
  {
    id: 'hair-loss-evaluation', name: 'ارزیابی ریزش مو', alternateNames: ['تشخیص ریزش مو'],
    modality: 'non-surgical', relationship: 'offered', schemaProcedureType: 'NoninvasiveProcedure',
    bodyLocation: 'پوست سر و مو', serviceCategory: 'ارزیابی و تصمیم بالینی',
    scopeNote: 'ارزیابی ارائه‌شده برای نام‌گذاری الگوی ریزش و تعیین مسیر درمان یا ارجاع.',
    keywords: ['ریزش مو', 'پوست سر', 'فولیکول'],
  },
  {
    id: 'submental-liposuction', name: 'لیپوساکشن و ساکشن غبغب', alternateNames: ['ساکشن غبغب', 'لیپوساکشن غبغب'],
    modality: 'surgical', relationship: 'offered', schemaProcedureType: null,
    bodyLocation: 'چربی زیرچانه و گردن', serviceCategory: 'جراحی و کانتور زیرچانه',
    scopeNote: 'خدمت جراحی صریحاً ارائه‌شده؛ کاندیداتوری به سهم چربی، پوست، پلاتیسما و ساختار چانه وابسته است.',
    keywords: ['ساکشن غبغب', 'لیپوساکشن غبغب', 'چربی زیرچانه'],
  },
  {
    id: 'body-contouring', name: 'ارزیابی کانتورینگ و لاغری موضعی', alternateNames: ['کانتورینگ بدن', 'لاغری موضعی'],
    modality: 'mixed', relationship: 'evaluated', schemaProcedureType: null,
    bodyLocation: 'بدن و چربی موضعی', serviceCategory: 'ارزیابی کانتور بدن',
    scopeNote: 'موضوع برای تعیین مکانیسم و مسیر مناسب ارزیابی می‌شود؛ ارائه هر روش به ارزیابی وابسته است.',
    keywords: ['لاغری موضعی', 'کانتور بدن', 'کرایولیپولیز', 'سلولیت'],
  },
  {
    id: 'blepharoplasty', name: 'جراحی پلک و بلفاروپلاستی', alternateNames: ['بلفاروپلاستی', 'جراحی زیبایی پلک'],
    modality: 'surgical', relationship: 'referral-context', schemaProcedureType: null,
    bodyLocation: 'پلک بالا و پایین', serviceCategory: 'جراحی مرتبط و مرز ارجاع',
    scopeNote: 'برای مقایسه با روش‌های غیرجراحی، تشخیص پوست اضافه و تعیین زمان ارجاع پوشش داده می‌شود.',
    keywords: ['جراحی پلک', 'بلفاروپلاستی', 'پلک سنگین'],
  },
  {
    id: 'rhinoplasty', name: 'رینوپلاستی و جراحی بینی', alternateNames: ['رینوپلاستی', 'جراحی زیبایی بینی'],
    modality: 'surgical', relationship: 'referral-context', schemaProcedureType: null,
    bodyLocation: 'بینی و ساختار تنفسی', serviceCategory: 'جراحی مرتبط و مرز ارجاع',
    scopeNote: 'برای تفکیک اصلاح محدود با فیلر از تغییر ساختاری، عملکرد تنفسی و ارجاع پوشش داده می‌شود.',
    keywords: ['رینوپلاستی', 'جراحی بینی', 'بینی را با فیلر'],
  },
  {
    id: 'facelift-necklift', name: 'لیفت جراحی صورت و گردن', alternateNames: ['فیس‌لیفت', 'لیفت گردن'],
    modality: 'surgical', relationship: 'referral-context', schemaProcedureType: null,
    bodyLocation: 'صورت و گردن', serviceCategory: 'جراحی مرتبط و مرز ارجاع',
    scopeNote: 'برای مقایسه با نخ، فیلر و روش‌های انرژی‌محور و تعیین افت خارج از ظرفیت روش‌های غیرجراحی پوشش داده می‌شود.',
    keywords: ['لیفت صورت و گردن', 'لیفت جراحی', 'پوست اضافه'],
  },
  {
    id: 'orthognathic-surgery', name: 'جراحی فک و اصلاح اسکلتی', alternateNames: ['جراحی ارتوگناتیک', 'جراحی فک'],
    modality: 'surgical', relationship: 'referral-context', schemaProcedureType: null,
    bodyLocation: 'فک بالا، فک پایین و بایت', serviceCategory: 'جراحی مرتبط و مرز ارجاع',
    scopeNote: 'برای تفکیک مشکل اسکلتی و بایت از کانتور تزریقی و تعیین ارجاع پوشش داده می‌شود.',
    keywords: ['جراحی فک', 'بایت', 'اسکلت'],
  },
  {
    id: 'hair-transplant', name: 'پیوند و کاشت مو', alternateNames: ['کاشت مو', 'پیوند مو'],
    modality: 'surgical', relationship: 'referral-context', schemaProcedureType: null,
    bodyLocation: 'پوست سر و نواحی برداشت و کاشت', serviceCategory: 'جراحی مرتبط و مرز ارجاع',
    scopeNote: 'برای مقایسه با درمان‌های غیرجراحی ریزش مو و تعیین زمان ارجاع پوشش داده می‌شود.',
    keywords: ['پیوند مو', 'کاشت مو'],
  },
];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function getTopicGroup(title) {
  return topicGroups.find((group) => group.matches.some((term) => title.includes(term))) ?? topicGroups[0];
}

export function classifyHeading(title, depth = 2) {
  const group = getTopicGroup(title);
  const matchedProcedures = procedures.filter((procedure) => procedure.keywords.some((term) => title.toLocaleLowerCase('fa').includes(term.toLocaleLowerCase('fa'))));
  const intents = [...group.intents];
  if (title.includes('کرمانشاه')) intents.push('local');
  if (/قیمت|هزینه/.test(title)) intents.push('commercial-investigation');
  if (/بهتر است یا|فرق|مقایسه|یکی نیست|کدام/.test(title)) intents.push('comparison');
  if (/عوارض|هشدار|خطر|فوری|بعد از|مراقبت/.test(title)) intents.push('safety', 'post-treatment');
  if (/کاندید|چه کسانی|مناسب نیست|رد شود|مکث/.test(title)) intents.push('candidacy');
  if (/جراحی|ساکشن|لیپوساکشن|پیوند مو|کاشت مو|بلفارو|رینوپلاستی/.test(title)) intents.push('surgical');
  if (/[؟?]$/.test(title) || depth === 4) intents.push('question-answer');
  return {
    groupId: group.id,
    groupLabel: group.label,
    intents: unique(intents),
    modalities: unique([...group.modalities, ...matchedProcedures.map((item) => item.modality)]),
    procedureIds: matchedProcedures.map((item) => item.id),
  };
}

export function buildSectionRelationships(sections) {
  return sections.map((section, index) => {
    const group = getTopicGroup(section.text);
    const related = [];
    for (const candidate of sections) {
      if (candidate.slug === section.slug) continue;
      const candidateGroup = getTopicGroup(candidate.text);
      const sameGroup = candidateGroup.id === group.id;
      const adjacentGroup = group.relatedGroupIds.includes(candidateGroup.id);
      if (sameGroup || adjacentGroup) related.push(candidate.slug);
    }
    const previous = sections[index - 1]?.slug;
    const next = sections[index + 1]?.slug;
    return {
      id: section.slug,
      previous,
      next,
      related: unique([previous, next, ...related]).slice(0, 6),
    };
  });
}
