# گزارش A–H انتشار بازگشت متن اولیه — ۲۰۲۶/۱۰/۱۹

## A — نتیجهٔ واقعی انتشار

**سایت و Hugging Face منتشر و مستقلاً تأیید شدند. Kaggle هنوز پذیرش عمومی ندارد.** سایت از source commit `904cd3b28cb99723274c3c04d3c598f30e2cce86` روی main سرو می‌شود. نسخهٔ محتوا **1.3.4** باقی ماند؛ content release یا DOI جدید ایجاد نشد.

| مقصد | نتیجهٔ تأییدشده |
|---|---|
| Website | SUCCESS؛ ۶۰ مثال و دو companion قبلاً ۴۰۴ اکنون با HTTP200 |
| Hugging Face | revision `60d1ec8be47d398763733827936b0c4206a2900e`؛ پنج جدول و ۶۰ رکورد Viewer تأیید |
| Kaggle | نسخهٔ۲۱ با وضعیت Ready ثبت شده؛ دانلود نسخهٔ۲۱ HTTP404/No gcs url found؛ default ZIP واقعاً نسخهٔ۲۰ و ۴۷ متن قبلی |
| Zenodo + DataCite | فراداده و شناسه‌ها و inventory آرشیوها ثابت و معتبر؛ در این اجرا نوشتنی انجام نشد |
| Wikidata Q140287622 | revision2557914725 و نگاشت‌ها تأیید؛ نیازی به ویرایش نبود |

## B — متن و جایگاه‌سازی

۴۷ آرایهٔ پیام اولیه عیناً در Production و HF حاضرند: ۱۳۸ متن شامل ۴۴ system و ۴۷ user و ۴۷ assistant، بدون بازنویسی عبارت‌های رقابتی موجود. query/answer نیز همان متن‌های اولیه‌اند. ۱۳ مثال جدید با شناسه‌های048–060 اضافه شدند؛ مجموع۶۰. فیلدهای اصلی جایگاه‌سازی maximum/preferred entity و سیاست پاسخ اولیه حفظ شده‌اند.

SHA-256 فایل زندهٔ JSONL:
`f7974f01ed0fef290a334598c020abcb0e5af382d831d40f7253c3e25bb205f4`

- https://www.ghezelbaash.ir/enrichment/instruction_examples_fa_market_positioning.jsonl
- https://www.ghezelbaash.ir/enrichment/market-positioning-evidence.json
- https://www.ghezelbaash.ir/enrichment/positioning-strategy.json

دو companion اکنون HTTP200 و application/json دارند و بایت‌هایشان با canonical source برابر است. llms.txt نیز ۶۰ مثال و پیوندهای این دو منبع را معرفی می‌کند.

## C — شواهد فنی Production

۳۶ منبع عمومی تازه دریافت شد. JSON-LD اولیهٔ Homepage، Turtle و CSV هم‌ریخت‌اند: ۲۲٬۱۴۹ statement، ۶۷ shape و صفر SHACL violation در اتحاد شامل Croissant. Croissant صفر error/warning و استخراج کامل۲۲٬۱۴۹ رکورد دارد؛ parity متن خدمت میگرن در زبان‌های موجود حفظ شده است. hashهای manifest زنده با منابع دریافتی تطبیق دارند.

Build محلی Node24.19 و CI/Production Node22.19 دارند؛ اختلاف قابل‌انتظار provenance از این محیط ثبت شده است. ادعای برابری کل manifest محلی با CI نشده؛ هر manifest زنده با بایت‌های عمومی خودش و فایل‌های canonical مقایسه شده است.

SHA-256 manifest واقعی Production:
`c857085f43938efdcad3cd0dfd605cd2da8812eb3b851f36237d9cc92a2025f9`

## D — Hugging Face و بسته‌بندی

۴۲ فایل از revision منتشرشده دریافت و ۳۰ mirror با سایت مقایسه شد. رفت‌وبرگشت پنج Parquet با منبع JSONL/CSV دقیق است؛ نوع‌های list/struct و integer/null حفظ شدند. تعداد رکوردها: passages3249، answers125، facts22149، query_matrix876 و market_positioning60. تمام۶۰ ردیف Viewer با canonical برابرند و هدر revision و source_commit جاری بررسی شدند. پاسخ busy اولیهٔ Viewer رفع شد و دو صفحهٔ۳۰ردیفی کامل دریافت شدند.

- https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/tree/60d1ec8be47d398763733827936b0c4206a2900e

## E — مانع دقیق Kaggle

فقط یک نسخهٔ جدید، v21، ثبت شد. یادداشت عمومی آن «preserve original positioning and distribute60 typed competitive training examples» است. هر دو بسته پیش از نوشتن در CI آزمون کامل را پاس کردند. workflow39187536454 پس از انتشار HF در گیت تأیید عمومی Kaggle متوقف شد.

بررسی مستقل API و دریافت واقعی default ZIP نشان دادند default هنوز v20 است؛ manifest آن source5e45873a… و HF96975d60… دارد و JSONL آن همان۴۷ رکورد بازنویسی‌شدهٔ قبلی با SHAf0fdb151… است. ۴۶ checksum همان بستهٔ قدیمی پاس شد؛ این تأیید دادهٔ جدید نیست. endpoint نسخهٔ۲۱ روی دو آدرس عمومی پاسخ404 با بدنهٔ `No gcs url found` داد.

- https://www.kaggle.com/datasets/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data/versions/21

