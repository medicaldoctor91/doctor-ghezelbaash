import { readFile, writeFile } from 'node:fs/promises';

const removableStyles = new Set([
  'font-style:normal',
  'direction:rtl;text-align:right',
  'direction:rtl;text-align:right;cursor:pointer',
  'direction:ltr;text-align:left',
  'direction:ltr;text-align:left;cursor:pointer',
]);

const jsonLdScriptPattern = /<script\b[^>]*\btype=(['"])application\/ld\+json\1[^>]*>/gi;

function normalizeStyle(value) {
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/;+$/, '');
}

function normalizeHtml(html) {
  return html.replace(/\sstyle=(['"])(.*?)\1/gi, (match, _quote, value) => {
    return removableStyles.has(normalizeStyle(value)) ? '' : match;
  });
}

function assertCanonicalHeadGraph(html, pathname) {
  if (pathname !== 'index.html') return;

  const documentHead = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  const graphScripts = html.match(jsonLdScriptPattern) ?? [];
  jsonLdScriptPattern.lastIndex = 0;

  if (graphScripts.length !== 1) {
    throw new Error(`expected exactly one inline JSON-LD Head Graph in ${pathname}, found ${graphScripts.length}`);
  }
  if (!jsonLdScriptPattern.test(documentHead)) {
    throw new Error(`the canonical inline JSON-LD Head Graph must be inside <head> in ${pathname}`);
  }
  jsonLdScriptPattern.lastIndex = 0;
}

export default function normalizeBuiltHtml() {
  return {
    name: 'normalize-built-html',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        let changed = 0;
        for (const pathname of ['index.html', '404.html']) {
          const url = new URL(pathname, dir);
          try {
            const input = await readFile(url, 'utf8');
            const output = normalizeHtml(input);
            if (/\sstyle=(['"])/i.test(output)) {
              throw new Error(`an unapproved inline style remains in ${pathname}`);
            }
            assertCanonicalHeadGraph(output, pathname);
            if (output !== input) {
              await writeFile(url, output, 'utf8');
              changed += 1;
            }
          } catch (error) {
            if (error?.code === 'ENOENT') continue;
            throw error;
          }
        }
        logger.info(`Normalized inline presentation attributes in ${changed} generated page(s).`);
      },
    },
  };
}
