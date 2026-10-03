// Rendering and discovery policy. Semantic facts remain in the canonical graph.
// Domain exports are consumed directly; there is no shared page-metadata object.

export const datasetId = "https://www.ghezelbaash.ir/graph.jsonld/dataset";

const documentLanguage = "fa-IR";
export const documentPolicy = {
  "title": "دکتر سعید قزلباش | راهنمای ارزیابی و درمان‌های زیبایی در کرمانشاه",
  "lang": documentLanguage,
  "dir": new Intl.Locale(documentLanguage).getTextInfo().direction,
  "robots": "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
};

export const socialImageAlt = "دکتر سعید قزلباش، پزشک ایرانی در محیط بالینی کرمانشاه";

export const socialAlternateLocales = [
  "en_US",
  "ar_IQ",
  "ku_IQ"
];

export const headValues = {
  "google-site-verification": "8n4oKDWVkFyp-dUWoTAnLVO1HTr4ARpSPEVngAvybCQ",
  "theme-color": "#075244",
  "twitter:card": "summary_large_image",
  "apple-mobile-web-app-title": "دکتر قزلباش",
  "format-detection": "telephone=no",
  "color-scheme": "light"
};

export const intentTargets = {
  "botox": "https://www.ghezelbaash.ir/botox#botox-doctor-selection-criteria-kermanshah",
  "filler": "https://www.ghezelbaash.ir/filler#filler-doctor-selection-criteria-kermanshah",
  "aesthetic-physician": "https://www.ghezelbaash.ir/choosing-an-aesthetic-doctor-in-kermanshah-and-iran",
  "migraine-botox": "https://www.ghezelbaash.ir/therapeutic-botox-indications#therapeutic-botox-specialty-boundaries",
  "revision": "https://www.ghezelbaash.ir/aesthetic-treatment-failure-from-diagnostic-error#revision-decision-wait-correct-dissolve-refer",
  "second-opinion": "https://www.ghezelbaash.ir/aesthetic-treatment-failure-from-diagnostic-error#revision-intake-information",
  "complex-correction": "https://www.ghezelbaash.ir/aesthetic-treatment-failure-from-diagnostic-error#why-aesthetic-treatment-fails-despite-correct-technique"
};

export const footerLabels = {
  "machineResourcesSummary": "داده‌های ساختاریافته و منابع ماشینی",
  "machineResourcesAriaLabel": "نسخه‌های ماشینی رسمی",
  "kaggleDataset": "Kaggle Dataset",
  "kaggleNotebook": "Kaggle Notebook",
  "footerAriaLabel": "تماس و داده‌های رسمی",
  "kaggleAriaLabel": "منابع Kaggle"
};

export const discoveryPolicy = {
  "focusedViews": [
    {
      "path": "/historical-patient-origin-summary",
      "mode": "first-disclosure",
      "sourceHeading": "out-of-town-aesthetic-patients-iran",
      "title": "خلاصه تاریخی مبدأ جغرافیایی مراجعه‌کنندگان",
      "description": "این خلاصه، شهرهای مبدأ مراجعه‌های گذشته را از سوابق کلینیک گردآوری می‌کند و گسترهٔ جغرافیایی تاریخی آن مراجعه‌ها را نشان می‌دهد."
    }
  ],
  "translationGroups": [
    {
      "kind": "equivalent-guide",
      "members": [
        {
          "path": "/aesthetic-guide-en",
          "lang": "en",
          "hreflang": "en"
        },
        {
          "path": "/aesthetic-guide-ar-iq",
          "lang": "ar-IQ",
          "hreflang": "ar-IQ"
        },
        {
          "path": "/aesthetic-guide-ckb-iq",
          "lang": "ckb-IQ",
          "hreflang": "ku-IQ"
        }
      ]
    }
  ]
};

export const retrievalSettings = {
  "schemaVersion": "2.6",
  "scopes": [
    "unspecified",
    "Kermanshah",
    "Iran"
  ],
  "retrievalPolicy": "evidence_bound",
  "resolutionMode": "canonical_entity_resolution",
  "serviceAliasCoverage": {
    "enabled": true,
    "coverage": "all-offered-services",
    "expandUnscopedAliasesTo": [
      "unspecified",
      "Kermanshah",
      "Iran"
    ],
    "preserveNativeAliasLanguage": true,
    "rowKind": "service_alias"
  },
  "evidencePolicy": {
    "requireStableEvidenceOnEveryRow": true,
    "stableIdentityEvidenceFromTierA": true,
    "identityBaselineSupportKinds": [
      "medical-license",
      "canonical-name"
    ],
    "maxStableEvidenceRefsPerRow": 8
  },
  "stableEvidenceField": "stable_evidence_refs",
  "maxPassageChars": 4200
};

