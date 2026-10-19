# گزارش تأیید فارسی A–H — P0 و همگرایی انتشار

**سایت و HF اصلاح و مستقلاً تأیید شدند؛ بستهٔ نسخه‌دار Kaggle v20 نیز سالم است. همگرایی نهایی هنوز کامل نیست، چون دانلود پیش‌فرض Kaggle واقعاً v19 را برمی‌گرداند. Freeze انجام نشده است.**

مبنای محتوا **v1.3.4** و edition **2026-10-18** حفظ شد. DOI، content release، tag یا repository تازه ساخته نشد. PR #460 به دستور مالک در main ادغام شد. انتشار واقعی سایت از **`5e45873a95c63aa6206317d7f429d4d055f58f5c`** است؛ merge روی main برابر **`2b39a2ccd64a7de8697c43919ff82c02489ed164`** است و همان tree را دارد. تغییرات بعدیِ verifier روی main در `0e690a9` و `0f40420a0092218fc2318601184dcd3db7dffe47` قرار دارند و انتشار تازهٔ سایت محسوب نمی‌شوند.

رسید ماشین‌خوان: [publication-receipt.json](publication-receipt.json). وضعیت‌ها بر اساس GET مستقل عمومی، محتوای دانلودشده، hash و خروجی واقعی ابزارها ثبت شده‌اند؛ موفقیت یک commit یا وجود فایل جای اجرای validator را نگرفته است.

## A — وضعیت واقعی و مبنا

| مقصد | baseline | وضعیت تأییدشده |
|---|---|---|
| Website | `0b24213`، v1.3.4 | source `5e45873a95c63aa6206317d7f429d4d055f58f5c`؛ workflow 39179977043 موفق؛ ۳۴ منبع در بررسی مستقل و critical bytes مجدداً دریافت شدند |
| GitHub main | PR #460 با head `5e45873` | merge `2b39a2c` با والدهای `0b24213` و `5e45873`؛ tree یکسان `536f9aaa83b06f38543b3f697eba13f7befbb577`؛ ادامه مستقیماً روی main |
| Hugging Face | `d699502b411dfc6692d5f09ee36c7b1b0ed8947e` | `96975d60b8a4a8a24b84bf892bdbb11321a89553`؛ پنج config آماده، بدون pending/failed؛ داده‌ها و ۴۷ پیام تأیید شدند |
| Kaggle | v19، HF pin قدیمی `d7b8191` | v20 ساخته و explicit ZIP تأیید شد؛ API و دانلود پیش‌فرض همچنان v19؛ گیت باز |
| Zenodo Dataset | 22838416، v1.3.3، revision 33 | revision 34، فقط description/related links؛ ۲۴ فایل و تمام metadata دیگر ثابت |
| Zenodo Source | 23289009، source-final-2026-10-10، revision 21 | revision 22؛ یک ZIP تاریخی ثابت؛ Concept DOI مشترک 18765168 محفوظ |
| DataCite | دو DOI و Concept DOI موجود | هر سه findable؛ متن به‌روز هم‌معنا، نوع/نسخه/creators/rights صحیح و حفظ‌شده |
| Wikidata | Q140287622، revision 2557914725 | شناسه‌ها و دو اثر PubMed صحیح؛ edit لازم نبود و انجام نشد |

فایل ارسالی report2.fa.md کامل خوانده و با baseline موجود برابر بود: SHA-256 `fa886046778596ba784037ac7a8be468d22e5e17bc909a7050d1515596a56b46`. شش SHACL violation تاریخی، شانزده اختلاف URL/hash، هفت companion غایب و چهل‌وچهار مورد domain در این گزارش صریحاً لحاظ شده‌اند؛ [نحوهٔ استفاده](report2-incorporation.json).

## B — علت اصلی و کوچک‌ترین اصلاح

