import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import {
  aeoDataResponse,
  getAeoDataContentType,
  normalizeAeoDataDocument,
  buildAeoDataIndex,
} from '~/utils/aeoDataEndpoint';
import { jsonResponse } from '~/utils/jsonLd';

type DataEndpointProps = {
  id: string;
  data: Record<string, any> | null;
};

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  const entries = await getCollection('aeoData');

  return [
    {
      params: { id: 'index' },
      props: { id: 'index', data: null },
    },
    ...entries
      .filter((entry) => entry.id !== 'index')
      .map((entry) => ({
        params: { id: entry.id },
        props: { id: entry.id, data: entry.data },
      })),
  ];
};

export const GET: APIRoute = async ({ props, params }) => {
  const id = String((props as DataEndpointProps | undefined)?.id ?? params.id ?? '');

  if (!id) return new Response('Missing data id\n', { status: 404 });

  if (id === 'index') {
    return jsonResponse(await buildAeoDataIndex(), getAeoDataContentType(id));
  }

  const data = (props as DataEndpointProps | undefined)?.data;
  if (data) return jsonResponse(normalizeAeoDataDocument(id, data), getAeoDataContentType(id));

  return aeoDataResponse(id);
};
