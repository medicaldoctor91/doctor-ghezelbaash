# Dr. Saeed Ghezelbash canonical site source

این سورس فقط برای تولید dist نهایی همین corpus طراحی شده است. مرجع اصلی محتوا، routeها، هویت‌ها، graph و policyهای انتشار در `src/pages/index.astro` قرار دارد.

## قرارداد خروجی

- دقیقاً ۷۲ صفحهٔ canonical تولید می‌شود: Home جامع + ۷۱ focused entry که همان reader/corpus را با context موضوعی باز می‌کنند.
- هویت canonical پزشک `https://www.ghezelbaash.ir/#saeed-ghezelbash` است؛ مسیر `/saeed-ghezelbash` صفحه یا alias عمومی نیست.
- Home کل corpus قابل‌دیدن را حفظ می‌کند. Search-facing JSON-LD قبل از body قرار می‌گیرد و با Person پزشک شروع می‌شود؛ full canonical graph داخل HTML تکرار نمی‌شود و به‌صورت `/graph.jsonld` منتشر می‌شود.
- full graph شامل ۱۵۹۲ node است. Search projection فقط plumbing غیرSearch مانند SHACL/PROV/DCAT/RDF vocabulary را کنار می‌گذارد و روابط مفید Schema.org پزشک را حفظ می‌کند.
- چهار `VideoObject` به watch pageهای canonical خود متصل‌اند و sitemap نیز همان watch pageها را منتشر می‌کند.
- media با URLهای semantic و پایدار منتشر می‌شود؛ نسخه‌های fingerprinted byte-identical اضافی در source نگه‌داری نمی‌شوند.
- ۱۹۱ redirect تاریخی curated مستقیماً در `SOURCE.routes.legacyRedirects` قرار دارند؛ خروجی routing نهایی ۸۹۳ rule است: ۳۳۵ permanent redirect و ۵۵۸ bounded representation rewrite.
- ۲۴ machine resource در registry وجود دارد؛ ۲۰ artifact ثابت/مشتق پس از Astro build materialize می‌شوند و HTML/sitemap/robots/manifest از مسیرهای اصلی build می‌آیند.
- `_headers`، `_redirects` و `security.txt` مستقیماً از truth فعلی تولید می‌شوند؛ candidate A/B/C، benchmark انتخاب winner، supplement routing و post-build date/language repair وجود ندارند.

## Toolchain

حداقل Node عملی این package `22.19.0` است (وابستگی lock‌شدهٔ فعلی این حد را لازم دارد) و Node 24 نیز در range پشتیبانی می‌شود.

```sh
npm ci
npm run test:v2
npm run build
npm run finalize
npm run seal
npm run verify:dist
```

برای اجرای کامل همان زنجیره با یک دستور:

```sh
npm run release:v2
```

`npm run test:v2` قراردادهای source، Search graph، machine resources، routing، media، headers/security، integrity، rendering و release runner را بررسی می‌کند.

رفتارهای edge/CDN مانند TLS، HTTP/2/3، compression negotiation و پاسخ live میزبان پس از deploy جداگانه قابل بررسی‌اند و در source شبیه‌سازی نمی‌شوند.