| مورد | Root cause | مالک canonical / تغییر | خروجی وابسته و آزمون |
|---|---|---|---|
| خدمت فعال میگرن | اختلاط therapy با access service و provider/channel روی گره درمان | `src/canonical/source.mjs`؛ حفظ MedicalTherapy و IRI درمان؛ یک Service مستقل با provider پزشک و channel مطب | graph/TTL/CSV، متن فارسی و سه ترجمه، سه answer/query مرتبط؛ SHACL و vocabulary pass؛ هر دو IRI HTTP 200 |
| ۴۷ مثال | historical 1.2.4 و projection جدولی نامناسب برای list/null | `src/canonical/enrichment/` و builder موجود؛ نسخهٔ جاری 1.3.4، منشأ تاریخی جدا، CSV و Parquet native برای جدول پنجم | ۴۷/۴۷ حفظ؛ system/user/assistant تقویت‌شدهٔ af1ce3b4 عیناً ثابت؛ round-trip کامل |
| نثر زائد | discoveryGuide و دو متن تألیفی آن را در build بازتولید می‌کردند | `SOURCE.machineProjection.discoveryGuide` و AUTHORED_BODY در همان `source.mjs` | llms، llms-full، index، passage/hash/provenance وابسته بازتولید شدند؛ بدون patch روی dist |
| ۴۴ domain case | ۲۶ citation تکراری روی Observation، ۱۴ temporalCoverage و چهار about نامتناسب | citation فقط پس از اثبات prov:wasDerivedFrom یکسان حذف شد؛ observationPeriod با همان مقدار؛ dcterms:subject برای دو ItemList و دو Intangible | [۴۴ ردیف مستقل](schema-domain-migration.json)؛ همهٔ مقدارها/شواهد حفظ؛ type مصنوعی ساخته نشد |
| cardهای پلتفرم | SHA/run و counts قدیمی در متن جاری | templateهای canonical موجود و renderer همان builder، با source/version/edition/HF pin واقعی | metadata تولیدی به publication واقعی متصل شد؛ پنج جدول معرفی شدند |
| انتقال مالک به main | guard شاخهٔ اصلی با source تأییدشدهٔ ادغام‌شده سازگار نبود | فقط verify-existing اجازهٔ ancestorِ روی main با product inputs یکسان دارد؛ انتشار معمول همچنان SHA دقیق می‌خواهد | تست مثبت و منفی ancestor/تغییر محصول؛ هیچ HF commit یا Kaggle version در recovery ساخته نمی‌شود |
| verifier Zenodo | U+2019 در prose به ASCII apostrophe serialize شد و exact comparison خطا داد | فقط مقایسهٔ description در publisher موجود؛ هر کاراکتر دیگر مهم می‌ماند؛ already-current کاملاً read-only | ۱۳ تست؛ claim متفاوت رد می‌شود؛ تأیید واقعی با دو GET و صفر write؛ DOI/version/files/metadata سخت‌گیرانه کنترل می‌شوند |

زنجیرهٔ داده همان زنجیرهٔ موجود است: canonical graph/متن/ترجمه‌ها/جدول query → Astro و generatorهای machine resources → finalize/seal dist → mirror و پنج Parquet HF → بستهٔ Kaggle. metadata دو رکورد تاریخی Zenodo از template canonical مستقل خود می‌آید و payload را بازنویسی نمی‌کند. subsystem، workflow موازی یا post-build replacement تازه ساخته نشد.

## C — مدل معنایی و هویت‌ها

