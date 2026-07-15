# Homepage stages 1–4 execution record

این سند رکورد اجرایی و ممیزی مراحل ۱ تا ۴ بازمعماری Homepage است. هدف آن ثبت baseline، وابستگی‌های مهاجرت، قرارداد canonical و وضعیت گیت‌های پذیرش است؛ نه ایجاد منبع حقیقت موازی برای HTML یا Graph.

## محدوده و نقاط مبنا

- مخزن: `medicaldoctor91/doctor-ghezelbaash`
- شاخه پایه: `main`
- baseline پیش از قرارداد مرکزی مرحله ۲: `c2608056ffb3ee6f35a1f7f097fdd2cccb17e46a`
- پایان مرحله ۲: `318e9a5f8c53f385d5748892691d8e4735d727a6`
- پایان مرحله ۳: `7e4e243102ebd74cde4e6f526e3a6379148b8c1c`
- پایان مرحله ۴: `c851f671dab6fc21a834f92a64d20f4940937b79`
- HEAD مورد بازاعتبارسنجی پس از مرحله ۵: `166b2db55a4a04ff8c2c71749a3832ec0f08f6b4`

PRهای مرجع:

- مرحله ۲: PR #56 — `Complete Stage 2 central Homepage architecture contract`
- مرحله ۳: PR #57 — `Complete Stage 3 Homepage hero contract`
- مرحله ۴: PR #58 — `Complete Stage 4 Homepage outline`

## مرحله ۱ — ممیزی و نقشه مهاجرت

### فایل‌های اصلی درگیر

#### ورودی و مونتاژ Homepage

- `src/pages/index.astro`
- `src/content/landing.md`
- `src/layouts/SiteLayout.astro`

#### قرارداد مرکزی و Anchorها

- `src/domain/homepage-content-registry.mjs`
- `src/domain/homepage-sections.mjs`
- `src/domain/homepage-sections.ts`
- `src/domain/homepage-article-registry.mjs`
- `src/domain/homepage-subsections.ts`
- `src/domain/anchors.ts`
- `src/domain/media.mjs`

#### اجزای رأس صفحه و اسکلت معنایی

- `src/components/home/PhysicianHero.astro`
- `src/components/home/ContentTable.astro`
- `src/components/home/BestDoctorAnswers.astro`
- `src/components/home/Services.astro`
- `src/components/home/HomepageGuideV2.astro`
- `src/components/home/ClinicInformation.astro`
- `src/components/home/KnowledgeGraphSources.astro`
- `src/components/home/ContactSection.astro`
- `src/components/home/HomeFooter.astro`

#### Graph و داده ساختاریافته که در مراحل ۱ تا ۴ فقط باید build-safe بمانند

- `src/compilers/google-page-graph.ts`
- `src/compilers/homepage-graph-contract.ts`
- `src/compilers/homepage-graph-completeness.ts`
- `src/compilers/homepage-graph-audit-fixes.ts`
- `src/pages/knowledge-graph.jsonld.ts`
- `src/lib/schema.ts`

#### Validatorها و build contract

- `package.json`
- `scripts/validate-stage-2-architecture.mjs`
- `scripts/validate-stage-3-hero.mjs`
- `scripts/validate-stage-4-outline.mjs`
- `scripts/validate-release.mjs`
- `scripts/validate-visible-contract.mjs`
- `scripts/validate-schema-semantics.mjs`
- `scripts/validate-nine-stage-audit.mjs`

### قرارداد canonical انتیتی‌ها

| مفهوم | Fragment canonical | URI کامل |
|---|---|---|
| Person | `#mohammad-saeed-ghezelbash` | `https://www.ghezelbaash.ir/#mohammad-saeed-ghezelbash` |
| Clinic | `#dr-saeed-ghezelbash-aesthetic-clinic` | `https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic` |
| WebPage | `#webpage` | `https://www.ghezelbaash.ir/#webpage` |
| WebSite | `#website` | `https://www.ghezelbaash.ir/#website` |

نسخه‌های جایگزین املایی یا کوتاه‌شده برای Person و Clinic canonical نیستند و نباید در DOM یا Graph به‌عنوان alias زنده بمانند.

### ماتریس مهاجرت Anchorهای سطح بالا

