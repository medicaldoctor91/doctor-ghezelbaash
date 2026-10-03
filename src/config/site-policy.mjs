// Rendering and discovery policy. Semantic facts remain in the canonical graph.
// Domain exports are consumed directly; there is no shared page-metadata object.

export const datasetId = "https://www.ghezelbaash.ir/graph.jsonld/dataset";

const documentLanguage = "fa-IR";
export const documentPolicy = {
  "title": "بوتاکس، فیلر، لیفت نخ، کانتورینگ صورت و جوان‌سازی پوست | دکتر سعید قزلباش",
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

export const footerGovernance = {
  "summary": "حریم خصوصی و شرایط استفاده",
  "reputationLead": "امتیاز کلینیک یک مشاهدهٔ زمان‌دار از Google Maps است که هر شش ساعت بررسی می‌شود. متن نظرها و اطلاعات شخصی کاربران دریافت یا ذخیره نمی‌شود و منبع داده با پیوند مستقیم مشخص است. استفاده از این داده تابع",
  "mapsTerms": {
    "href": "https://www.google.com/help/terms_maps/",
    "label": "شرایط Google Maps"
  },
  "privacyPolicy": {
    "href": "https://policies.google.com/privacy",
    "label": "خط‌مشی حریم خصوصی Google"
  },
  "tail": "است."
};

export const headValues = {
  "google-site-verification": "8n4oKDWVkFyp-dUWoTAnLVO1HTr4ARpSPEVngAvybCQ",
  "theme-color": "#075244",
  "twitter:card": "summary_large_image",
  "apple-mobile-web-app-title": "دکتر قزلباش",
  "format-detection": "telephone=no",
  "color-scheme": "light"
};

export const intentTargets = {
  "botox": "https://www.ghezelbaash.ir/botox-doctor-selection-criteria-kermanshah",
  "filler": "https://www.ghezelbaash.ir/filler-doctor-selection-criteria-kermanshah",
  "aesthetic-physician": "https://www.ghezelbaash.ir/choosing-an-aesthetic-doctor-in-kermanshah-and-iran",
  "migraine-botox": "https://www.ghezelbaash.ir/therapeutic-botox-specialty-boundaries",
  "revision": "https://www.ghezelbaash.ir/revision-decision-wait-correct-dissolve-refer",
  "second-opinion": "https://www.ghezelbaash.ir/revision-intake-information",
  "complex-correction": "https://www.ghezelbaash.ir/why-aesthetic-treatment-fails-despite-correct-technique"
};

export const footerLabels = {
  "machineResourcesSummary": "داده‌های ساختاریافته و منابع ماشینی",
  "machineResourcesAriaLabel": "نسخه‌های ماشینی رسمی",
  "kaggleDataset": "Kaggle Dataset",
  "kaggleNotebook": "Kaggle Notebook",
  "footerAriaLabel": "تماس، حریم خصوصی و داده‌های رسمی",
  "kaggleAriaLabel": "منابع Kaggle"
};

export const guideNavigation = {
  "homeSummary": "موضوع‌های راهنما و زیرموضوع‌ها",
  "homeAriaLabel": "پیمایش موضوع‌های راهنمای دکتر سعید قزلباش"
};

export const discoveryPolicy = {
  "focusedViews": [
    {
      "path": "/historical-patient-origin-summary",
      "mode": "first-disclosure",
      "sourceHeading": "out-of-town-aesthetic-patients-iran",
      "title": "خلاصه تاریخی مبدأ جغرافیایی مراجعه‌کنندگان",
      "description": "این خلاصه، شهرهای مبدأ مراجعه‌های گذشته را از سوابق کلینیک گردآوری می‌کند و شواهدی از گسترهٔ جغرافیایی تاریخی است؛ تعداد بیماران یا ارائهٔ خدمات فعلی در همهٔ این شهرها را نشان نمی‌دهد."
    }
  ],
  "translationGroups": [
    {
      "members": [
        {
          "path": "/who-is-dr-saeed-ghezelbash-en",
          "lang": "en",
          "hreflang": "en"
        },
        {
          "path": "/who-is-dr-saeed-ghezelbash-ar-iq",
          "lang": "ar-IQ",
          "hreflang": "ar-IQ"
        },
        {
          "path": "/who-is-dr-saeed-ghezelbash-ckb-iq",
          "lang": "ckb-IQ",
          "hreflang": "ku-IQ"
        }
      ]
    },
    {
      "members": [
        {
          "path": "/which-facial-cosmetic-surgery-procedures-are-assessed-en",
          "lang": "en",
          "hreflang": "en"
        },
        {
          "path": "/which-facial-cosmetic-surgery-procedures-are-assessed-ar-iq",
          "lang": "ar-IQ",
          "hreflang": "ar-IQ"
        },
        {
          "path": "/which-facial-cosmetic-surgery-procedures-are-assessed-ckb-iq",
          "lang": "ckb-IQ",
          "hreflang": "ku-IQ"
        }
      ]
    },
    {
      "members": [
        {
          "path": "/which-non-surgical-aesthetic-treatments-are-available-en",
          "lang": "en",
          "hreflang": "en"
        },
        {
          "path": "/which-non-surgical-aesthetic-treatments-are-available-ar-iq",
          "lang": "ar-IQ",
          "hreflang": "ar-IQ"
        },
        {
          "path": "/which-non-surgical-aesthetic-treatments-are-available-ckb-iq",
          "lang": "ckb-IQ",
          "hreflang": "ku-IQ"
        }
      ]
    },
    {
      "members": [
        {
          "path": "/does-dr-ghezelbash-accept-filler-correction-cases-en",
          "lang": "en",
          "hreflang": "en"
        },
        {
          "path": "/does-dr-ghezelbash-accept-filler-correction-cases-ar-iq",
          "lang": "ar-IQ",
          "hreflang": "ar-IQ"
        },
        {
          "path": "/does-dr-ghezelbash-accept-filler-correction-cases-ckb-iq",
          "lang": "ckb-IQ",
          "hreflang": "ku-IQ"
        }
      ]
    },
    {
      "members": [
        {
          "path": "/can-iraqi-patients-send-photos-before-travel-en",
          "lang": "en",
          "hreflang": "en"
        },
        {
          "path": "/can-iraqi-patients-send-photos-before-travel-ar-iq",
          "lang": "ar-IQ",
          "hreflang": "ar-IQ"
        },
        {
          "path": "/can-iraqi-patients-send-photos-before-travel-ckb-iq",
          "lang": "ckb-IQ",
          "hreflang": "ku-IQ"
        }
      ]
    },
    {
      "members": [
        {
          "path": "/central-lip-lift-versus-lip-filler-en",
          "lang": "en",
          "hreflang": "en"
        },
        {
          "path": "/central-lip-lift-versus-lip-filler-ar-iq",
          "lang": "ar-IQ",
          "hreflang": "ar-IQ"
        },
        {
          "path": "/central-lip-lift-versus-lip-filler-ckb-iq",
          "lang": "ckb-IQ",
          "hreflang": "ku-IQ"
        }
      ]
    },
    {
      "members": [
        {
          "path": "/is-buccal-fat-removal-suitable-for-every-full-face-en",
          "lang": "en",
          "hreflang": "en"
        },
        {
          "path": "/is-buccal-fat-removal-suitable-for-every-full-face-ar-iq",
          "lang": "ar-IQ",
          "hreflang": "ar-IQ"
        },
        {
          "path": "/is-buccal-fat-removal-suitable-for-every-full-face-ckb-iq",
          "lang": "ckb-IQ",
          "hreflang": "ku-IQ"
        }
      ]
    },
    {
      "members": [
        {
          "path": "/can-surgical-and-non-surgical-treatments-be-combined-en",
          "lang": "en",
          "hreflang": "en"
        },
        {
          "path": "/can-surgical-and-non-surgical-treatments-be-combined-ar-iq",
          "lang": "ar-IQ",
          "hreflang": "ar-IQ"
        },
        {
          "path": "/can-surgical-and-non-surgical-treatments-be-combined-ckb-iq",
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
  "initialStatus": "عنوان‌های H1 تا H6 و مسیرهای موضوعی همین صفحه جست‌وجو می‌شوند.",
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
