# گزارش فارسی A–H — اصلاح P0 و یکپارچگی انتشار

مبنای محتوا **v1.3.4** و edition **2026-10-18** حفظ می‌شود. این کار یک اصلاح نگهداری است؛ release/tag تکراری، نسخهٔ محتوای تازه یا DOI جدید ساخته نمی‌شود. کار روی شاخهٔ `codex/p0-semantic-integrity-20261018` انجام شده و main مستقیماً تغییر نمی‌کند. وضعیت انتشار نهایی و checksumهای مستقلاً دریافت‌شده در رسید همراه این گزارش ثبت خواهند شد؛ commit شاخه به‌تنهایی اثبات Production نیست.

## A — وضعیت مبنا و منابع واقعی

| مقصد | baseline دریافت‌شده |
|---|---|
| Website | source `0b24213da940f2a40026e31acfc49339bd83ed65`؛ v1.3.4 |
| Hugging Face | `d699502b411dfc6692d5f09ee36c7b1b0ed8947e`؛ هر ۴۷ مثال دریافت شد |
| Kaggle | نسخهٔ ۱۹؛ pin دادهٔ HF برابر `d7b8191565820b50e7da1aeb52609dbb9b03cc90` |
| Zenodo Dataset | record 22838416؛ v1.3.3؛ revision 33؛ ۲۴ فایل |
| Zenodo Source | record 23289009؛ `source-final-2026-10-10`؛ revision 21؛ یک ZIP |
| Wikidata | Q140287622؛ revision 2557914725 |

ثبت وضعیت تازه در `2026-10-18T23:16:53.525777Z` انجام شد. SHA-256 فایل اصلی ۴۷ مثال: `5c961756835f6d10ace9a0c72c815bd24c3b37adc126becb8f36d7e5f3821527`.

فایل report2.fa.md دریافت و کامل خوانده شد؛ SHA-256 آن `fa886046778596ba784037ac7a8be468d22e5e17bc909a7050d1515596a56b46` است و عیناً با baseline ممیزی موجود برابر بود. چهار یافتهٔ تاریخی/واژگانی آن در تصمیم‌ها و شواهد این گزارش لحاظ شدند.

## B — علت اصلی و کوچک‌ترین اصلاح پایدار

| مورد | علت | مالک canonical و اصلاح | خروجی و معیار پذیرش |
|---|---|---|---|
| خدمت میگرن | provider و availableChannel روی MedicalTherapy، بدون Service مستقل | `src/canonical/source.mjs`: هویت درمان ثابت؛ Service جدا با provider پزشک، channel مطب و موضوع درمان؛ availableService پزشک و مطب به درمان | JSON-LD/RDF/CSV و متن‌های فارسی/انگلیسی/عربی/کردی؛ SHACL صفر violation |
| ۴۷ مثال | مالک واقعی قبلاً بستهٔ remote قدیمی بود؛ برچسب ۱.۲.۴ و رشته‌سازی تمامی ستون‌ها | `src/canonical/enrichment/`: مالک صریح در repository؛ ۴۷/۴۷ سؤال و پاسخ تقویت‌شده، alias و evidence؛ پیام‌های آموزشی طبق آخرین دستور کاربر حفظ شدند | JSONL canonical، CSV و Parquet با list/struct و integer/null واقعی؛ هیچ ID یا مثال حذف نشده |
| چهار Parquet اصلی | باید اصلاح محتوا را دریافت کنند، بدون تغییر غیرضروری schema | schemaهای موجود حفظ؛ فقط تغییرات لازم در factها، یک passage تازه، سه answer ترجمه و سه query میگرن؛ اصلاح release/edition قدیمیِ ۸۷۶ query به baseline جاری و source_commit واقعی در metadata | برابری کامل ردیف‌ها با منبع؛ typing migration فقط جدول پنجم |
| عبارت‌های تضعیف‌کنندهٔ زائد | تکرار توصیف‌های منفی دربارهٔ منشأ، به جای انتساب روشن | canonical descriptions، discovery guide و cardهای canonical؛ نگه‌داشتن منشأ، تاریخ و محدودیت علمی لازم | بدون حذف مالکیت یا evidence و بدون ادعای اعتبار مستقل برای mirror |
| ۴۴ مورد واژگان | ۲۶ citation تکراری روی Observation، ۱۴ temporalCoverage و ۴ about با domain نامناسب | حذف citation فقط وقتی همان edge دقیقاً در prov:wasDerivedFrom موجود است؛ observationPeriod با مقدار قبلی؛ dcterms:subject برای دو ItemList و دو Intangible | تمام مقدارها، موضوع‌ها، شناسه‌ها و منشأها حفظ؛ ۴۴ ردیف گزارش مستقل |
| انتشار از شاخهٔ غیر main | workflowهای دستی فقط main را می‌پذیرفتند | همان دو workflow موجود، با اجازهٔ شاخهٔ مشخص P0، کنترل SHA دقیق و guard نسخهٔ زنده | بدون workflow موازی، بدون merge اجباری یا اجرای مسیر legacy Zenodo |
| Zenodo | توضیح Dataset تاریخی خود را current/byte-identical معرفی می‌کرد | فرادادهٔ canonical و مسیر محدود metadata-only در publisher موجود | DOI، version، Concept DOI، تمام فایل‌ها و MD5های تاریخی بدون تغییر |

