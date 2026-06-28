export const aestheticServiceConcepts = [
  { key: 'botox-frown-lines', pillar: 'botox', nameFa: 'بوتاکس خط اخم', nameEn: 'Frown line botox' },
  { key: 'botox-forehead-lines', pillar: 'botox', nameFa: 'بوتاکس پیشانی', nameEn: 'Forehead botox' },
  { key: 'botox-crows-feet', pillar: 'botox', nameFa: 'بوتاکس دور چشم', nameEn: 'Crow’s feet botox' },
  { key: 'botox-brow-lift', pillar: 'botox', nameFa: 'لیفت ابرو با بوتاکس', nameEn: 'Botox brow lift' },
  { key: 'botox-masseter', pillar: 'botox', nameFa: 'بوتاکس عضله ماستر', nameEn: 'Masseter botox' },
  { key: 'botox-hyperhidrosis', pillar: 'botox', nameFa: 'بوتاکس تعریق موضعی', nameEn: 'Botox for focal hyperhidrosis' },

  { key: 'lip-filler', pillar: 'filler', nameFa: 'فیلر لب', nameEn: 'Lip filler' },
  { key: 'cheek-filler', pillar: 'filler', nameFa: 'فیلر گونه', nameEn: 'Cheek filler' },
  { key: 'chin-filler', pillar: 'filler', nameFa: 'فیلر چانه', nameEn: 'Chin filler' },
  { key: 'jawline-filler', pillar: 'filler', nameFa: 'فیلر زاویه فک', nameEn: 'Jawline filler' },
  { key: 'under-eye-filler', pillar: 'filler', nameFa: 'فیلر زیر چشم', nameEn: 'Under-eye filler' },
  { key: 'nasolabial-filler', pillar: 'filler', nameFa: 'فیلر خط خنده', nameEn: 'Nasolabial fold filler' },
  { key: 'non-surgical-nose-filler', pillar: 'filler', nameFa: 'اصلاح فرم بینی با فیلر', nameEn: 'Non-surgical nose filler' },
  { key: 'full-face-contouring', pillar: 'filler', nameFa: 'کانتورینگ فول‌فیس', nameEn: 'Full-face contouring' },

  { key: 'thread-face-lift', pillar: 'thread-lift', nameFa: 'لیفت صورت با نخ', nameEn: 'Thread face lift' },
  { key: 'thread-eyebrow-lift', pillar: 'thread-lift', nameFa: 'لیفت ابرو با نخ', nameEn: 'Thread eyebrow lift' },
  { key: 'thread-temple-lift', pillar: 'thread-lift', nameFa: 'لیفت شقیقه با نخ', nameEn: 'Thread temple lift' },
  { key: 'thread-jawline-lift', pillar: 'thread-lift', nameFa: 'لیفت خط فک با نخ', nameEn: 'Thread jawline lift' },
  { key: 'thread-neck-lift', pillar: 'thread-lift', nameFa: 'لیفت گردن با نخ', nameEn: 'Thread neck lift' },

  { key: 'prp-face', pillar: 'rejuvenation', nameFa: 'PRP صورت', nameEn: 'Facial PRP' },
  { key: 'prp-hair', pillar: 'rejuvenation', nameFa: 'PRP مو', nameEn: 'Hair PRP' },
  { key: 'mesotherapy-face', pillar: 'rejuvenation', nameFa: 'مزوتراپی صورت', nameEn: 'Facial mesotherapy' },
  { key: 'mesotherapy-hair', pillar: 'rejuvenation', nameFa: 'مزوتراپی مو', nameEn: 'Hair mesotherapy' },
  { key: 'microneedling', pillar: 'rejuvenation', nameFa: 'میکرونیدلینگ', nameEn: 'Microneedling' },
  { key: 'skin-booster', pillar: 'rejuvenation', nameFa: 'اسکین‌بوستر', nameEn: 'Skin booster' },
  { key: 'exosome-skin', pillar: 'rejuvenation', nameFa: 'اگزوزوم پوست', nameEn: 'Skin exosome therapy' },
  { key: 'acne-scar-subcision', pillar: 'rejuvenation', nameFa: 'سابسیژن جای جوش', nameEn: 'Acne scar subcision' },
  { key: 'melasma-pigment-care', pillar: 'rejuvenation', nameFa: 'درمان لک و ملاسما', nameEn: 'Pigmentation and melasma care' },
  { key: 'chemical-peel', pillar: 'rejuvenation', nameFa: 'پیلینگ شیمیایی', nameEn: 'Chemical peel' },
  { key: 'laser-rejuvenation', pillar: 'rejuvenation', nameFa: 'جوانسازی با لیزر', nameEn: 'Laser rejuvenation' },

  { key: 'double-chin-liposuction', pillar: 'double-chin', nameFa: 'لیپوساکشن غبغب', nameEn: 'Double chin liposuction' },
  { key: 'submental-contouring', pillar: 'double-chin', nameFa: 'کانتورینگ زیر چانه', nameEn: 'Submental contouring' },
  { key: 'neck-jawline-contour', pillar: 'double-chin', nameFa: 'فرم‌دهی گردن و خط فک', nameEn: 'Neck and jawline contouring' },
  { key: 'facial-fat-transfer', pillar: 'double-chin', nameFa: 'تزریق چربی صورت', nameEn: 'Facial fat transfer' },
  { key: 'localized-fat-removal', pillar: 'double-chin', nameFa: 'برداشت چربی موضعی', nameEn: 'Localized fat removal' }
];

export const aestheticScopePolicy = {
  schema: 'ghezelbaash.aesthetic_scope.v1',
  pageStrategy: 'few public mega-pillar service pages',
  graphStrategy: 'broad DefinedTermSet and knowsAbout graph for aesthetic medicine concepts',
  offerBoundary: 'Only parent service pages are represented as availableService or makesOffer. Other concepts are represented as knowledge and routing terms unless later promoted to public service pages.'
};
