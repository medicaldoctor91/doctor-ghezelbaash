import type { APIRoute } from 'astro';
import { llmsTextResponse } from '~/utils/textEndpoint';

export const prerender = true;

export const GET: APIRoute = async () => llmsTextResponse('full');
