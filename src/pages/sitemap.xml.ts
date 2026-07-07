import type { APIRoute } from 'astro';
import { SITE } from '~/site.config';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const origin = site?.origin ?? SITE.site;
  const sitemapIndex = new URL('/sitemap-index.xml', origin).href;
  const videoSitemap = new URL('/video-sitemap.xml', origin).href;

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>${sitemapIndex}</loc></sitemap>\n  <sitemap><loc>${videoSitemap}</loc></sitemap>\n</sitemapindex>\n`,
    {
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'public, max-age=3600',
      },
    }
  );
};