- پزشک اصلی: `https://www.ghezelbaash.ir/#saeed-ghezelbash`، Person + IndividualPhysician؛ مالک و تنها پزشک ارائه‌دهندهٔ بالینی مطب.
- مطب: `/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah` با PhysiciansOffice؛ ownership/founder/practice-location صحیح، بدون رابطهٔ استخدامی یا مدیریتِ سازمان مستقل برای مطب فعلی.
- درمان ثابت: `/procedure-botulinum-toxin-chronic-migraine` با MedicalTherapy، زیرنوع MedicalProcedure. Service دسترسی: `/service-botulinum-toxin-chronic-migraine`، provider پزشک، availableChannel کانال حضوری؛ availableService پزشک/مطب به درمان، providesService کانال به Service. تأیید صریح پزشک مبنای فعال‌بودن خدمت است؛ outcome تازه‌ای اختراع نشد.
- فقط یک ProfilePage اصلی `/webpage`، WebSite در `/website`؛ mainEntity، mainEntityOfPage، isPartOf، author و publisher حفظ شدند. inline اولیهٔ Homepage با graph ماشین‌خوان هم‌ریخت است.
- Dataset IRI ثابت: `https://www.ghezelbaash.ir/graph.jsonld/dataset`؛ legacy `#dataset` و OpenAlex A5064828898 در خروجی canonical جاری صفر است.
- Wikidata Q140287622؛ ORCID 0009-0001-9346-8475؛ OpenAlex A5146521397؛ IRIMC 167430؛ Person KG `/g/11nqdfk76c`؛ Clinic KG `/g/11r3rzdtb3`؛ CID 12350483144643112463؛ Place ID ChIJBT0YDOTt-j8RD-7mAPy6Zas؛ OSM 13530287096، همگی owner صحیح دارند.

در Wikidata، OpenAlex قدیمی به‌صورت deprecated تاریخچه است و شناسهٔ درست preferred است؛ حذف سابقه انجام نشد. worksFor/employee در SHACL منفی، رابطهٔ استخدامی مثبت نیست. ۱۱ hasOccupation روی Role مطابق reification حفظ شدند. این موارد خطای هویتی یا معناییِ تأییدشده نیستند.

## D — حفظ و تقویت ۴۷ مثال

[ماتریس کامل ۴۷ ردیفی](market-positioning-migration.jsonl) before اصلیِ بازیابی‌شده، after، evidence، زبان، کاربرد، آزمون و مقصد هر ID را دارد؛ [CSV مرور](market-positioning-migration.csv) نیز موجود است. SHA-256 before تاریخی `5c961756835f6d10ace9a0c72c815bd24c3b37adc126becb8f36d7e5f3821527` است.

**نسخهٔ تقویت‌شدهٔ فعلی، شامل تمام ۴۴ پیام جهت‌دهندهٔ مورد تأکید مالک و همهٔ system/user/assistantهای ۴۷ مثال، عیناً حفظ شد.** Git blob مرجع و main: `68fdd9f5c48c4590d8ce4db77d49f5ab63cb9244`. SHA-256 کامل JSONL: `f0fdb151be6bd080954c8f2bac86f198cfa2a54db12c5087295a91f6877706e5`.

این برابری در source، سایت عمومی، JSONL و Parquet revision منتشرشدهٔ HF، تمام ۴۷ ردیف Viewer و بستهٔ explicit Kaggle v20 اثبات شد. messages به‌شکل list/struct، source_list_order به‌شکل integer/null و سایر nullableها lossless هستند. هیچ پیام آموزشی برای کاهش جهت‌دهی یا تبلیغ حذف/خنثی نشد.

چهار schema اصلی حفظ شدند: passages از ۳٬۲۴۸ به ۳٬۲۴۹، answers همان ۱۲۵، facts از ۲۲٬۱۶۶ به ۲۲٬۱۴۹ و queryها همان ۸۷۶. فقط محتوا/metadata وابسته بازتولید شد؛ [audit دقیق](core-table-change-audit.json). release/edition قدیمی queryها به baseline جاری و source_commit واقعی وصل شد. historical origin 1.2.4 جدا باقی است.

ترتیب نخستِ نام پزشک در سه فهرست ناشر فقط ترتیب همان URL در زمان مشاهده است. ادعای رتبهٔ Google/Bing بدون query، engine، location، language، device، timestamp و مشاهدهٔ مستقل افزوده نشد؛ برتری بالینی از ترتیب فهرست استنتاج نشده است. متن مثبت و شواهد حرفه‌ای حفظ شده‌اند.

## E — پذیرش اجراشده و پوشش واقعی