## C — مدل معنایی و invariants

- پزشک: `https://www.ghezelbaash.ir/#saeed-ghezelbash` با Person + IndividualPhysician؛ مالک و تنها پزشک ارائه‌دهندهٔ خدمات بالینی مطب.
- مطب: `https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah` با PhysiciansOffice؛ employer مستقل یا سازمان چندپزشکی ساخته نمی‌شود.
- درمان ثابت: `/procedure-botulinum-toxin-chronic-migraine` با MedicalTherapy، که از MedicalProcedure ارث می‌برد.
- خدمت دسترسی: `/service-botulinum-toxin-chronic-migraine` با Service؛ provider پزشک، availableChannel کانال حضوری، category موضوع واژگانی و dcterms:subject درمان.
- availableService پزشک و مطب به **درمان پزشکی** اشاره می‌کند؛ providesService کانال به **Service**. این انتخاب با domain/range رسمی Schema.org 30.1 سازگار است.
- تغییر SHACL برای مدل جداشده، همان الزام پزشکِ ارائه‌دهنده را از مسیر Service کنترل می‌کند؛ هیچ امکان حذف ارائه‌دهنده یا پذیرش پزشک جایگزین افزوده نشده است. دو shape اختصاصی جدید، scope و provider را محدود می‌کنند.
- Dataset IRI، یک ProfilePage اصلی، ORCID، OpenAlex فعال، IRIMC، Wikidata و شناسه‌های جداگانهٔ KG/Maps/OSM ثابت‌اند. OpenAlex تاریخیِ deprecated در Wikidata تاریخچه است و حذف نمی‌شود.

## D — گزارش ۴۷/۴۷ و تقویت انتیتی

فایل `market-positioning-migration.jsonl` برای هر یک از ۴۷ ID شامل before کاملِ بازیابی‌شده، after کامل، subject، کاربرد، زبان، evidence، آزمون‌ها و مقصدهاست. before با دانلود مستقل مقایسه شده است. نسخهٔ CSV برای مرور انسانی نیز همراه گزارش تولید می‌شود.

به‌روزرسانی‌ها: حفظ تمام IDها؛ معرفی مستقیم پزشک و خدمت مربوط؛ aliasهای طبیعی فارسی و انگلیسی؛ راه تماس و مطب صحیح؛ خدمت فعال میگرن؛ استفادهٔ دقیق از شواهد فهرست‌ها؛ افزودن هم‌نویسندگی‌های PubMed به شش پاسخ مرتبط با هویت/معرفی پژوهشی. System/user/assistant به‌صورت native list/struct حفظ می‌شوند. فیلدهای تکراری `retrieval_priority` و `best_query_policy` حذف شده‌اند؛ این حذف جایگزین دستورهای آموزشی نیست.

