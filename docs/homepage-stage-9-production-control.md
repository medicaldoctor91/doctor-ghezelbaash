# مرحله ۹ — آزمون، بازبینی و کنترل تولید Homepage

این سند رکورد نهایی کنترل انتشار بازمعماری Homepage است. منبع حقیقت HTML، Registry و Graph همچنان کد پروژه است؛ این سند فقط baseline، ۲۰ معیار پذیرش، traceability، نقاط rollback و روش اثبات آمادگی تولید را ثبت می‌کند.

## محدوده انتشار

- مخزن: `medicaldoctor91/doctor-ghezelbaash`
- شاخه مقصد: `main`
- baseline پیش از مرحله ۲: `c2608056ffb3ee6f35a1f7f097fdd2cccb17e46a`
- پایان مرحله ۸ و نقطه rollback پیش از مرحله ۹: `aeeade6650ee4947ec9287c8d15c8887a0ae89a3`
- Person canonical: `https://www.ghezelbaash.ir/#mohammad-saeed-ghezelbash`
- Clinic canonical: `https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic`
- فایل منبع اصلی پزشکی: `src/content/landing.md`
- Git blob baseline و فعلی فایل پزشکی: `2489ae2d05bf12ad7ad8782d969f2b6d6abc8b72`

مقایسه baseline با پایان مرحله ۸ نشان می‌دهد شاخه جدید ۲۰ commit جلوتر است، فایل حذف‌شده‌ای در diff وجود ندارد و blob فایل `landing.md` بدون تغییر باقی مانده است. بنابراین بازمعماری، محتوای منبع پزشکی را حذف نکرده و تغییرات آن در لایه معماری، رندر، Registry، ویدئو، Footer و Graph انجام شده‌اند.

## ۲۰ معیار پذیرش canonical

1. **AC-01 — معماری استاتیک:** تنها `index.html` و `404.html` خروجی HTML باشند و صفحه مستقل ویدئو وجود نداشته باشد.
2. **AC-02 — رأس Person-first:** یک H1 مصوب، Person ID canonical و مقدمه ۱۸۰ تا ۲۸۰ کلمه‌ای وجود داشته باشد.
3. **AC-03 — رسانه و اقدام Hero:** تصویر LCP، امتیاز Google Maps و دقیقاً دو CTA اصلی حفظ شوند.
4. **AC-04 — Content Table:** جدول محتوای crawlable بلافاصله پس از بلوک Person و شامل ۱۶ مقصد مرتب باشد.
5. **AC-05 — اسکلت H2:** هر ۱۶ H2 با ID، عنوان و ترتیب Registry در HTML موجود باشند؛ ID و Fragment شکسته وجود نداشته باشد.
6. **AC-06 — اسکلت H3 و Heading:** H3های canonical با parent درست رندر شوند و پرش سطح Heading رخ ندهد.
7. **AC-07 — حفظ محتوای پزشکی:** Git blob منبع پزشکی با baseline برابر، عمق متن در بازه ممیزی و پاراگراف بلند تکراری صفر باشد.
8. **AC-08 — semantics خدمات:** روابط `offered`، `evaluated` و `referral-context` مستقل و قابل تشخیص باقی بمانند.
9. **AC-09 — نگاشت ۱۲ ویدئو:** هر ویدئو یک مقصد صریح، فایل، thumbnail، عنوان و `VideoObject` منطبق داشته باشد.
10. **AC-10 — ویدئوهای آموزش پزشکی:** دو ویدئوی آموزشی فقط داخل `#medical-education` باشند.
11. **AC-11 — ویدئوی رضایت زیباجو:** ویدئوی «رضایت زیباجو از خدمات زیبایی دکتر سعید قزلباش» داخل سکشن کلینیک باشد.
12. **AC-12 — قرارداد کلینیک:** Clinic anchor، نشانی، تماس، زمان، rating، count، source و observedAt قابل مشاهده و منطبق باشند.
13. **AC-13 — Footer:** پنج گروه مصوب و دایرکتوری لینک یکتا وجود داشته باشد و Instagram Direct فقط CTA بماند.
14. **AC-14 — جداسازی انتیتی:** Person تنها `mainEntity` و Clinic یک `MedicalClinic/LocalBusiness` مستقل باشد.
15. **AC-15 — parity گراف:** HTML، JSON-LD داخلی و `knowledge-graph.jsonld` برای انتیتی‌ها، H1، TOC، سکشن‌ها و ویدئوها همگام باشند.
16. **AC-16 — Discovery envelope:** HTML head و HTTP Link فقط قرارداد minimal مصوب را منتشر کنند.
17. **AC-17 — راهنمای ماشین‌خوان:** `llms.txt` و `ai.txt` فقط URIهای canonical فعلی را معرفی کنند.
18. **AC-18 — indexing و artifactها:** sitemap/robots صحیح و فایل‌ها، sitemap و routeهای obsolete حذف شده باشند.
19. **AC-19 — بودجه عملکرد:** اندازه خام، gzip، Brotli، DOM و preload رسانه‌ها در محدوده تعیین‌شده باشند.
20. **AC-20 — کنترل انتشار:** مراحل ۲ تا ۹ در build chain، workflow بررسی production، traceability و rollback ثبت شده باشند.

## Traceability

