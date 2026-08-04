const MARKDOWN_MEDIA_TYPES = ['text/markdown', 'application/markdown'];
const HTML_MEDIA_TYPES = ['text/html', 'application/xhtml+xml'];
const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=yes, use=reference';
const HTML_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=60, stale-if-error=86400';

function parseAccept(value) {
  if (!value) return [];

  return value
    .split(',')
    .map((item, index) => {
      const [rawType, ...rawParameters] = item.trim().split(';');
      const type = rawType.trim().toLowerCase();
      let quality = 1;

      for (const rawParameter of rawParameters) {
        const [rawName, rawValue] = rawParameter.trim().split('=');
        if (rawName?.toLowerCase() !== 'q') continue;
        const parsed = Number.parseFloat(rawValue ?? '');
        quality = Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
      }

      return { type, quality, index };
    })
    .filter(({ type }) => type.includes('/'));
}

function matchScore(actualType, acceptedRanges) {
  const [actualMajor] = actualType.split('/');
  let best = { quality: 0, specificity: -1, index: Number.POSITIVE_INFINITY };

  for (const accepted of acceptedRanges) {
    let specificity = -1;

    if (accepted.type === actualType) specificity = 2;
    else if (accepted.type === `${actualMajor}/*`) specificity = 1;
    else if (accepted.type === '*/*') specificity = 0;

    if (specificity < 0) continue;

    const isBetter =
      specificity > best.specificity ||
      (specificity === best.specificity && accepted.index < best.index);

    if (isBetter) {
      best = {
        quality: accepted.quality,
        specificity,
        index: accepted.index,
      };
    }
  }

  return best;
}

function bestRepresentationScore(mediaTypes, acceptedRanges) {
  return mediaTypes
    .map((type) => matchScore(type, acceptedRanges))
    .reduce((best, candidate) => {
      if (candidate.quality !== best.quality) {
        return candidate.quality > best.quality ? candidate : best;
      }
      if (candidate.specificity !== best.specificity) {
        return candidate.specificity > best.specificity ? candidate : best;
      }
      return candidate.index < best.index ? candidate : best;
    }, { quality: 0, specificity: -1, index: Number.POSITIVE_INFINITY });
}

function prefersMarkdown(acceptHeader) {
  const acceptedRanges = parseAccept(acceptHeader);
  const explicitlyAcceptsMarkdown = acceptedRanges.some(
    ({ type, quality }) => MARKDOWN_MEDIA_TYPES.includes(type) && quality > 0,
  );

  if (!explicitlyAcceptsMarkdown) return false;

  const markdown = bestRepresentationScore(MARKDOWN_MEDIA_TYPES, acceptedRanges);
  const html = bestRepresentationScore(HTML_MEDIA_TYPES, acceptedRanges);

  if (markdown.quality !== html.quality) return markdown.quality > html.quality;
  if (markdown.specificity !== html.specificity) return markdown.specificity > html.specificity;
  return markdown.index < html.index;
}

function appendVary(headers, token) {
  const current = headers.get('Vary');
  if (!current) {
    headers.set('Vary', token);
    return;
  }

  const tokens = current.split(',').map((item) => item.trim().toLowerCase());
  if (!tokens.includes(token.toLowerCase())) headers.set('Vary', `${current}, ${token}`);
}

function cloneResponse(response, requestMethod, mutateHeaders) {
  const headers = new Headers(response.headers);
  mutateHeaders(headers);

  return new Response(requestMethod === 'HEAD' ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return env.ASSETS.fetch(request);
  }

  const serveMarkdown = prefersMarkdown(request.headers.get('Accept'));
  const assetURL = new URL(request.url);
  assetURL.search = '';
  assetURL.pathname = serveMarkdown ? '/index.md' : '/';

  const assetRequest = new Request(assetURL, {
    method: request.method,
    headers: request.headers,
  });
  const assetResponse = await env.ASSETS.fetch(assetRequest);

  return cloneResponse(assetResponse, request.method, (headers) => {
    appendVary(headers, 'Accept');
    headers.set('Content-Signal', CONTENT_SIGNAL);

    if (!serveMarkdown) {
      headers.set('Cache-Control', HTML_CACHE_CONTROL);
      return;
    }

    headers.set('Content-Type', 'text/markdown; charset=utf-8');
    headers.set('Content-Language', 'fa-IR');
    headers.set('Content-Location', '/index.md');
    headers.set('X-Robots-Tag', 'noindex, follow');
  });
}