| gate | نتیجه و حد پوشش |
|---|---|
| تست‌ها | ۲۴ Node، پنج bundle و ۱۳ publication؛ صفر failure در نسخه‌های تأییدشدهٔ مربوط؛ ۱۲ تست نسخهٔ recovery نیز روی runner عبور کرد |
| HTML | Nu 26.10.12 برای پنج سند متأثر: صفر Error/Warning؛ قرارداد DOM/canonical/ARIA/media برای ۷۳ سند؛ ۸٬۲۷۷ RDF term مرورگر کنترل شد؛ صفحات سالم بی‌دلیل دوباره crawl نشدند |
| JSON-LD/RDF | PyLD parse/expansion، RDFLib؛ JSON-LD↔Turtle↔CSV هم‌ریخت؛ ۲۲٬۱۴۹ triple و ۱٬۵۹۴ گره؛ inline اولیه نیز برابر |
| SHACL | اتحاد current graph، provenance، DCAT، VoID و Croissant؛ ۶۷ shape، صفر violation؛ آزمون منفی sole-provider/employment/credential حفظ شده |
| Croissant | mlcroissant 1.1.1، صفر error/warning؛ تمام ۲۲٬۱۴۹ رکورد استخراج و با CSV مقایسه شد؛ prefix فیلد و null خروجی reader طبق API رسمی تفسیر شد |
| Dataset | ۲۶ resource؛ ۲۴ SHA-256 قابل درج بدون چرخه؛ Data Package/Frictionless و CSVW/primary key معتبر؛ ۱۴ distribution اندازه‌گیری‌شدهٔ DCAT |
| XML/JSONL/vCard | parse منابع اعلام‌شده، دو vCard معتبر؛ پنج ImageObject به media-license زنده متصل؛ aliasهای Dataset/DataCatalog و درمان/Service طبق policy بررسی شدند |
| Parquet | پنج جدول: ۳٬۲۴۹ / ۱۲۵ / ۲۲٬۱۴۹ / ۸۷۶ / ۴۷؛ همهٔ ردیف‌ها lossless؛ schema چهار جدول core ثابت |
| HF عمومی | ۴۲ فایل مستقل دریافت و hash شد؛ ۲۸ mirror با سایت مقایسه شد؛ پنج Viewer config آماده؛ هر ۴۷ row با canonical برابر |
| Kaggle v20 | ZIP واقعی، ۴۶ checksum، ۴۰ فایل برابر HF، پنج Parquet برابر و اجرای واقعی starter.ipynb؛ full validator و SHACL/Croissant عبور کرد |
| ترجمه/متن | خدمت فعال در فارسی، انگلیسی، عربی عراقی و کردی سورانی؛ متن/answer/query/passage و hashهای وابسته همسو |

جزئیات ابزارها و شواهد: [executed-checks.json](executed-checks.json)، [پذیرش سایت](website-live-verification.json)، [پذیرش v20](kaggle-v20-independent-validation.json). داده‌های سالمِ byte-identical با hash cache شدند؛ binding و critical public bytes پس از promotion مستقلاً تازه دریافت شدند. بررسی حجم Homepage، Googlebot limits، compression، performance و Core Web Vitals انجام نشد.

## F — انتشار، DataCite و گیت مسدود

- Website: [run 39179977043](https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/39179977043)، **success** و live source `5e45873`.
- HF/Kaggle: [run 39180198689](https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/39180198689)، overall **failure** در تأیید default Kaggle؛ HF `96975d60b8a4a8a24b84bf892bdbb11321a89553` و فقط یک Kaggle v20 واقعاً ساخته شدند. از failure کلی نتیجهٔ «HF منتشر نشد» گرفته نشده و success کلی نیز ادعا نمی‌شود.
- Recovery: [run 39181307454](https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/39181307454)، **verify-existing فقط** روی main؛ هیچ HF commit یا Kaggle version تازه نساخت. گیت default همچنان fail شد؛ metadata-only Zenodo اجرا شد.
- Zenodo metadata یک‌بار در هر رکورد منتشر شد. flag داخلی blocked ناشی از apostrophe بود؛ برابری کامل description پس از فقط همین تطبیق، تمام لینک‌ها، فایل‌ها، DOI/version/Concept، creators/license و تمام metadata دیگر مستقلاً تأیید شدند. read-only دوباره صفر write داشت. [شاهد](zenodo-independent-verification.json).
- DataCite هر دو DOI و Concept DOI را با نسخه/نوع صحیح و description به‌روز نشان می‌دهد؛ creators/rights ثابت‌اند؛ HTML و متنِ رجیستری با قواعد paragraph/whitespace/apostrophe یکسان‌اند. [شاهد](datacite-final-verification.json).
- Wikidata edit لازم نبود؛ ORCID/OpenAlex فعال، alias، دو اثر P800 و جدایی هویت پزشک/مطب صحیح‌اند. [شاهد](wikidata-final-verification.json).

