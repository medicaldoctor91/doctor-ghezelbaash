export const homepageEntityIds = Object.freeze({
  person: 'mohammad-saeed-ghezelbash',
  clinic: 'dr-saeed-ghezelbash-aesthetic-clinic',
  website: 'website',
  webpage: 'webpage',
});

export const homepageToc = Object.freeze({
  id: 'content-table',
  headingId: 'content-table-title',
  title: 'فهرست کامل راهنمای پزشکی زیبایی',
  groups: Object.freeze([
    Object.freeze({ id: 'local', title: 'انتخاب پزشک و خدمات در کرمانشاه' }),
    Object.freeze({ id: 'treatment', title: 'انتخاب درمان و درمان‌های غیرجراحی' }),
    Object.freeze({ id: 'clinical', title: 'پوست، مو، کانتورینگ و جراحی' }),
    Object.freeze({ id: 'safety', title: 'اصلاح، ایمنی، هزینه و پرسش‌های متداول' }),
    Object.freeze({ id: 'authority', title: 'پژوهش، کلینیک و منابع' }),
  ]),
});

export const homepageSections = Object.freeze([
  { order: 1, id: 'best-aesthetic-doctor-kermanshah', title: 'بهترین دکتر زیبایی در کرمانشاه را چگونه انتخاب کنیم؟', kind: 'component', tocGroup: 'local', intentClass: ['local-selection', 'physician-selection'], geographyScope: ['Kermanshah', 'Iran'], about: 'person', includeInToc: true, includeInGraph: true },
  { order: 2, id: 'aesthetic-services-kermanshah', title: 'خدمات زیبایی در کرمانشاه؛ خدمات ارائه‌شده، ارزیابی و مرز ارجاع', kind: 'component', tocGroup: 'local', intentClass: ['local-service', 'commercial-investigation'], geographyScope: ['Kermanshah', 'Iran'], about: 'services', includeInToc: true, includeInGraph: true },
  { order: 3, id: 'aesthetic-treatment-selection', title: 'انتخاب درمان زیبایی براساس مشکل، آناتومی و نتیجه مورد انتظار', kind: 'article', tocGroup: 'treatment', intentClass: ['problem-first', 'treatment-selection'], geographyScope: ['Iran'], about: 'medical-content', includeInToc: true, includeInGraph: true },
  { order: 4, id: 'injectable-aesthetic-treatments', title: 'بوتاکس، فیلر و درمان‌های تزریقی زیبایی', kind: 'article', tocGroup: 'treatment', intentClass: ['injectables', 'treatment-guide'], geographyScope: ['Iran'], about: 'medical-content', includeInToc: true, includeInGraph: true },
  { order: 5, id: 'lifting-and-facial-aging', title: 'افتادگی صورت، لیفت نخ و انتخاب روش جوان‌سازی', kind: 'article', tocGroup: 'treatment', intentClass: ['facial-aging', 'lifting'], geographyScope: ['Iran'], about: 'medical-content', includeInToc: true, includeInGraph: true },
  { order: 6, id: 'skin-scar-rejuvenation', title: 'پوست، جای جوش، لک و جوان‌سازی', kind: 'article', tocGroup: 'clinical', intentClass: ['skin', 'scar', 'rejuvenation'], geographyScope: ['Iran'], about: 'medical-content', includeInToc: true, includeInGraph: true },
  { order: 7, id: 'hair-loss-and-restoration', title: 'ریزش مو، PRP، مزوتراپی و کاشت مو', kind: 'article', tocGroup: 'clinical', intentClass: ['hair-loss', 'restoration'], geographyScope: ['Iran'], about: 'medical-content', includeInToc: true, includeInGraph: true },
  { order: 8, id: 'submental-and-body-contouring', title: 'غبغب، کانتور صورت و لاغری موضعی', kind: 'article', tocGroup: 'clinical', intentClass: ['submental', 'contouring'], geographyScope: ['Iran'], about: 'medical-content', includeInToc: true, includeInGraph: true },
  { order: 9, id: 'aesthetic-surgery-and-referral', title: 'جراحی زیبایی و مرز ارجاع به جراح', kind: 'article', tocGroup: 'clinical', intentClass: ['surgery', 'referral-boundary'], geographyScope: ['Iran'], about: 'medical-content', includeInToc: true, includeInGraph: true },
  { order: 10, id: 'revision-complications-and-safety', title: 'اصلاح درمان قبلی، عوارض و ایمنی', kind: 'article', tocGroup: 'safety', intentClass: ['revision', 'complications', 'safety'], geographyScope: ['Iran'], about: 'medical-content', includeInToc: true, includeInGraph: true },
  { order: 11, id: 'aesthetic-cost-and-consultation', title: 'هزینه خدمات زیبایی، مشاوره و برنامه درمان', kind: 'article', tocGroup: 'safety', intentClass: ['cost', 'consultation'], geographyScope: ['Kermanshah', 'Iran'], about: 'services', includeInToc: true, includeInGraph: true },
  { order: 12, id: 'aesthetic-faq-kermanshah-iran', title: 'پرسش‌های متداول خدمات زیبایی در کرمانشاه و ایران', kind: 'article', tocGroup: 'safety', intentClass: ['faq', 'answer-first'], geographyScope: ['Kermanshah', 'Iran'], about: 'medical-content', includeInToc: true, includeInGraph: true },
  { order: 13, id: 'medical-research-and-education', title: 'پژوهش و آموزش پزشکی دکتر سعید قزلباش', kind: 'article', tocGroup: 'authority', intentClass: ['entity-authority', 'research', 'education'], geographyScope: ['Iran'], about: 'person', includeInToc: true, includeInGraph: true },
  { order: 14, id: 'clinic-information-kermanshah', title: 'کلینیک محل فعالیت دکتر سعید قزلباش در کرمانشاه', kind: 'component', tocGroup: 'authority', intentClass: ['clinic-entity', 'local-information'], geographyScope: ['Kermanshah', 'Iran'], about: 'clinic', includeInToc: true, includeInGraph: true },
  { order: 15, id: 'knowledge-graph-and-datasets', title: 'گراف دانش، دیتاست و داده‌های ساختاریافته', kind: 'component', tocGroup: 'authority', intentClass: ['knowledge-graph', 'dataset', 'structured-data'], geographyScope: ['Global'], about: 'data', includeInToc: true, includeInGraph: true },
  { order: 16, id: 'sources-contact-and-appointment', title: 'منابع، راه‌های ارتباطی و رزرو مشاوره', kind: 'component', tocGroup: 'authority', intentClass: ['sources', 'contact', 'appointment'], geographyScope: ['Kermanshah', 'Iran'], about: 'person', includeInToc: true, includeInGraph: true },
].map((section) => Object.freeze({
  ...section,
  intentClass: Object.freeze([...section.intentClass]),
  geographyScope: Object.freeze([...section.geographyScope]),
})));

export const homepageTocGroups = homepageToc.groups;
export const homepageTocSections = Object.freeze(homepageSections.filter((section) => section.includeInToc));
export const articleHomepageSections = Object.freeze(homepageSections.filter((section) => section.kind === 'article'));
export const homepageSectionById = new Map(homepageSections.map((section) => [section.id, section]));
export const homepageMainSectionIds = Object.freeze(homepageSections.map((section) => section.id));
