import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir, rm } from 'node:fs/promises';

const jsonLdScriptPattern = /<script\b[^>]*\btype=(["'])application\/ld\+json\1[^>]*>/gi;
const maxIndexableHtmlBytes = 1_920_000;

async function listHtmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name, directory);
    if (entry.isDirectory()) files.push(...await listHtmlFiles(new URL(`${entry.name}/`, directory)));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(url);
  }
  return files;
}

function assertHtml(html, pathname) {
  if (/\sstyle=(["'])/i.test(html)) {
    throw new Error(`an inline style attribute remains in ${pathname}`);
  }

  const documentHead = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  const graphScripts = html.match(jsonLdScriptPattern) ?? [];
  const noindex = /<meta\b[^>]*\bname=(["'])robots\1[^>]*\bcontent=(["'])[^"']*\bnoindex\b[^"']*\2/i.test(documentHead);
  const expectedGraphCount = noindex ? 0 : 1;
  jsonLdScriptPattern.lastIndex = 0;

  const htmlBytes = Buffer.byteLength(html, 'utf8');
  if (!noindex && htmlBytes > maxIndexableHtmlBytes) {
    throw new Error(
      `${pathname} is ${htmlBytes} bytes; indexable HTML must stay at or below ${maxIndexableHtmlBytes} bytes`,
    );
  }

  if (graphScripts.length !== expectedGraphCount) {
    throw new Error(`expected ${expectedGraphCount} inline JSON-LD Head Graph(s) in ${pathname}, found ${graphScripts.length}`);
  }
  if (!noindex && !jsonLdScriptPattern.test(documentHead)) {
    throw new Error(`the canonical inline JSON-LD Head Graph must be inside <head> in ${pathname}`);
  }
  jsonLdScriptPattern.lastIndex = 0;

  const firstHeadElement = documentHead.match(/<([a-z][\w:-]*)\b[^>]*>/i)?.[0] ?? '';
  if (!/^<meta\b[^>]*\bcharset=(["'])utf-8\1/i.test(firstHeadElement)) {
    throw new Error(`UTF-8 charset metadata must be the first element in <head> in ${pathname}`);
  }

  const charsetOffset = html.search(/<meta\b[^>]*\bcharset=(["'])utf-8\1/i);
  if (charsetOffset < 0 || Buffer.byteLength(html.slice(0, charsetOffset), 'utf8') > 1024) {
    throw new Error(`UTF-8 charset metadata must occur within the first 1,024 bytes in ${pathname}`);
  }

  if (!noindex) {
    const graphOffset = documentHead.search(jsonLdScriptPattern);
    jsonLdScriptPattern.lastIndex = 0;
    const canonicalOffset = documentHead.search(/<link\b[^>]*\brel=(["'])canonical\1/i);
    const preloadOffset = documentHead.search(/<link\b[^>]*\brel=(["'])preload\1/i);
    if (canonicalOffset < 0 || canonicalOffset > graphOffset) {
      throw new Error(`the canonical link must precede the JSON-LD Head Graph in ${pathname}`);
    }
    if (preloadOffset >= 0 && preloadOffset > graphOffset) {
      throw new Error(`critical preloads must precede the JSON-LD Head Graph in ${pathname}`);
    }
  }
}

export default function assertBuiltHtml() {
  let projectRoot;
  let outputDirectory;

  return {
    name: 'assert-built-html',
    hooks: {
      'astro:config:done': ({ config }) => {
        projectRoot = fileURLToPath(config.root);
        outputDirectory = fileURLToPath(config.outDir);
      },
      'astro:build:start': async ({ logger }) => {
        const relativeOutput = path.relative(projectRoot, outputDirectory);
        if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
          throw new Error(`refusing to clear unsafe build output directory: ${outputDirectory}`);
        }

        let entries = [];
        try {
          entries = await readdir(outputDirectory);
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }

        await Promise.all(entries
          .filter((entry) => entry !== '.git')
          .map((entry) => rm(path.join(outputDirectory, entry), {
            force: true,
            maxRetries: 3,
            recursive: true,
          })));

        if (entries.some((entry) => entry !== '.git')) {
          logger.info('Cleared the previous generated output before building.');
        }
      },
      'astro:build:done': async ({ dir, logger }) => {
        const files = await listHtmlFiles(dir);
        for (const url of files) {
          const pathname = decodeURIComponent(url.pathname.slice(dir.pathname.length));
          assertHtml(await readFile(url, 'utf8'), pathname);
        }
        logger.info(`Validated ${files.length} generated HTML document(s) without rewriting build output.`);
      },
    },
  };
}