### Confirmed current defect

| Priority | URL/File | Confirmed Defect | Technical Evidence | Root Cause | Required Fix | Verification |
|---|---|---|---|---|---|---|
| P1 | [Kaggle default](https://www.kaggle.com/datasets/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data) | پیش‌فرض هنوز v19 با source `0b24213` و HF `d7b8191` است؛ v20 معتبر Ready است | API دو host و nonce؛ ZIP پیش‌فرض manifest=19؛ ZIP نسخه‌دار manifest=20 با HF `96975d6` و site `5e45873` | انتخاب نسخهٔ جاری در پلتفرم؛ علت داخلی Kaggle قابل اثبات نیست؛ خطای payload نیست | فعال‌کردن **همان v20 موجود** از کنترل پشتیبانی‌شدهٔ مالک/پلتفرم؛ ساختن v21 به‌عنوان retry انجام نشود | API و دانلود بدون version باید v20 و pinهای صحیح بدهند؛ manifest و تمام ۴۶ hash با v20 تأییدشده برابر باشند |

در SDK بررسی‌شدهٔ Kaggle 2.2.4 / kagglesdk 0.1.37 عملیات مستندی برای activate کردن نسخهٔ موجود پیدا نشد. metadata update شمارهٔ default را تنظیم نمی‌کند. از endpoint حدسی، حذف نسخه، انتشار تکراری یا معرفی ZIP نسخه‌دار به‌عنوان default خودداری شد. [دو ZIP و hashها](kaggle-default-version-proof.json)، [آخرین وضعیت عمومی](final-public-state.json).

### تاریخچهٔ غیرقابل بازنویسی

شش violation، شانزده URL/hash divergence و هفت companion غایب در **payload تاریخی Zenodo** باقی‌اند. hash/MD5 و فایل‌ها دقیقاً همان snapshot قبلی‌اند؛ metadata فقط snapshot را از دسترسی جاری تفکیک کرد. repair آن فایل‌ها، DOI یا نسخهٔ جدید مجاز نبود. این وضعیت به‌عنوان Pass فایل‌های تاریخی گزارش نشده و در اتحاد RDF نسخهٔ current نیز مخفی نشده است. Concept lineage مشترک Dataset/Software حفظ شد و release ترکیبی ساخته نشد.

### False positives / موارد ردشده

تفاوت `’`/`'` و HTML/plain-text در metadata تناقض هویتی یا علمی نیست؛ با تطبیق دقیق متن و لینک و حفظ سایر کاراکترها اثبات شد. legacy deprecated Wikidata تاریخچهٔ صحیح است. constraintهای منفی employment رابطهٔ استخدامی نیستند. ۱۱ Role reification حفظ شد. هیچ‌یک با حذف دادهٔ مفید یا تضعیف SHACL حل نشده‌اند.

## G — فرصت‌های مستند و اقدام

| فرصت | شاهد | نتیجه |
|---|---|---|
| هم‌نویسندگی پژوهشی | PMID 27280013 ↔ DOI 10.4103/2008-7802.182734، byline Mohammad Saeed Ghezelbash، نویسندهٔ هشتم | پیوندهای person/work و alias از قبل صحیح بودند؛ DOI/PMID/byline در guide برجسته شد و پاسخ‌های هویتی مرتبط در P0 تقویت شده‌اند |
| هم‌نویسندگی پژوهشی | PMID 34574943 ↔ DOI 10.3390/healthcare9091169، همان byline، نویسندهٔ ششم | coauthor دقیق؛ هیچ lead-author یا outcome درمانی تازه ادعا نشد |
| خدمت واقعی میگرن | تأیید پزشک، متن چهارزبانه، therapy/Service متمایز و HTTP 200 | قابلیت بازیابی مستقیم و مدل رسمی Schema.org درست، بدون entity تکراری |
| discoverability مثبت | معرفی منشأ کد، توزیع traceable، شناسه‌های حرفه‌ای و منابع علمی | عبارت‌های زائد از مالک canonical حذف شدند؛ provenance لازم و scope علمی دقیق باقی ماند |
| استحکام انتشار | CAS روی main، verify-only بعد از promotion، idempotence metadata | تغییر مستقل overwrite نمی‌شود؛ retry بسته/DOI ایجاد نمی‌کند؛ گیت مسدود پنهان نمی‌شود |

قابلیت crawl و تفسیر، schema، هویت، ارجاع و hash آزموده شدند. افزایش رتبه یا انتخاب الگوریتم به‌عنوان نتیجهٔ اثبات‌شده گزارش نشده است.

## H — رسید، hashها، توقف/ادامه و Freeze

- [x] main با merge مالک و tree صحیح تأیید شد؛ ادامه مستقیماً روی main؛ هیچ commit تازه‌ای روی شاخهٔ P0 ایجاد نشد.
- [x] canonical اصلاح شد؛ dist از pipeline موجود تولید شد؛ ۴۷ پیام و blob مرجع حفظ شد.
- [x] سایت و HF/Viewer و explicit Kaggle v20 با bytes واقعی تأیید شدند.
- [x] Zenodo metadata و DataCite تأیید شدند؛ payload/DOI/version و تاریخچه ثابت؛ هیچ update دوم انجام نشد.
- [x] Wikidata درست است و edit نمایشی یا ادعای بدون منبع انجام نشد.
- [ ] **default Kaggle باید به v20 برسد؛ تا آن زمان five-channel acceptance برقرار نیست.**
- [ ] **Freeze، tag یا release marker نهایی ایجاد نشده است.** API branch protection نیز HTTP 403 داد؛ ادعای lock قابل اجرا نداریم.

[runbook نگهداری](maintenance-runbook.fa.md) مسیر ادامهٔ دقیق، acceptance و منع retry تکراری را دارد. [checksum شواهد](evidence-checksums.sha256) فایل‌های گزارش را پوشش می‌دهد. کدهای لازم provenance مانند first-party-authored/canonical/release-preservation حفظ شدند؛ این کدها نثر تضعیف‌کننده نیستند.

### URLs و SHA-256 قبل/بعدِ عمومی

| URL | قبل | Live تأییدشده |
|---|---|---|
| https://www.ghezelbaash.ir/llms.txt | `2a10ce594bb2dfccd3618c1b36204bd0f89e38909655380c8f9f53b65e657f46` | `7b18c0758a0e9d36a8aa903ec9417ccaea0cefd4fa051aa8ac93a9a206c6f40b` |
| https://www.ghezelbaash.ir/llms-full.txt | `a9173237634b76b07f20a96101b929e4383fd15d2d2cc9a96d50c6850a3e4793` | `a6348e1e25d63755d8252a1307ecad9e46ac8a129101342ad6be06b55bb70628` |
| https://www.ghezelbaash.ir/index.md | `046c6869af6453c3586b6c1744b6475b770bea4ce60abbf32971e6a302e0adc6` | `537c98d4866cb577641d732438435ee9b52164b3c8721c019bed8471424d4873` |
| https://www.ghezelbaash.ir/physician-expertise.md | `11c2a77115e15b9afa762c0346a9ad14206eeb1e57a3775979a69acc1d4ff34f` | `11c2a77115e15b9afa762c0346a9ad14206eeb1e57a3775979a69acc1d4ff34f` |

Diffهای دقیق: [llms.txt](llms.txt.diff)، [llms-full.txt](llms-full.txt.diff)، [index.md](index.md.diff). physician-expertise.md سالم بود و تغییر نکرد. [جزئیات دریافت و hash](wording-live-verification.json).
