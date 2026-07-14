export const homepageEntityIds = {
  person: 'mohammad-saeed-ghezelbash',
  clinic: 'dr-saeed-ghezelbash-aesthetic-clinic',
  website: 'website',
  webpage: 'webpage',
} as const;

export type HomepageSectionKind = 'component' | 'article';
export type HomepageTocGroup =
  | 'local'
  | 'treatment'
  | 'clinical'
  | 'safety'
  | 'authority';

export type HomepageSectionDefinition = {
  id: string;
  title: string;
  kind: HomepageSectionKind;
  tocGroup: HomepageTocGroup;
  intentClass: string[];
  geographyScope: string[];
  about: 'person' | 'clinic' | 'services' | 'medical-content' | 'data';
  includeInToc: true;
  includeInGraph: true;
};

export const homepageSections: HomepageSectionDefinition[] = [
  {
    id: 'best-aesthetic-doctor-kermanshah',
    title: 'بهترین دکتر زیبایی در کرمانشاه را چگونه انتخاب کنیم؟',
    kind: 'component',
    tocGroup: 'local',
    intentClass: ['local-selection', 'physician-selection'],
    geographyScope: ['Kermanshah', 'Iran'],
    about: 'person',
    includeInToc: true,
    includeInGraph: true,
  },
  {
    id: 'aesthetic-services-kermanshah',
    title: 'خدمات زیبایی در کرمانشاه؛ خدمات ارائه‌شده، ارزیابی و مرز ارجاع',
    kind: 'component',
    tocGroup: 'local',
    intentClass: ['local-service', 'commercial-investigation'],
    geographyScope: ['Kermanshah', 'Iran'],
    about: 'services',
    includeInToc: true,
    includeInGraph: true,
  },
  {
    id: 'aesthetic-treatment-selection',
    title: 'انتخاب درمان زیبایی براساس مشکل، آناتومی و نتیجه مورد انتظار',
    kind: 'article',
    tocGroup: 'treatment',
    intentClass: ['problem-first', 'treatment-selection'],
    geographyScope: ['Iran'],
    about: 'medical-content',
    includeInToc: true,
    includeInGraph: true,
  },
  {
    id: 'injectable-aesthetic-treatments',
    title: 'بوتاکس، فیلر و درمان‌های تزریقی زیبایی',
    kind: 'article',
    tocGroup: 'treatment',
    intentClass: ['injectables', 'treatment-guide'],
    geographyScope: ['Iran'],
    about: 'medical-content',
    includeInToc: true,
    includeInGraph: true,
  },
  {
    id: 'lifting-and-facial-aging',
    title: 'افتادگی صورت، لیفت نخ و انتخاب روش جوان‌سازی',
    kind: 'article',
    tocGroup: 'treatment',
    intentClass: ['facial-aging', 'lifting'],
    geographyScope: ['Iran'],
    about: 'medical-content',
    includeInToc: true,
    includeInGraph: true,
  },
  {
    id: 'skin-scar-rejuvenation',
    title: 'پوست، جای جوش، لک و جوان‌سازی',
    kind: 'article',
    tocGroup: 'clinical',
    intentClass: ['skin', 'scar', 'rejuvenation'],
    geographyScope: ['Iran'],
    about: 'medical-content',
    includeInToc: true,
    includeInGraph: true,
  },
  {
    id: 'hair-loss-and-restoration',
    title: 'ریزش مو، PRP، مزوتراپی و کاشت مو',
    kind: 'article',
    tocGroup: 'clinical',
    intentClass: ['hair-loss', 'restoration'],
    geographyScope: ['Iran'],
    about: 'medical-content',
    includeInToc: true,
    includeInGraph: true,
  },
  {
    id: 'submental-and-body-contouring',
    title: 'غبغب، کانتور صورت و لاغری موضعی',
    kind: 'article',
    tocGroup: 'clinical',
    intentClass: ['submental', 'contouring'],
    geographyScope: ['Iran'],
    about: 'medical-content',
    includeInToc: true,
    includeInGraph: true,
  },
  {
    id: 'aesthetic-surgery-and-referral',
    title: 'جراحی زیبایی و مرز ارجاع به جراح',
    kind: 'article',
    tocGroup: 'clinical',
    intentClass: ['surgery', 'referral-boundary'],
    geographyScope: ['Iran'],
    about: 'medical-content',
    includeInToc: true,
    includeInGraph: true,
  },
  {
    id: 'revision-complications-and-safety',
    title: 'اصلاح درمان قبلی، عوارض و ایمنی',
    kind: 'article',
    tocGroup: 'safety',
    intentClass: ['revision', 'complications', 'safety'],
    geographyScope: ['Iran'],
    about: 'medical-content',
    includeInToc: true,
    includeInGraph: true,
  },
  {
    id: 'aesthetic-cost-and-consultation',
    title: 'هزینه خدمات زیبایی، مشاوره و برنامه درمان',
    kind: 'article',
    tocGroup: 'safety',
    intentClass: ['cost', 'consultation'],
    geographyScope: ['Kermanshah', 'Iran'],
    about: 'services',
    includeInToc: true,
    includeInGraph: true,
  },
  {
    id: 'aesthetic-faq-kermanshah-iran',
    title: 'پرسش‌های متداول خدمات زیبایی در کرمانشاه و ایران',
    kind: 'article',
    tocGroup: 'safety',
    intentClass: ['faq', 'answer-first'],
    geographyScope: ['Kermanshah', 'Iran'],
    about: 'medical-content',
    includeInToc: true,
    includeInGraph: true,
  },
  {
    id: 'medical-research-and-education',
    title: 'پژوهش و آموزش پزشکی دکتر سعید قزلباش',
    kind: 'article',
    tocGroup: 'authority',
    intentClass: ['entity-authority', 'research', 'education'],
    geographyScope: ['Iran'],
    about: 'person',
    includeInToc: true,
    includeInGraph: true,
  },
  {
    id: 'clinic-information-kermanshah',
    title: 'کلینیک محل فعالیت دکتر سعید قزلباش در کرمانشاه',
    kind: 'component',
    tocGroup: 'authority',
    intentClass: ['clinic-entity', 'local-information'],
    geographyScope: ['Kermanshah', 'Iran'],
    about: 'clinic',
    includeInToc: true,
    includeInGraph: true,
  },
  {
    id: 'knowledge-graph-and-datasets',
    title: 'گراف دانش، دیتاست و داده‌های ساختاریافته',
    kind: 'component',
    tocGroup: 'authority',
    intentClass: ['knowledge-graph', 'dataset', 'structured-data'],
    geographyScope: ['Global'],
    about: 'data',
    includeInToc: true,
    includeInGraph: true,
  },
  {
    id: 'sources-contact-and-appointment',
    title: 'منابع، راه‌های ارتباطی و رزرو مشاوره',
    kind: 'component',
    tocGroup: 'authority',
    intentClass: ['sources', 'contact', 'appointment'],
    geographyScope: ['Kermanshah', 'Iran'],
    about: 'person',
    includeInToc: true,
    includeInGraph: true,
  },
];

export const articleHomepageSections = homepageSections.filter((section) => section.kind === 'article');

export const homepageTocGroups: Array<{
  id: HomepageTocGroup;
  title: string;
}> = [
  { id: 'local', title: 'انتخاب پزشک و خدمات در کرمانشاه' },
  { id: 'treatment', title: 'انتخاب درمان و درمان‌های غیرجراحی' },
  { id: 'clinical', title: 'پوست، مو، کانتورینگ و جراحی' },
  { id: 'safety', title: 'اصلاح، ایمنی، هزینه و پرسش‌های متداول' },
  { id: 'authority', title: 'پژوهش، کلینیک و منابع' },
];

export const homepageSectionById = new Map(homepageSections.map((section) => [section.id, section]));