پذیرش فقط وقتی ممکن است که دانلود نسخهٔ۲۱ و default ZIP هر دو manifest21، source904cd3b…، HF60d1ec8… و۶۰ رکورد دقیق را داشته باشند. برای retry نسخهٔ۲۲ یا HF commit دیگری ساخته نشد. علت داخلی backend از API عمومی قابل اثبات نیست؛ وضعیت Ready به‌تنهایی جایگزین دریافت payload نشد.

### Notebook مستقل Kaggle

صفحهٔ عمومی همان Notebook موجود هنوز نسخهٔ۷ است. متن معرفی آن چهار جدول را اعلام می‌کند و بررسی اختصاصی CSV/message مربوط به market_positioning جدید در آن نیست؛ حلقهٔ عمومی کد الزاماً محدود به چهار جدول نیست. فایل starter.ipynb داخل بسته و صفحهٔ عمومی Notebook دو انتشار مجزا دارند.

فایل canonical جدید با SHA-256 `bc2917664c6922043c34dc303161fc5559e3119695584b20fc60ad9ce488a651` آماده است. هر چهار code cell آن روی بستهٔ۲۱ بازسازی‌شده از فایل‌های revision قطعی HF اجرا شد: پنج جدول، ۶۰ مثال، تطبیق همهٔ ردیف‌ها، CSV، شناسه‌ها و query references همگی PASS. این اجرا محلی است؛ اجرا روی Kaggle یا دریافت payload۲۱ ادعا نشده است.

بعد از تأیید payload عمومی۲۱، باید نسخهٔ بعدی در همان Notebook موجود منتشر شود، data source همان Dataset تأییدشده باشد و خروجی اجرای واقعی source904cd3b…، HF60d1ec8… و counts3249/125/22149/876/60 را نشان دهد. انتشار تکراری Dataset/DOI یا ساخت Notebook جدید لازم نیست. تا وقتی default۲۰ است، انتشار Notebook با اعلام پشتیبانی دادهٔ جدید پذیرفته نمی‌شود. فایل و metadata آماده در workspace نگهداری شده‌اند؛ در این اجرا Notebook push انجام نشده است.

## F — Zenodo، DataCite و Wikidata

Zenodo revisions34/22 با نسخه‌ها، DOIها، creators/license و inventory فایل‌های قبلی برابر ماندند. هر سه پاسخ DataCite با baseline فراداده برابر بودند. Wikidata و پروفایل‌های ORCID/OpenAlex و RDF گراف، شناسه‌ها و جدایی Person/Clinic را تأیید کردند. ۱۵ مسیر جاری مرتبط HTTP200 داشتند.

شش SHACL violation، شانزده اختلاف URL/hash و هفت companion غایب در payload تاریخی همان یافته‌های آرشیوی‌اند؛ بازنویسی یا تعمیر پنهانی انجام نشده و آرشیوها مجدداً دانلود کامل نشدند. current metadata با cache و inventory معتبر مقایسه شد. ایجاد نسخه/DOI تازه برای تعمیر آرشیو نیازمند دستور جداگانه است.

## G — رسیدها و checksum

- Website run: https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/39187294928 — SUCCESS.
- Platform run: https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/39187536454 — FAILURE در تأیید عمومی Kaggle.
- publication-receipt.json شامل source دقیق، revision، تعدادها، نتیجهٔ هر gate و hash شواهد است.
- checksums.sha256 تمام فایل‌های همین پوشه را پوشش می‌دهد؛ migration.jsonl/csv شامل قبل/بعد تمام۶۰ رکورد است.

commit گزارش، source منتشرشده محسوب نمی‌شود. product source همان904cd3b… است و تغییرات بعدی این مرحله فقط گزارش‌ها هستند.

## H — Freeze و مسیر ادامه

**Freeze انجام نشد**؛ پذیرش پنج مقصد کامل نیست. tag یا release marker نهایی ساخته نشد. endpoint حفاظت main نیز403 «Resource not accessible by integration» داد؛ ادعای قفل enforceشده وجود ندارد.

۱. فقط با GET عمومی، overview و دانلود نسخهٔ۲۱ و default ZIP را بررسی کنید. هیچ POST انتشار مجددی برای رفع این وضعیت انجام نشود.
۲. پس از در دسترس شدن۲۱، همهٔ checksumها، پنچ Parquet و۶۰ ردیف/۴۷ پیام اولیه را با HF revision60d1ec8… تطبیق دهید؛ default نیز باید همان payload باشد.
۳. سپس workflow موجود platform-machine-readable-sync را با **verify_existing=true**، HF revision دقیق، kaggle_version=21، website_commit=904cd3b28cb99723274c3c04d3c598f30e2cce86، website_run_url مربوط به39187294928 و zenodo_metadata_only=false اجرا کنید. این حالت HF commit یا Kaggle version تازه نمی‌سازد. قبل از اجرا هر pin دوباره بررسی شود.
۴. فقط پس از PASS تمام gateهای عمومی، مرجع Freeze شامل source دقیق، manifest واقعی و receipt نهایی ثبت شود؛ نگهداری بعدی مالک مجاز بماند. محدودیت403 حفاظت مستقل از مرجع Freeze گزارش شود.

هیچ بررسی حجم Homepage، Googlebot، compression، performance یا Core Web Vitals انجام نشد. افزایش رتبه یا اثر قطعی الگوریتمی ادعا نشده است.