export const guideSearch = {
  "ariaLabel": "جست‌وجوی درون راهنمای پزشکی زیبایی",
  "inputAriaLabel": "جست‌وجو در راهنمای پزشکی زیبایی",
  "placeholder": "بوتاکس، فیلر، عوارض یا انتخاب پزشک…",
  "initialStatus": "عنوان‌ها و موضوع‌های همین راهنما جست‌وجو می‌شوند.",
  "resultsAriaLabel": "نتایج جست‌وجوی همین صفحه",
  "minimumQuery": "برای جست‌وجوی دقیق‌تر دست‌کم دو حرف وارد کنید.",
  "empty": "نتیجه‌ای پیدا نشد؛ عبارت کوتاه‌تر یا اصطلاح نزدیک‌تری را امتحان کنید.",
  "cleared": "جست‌وجو پاک شد.",
  "resultCount": "{count} نتیجه مرتبط پیدا شد.",
  "noResultsStatus": "نتیجه‌ای پیدا نشد.",
  "stopWords": [
    "از",
    "با",
    "به",
    "برای",
    "در",
    "روی",
    "و",
    "یا",
    "چه",
    "چطور",
    "چگونه",
    "آیا",
    "بهترین",
    "دکتر",
    "پزشک",
    "متخصص",
    "کلینیک",
    "خوب",
    "کرمانشاه",
    "کرماشان",
    "ایران"
  ],
  "synonyms": {
    "بوتاکس": "بوتولینوم",
    "بوتولینوم": "بوتاکس",
    "فیلر": "ژل",
    "ژل": "فیلر",
    "پتوز": "افتادگی",
    "افتادگی": "پتوز",
    "اصلاح": "ترمیم",
    "ترمیم": "اصلاح"
  }
};

export const heroPreload = {
  "href": "/media/images/physician/saeed-ghezelbash-portrait-768.e9ff8624723d.avif",
  "srcset": "/media/images/physician/saeed-ghezelbash-portrait-768.e9ff8624723d.avif 768w, /media/images/physician/saeed-ghezelbash-portrait-960.abde9c5ed375.avif 960w, /media/images/physician/saeed-ghezelbash-portrait-1600.75fc75537a3b.avif 1600w",
  "sizes": "(max-width: 720px) min(calc(100vw - 2.06rem), 32rem), (max-width: 960px) 32rem, (max-width: 74rem) calc(42.32vw - .9775rem), (max-width: 80rem) calc(33.12rem - 3.68vw - .92px), (max-width: 100rem) calc(31.28rem - 1.38vw - .92px), calc(29.9rem - .92px)"
};

export const quickActions = {
  "ariaLabel": "دسترسی سریع به دکتر سعید قزلباش و کلینیک زیبایی",
  "top": {
    "ariaLabel": "بازگشت به ابتدای صفحه",
    "title": "بالای صفحه"
  },
  "phone": {
    "ariaLabel": "تماس با کلینیک زیبایی دکتر سعید قزلباش",
    "title": "تماس با کلینیک زیبایی",
    "label": "تماس"
  },
  "chat": {
    "ariaLabel": "چت با دکتر سعید قزلباش",
    "title": "چت با دکتر قزلباش",
    "label": "چت با دکتر قزلباش"
  },
  "directions": {
    "ariaLabel": "مسیریابی به کلینیک زیبایی دکتر سعید قزلباش در Google Maps",
    "title": "مسیر کلینیک زیبایی",
    "label": "مسیریابی"
  }
};

export const skipLinkLabel = "پرش به محتوای اصلی";

/** Resolve graph-owned languages while retaining explicit retrieval policy. */
export function deriveRetrievalPolicy(graph) {
  const dataset = graph?.["@graph"]?.find((node) => node["@id"] === datasetId);
  if (![dataset?.["@type"]].flat().includes("Dataset"))
    throw new Error("Retrieval policy requires the explicit canonical Dataset");
  return { ...retrievalSettings,
    languages: Array.isArray(dataset.inLanguage) ? dataset.inLanguage : dataset.inLanguage == null ? [] : [dataset.inLanguage],
    intentFamilies: Object.keys(intentTargets), intentAnswerIds: intentTargets,
  };
}