| معیار | منبع/خروجی اصلی | گیت مستقیم | گیت مکمل |
|---|---|---|---|
| AC-01 | Astro routes و `dist` | Stage 9 | release validator |
| AC-02 | `PhysicianHero.astro` | Stage 3، Stage 9 | visible contract |
| AC-03 | Hero و `entities.ts` | Stage 3، Stage 9 | release validator |
| AC-04 | `ContentTable.astro` و Registry | Stage 4، Stage 9 | Stage 8 ItemList parity |
| AC-05 | `homepage-sections.mjs` | Stage 2، Stage 4، Stage 9 | release validator |
| AC-06 | article Registry و renderer | Stage 4، Stage 9 | nine-stage audit |
| AC-07 | `landing.md` | Stage 5، Stage 9 | passage-depth validator |
| AC-08 | knowledge/authority registries | Stage 5، Stage 9 | schema semantics |
| AC-09 | `media.mjs` و contextual renderer | Stage 6، Stage 9 | Stage 8 graph parity |
| AC-10 | `#medical-education` | Stage 6، Stage 9 | release validator |
| AC-11 | Clinic section | Stage 6، Stage 7، Stage 9 | production audit |
| AC-12 | `ClinicInformation.astro` | Stage 7، Stage 9 | Graph synchronization |
| AC-13 | external directory Registry | Stage 7، Stage 9 | visible contract |
| AC-14 | graph compilers | Stage 8، Stage 9 | release/schema validators |
| AC-15 | synchronization compiler | Stage 8، Stage 9 | canonical superset check |
| AC-16 | `SiteLayout.astro` و `_headers` | Stage 9 | production audit |
| AC-17 | `llms.txt.ts` و `ai.txt` | Stage 8، Stage 9 | production audit |
| AC-18 | robots/sitemaps/routes | Stage 9 | release و production audit |
| AC-19 | built Homepage | Stage 9 | release validator |
| AC-20 | package/workflows/docs | Stage 9 | GitHub Actions و Cloudflare Preview |

گیت ماشینی نهایی: `scripts/validate-stage-9-production-readiness.mjs`.

این گیت یک گزارش غیرقابل‌انتشار در `build-reports/stage-9-validation.json` می‌سازد. گزارش داخل artifact مربوط به CI ذخیره می‌شود و به دارایی‌های عمومی سایت یا گراف انتیتی اضافه نمی‌شود.

## کنترل CI و محیط واقعی

### پیش از merge

1. Python syntax برای `audit-production.py` و `run-production-audit.py` بررسی می‌شود.
2. `npm run build` مراحل ۲ تا ۹ و تمام release validatorها را اجرا می‌کند.
3. گزارش Stage 9 و build log به‌عنوان artifact نگهداری می‌شوند.
4. Cloudflare Branch Preview باید روی همان head commit موفق باشد.

### پس از merge به main

workflow با نام `Verify production deployment` روی دامنه `https://www.ghezelbaash.ir/` اجرا می‌شود و با cache-busting این موارد را کنترل می‌کند:

- پاسخ و headerهای دامنه واقعی؛
- H1، Person/Clinic IDs، TOC و ۱۶ سکشن؛
- ۱۲ ویدئو و محل ویدئوی رضایت زیباجو؛
- HTML head و HTTP Link؛
- JSON-LD داخلی و گراف کامل؛
- rating برابر ۵/۵ و count برابر ۱۶۳؛
- sitemap، robots، فایل‌های well-known و نبود watch page/video sitemap؛
- byte-range ویدئو؛
- URIهای canonical داخل `llms.txt` و `ai.txt`.

## rollback

rollback اصلی مرحله ۹ commit زیر است:

```text
aeeade6650ee4947ec9287c8d15c8887a0ae89a3
```

این commit پایان مرحله ۸ و آخرین وضعیت سبز پیش از تغییرات کنترل تولید است. در صورت شکست ناشی از خود مرحله ۹، PR مرحله ۹ revert می‌شود یا `main` به این نقطه بازگردانده می‌شود؛ تغییرات محتوایی و معماری مراحل ۱ تا ۸ دست‌نخورده می‌مانند.

نقاط rollback لایه‌ای دیگر:

- پایان مرحله ۷: `e78ca9c15d30e51419594c658eed5c9f066eefd3`
- پایان مرحله ۶: `eccb8beab42b33a4dcde45bf9fb9ed1b94e8fcba`
- baseline معماری: `c2608056ffb3ee6f35a1f7f097fdd2cccb17e46a`

بازگشت به baseline فقط برای بازیابی اضطراری کل بازمعماری مجاز است و باید با ثبت علت، اثر بر HTML/Graph و برنامه بازانتشار انجام شود.

## تصمیم انتشار

انتشار فقط زمانی مجاز است که:

- گزارش Stage 9 مقدار `20/20 PASS` داشته باشد؛
- تمام validatorهای مراحل ۲ تا ۸ همچنان PASS باشند؛
- release validatorها PASS باشند؛
- Cloudflare Preview موفق باشد؛
- production audit پس از merge روی دامنه واقعی PASS شود.

هیچ ادعای «۳۵ معیار» در این قرارداد وجود ندارد. سطح پذیرش رسمی همان ۲۰ معیار canonical بالاست و assertionهای فنی زیرمجموعه آن‌ها هستند.
