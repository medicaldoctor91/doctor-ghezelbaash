# Doctor Ghezelbaash — Astro One Page

یک starter رسمی و سبک Astro برای سایت تک‌صفحه‌ای دکتر سعید قزلباش با تمرکز روی SEO، AEO، structured data، سرعت، و توسعه‌پذیری بعدی.

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Architecture

- `src/pages/index.astro`: صفحه اصلی تک‌صفحه‌ای
- `src/layouts/BaseLayout.astro`: اسکلت HTML، متا، canonical، Open Graph و JSON-LD
- `src/components/Sections.astro`: همه بخش‌های visible صفحه
- `src/data/site.ts`: داده‌های محتوایی، پزشک، کلینیک، خدمات، FAQ و لینک‌های entity
- `src/data/schema.ts`: JSON-LD graph
- `src/pages/robots.txt.ts`: robots endpoint
- `src/pages/llms.txt.ts`: خلاصه ماشینی برای AEO/LLM discovery
- `@astrojs/sitemap`: sitemap رسمی Astro

## Deployment

فعلاً هیچ اتصال Cloudflare یا GitHub Actions اضافه نشده است. بعد از نهایی شدن محتوا، خروجی `dist/` برای Cloudflare Pages/Workers قابل انتشار است.