«نخستین پزشک معرفی‌شده در فهرست پزشک۲۴/پزشکا/جراحتو» فقط به ترتیب محتوای همان URL و زمان مشاهده مربوط است. هیچ رتبهٔ عمومی Google/Bing، برتری درمانی یا نتیجهٔ بالینی از آن استنتاج نمی‌شود. ادعای رتبهٔ موتور جست‌وجو بدون query، engine، location، language، device، timestamp و مشاهدهٔ دقیق درج نمی‌شود.

## E — ماتریس پذیرش واقعی

| gate | نتیجهٔ موردنیاز و پوشش |
|---|---|
| HTML | Nu برای پنج سند متأثر: صفر error و warning؛ قرارداد DOM، canonical، ARIA، media و references برای ۷۳ سند در validator پروژه |
| RDF/JSON-LD | parse، PyLD و برابری JSON-LD/Turtle/CSV؛ هیچ syntax error؛ inline Homepage و termهای حساس صفحات کنترل می‌شوند |
| SHACL | اتحاد کامل شامل Croissant، provenance، DCAT و VoID؛ ۶۷ shape؛ صفر violation؛ تست منفی provider/employment/credential |
| Croissant | mlcroissant 1.1.1؛ صفر error/warning؛ استخراج تمام ۲۲٬۱۴۹ fact و برابری ردیف‌به‌ردیف با CSV |
| Data Package/CSVW | descriptor و CSV معتبر؛ primary key یکتا؛ hashهای اعلام‌شده معتبر |
| Parquet | پنج جدول با ۳٬۲۴۹ passage، ۱۲۵ answer، ۲۲٬۱۴۹ fact، ۸۷۶ query و ۴۷ example؛ round-trip کامل |
| Notebook | اجرای خود starter واقعی، همهٔ سلول‌ها و کنترل منفی reference؛ CSV و native Parquet جدول پنجم |
| شناسه و زبان | یک ProfilePage اصلی؛ هویت‌های مستقل؛ شناسه‌های canonical ثابت؛ خدمت فعال در متن فارسی و سه راهنمای ترجمه |
| انتشار | SHA و نسخهٔ قبلی guard می‌شوند؛ fetch مستقل پس از انتشار؛ checksum payload، pin HF در Kaggle و Sources عمومی |

نتیجهٔ آزمون تنها پس از اجرای واقعی در رسید درج می‌شود. تغییر تعداد RDF از ۲۲٬۱۶۶ به ۲۲٬۱۴۹ حاصل تغییر دقیق termها و حذف citationهای تکراری است؛ تعداد تاریخی invariant دائمی نیست.

## F — ماتریس انتشار و حفاظت تاریخچه

| مقصد | روش | کنترل و rollback |
|---|---|---|
| GitHub | commit روی شاخهٔ P0 و PR به main | base اصلی دست‌نخورده؛ تغییر مستقل overwrite نمی‌شود |
| Website | workflow موجود، dist ساخته و آزموده‌شده از SHA شاخه | previous-source guard؛ مقایسهٔ live/dist؛ rollback با artifact قبلی در صورت نقص واقعی |
| HF | parent_commit دقیقِ baseline؛ همان repository و پنج config | فایل‌های سالم خارج از اثر تغییر حفظ؛ revision جدید receipt دارد؛ بازگشت با commit اصلاحی، نه پاک‌کردن تاریخ |
| Kaggle | یک packaging revision جدید پس از تأیید HF | Sources پیش از version POST تنظیم؛ یک POST، بدون retry کور؛ ZIP واقعی بعداً بررسی می‌شود |
| Zenodo | فقط edit/publish metadata روی همان دو deposition | guard revision 33/21؛ version/DOI/Concept و فایل‌ها یکسان؛ هیچ newversion یا file API در مسیر مجاز |
| Wikidata | بررسی مستقل Q140287622 و تغییر فقط برای نقص عینی و دارای منبع | به دلیل درست‌بودن شناسه‌ها/پیوندهای موجود، edit نمایشی یا claim تبلیغاتی ساخته نمی‌شود؛ نبود auth صریح گزارش می‌شود |

