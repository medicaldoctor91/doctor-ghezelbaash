import type { APIRoute } from 'astro';
import { buildGeneratedCanonicalEntityGraph } from '~/utils/entityGraph';
import { jsonResponse } from '~/utils/jsonLd';

export const prerender = true;

export const GET: APIRoute = async () => jsonResponse(await buildGeneratedCanonicalEntityGraph());