| Anchor قدیمی/مبهم | وضعیت نهایی | مقصد canonical یا تصمیم مهاجرت |
|---|---|---|
| `#article` | حذف | محتوای مقاله میان ۱۱ سکشن article canonical توزیع شده است. |
| `#clinical-guide` | حذف | `#aesthetic-treatment-selection` و خوشه‌های درمانی مرتبط |
| `#services` | حذف | `#aesthetic-services-kermanshah` |
| `#clinic-reputation` | حذف | `#clinic-information-kermanshah`؛ Rating در Hero نیز نمایش داده می‌شود. |
| `#search-intent-hub` | حذف | `#best-aesthetic-doctor-kermanshah` و Content Table |
| `#priority-answer-hub` | حذف | `#best-aesthetic-doctor-kermanshah` و H3های answer-first |
| `#knowledge-resources` | حذف | `#knowledge-graph-and-datasets` |
| `#videos` | حذف | ویدئوها به سکشن پزشکی یا آموزشی مرتبط منتقل شده‌اند. |
| `#video-knowledge-hub` | حذف | هیچ Video Hub مستقل باقی نمانده است. |
| `#legacy-article-N` | حذف | fallback رندر legacy مجاز نیست. |
| `#clinical-decision-model-*` | حذف از DOM | فقط به‌عنوان locator منبع در Registry داخلی استفاده می‌شود و Fragment عمومی نیست. |

قانون مهاجرت: هر Fragment عمومی باید یک مفهوم یکتا داشته باشد. شناسه‌های legacy می‌توانند برای استخراج محتوای منبع داخل Registry استفاده شوند، اما نباید در HTML build‌شده، TOC یا Graph URI باقی بمانند.

### نقشه قطعی ویدئوها

| video id | sectionId | subsectionId |
|---|---|---|
| `home-workshop-thread-lift-training` | `medical-research-and-education` | `medical-education` |
| `home-workshop-thread-lift-advanced` | `medical-research-and-education` | `medical-education` |
| `clinic-patient-experience-review` | `clinic-information-kermanshah` | — |
| `botox-vs-subcision-dynamic-static-scar` | `injectable-aesthetic-treatments` | `botulinum-toxin-guide` |
| `filler-under-eye-transformation` | `injectable-aesthetic-treatments` | `under-eye-filler-guide` |
| `filler-under-eye-before-after` | `injectable-aesthetic-treatments` | `under-eye-filler-guide` |
| `cat-eye-thread-lift-before-after` | `lifting-and-facial-aging` | `thread-lift-guide` |
| `jalupro-vs-profhilo-skin-boosters` | `skin-scar-rejuvenation` | `skin-booster-mesogel` |
| `nonsurgical-rhinoplasty-boundary` | `aesthetic-surgery-and-referral` | `rhinoplasty-evaluation` |
| `nose-filler-before-after` | `injectable-aesthetic-treatments` | `facial-contouring-injections` |
| `proper-subcision-technique-guide` | `skin-scar-rejuvenation` | `subcision-guide` |
| `mesoneedling-dark-spots-warning` | `skin-scar-rejuvenation` | `pigmentation-melasma-guide` |

هیچ ویدئویی مجاز نیست با text matching یا fallback به اولین سکشن منتقل شود.

### تعارض‌ها و تصمیم‌های قطعی

1. شناسه Person فقط `mohammad-saeed-ghezelbash` است.
2. شناسه Clinic فقط `dr-saeed-ghezelbash-aesthetic-clinic` است.
3. `#clinic-information-kermanshah` سکشن محتوایی است، نه شناسه انتیتی Clinic.
4. Person تنها `mainEntity` Homepage باقی می‌ماند؛ Clinic انتیتی پشتیبان مستقل است.
5. Google Maps در `hasMap` و HTML مکانی استفاده می‌شود، نه `sameAs`.
6. Instagram profile می‌تواند `sameAs` باشد؛ Instagram Direct فقط CTA است.
7. Content Table باید دقیقاً بعد از بلوک Person قرار گیرد.
8. مقدمه Person Anchor مستقل و ورودی TOC ندارد.
9. دو ویدئوی آموزش پزشکی فقط زیر `#medical-education` قرار می‌گیرند.
10. شناسه‌های عددی legacy فقط locator منبع هستند و در خروجی عمومی مجاز نیستند.

## مرحله ۲ — قرارداد مرکزی معماری

منبع حقیقت مرکزی:

- `src/domain/homepage-content-registry.mjs`
- `src/domain/homepage-sections.mjs`
- `src/domain/homepage-article-registry.mjs`

قرارداد مرحله ۲ شامل موارد زیر است:

- ۴ شناسه انتیتی canonical
- Content Table با ID و heading ID ثابت
- ۵ گروه TOC
- ۱۶ H2 canonical با ترتیب `1..16`
- عنوان، kind، Search Intent، geographyScope، about، includeInToc و includeInGraph
- H3های article منتخب و parentId آن‌ها
- جایگاه صریح همه ویدئوها

گیت ماشینی: `scripts/validate-stage-2-architecture.mjs`

وضعیت ثبت‌شده:

- ۱۶ H2 canonical
- ترتیب قطعی ۱ تا ۱۶
- ۵ گروه TOC
- عدم تکرار ID و عنوان H2/H3
- تمام مقصدهای TOC قابل تولید
- تمام parentهای H3 معتبر
- تمام مقصدهای ویدئو معتبر

