import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const root = normalize(join(process.cwd(), process.argv[2] ?? 'dist'));
const port = Number(process.env.PORT ?? process.argv[3] ?? 4173);
const textTypes = new Set(['.html', '.css', '.js', '.mjs', '.json', '.jsonld', '.xml', '.txt', '.svg', '.webmanifest', '.vtt']);
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jsonld': 'application/ld+json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.mp4': 'video/mp4', '.vtt': 'text/vtt; charset=utf-8', '.woff2': 'font/woff2',
};

const safePath = (pathname) => {
  const decoded = decodeURIComponent(pathname).replace(/\\/gu, '/');
  const normalized = normalize(decoded).replace(/^(?:\.\.(?:\/|\\|$))+/u, '');
  return normalized.startsWith('/') ? normalized.slice(1) : normalized;
};

const sendText = (request, response, file, status) => {
  const extension = extname(file).toLowerCase();
  const body = readFileSync(file);
  const accepts = request.headers['accept-encoding'] ?? '';
  response.statusCode = status;
  response.setHeader('Content-Type', contentTypes[extension] ?? 'application/octet-stream');
  response.setHeader('Vary', 'Accept-Encoding');
  response.setHeader('Cache-Control', extension === '.html' ? 'public, max-age=0, must-revalidate' : 'public, max-age=31536000, immutable');
  if (/\bbr\b/u.test(accepts)) {
    const compressed = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 8 } });
    response.setHeader('Content-Encoding', 'br');
    response.setHeader('Content-Length', compressed.length);
    response.end(compressed);
    return;
  }
  if (/\bgzip\b/u.test(accepts)) {
    const compressed = gzipSync(body, { level: 9 });
    response.setHeader('Content-Encoding', 'gzip');
    response.setHeader('Content-Length', compressed.length);
    response.end(compressed);
    return;
  }
  response.setHeader('Content-Length', body.length);
  response.end(body);
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
  if (url.pathname === '/index.html') {
    response.writeHead(301, { Location: '/', 'Cache-Control': 'public, max-age=3600' });
    response.end();
    return;
  }
  let relative = safePath(url.pathname);
  if (!relative || relative.endsWith('/')) relative = `${relative}index.html`;
  let file = join(root, relative);
  let status = 200;
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    file = join(root, '404.html');
    status = 404;
  }
  const extension = extname(file).toLowerCase();
  if (textTypes.has(extension)) {
    sendText(request, response, file, status);
    return;
  }
  response.statusCode = status;
  response.setHeader('Content-Type', contentTypes[extension] ?? 'application/octet-stream');
  response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  response.setHeader('Content-Length', statSync(file).size);
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => console.log(`Serving ${root} at http://127.0.0.1:${port}`));
