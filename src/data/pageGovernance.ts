export interface PageGovernanceLink {
  label: string;
  href: string;
}

export interface PageGovernanceEvidence {
  topic: string;
  name: string;
  href: string;
  evidenceType: string;
}

export interface PageGovernanceEntry {
  pageId: string;
  path: string;
  title: string;
  canonicalEntity: string;
  category: string;
  definition: string;
  decisionFrame: string;
  adjacentEntities: PageGovernanceLink[];
  evidence: PageGovernanceEvidence[];
  reviewedAt: string;
  reviewedAtPersian: string;
  reviewedBy: string;
  reviewerCredential: string;
  reviewScope: string[];
}

export const pageGovernance: Record<string, PageGovernanceEntry> = {
  '/': {
    pageId: 'home',
    path: '/',
    title: 'دکتر سعید قزلباش؛ هاب هویت پزشک زیبایی در کرمانشاه',
    canonicalEntity: 'دکتر سعید قزلباش',
    category: 'پزشک زیبایی و هاب انتیتی اصلی سایت',
    definition:
      'دکتر سعید قزلباش پزشک زیبایی فعال در کرمانشاه است که محتوای این سایت را حول تشخیص، انتخاب درست بیمار و تصمیم‌گیری قبل از تکنیک سازمان‌دهی می‌کند.',
    decisionFrame:
      'این صفحه نقطه ورود برای شناخت پزشک، مسیرهای رسمی تماس، شواهد هویتی، آموزش پزشکان و چهار مسیر اصلی درمانی است؛ هدف آن فروش یک روش خاص نیست، بلکه ساختن یک مسیر قابل پیگیری برای تصمیم زیبایی است.',
    adjacentEntities: [
      { label: 'کلینیک زیبایی دکتر سعید قزلباش', href: '/dr-saeed-ghezelbash-aesthetic-clinic/' },
      { label: 'بوتاکس در کرمانشاه', href: '/botox-kermanshah/' },
      { label: 'تزریق فیلر در کرمانشاه', href: '/filler-kermanshah/' },
      { label: 'لیفت نخ در کرمانشاه', href: '/thread-lift-kermanshah/' },
      { label: 'درمان مشکلات زیبایی', href: '/aesthetic-concerns-kermanshah/' },
      { label: 'کد نظام پزشکی ۱۶۷۴۳۰', href: '#identity-evidence-list' },
    ],
    evidence: [
      {
        topic: 'هویت پزشکی',
        name: 'استعلام کد نظام پزشکی ۱۶۷۴۳۰',
        href: 'https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e',
        evidenceType: 'official-identity',
      },
      {
        topic: 'هویت پژوهشی',
        name: 'ORCID دکتر سعید قزلباش',
        href: 'https://orcid.org/0009-0001-9346-8475',
        evidenceType: 'scholarly-identity',
      },
      {
        topic: 'انتیتی دانش‌گراف',
        name: 'Wikidata پزشک',
        href: 'https://www.wikidata.org/entity/Q140287622',
        evidenceType: 'knowledge-graph',
      },
      {
        topic: 'نمونه‌کار/حضور بیرونی',
        name: 'Instagram رسمی نمونه‌کارها',
        href: 'https://www.instagram.com/doctor.ghezelbaash/',
        evidenceType: 'portfolio-presence',
      },
    ],
    reviewedAt: '2026-07-04',
    reviewedAtPersian: '۱۳ تیر ۱۴۰۵',
    reviewedBy: 'دکتر سعید قزلباش',
    reviewerCredential: 'کد نظام پزشکی ۱۶۷۴۳۰',
    reviewScope: [
      'visible content alignment',
      'medical wording safety',
      'entity graph consistency',
      'video/evidence layer',
    ],
  },
  '/dr-saeed-ghezelbash-aesthetic-clinic/': {
    pageId: 'clinic',
    path: '/dr-saeed-ghezelbash-aesthetic-clinic/',
    title: 'کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه',
    canonicalEntity: 'کلینیک زیبایی دکتر سعید قزلباش',
    category: 'LocalBusiness / MedicalClinic entity hub',
    definition:
      'کلینیک زیبایی دکتر سعید قزلباش هاب مکانی و سازمانی خدمات زیبایی غیرجراحی در کرمانشاه است که مسیر تماس، آدرس، نقشه، پزشک مسئول و چهار مگاپیلار درمانی را در یک منبع قابل پیگیری جمع می‌کند.',
    decisionFrame:
      'این صفحه برای کاربر و crawler روشن می‌کند که تصمیم درمانی به پزشک مشخص، مکان واقعی، شماره تماس و مسیرهای رسمی وصل است؛ نه به یک landing page بی‌هویت.',
    adjacentEntities: [
      { label: 'دکتر سعید قزلباش', href: '/' },
      { label: 'Google Maps clinic listing', href: 'https://www.google.com/maps?cid=12350483144643112463' },
      { label: 'OpenStreetMap clinic node', href: 'https://www.openstreetmap.org/node/13530287096' },
      { label: 'بوتاکس', href: '/botox-kermanshah/' },
      { label: 'فیلر', href: '/filler-kermanshah/' },
      { label: 'لیفت نخ', href: '/thread-lift-kermanshah/' },
    ],
    evidence: [
      {
        topic: 'مکان و مسیر',
        name: 'Google Maps listing',
        href: 'https://www.google.com/maps?cid=12350483144643112463',
        evidenceType: 'local-business',
      },
      {
        topic: 'مکان مستقل',
        name: 'OpenStreetMap clinic node',
        href: 'https://www.openstreetmap.org/node/13530287096',
        evidenceType: 'local-map',
      },
      {
        topic: 'هویت پزشک مسئول',
        name: 'استعلام نظام پزشکی',
        href: 'https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e',
        evidenceType: 'official-identity',
      },
      {
        topic: 'انتیتی کلینیک',
        name: 'Wikidata کلینیک',
        href: 'https://www.wikidata.org/entity/Q140288589',
        evidenceType: 'knowledge-graph',
      },
    ],
    reviewedAt: '2026-07-04',
    reviewedAtPersian: '۱۳ تیر ۱۴۰۵',
    reviewedBy: 'دکتر سعید قزلباش',
    reviewerCredential: 'کد نظام پزشکی ۱۶۷۴۳۰',
    reviewScope: [
      'visible content alignment',
      'medical wording safety',
      'entity graph consistency',
      'video/evidence layer',
    ],
  },
  '/botox-kermanshah/': {
    pageId: 'botox',
    path: '/botox-kermanshah/',
    title: 'بوتاکس در کرمانشاه؛ تعریف و مسیر تصمیم',
    canonicalEntity: 'بوتاکس در کرمانشاه',
    category: 'مسیر تزریق نورومدولاتور در پزشکی زیبایی',
    definition:
      'بوتاکس در پزشکی زیبایی، تزریق کنترل‌شده سم بوتولینوم برای کاهش فعالیت عضله‌های هدف است؛ بنابراین برای چین‌های دینامیک مناسب‌تر است، نه برای فرورفتگی، اسکار فیبروتیک یا چسبندگی زیرپوستی.',
    decisionFrame:
      'این صفحه بوتاکس را از زاویهٔ مکانیسم بررسی می‌کند: اگر مشکل با حرکت عضله یا فعالیت غده مرتبط باشد بوتاکس وارد تصمیم می‌شود؛ اگر مشکل حجم، افتادگی، خط ثابت یا tethering باشد مسیر باید عوض شود.',
    adjacentEntities: [
      { label: 'چروک دینامیک', href: '#botox-muscle-vs-tissue' },
      { label: 'خط اخم و پیشانی', href: '#botox-frown-lines' },
      { label: 'بوتاکس ماستر', href: '#botox-masseter' },
      { label: 'تعریق موضعی', href: '#botox-hyperhidrosis' },
      { label: 'سابسیژن و چسبندگی فیبروتیک', href: '/aesthetic-concerns-kermanshah/#acne-scar-subcision' },
      { label: 'فیلر برای حجم', href: '/filler-kermanshah/' },
    ],
    evidence: [
      {
        topic: 'برچسب دارویی',
        name: 'BOTOX Cosmetic prescribing information',
        href: 'https://www.rxabbvie.com/pdf/botox-cosmetic_pi.pdf',
        evidenceType: 'label-approved',
      },
      {
        topic: 'برچسب FDA',
        name: 'FDA BOTOX Cosmetic label 2024',
        href: 'https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/103000s5316s5319s5323s5326s5331lbl.pdf',
        evidenceType: 'regulatory-label',
      },
      {
        topic: 'هویت پزشک',
        name: 'استعلام نظام پزشکی',
        href: 'https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e',
        evidenceType: 'official-identity',
      },
      {
        topic: 'مسیر تصمیم داخلی',
        name: 'Decision matrix',
        href: '/data/decision-matrix.json',
        evidenceType: 'internal-routing',
      },
    ],
    reviewedAt: '2026-07-04',
    reviewedAtPersian: '۱۳ تیر ۱۴۰۵',
    reviewedBy: 'دکتر سعید قزلباش',
    reviewerCredential: 'کد نظام پزشکی ۱۶۷۴۳۰',
    reviewScope: [
      'visible content alignment',
      'medical wording safety',
      'entity graph consistency',
      'video/evidence layer',
    ],
  },
  '/filler-kermanshah/': {
    pageId: 'filler',
    path: '/filler-kermanshah/',
    title: 'تزریق فیلر در کرمانشاه؛ تعریف و مسیر تصمیم',
    canonicalEntity: 'تزریق فیلر در کرمانشاه',
    category: 'مسیر حجم‌دهی، فرم‌دهی و اصلاح تناسب با فیلر هیالورونیک اسید',
    definition:
      'تزریق فیلر در پزشکی زیبایی، استفاده هدفمند از مواد پرکننده برای اصلاح حجم، فرم، حمایت بافتی یا تناسب چهره است؛ تصمیم درست به ناحیه، عمق، ریسک عروقی و سابقه تزریق قبلی وابسته است.',
    decisionFrame:
      'این صفحه فیلر را به‌عنوان ابزار پرکردن ساده معرفی نمی‌کند؛ ابتدا مسئله حجم، فرم، ریسک ناحیه، سابقه قبلی و مرز با درمان‌های دیگر مثل بوتاکس یا لیفت نخ بررسی می‌شود.',
    adjacentEntities: [
      { label: 'فیلر لب', href: '#lip-filler' },
      { label: 'فیلر زیر چشم', href: '#under-eye-filler' },
      { label: 'فیلر بینی', href: '#nose-filler' },
      { label: 'ریسک عروقی', href: '#filler-vascular-risk' },
      { label: 'بوتاکس برای عضله', href: '/botox-kermanshah/' },
      { label: 'لیفت نخ برای افتادگی منتخب', href: '/thread-lift-kermanshah/' },
    ],
    evidence: [
      {
        topic: 'ریسک عروقی فیلر',
        name: 'Guideline for HA filler-induced vascular occlusion',
        href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8211329/',
        evidenceType: 'clinical-guideline',
      },
      {
        topic: 'استفاده از هیالورونیداز',
        name: 'Guideline for safe use of hyaluronidase',
        href: 'https://jcadonline.com/guideline-hyaluronidase-aesthetic/',
        evidenceType: 'clinical-guideline',
      },
      {
        topic: 'هویت پزشک',
        name: 'استعلام نظام پزشکی',
        href: 'https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e',
        evidenceType: 'official-identity',
      },
      {
        topic: 'نمونه‌کار',
        name: 'Instagram رسمی نمونه‌کارها',
        href: 'https://www.instagram.com/doctor.ghezelbaash/',
        evidenceType: 'portfolio-presence',
      },
    ],
    reviewedAt: '2026-07-04',
    reviewedAtPersian: '۱۳ تیر ۱۴۰۵',
    reviewedBy: 'دکتر سعید قزلباش',
    reviewerCredential: 'کد نظام پزشکی ۱۶۷۴۳۰',
    reviewScope: [
      'visible content alignment',
      'medical wording safety',
      'entity graph consistency',
      'video/evidence layer',
    ],
  },
  '/thread-lift-kermanshah/': {
    pageId: 'thread_lift',
    path: '/thread-lift-kermanshah/',
    title: 'لیفت نخ در کرمانشاه؛ تعریف و مسیر تصمیم',
    canonicalEntity: 'لیفت نخ در کرمانشاه',
    category: 'مسیر لیفت با نخ برای افتادگی‌های منتخب',
    definition:
      'لیفت نخ در پزشکی زیبایی، استفاده از نخ‌های قابل جذب یا محرک بافت برای جابه‌جایی محدود یا حمایت بافت در افتادگی‌های منتخب است؛ نتیجه آن به انتخاب کاندید، کیفیت پوست، مسیر نخ و انتظار واقع‌بینانه وابسته است.',
    decisionFrame:
      'این صفحه لیفت نخ را به‌عنوان جایگزین عمومی جراحی یا راه‌حل همه افتادگی‌ها معرفی نمی‌کند؛ ابتدا شلی پوست، حجم ازدست‌رفته، ضخامت بافت و حد انتظار فرد بررسی می‌شود.',
    adjacentEntities: [
      { label: 'کاندید مناسب لیفت نخ', href: '#thread-lift-candidate' },
      { label: 'افتادگی خفیف تا متوسط', href: '#thread-lift-sagging' },
      { label: 'مراقبت بعد از لیفت نخ', href: '#thread-lift-aftercare' },
      { label: 'عوارض نخ', href: '#thread-lift-risks' },
      { label: 'فیلر برای حجم', href: '/filler-kermanshah/' },
      { label: 'مشکلات زیبایی و غبغب', href: '/aesthetic-concerns-kermanshah/' },
    ],
    evidence: [
      {
        topic: 'عوارض لیفت نخ',
        name: 'Meta-analysis of thread lifting complications',
        href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13076318/',
        evidenceType: 'systematic-review',
      },
      {
        topic: 'dimpling/extrusion',
        name: 'Thread lift complications review',
        href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7507174/',
        evidenceType: 'clinical-review',
      },
      {
        topic: 'مواد نخ',
        name: 'Thread lifting materials review',
        href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11086642/',
        evidenceType: 'clinical-review',
      },
      {
        topic: 'هویت پزشک',
        name: 'استعلام نظام پزشکی',
        href: 'https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e',
        evidenceType: 'official-identity',
      },
    ],
    reviewedAt: '2026-07-04',
    reviewedAtPersian: '۱۳ تیر ۱۴۰۵',
    reviewedBy: 'دکتر سعید قزلباش',
    reviewerCredential: 'کد نظام پزشکی ۱۶۷۴۳۰',
    reviewScope: [
      'visible content alignment',
      'medical wording safety',
      'entity graph consistency',
      'video/evidence layer',
    ],
  },
  '/aesthetic-concerns-kermanshah/': {
    pageId: 'aesthetic_concerns',
    path: '/aesthetic-concerns-kermanshah/',
    title: 'درمان مشکلات زیبایی در کرمانشاه؛ تشخیص مسئله قبل از درمان',
    canonicalEntity: 'درمان مشکلات زیبایی در کرمانشاه',
    category: 'هاب تشخیص مسئله برای لک، جای جوش، مو، غبغب و کیفیت پوست',
    definition:
      'صفحه درمان مشکلات زیبایی در کرمانشاه نقطه شروع برای کاربرانی است که هنوز نام درمان درست را نمی‌دانند و باید مسئله‌هایی مثل لک، جای جوش، ریزش مو، غبغب، منافذ یا کیفیت پوست را قبل از انتخاب روش تفکیک کنند.',
    decisionFrame:
      'این صفحه جلوی پرش مستقیم از دغدغه به نام درمان را می‌گیرد؛ مثلاً لک با ملاسما یا PIH یکی نیست، جای جوش فرورفته همیشه یک مکانیسم ندارد و سابسیژن فقط وقتی منطق دارد که چسبندگی فیبروتیک زیرپوستی نقش داشته باشد.',
    adjacentEntities: [
      { label: 'لک و ملاسما', href: '#pigmentation-melasma' },
      { label: 'جای جوش و tethering', href: '#acne-scar-subcision' },
      { label: 'مزونیدلینگ و لک', href: '#video-aesthetic-mesoneedling-dark-spots-warning' },
      { label: 'سابسیژن', href: '#video-aesthetic-subcision-technique-guide' },
      { label: 'اسکین‌بوستر', href: '#video-aesthetic-jalupro-vs-profhilo-skin-boosters' },
      { label: 'فیلر زیر چشم', href: '/filler-kermanshah/#under-eye-filler' },
    ],
    evidence: [
      {
        topic: 'PIH',
        name: 'Postinflammatory hyperpigmentation review',
        href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2921758/',
        evidenceType: 'clinical-review',
      },
      {
        topic: 'facial hyperpigmentation',
        name: 'Management of facial hyperpigmentation in skin of colour',
        href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9165630/',
        evidenceType: 'clinical-review',
      },
      {
        topic: 'سابسیژن',
        name: 'Subcision acne scar review focused on tethered/rolling scars',
        href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9868281/',
        evidenceType: 'clinical-review',
      },
      {
        topic: 'اسکین‌بوستر',
        name: 'Systematic review of Profhilo efficacy and safety',
        href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13038071/',
        evidenceType: 'systematic-review',
      },
    ],
    reviewedAt: '2026-07-04',
    reviewedAtPersian: '۱۳ تیر ۱۴۰۵',
    reviewedBy: 'دکتر سعید قزلباش',
    reviewerCredential: 'کد نظام پزشکی ۱۶۷۴۳۰',
    reviewScope: [
      'visible content alignment',
      'medical wording safety',
      'entity graph consistency',
      'video/evidence layer',
    ],
  },
};

export function getPageGovernance(pathname: string): PageGovernanceEntry {
  return pageGovernance[pathname] ?? pageGovernance['/'];
}