## مرحله ۳ — رأس Person-first Homepage

پیاده‌سازی اصلی: `src/components/home/PhysicianHero.astro`

ترتیب قطعی:

1. H1 یکتا
2. مقدمه سه‌پاراگرافی ۱۸۰ تا ۲۸۰ کلمه
3. portrait اصلی پزشک
4. نوار اعتبار و اقدام
5. Content Table بلافاصله پس از header

قرارداد Hero:

- `<header id="mohammad-saeed-ghezelbash" aria-labelledby="page-title">`
- H1: `دکتر سعید قزلباش؛ پزشک زیبایی، پوست و مو در کرمانشاه`
- تصویر AVIF/WebP/JPEG responsive با ابعاد ثابت
- `loading="eager"`
- `fetchpriority="high"`
- Rating قابل مشاهده: ۵ از ۵ بر پایه ۱۶۳ ارزیابی Google Maps
- یک لینک مکانی Google Maps که CTA اصلی محسوب نمی‌شود
- دقیقاً دو CTA اصلی:
  - رزرو وقت مشاوره رایگان
  - گفت‌وگوی آنلاین با دکتر قزلباش

گیت ماشینی: `scripts/validate-stage-3-hero.mjs`

## مرحله ۴ — Content Table و اسکلت معنایی

پیاده‌سازی‌های اصلی:

- `src/components/home/ContentTable.astro`
- `src/components/home/BestDoctorAnswers.astro`
- `src/components/home/Services.astro`
- `src/components/home/HomepageGuideV2.astro`
- `src/pages/index.astro`

قرارداد نهایی:

- Content Table واقعی با `<nav>`
- ۵ گروه native `<details>/<summary>`
- ۱۶ مقصد H2 به ترتیب canonical
- Content Table نخستین H2 داخل `main`
- ۱۶ سکشن H2 اصلی با `section + aria-labelledby`
- ۷۵ مقصد H3 canonical
- H4 برای جزئیات، FAQ و عنوان ویدئو
- عدم وابستگی TOC به JavaScript
- عدم وجود Fragment شکسته
- عدم وجود ID تکراری
- عدم وجود aliasهای obsolete یا IDهای عددی legacy در DOM

گیت ماشینی: `scripts/validate-stage-4-outline.mjs`

## فهرست ۱۶ H2 canonical

1. `#best-aesthetic-doctor-kermanshah`
2. `#aesthetic-services-kermanshah`
3. `#aesthetic-treatment-selection`
4. `#injectable-aesthetic-treatments`
5. `#lifting-and-facial-aging`
6. `#skin-scar-rejuvenation`
7. `#hair-loss-and-restoration`
8. `#submental-and-body-contouring`
9. `#aesthetic-surgery-and-referral`
10. `#revision-complications-and-safety`
11. `#aesthetic-cost-and-consultation`
12. `#aesthetic-faq-kermanshah-iran`
13. `#medical-research-and-education`
14. `#clinic-information-kermanshah`
15. `#knowledge-graph-and-datasets`
16. `#sources-contact-and-appointment`

## Traceability گیت‌های مراحل ۱ تا ۴

| الزام | منبع حقیقت | Validator/مدرک |
|---|---|---|
| Entity IDs | `homepage-sections.mjs` | stage 2 validator |
| ۱۶ H2 و ترتیب | `homepage-sections.mjs` | stage 2 و stage 4 validators |
| TOC groups و destinations | `homepage-sections.mjs`, `ContentTable.astro` | stage 2 و stage 4 validators |
| H1 و مقدمه و Hero order | `PhysicianHero.astro` | stage 3 validator |
| portrait/LCP | `PhysicianHero.astro`, assets | stage 3 validator |
| دو CTA و Maps | `PhysicianHero.astro`, `entities.ts` | stage 3 validator |
| ۷۵ H3 و hierarchy | Registry + renderer | stage 4 validator |
| Fragment integrity | HTML build‌شده | stage 4 و release validators |
| حذف aliasهای قدیمی | HTML build‌شده | stage 4 validator |
| video placement contract | `media.mjs` | stage 2 و nine-stage validators |

## فرمان بازاعتبارسنجی

روی Node مطابق `package.json`:

```bash
npm ci
npm run validate:stage2
npm run build:astro
npm run validate:stage3
npm run validate:stage4
```

اجرای کامل production contract:

```bash
npm run build
```

این سند جایگزین Registry، HTML یا Graph نیست. هر تغییر آینده در canonical IDs، ترتیب H2، مقصد ویدئو یا TOC باید ابتدا در منبع حقیقت کد اعمال شود و سپس این رکورد ممیزی به‌روز شود.