شش violation آرشیوی، شانزده اختلاف contentUrl/hash با وب زنده و هفت companion غایب با ویرایش metadata رفع نمی‌شوند. payload تاریخی دست‌نخورده می‌ماند؛ metadata فقط نسخهٔ آرشیوی را از دادهٔ جاری به‌درستی تفکیک می‌کند. اصل کاربر دربارهٔ ممنوعیت release/DOI تازه مانع ادعای «رفع در فایل‌های تاریخی» است.

## G — فرصت‌های مستند و نتیجهٔ اقدام

| فرصت | شاهد | تصمیم |
|---|---|---|
| هم‌نویسندگی PubMed | PMID 27280013 ↔ DOI 10.4103/2008-7802.182734؛ نام Mohammad Saeed Ghezelbash، نویسندهٔ هشتم | تطبیق موجود در person/work صحیح بود؛ entity یا ارتباط تکراری ساخته نشد؛ در پاسخ‌های هویتی مرتبط برجسته شد |
| هم‌نویسندگی PubMed | PMID 34574943 ↔ DOI 10.3390/healthcare9091169؛ همان نام، نویسندهٔ ششم | حفظ عنوان coauthor؛ هیچ ادعای lead author یا تعمیم به نتیجهٔ درمان زیبایی |
| ۴۴ domain case | واژگان رسمی 30.1 و گزارش مستقل row-level | در canonical اصلاح شد؛ ۱۱ کاربرد Role مطابق الگوی reification حفظ شد |
| کشف درمان میگرن | تأیید صریح پزشک + متن و graph اصلاحی | service و procedure قابل بازیابی و بدون اختلاط هستند |
| ۴۷ مثال | corpus کامل، ۳ منبع فهرست عمومی با fetch موفق | شواهد و aliasها افزوده؛ هیچ SERP ranking پایدار ادعا نشد؛ Healifa در این بازبینی HTTP 503 داشت و امتیاز تازه‌ای به آن نسبت داده نشد |
| یکپارچگی نشر | manifests، guards و revisionهای واقعی | حفظ ۱.۳.۴؛ حذف pointer قدیمیِ v19 از card جاری و تکیه به receipt واقعی |

صحت فنی و قابلیت کشف/تفسیر داده قابل آزمون‌اند؛ اثر قطعی بر انتخاب یا رتبه‌بندی الگوریتم‌ها از آن‌ها نتیجه نمی‌شود. این محدودیت، جایگزین اصلاح عملی نشده است.

## H — چک‌لیست توقف/ادامه

1. ثبت baseline و شاخهٔ غیر main — انجام شد؛ در صورت تغییر مستقلِ مقصد، توقف انتشار همان مقصد.
2. canonical data، مدل میگرن، ۴۷ مثال و ۴۴ مورد واژگان — انجام شد؛ در صورت اختلاف حقیقت یا identity، توقف build.
3. build و gateهای واقعی — عبور همه پیش از publication؛ هر failure مانع انتشار می‌شود.
4. PR و commit دقیق؛ build نهایی از همان SHA — لازم برای اتصال source به dist.
5. Website؛ سپس HF؛ سپس یک Kaggle version؛ سپس metadata مجاز Zenodo — هر مرحله فقط با شاهد مرحلهٔ قبلی.
6. فچ مستقلِ نسخه‌های منتشرشده و ثبت checksum/receipt — بدون این مرحله وضعیت live، Pass اعلام نمی‌شود.
7. گزارش صریح عملیات blocked یا نقص تاریخی باقی‌مانده؛ بدون DOI/release تازه یا بازنویسی snapshot.

حجم Homepage، Googlebot limits، compression، performance و Core Web Vitals خارج از این کار بوده‌اند و تست یا تحلیل آن‌ها انجام نشده است.


