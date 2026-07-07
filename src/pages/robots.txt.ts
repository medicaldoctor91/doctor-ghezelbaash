import type { APIRoute } from 'astro';
import { SITE } from '~/site.config';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const origin = site?.origin ?? SITE.site;
  const sitemap = new URL('/sitemap-index.xml', origin).href;
  const videoSitemap = new URL('/video-sitemap.xml', origin).href;

  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\nSitemap: ${videoSitemap}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
