import { globalWritingRules, pageContentBriefs } from '../data/contentBriefs.mjs';
import { site } from '../data/site.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.content_briefs.astro.v1',
    dateModified: '2026-06-27',
    canonicalWebsite: site.canonicalBase + '/',
    purpose: 'Machine-readable content generation briefs. This file describes required content structure and constraints without serving as final page copy.',
    globalWritingRules,
    briefs: pageContentBriefs
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
