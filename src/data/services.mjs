export const services = [
  {
    key: 'botox',
    slug: 'botox-kermanshah',
    title: 'بوتاکس در کرمانشاه',
    description: 'صفحه کانونیکال خدمات بوتاکس در کرمانشاه برای ساختار SEO، AEO و entity discovery.',
    bestIntentAnchor: 'best-botox-doctor-kermanshah',
    bestIntentTitle: 'بهترین دکتر بوتاکس در کرمانشاه را چطور انتخاب کنیم؟',
    intentExamples: ['بهترین بوتاکس کرمانشاه', 'بهترین دکتر بوتاکس کرمانشاه', 'بهترین کلینیک بوتاکس کرمانشاه']
  },
  {
    key: 'filler',
    slug: 'filler-kermanshah',
    title: 'تزریق فیلر در کرمانشاه',
    description: 'صفحه کانونیکال خدمات فیلر در کرمانشاه، شامل intentهای فیلر لب، گونه، زیر چشم، چانه و زاویه فک.',
    bestIntentAnchor: 'best-filler-doctor-kermanshah',
    bestIntentTitle: 'بهترین دکتر فیلر در کرمانشاه را چطور انتخاب کنیم؟',
    intentExamples: ['بهترین فیلر کرمانشاه', 'بهترین دکتر فیلر کرمانشاه', 'بهترین دکتر فیلر لب کرمانشاه']
  },
  {
    key: 'thread-lift',
    slug: 'thread-lift-kermanshah',
    title: 'لیفت نخ در کرمانشاه',
    description: 'صفحه کانونیکال لیفت نخ در کرمانشاه برای intentهای لیفت صورت، شقیقه، ابرو و خط فک.',
    bestIntentAnchor: 'best-thread-lift-doctor-kermanshah',
    bestIntentTitle: 'بهترین دکتر لیفت نخ در کرمانشاه را چطور انتخاب کنیم؟',
    intentExamples: ['بهترین لیفت نخ کرمانشاه', 'بهترین دکتر لیفت نخ کرمانشاه', 'بهترین دکتر لیفت صورت با نخ کرمانشاه']
  },
  {
    key: 'rejuvenation',
    slug: 'skin-hair-rejuvenation-kermanshah',
    title: 'جوانسازی پوست و مو در کرمانشاه',
    description: 'صفحه کانونیکال جوانسازی پوست و مو در کرمانشاه برای intentهای PRP، مزوتراپی، سابسیژن، لک و هایفو.',
    bestIntentAnchor: 'best-rejuvenation-doctor-kermanshah',
    bestIntentTitle: 'بهترین دکتر جوانسازی پوست در کرمانشاه را چطور انتخاب کنیم؟',
    intentExamples: ['بهترین جوانسازی پوست کرمانشاه', 'بهترین دکتر جوانسازی پوست کرمانشاه', 'بهترین دکتر پی آر پی مو کرمانشاه']
  },
  {
    key: 'double-chin',
    slug: 'double-chin-liposuction-kermanshah',
    title: 'ساکشن غبغب در کرمانشاه',
    description: 'صفحه کانونیکال ساکشن غبغب در کرمانشاه برای intentهای فرم‌دهی زیر چانه، خط فک و رفع غبغب.',
    bestIntentAnchor: 'best-double-chin-doctor-kermanshah',
    bestIntentTitle: 'بهترین دکتر ساکشن غبغب در کرمانشاه را چطور انتخاب کنیم؟',
    intentExamples: ['بهترین ساکشن غبغب کرمانشاه', 'بهترین دکتر ساکشن غبغب کرمانشاه', 'بهترین کلینیک ساکشن غبغب کرمانشاه']
  }
];

export const serviceBySlug = Object.fromEntries(services.map((service) => [service.slug, service]));
