# Dr. Saeed Ghezelbash canonical site source

این سورس فقط برای تولید dist نهایی همین corpus طراحی شده است. مرجع اصلی محتوا، routeها، هویت‌ها، graph و policyهای انتشار در `src/canonical/source.mjs` قرار دارد و renderer در `src/pages/index.astro` آن را مستقیماً import می‌کند.

## قرارداد خروجی

- دقیقاً ۷۲ صفحهٔ canonical تولید می‌شود: Home جامع + ۷۱ focused entry که همان reader/corpus را با context موضوعی باز می‌کنند.
- هویت canonical پزشک `https://www.ghezelbaash.ir/#saeed-ghezelbash` است؛ مسیر `/saeed-ghezelbash` صفحه یا alias عمومی نیست.
- Home کل corpus قابل‌دیدن را حفظ می‌کند و full canonical KG را در ابتدای `<head>` منتشر می‌کند. همان `SOURCE.graph` مستقیماً `/graph.jsonld` را نیز تولید می‌کند.
- برابری RDF میان SOURCE، Home، JSON-LD خارجی و Turtle با RDFC-1.0 و SHA-256 بررسی می‌شود. تعداد node یا artifact معیار authority نیست.
- focused projectionها فقط Schema.org و Q&A/media مرتبط با محتوای قابل‌دیدن همان route را دارند؛ هویت غنی Person و Clinic حفظ می‌شود.
- پس از اجرای JavaScript، reader پیرامون بخش منتخب باز می‌شود ولی title، H1، canonical، primary article و JSON-LD همان route باقی می‌مانند.
- چهار `VideoObject` به watch pageهای canonical متصل‌اند؛ لینک‌های Clip با `?t=` واقعاً زمان ویدیو را انتخاب می‌کنند.
- تاریخ edition از publication/modification/review جدا است. تاریخ‌های unsupported حذف می‌شوند و trust metadata قابل‌دیدن از truth گراف تولید می‌شود.
- در Home، باکس سه‌قسمتی نظام پزشکی، وضعیت مراجعه و تاریخ بازبینی درست زیر H1 قرار دارد؛ کادر نویسنده/بازبین فقط در ورودی‌های موضوعی نمایش داده می‌شود.
- redirectهای HTML یک‌مرحله‌ای هستند. aliasهای هویت 200 با MIME ماشین، CORS، noindex/follow و describedby پوشش داده می‌شوند؛ در sitemap HTML قرار نمی‌گیرند.
- representationهای مفید ماشین حفظ می‌شوند. موجودی و بررسی تک‌تک آن‌ها در [delivery audit](docs/delivery-audit.md) مستند است؛ llms.txt معیار ranking نیست.
- مسیر انتشار: validation → build → verification → finalize → seal → **read-only verification** → artifact. hashهای dist قبل و بعد از بررسی نهایی باید یکسان باشند.

## Toolchain

حداقل Node عملی این package `22.19.0` است (وابستگی lock‌شدهٔ فعلی این حد را لازم دارد) و Node 24 نیز در range پشتیبانی می‌شود.

```sh
npm ci
npm run test:v2
npm run build
npm run verify
npm run finalize
npm run seal
npm run verify:dist
```

برای اجرای کامل همان زنجیره با یک دستور:

```sh
npm run release:v2
```

`npm run release:v2` بررسی Chromium تمام ۷۲ route، seeking ویدیو و read-only بودن مرحلهٔ post-seal را هم اجرا می‌کند.

`npm run test:v2` قراردادهای source، Search graph، machine resources، routing، media، headers/security، integrity، rendering و release runner را بررسی می‌کند.

رفتارهای edge/CDN مانند TLS، HTTP/2/3، compression negotiation و پاسخ live میزبان پس از deploy جداگانه قابل بررسی‌اند و در source شبیه‌سازی نمی‌شوند.
