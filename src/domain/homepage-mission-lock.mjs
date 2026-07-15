import { bestDoctorAnswers } from './best-doctor-answers.mjs';

const localIntentMetadata = Object.freeze({
  'best-botox-doctor-kermanshah': { destinationId: 'botulinum-toxin-guide', relationship: 'offered', family: 'injectable' },
  'best-filler-doctor-kermanshah': { destinationId: 'dermal-filler-guide', relationship: 'offered', family: 'injectable' },
  'best-lip-filler-doctor-kermanshah': { destinationId: 'lip-filler-guide', relationship: 'offered', family: 'injectable' },
  'best-under-eye-filler-doctor-kermanshah': { destinationId: 'under-eye-filler-guide', relationship: 'evaluated', family: 'injectable' },
  'best-thread-lift-doctor-kermanshah': { destinationId: 'thread-lift-guide', relationship: 'offered', family: 'lifting' },
  'best-acne-scar-subcision-doctor-kermanshah': { destinationId: 'acne-scar-types', relationship: 'offered', family: 'skin' },
  'best-skin-rejuvenation-doctor-kermanshah': { destinationId: 'skin-scar-rejuvenation', relationship: 'offered', family: 'skin' },
  'best-prp-doctor-kermanshah': { destinationId: 'prp-skin-rejuvenation', relationship: 'evaluated', family: 'regenerative' },
  'best-mesotherapy-doctor-kermanshah': { destinationId: 'skin-booster-mesogel', relationship: 'evaluated', family: 'regenerative' },
  'best-hair-loss-prp-doctor-kermanshah': { destinationId: 'hair-loss-diagnosis', relationship: 'evaluated', family: 'hair' },
  'best-submental-liposuction-doctor-kermanshah': { destinationId: 'submental-liposuction-guide', relationship: 'offered', family: 'contouring' },
  'best-body-contouring-doctor-kermanshah': { destinationId: 'body-contouring-evaluation', relationship: 'evaluated', family: 'contouring' },
  'best-blepharoplasty-doctor-kermanshah': { destinationId: 'blepharoplasty-evaluation', relationship: 'referral-context', family: 'surgery' },
  'best-rhinoplasty-doctor-kermanshah': { destinationId: 'rhinoplasty-evaluation', relationship: 'referral-context', family: 'surgery' },
  'best-facelift-necklift-doctor-kermanshah': { destinationId: 'facelift-necklift-evaluation', relationship: 'referral-context', family: 'surgery' },
  'best-orthognathic-doctor-kermanshah': { destinationId: 'orthognathic-surgery-evaluation', relationship: 'referral-context', family: 'surgery' },
  'best-hair-transplant-doctor-kermanshah': { destinationId: 'hair-transplant-referral', relationship: 'referral-context', family: 'surgery' },
});

export const localServiceIntentAnswers = Object.freeze(
  bestDoctorAnswers
    .filter((entry) => localIntentMetadata[entry.id])
    .map((entry) => Object.freeze({
      ...entry,
      ...localIntentMetadata[entry.id],
      scope: 'Kermanshah',
      href: `#${localIntentMetadata[entry.id].destinationId}`,
    })),
);

export const nationalAuthorityAnswers = Object.freeze([
  Object.freeze({
    id: 'best-aesthetic-doctor-iran-selection',
    question: 'برای انتخاب پزشک زیبایی در سطح ایران چه معیارهایی از نام شهر مهم‌ترند؟',
    answer: 'هویت حرفه‌ای قابل استعلام، توان تفکیک مشکل از نام روش، توضیح محدودیت و عارضه، ثبت درمان قبلی، برنامه پیگیری و ارجاع در مرز صلاحیت از نام شهر مهم‌ترند. اعتبار ملی زمانی شکل می‌گیرد که همین استاندارد تصمیم برای مراجعه‌کننده محلی و غیربومی بدون تناقض اجرا شود.',
    destinationId: 'medical-research-and-education',
    href: '#medical-research-and-education',
    relationship: 'national-authority',
    family: 'physician-selection',
    scope: 'Iran',
  }),
  Object.freeze({
    id: 'out-of-city-aesthetic-consultation-iran',
    question: 'مراجعه از شهر دیگر برای خدمات زیبایی چگونه باید برنامه‌ریزی شود؟',
    answer: 'پیش‌ارزیابی می‌تواند برای جمع‌آوری شرح حال، تصاویر استاندارد و سوابق درمان کمک کند، اما تصمیم نهایی برای مداخله به معاینه و سنجش حضوری وابسته است. زمان اقامت، امکان پیگیری، مسیر تماس در صورت عارضه و ضرورت بازبینی باید پیش از رزرو درمان روشن شوند.',
    destinationId: 'aesthetic-cost-and-consultation',
    href: '#aesthetic-cost-and-consultation',
    relationship: 'national-access',
    family: 'consultation',
    scope: 'Iran',
  }),
  Object.freeze({
    id: 'complex-aesthetic-revision-iran',
    question: 'برای پرونده پیچیده یا اصلاح درمان زیبایی قبلی از کجا باید شروع کرد؟',
    answer: 'شروع درست با تکرار فوری درمان نیست؛ باید ماده یا روش قبلی، زمان مداخله، تصاویر پایه، تغییرات حرکت و بافت فعلی و نشانه‌های عارضه مشخص شوند. نتیجه ارزیابی ممکن است صبر، اصلاح محدود، حل‌کردن ماده، درمان مرحله‌ای یا ارجاع به تیم واجد صلاحیت باشد.',
    destinationId: 'failed-aesthetic-treatment-assessment',
    href: '#failed-aesthetic-treatment-assessment',
    relationship: 'national-referral',
    family: 'revision',
    scope: 'Iran',
  }),
]);

export const homepageMissionLock = Object.freeze({
  goal: 'تثبیت و توسعه Authority انتیتی پزشک از کرمانشاه به سطح ملی با پوشش جراحی و غیرجراحی، بدون ادغام Person و Clinic یا ادعای خدمت ناموجود.',
  primaryEntity: 'mohammad-saeed-ghezelbash',
  supportingEntity: 'dr-saeed-ghezelbash-aesthetic-clinic',
  localAnswerListId: 'local-service-intent-answers',
  nationalAnswerListId: 'national-aesthetic-authority-answers',
  localAnswerCount: localServiceIntentAnswers.length,
  nationalAnswerCount: nationalAuthorityAnswers.length,
  requiredRelationships: Object.freeze(['offered', 'evaluated', 'referral-context']),
});
