export type JsonLdNode = Record<string, unknown>;
export type JsonLdGraphDocument = {
  '@context'?: unknown;
  '@graph': JsonLdNode[];
  dateModified?: string;
  version?: string;
  [key: string]: unknown;
};

export const safeJson = (value: unknown): string => JSON.stringify(value, null, 2).replace(/</g, '\\u003c');

export const jsonResponse = (value: unknown, contentType = 'application/ld+json'): Response =>
  new Response(`${safeJson(value)}\n`, {
    headers: {
      'content-type': `${contentType}; charset=utf-8`,
      'cache-control': 'public, max-age=3600',
    },
  });