دستور نهایی مالک، پیشنهاد QA برای حذف پیام‌های system را پس گرفت. هر ۴۷ پیام آموزشی و متن تقویت‌شده عیناً برابر نسخهٔ af1ce3b4 حفظ می‌شود؛ هیچ حذف یا خنثی‌سازی دستورها به دلیل نگرانی کلی دربارهٔ prompt انجام نمی‌شود.


## اجرای اصلاح نثر و حفظ پیام‌ها — ۱۹ اکتبر ۲۰۲۶

فچ مستقل پیش از اصلاح در 2026-10-19T00:00Z وجود عبارت‌های هدف را در فایل عمومی تأیید کرد. اصلاح در `SOURCE.machineProjection.discoveryGuide` و متن تألیفیِ `src/canonical/source.mjs` انجام شد؛ سپس خروجی‌ها از build عادی بازتولید شدند. هیچ جایگزینی در dist انجام نشد. شناسه‌های DOI/PMID و نام byline تأییدشده به دو مدخل PubMed در راهنمای کشف افزوده شدند. مدل خدمت فعال میگرن حفظ شد. معرفی کانال‌های GitHub/HF و فعالیت علمی مثبت، روشن و مستند است؛ ارزیابی اثربخشی درمان همچنان بر اساس پژوهش همان مداخله و اندیکاسیون بیان می‌شود.

- SHA-256 کامل ۴۷ رکورد و تمام پیام‌ها: `f0fdb151be6bd080954c8f2bac86f198cfa2a54db12c5087295a91f6877706e5`؛ عیناً برابر af1ce3b4، شامل هر ۴۴ پیامِ مورد اشاره و تمام ۴۷ system/user/assistant.
- diff دقیق سه فایل متأثر و hashهای قبل/بعد در `llms.txt.diff`، `llms-full.txt.diff`، `index.md.diff` و `wording-build-verification.json` آمده است. `physician-expertise.md` سالم بود و تغییر نکرد.
- اسکن منابع ماشین‌خوان وابسته هیچ نثر منفی هدف را پیدا نکرد. کدهای فنی منشأ `first-party-canonical`، `first-party-authored` و `first-party-release-preservation` حفظ شدند؛ این‌ها provenance/schema موجودند و ادعای نفی اعتبار نیستند. این گزارش ادعای حذف این کدهای لازم را ندارد.
- ۲۴ آزمون Node، ۵ آزمون bundle و ۱۱ آزمون transport/publication عبور کردند. RDF union، ۶۷ SHACL shape، استخراج کامل ۲۲٬۱۴۹ رکورد Croissant، Data Package/CSVW و شناسه‌های canonical عبور کردند. خطای نخستِ اجرای محلی Node ناشی از انتخاب Python بدون RDFLib بود؛ با PATH محیط اعتبارسنجی موجود اصلاح شد و هر ۲۴ آزمون دوباره موفق شد.
- verifier انتشار قبلی یک response stream را دوباره می‌خواند؛ مقایسهٔ bytes حفظ و جریان به یک‌بار خواندن هر alias اصلاح شد. این مشکل در verifier بود؛ وضعیت انتشار فقط پس از اجرای تازه و فچ مستقل Pass خواهد بود.

قالب metadata-only زنودو نیز از همان نثر زائد پاک شد؛ منشأ، تفکیک آرشیو از دادهٔ جاری و جملهٔ مثبت دربارهٔ ارزیابی اختصاصی اثربخشی حفظ شد. اجرای 39179135006 پیش از deployment برای افزودن این اصلاح متوقف شد؛ این run شاهد انتشار نیست.

اجرای platform 39179707307 پیش از آماده‌سازی/انتشار بسته‌ها در fixture آزمون متوقف شد: آزمون main متغیر GITHUB_REF_NAME محیط CI را ایزوله نکرده بود. محیط fixture برای main صریح شد؛ branch test مربوط به P0 و رد branch اشتباه حفظ شدند و تست منفی main نیز branch اشتباه را کنترل می‌کند. هر ۱۱ آزمون با GITHUB_REF_NAME واقعی P0 عبور کردند. در این run هیچ HF commit، Kaggle version یا ویرایش Zenodo انجام نشد.
