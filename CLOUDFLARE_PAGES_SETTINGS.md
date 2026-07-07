# Cloudflare Pages deploy settings

این ریپو برای Deploy از طریق GitHub به Cloudflare Pages آماده است.

## فایل‌هایی که باید داخل GitHub باشند

- `src/`
- `public/`
- `scripts/`
- `package.json`
- `package-lock.json`
- `astro.config.ts`
- `tsconfig.json`
- `eslint.config.js`
- `.prettierrc.mjs`
- `.prettierignore`
- `.gitignore`
- `.node-version`
- `README.md`

## فایل‌هایی که نباید داخل GitHub باشند

- `node_modules/`
- `dist/`
- `.astro/`
- `.env`
- `.env.*`

## تنظیمات Cloudflare Pages

- Framework preset: `Astro`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`
- Node.js version: `22.12.0`

اگر در داشبورد Cloudflare لازم شد، Environment variable زیر را هم بگذارید:

```txt
NODE_VERSION=22.12.0
```

## فایل‌های مخصوص Cloudflare داخل پروژه

- `public/_headers`

این فایل بعد از build به `dist/_headers` کپی می‌شود و headerهای امنیتی، cache و noindex برای previewهای Cloudflare Pages را تنظیم می‌کند.
