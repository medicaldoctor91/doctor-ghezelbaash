const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=yes, use=reference';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const assetURL = new URL(request.url);
  assetURL.pathname = '/404.html';
  assetURL.search = '';

  const assetResponse = await env.ASSETS.fetch(
    new Request(assetURL, {
      method: request.method,
      headers: request.headers,
    }),
  );

  const headers = new Headers(assetResponse.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Content-Location', '/404.html');
  headers.set('X-Robots-Tag', 'noindex, follow');
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Signal', CONTENT_SIGNAL);

  return new Response(request.method === 'HEAD' ? null : assetResponse.body, {
    status: 404,
    statusText: 'Not Found',
    headers,
  });
}
