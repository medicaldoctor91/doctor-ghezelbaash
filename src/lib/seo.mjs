import { site, absoluteUrl, canonicalImage } from '../data/site.mjs';
import { routeLabelForPath } from './routes.mjs';

export const defaultRobots = 'index,follow,max-image-preview:large';

export function normalizeTitle(title, canonicalPath = '/') {
  const cleanTitle = title || routeLabelForPath(canonicalPath) || site.nameFa;
  return cleanTitle.includes(site.personFa) || cleanTitle.includes('قزلباش')
    ? cleanTitle
    : `${cleanTitle} | ${site.personFa}`;
}

export function normalizeDescription(description) {
  const fallback = 'صفحه رسمی دکتر سعید قزلباش و کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه؛ خدمات، آدرس، مسیر تماس و منابع قابل بررسی.';
  return description || fallback;
}

export function buildSeoMeta({
  title,
  description,
  canonicalPath = '/',
  robots = defaultRobots,
  image = site.image
} = {}) {
  return {
    title: normalizeTitle(title, canonicalPath),
    description: normalizeDescription(description),
    robots,
    canonical: absoluteUrl(canonicalPath),
    image: canonicalImage(image)
  };
}
