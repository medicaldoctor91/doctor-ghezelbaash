# Dr. Saeed Ghezelbash website source

این مخزن برای ساخت `dist` همین وب‌سایت است. محتوای اصلی، مسیرها، گراف و تنظیمات خروجی در `src/canonical/source.mjs` قرار دارند. renderer در `src/pages/index.astro` و ابزارهای ساخت و بررسی در `infrastructure/` هستند.

نسخهٔ Node در `.nvmrc` و وابستگی‌ها در `package-lock.json` مشخص شده‌اند. برای نصب و ساخت خروجی:

```sh
npm ci
npm run release:v2
```

خروجی سایت در `dist/` و نتایج اجرای جاری در `release/` تولید می‌شوند؛ هر دو پوشه خارج از فایل‌های ثبت‌شدهٔ Git هستند.

گردش ساخت و انتشار در `.github/workflows/build.yml` تعریف شده است. انتشار شاخهٔ `main` به پروژهٔ `doctor-ghezelbaash` در Cloudflare Pages انجام می‌شود. دامنهٔ سایت `https://www.ghezelbaash.ir` است.
