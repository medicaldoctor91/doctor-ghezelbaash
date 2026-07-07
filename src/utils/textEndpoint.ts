import { getEntry } from 'astro:content';

export const llmsTextResponse = async (id: string): Promise<Response> => {
  const entry = await getEntry('llmsDocs', id);

  if (!entry) {
    return new Response(`Missing llmsDocs collection entry: ${id}\n`, { status: 500 });
  }

  return new Response(`${entry.data.body.trim()}\n`, {
    headers: {
      'content-type': entry.data.contentType,
      'cache-control': 'public, max-age=3600',
    },
  });
};
