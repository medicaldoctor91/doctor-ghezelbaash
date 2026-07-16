import { SITE_URL } from '../data/doctor.ts';

export const seo = {
  canonical: SITE_URL,
  title: 'دکتر سعید قزلباش | پزشک زیبایی در کرمانشاه',
  description:
    'صفحه رسمی دکتر سعید قزلباش؛ معرفی پزشک و کلینیک در کرمانشاه، مقایسه روش‌های زیبایی و پاسخ روشن به پرسش‌های تصمیم‌ساز.',
  locale: 'fa_IR',
  language: 'fa-IR',
  siteName: 'دکتر سعید قزلباش',
  ogImage: `${SITE_URL}og-image.webp`,
} as const;

export const absoluteUrl = (path: string): string => new URL(path, SITE_URL).href;

export const escapeJsonForHtml = (value: unknown): string =>
  JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
