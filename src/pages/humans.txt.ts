import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';

export const prerender = true;

export const GET: APIRoute = async () => {
  const contact = await getEntry('siteData', 'contact');
  const data = contact?.data;
  const body = `/* TEAM */
Doctor / Entity: ${data?.doctorName ?? 'دکتر سعید قزلباش'}
Clinic: ${data?.clinicName ?? 'کلینیک زیبایی دکتر سعید قزلباش'}
Location: ${data?.address ?? 'کرمانشاه'}
Contact: ${data?.phone ?? '+989308209494'}
Instagram: ${data?.instagram ?? 'https://www.instagram.com/doctor.ghezelbaash/'}

/* SITE */
Language: Persian / fa-IR
Direction: RTL
Architecture: Astro Content Collections + generated endpoints
Canonical entity graph: /graph.json
Machine data index: /data/index.json
Video sitemap: /video-sitemap.xml
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
