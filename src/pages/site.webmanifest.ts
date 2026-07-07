import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { safeJson } from '~/utils/jsonLd';

export const prerender = true;

export const GET: APIRoute = async () => {
  const entry = await getEntry('siteManifest', 'webmanifest');
  if (!entry) throw new Error('Missing src/content/site-manifest/webmanifest.json content collection entry.');

  return new Response(`${safeJson(entry.data)}\n`, {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
