import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);
const IDENTITY_TEXT_MARKER = 'من، دکتر سعید قزلباش هستم';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function normalizeText(value) {
  return value
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[^]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[^]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findTagEnd(html, start) {
  let quote = null;
  for (let index = start + 1; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = null;
      else if (character === '\\') index += 1;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '>') return index;
  }
  return -1;
}

function readTagName(source, offset = 1) {
  let index = offset;
  while (/\s/.test(source[index] ?? '')) index += 1;
  const match = source.slice(index).match(/^([A-Za-z][A-Za-z0-9:-]*)/);
  return match?.[1]?.toLowerCase() ?? '';
}

function extractAttribute(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`\\s${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : '';
}

function extractRegion(html, tagName) {
  const open = new RegExp(`<${tagName}\\b[^>]*>`, 'i').exec(html);
  if (!open) return { markup: '', start: -1, end: -1 };
  const close = new RegExp(`</${tagName}\\s*>`, 'i');
  const remainder = html.slice(open.index + open[0].length);
  const closeMatch = close.exec(remainder);
  if (!closeMatch) return { markup: '', start: -1, end: -1 };
  const end = open.index + open[0].length + closeMatch.index + closeMatch[0].length;
  return { markup: html.slice(open.index, end), start: open.index, end };
}

export function inspectHtml(html) {
  const stack = [];
  const tagHistogram = Object.create(null);
  const headings = [];
  const fragmentIds = [];
  const imageAlts = [];
  const stylesheets = [];
  const preloads = [];
  let totalElements = 0;
  let maxDepth = 0;
  let mainDirectChildren = 0;
  let mainStackDepth = null;
  let index = 0;

  while (index < html.length) {
    const open = html.indexOf('<', index);
    if (open < 0) break;

    if (html.startsWith('<!--', open)) {
      const close = html.indexOf('-->', open + 4);
      index = close < 0 ? html.length : close + 3;
      continue;
    }

    if (html.startsWith('<![CDATA[', open)) {
      const close = html.indexOf(']]>', open + 9);
      index = close < 0 ? html.length : close + 3;
      continue;
    }

    if (/^<!doctype\b/i.test(html.slice(open, open + 16)) || html.startsWith('<?', open) || html.startsWith('<!', open)) {
      const end = findTagEnd(html, open);
      index = end < 0 ? html.length : end + 1;
      continue;
    }

    const end = findTagEnd(html, open);
    if (end < 0) break;
    const token = html.slice(open, end + 1);

    if (/^<\//.test(token)) {
      const tagName = readTagName(token, 2);
      let popped;
      do {
        popped = stack.pop();
        if (popped === 'main') mainStackDepth = null;
      } while (popped && popped !== tagName);
      index = end + 1;
      continue;
    }

    const tagName = readTagName(token);
    if (!tagName) {
      index = end + 1;
      continue;
    }

    const parentIsMain = mainStackDepth !== null && stack.length === mainStackDepth + 1;
    if (parentIsMain) mainDirectChildren += 1;

    totalElements += 1;
    tagHistogram[tagName] = (tagHistogram[tagName] ?? 0) + 1;

    const id = extractAttribute(token, 'id');
    if (id) fragmentIds.push(id);

    if (/^h[1-6]$/.test(tagName)) {
      const closing = new RegExp(`</${tagName}\\s*>`, 'ig');
      closing.lastIndex = end + 1;
      const closeMatch = closing.exec(html);
      const inner = closeMatch ? html.slice(end + 1, closeMatch.index) : '';
      headings.push({ level: Number(tagName[1]), id, text: normalizeText(inner) });
    }

    if (tagName === 'img') imageAlts.push(extractAttribute(token, 'alt'));
    if (tagName === 'link') {
      const rel = extractAttribute(token, 'rel').toLowerCase().split(/\s+/).filter(Boolean);
      const href = extractAttribute(token, 'href');
      if (rel.includes('stylesheet')) stylesheets.push(href);
      if (rel.includes('preload')) {
        preloads.push({
          href,
          as: extractAttribute(token, 'as'),
          type: extractAttribute(token, 'type'),
          media: extractAttribute(token, 'media'),
          fetchpriority: extractAttribute(token, 'fetchpriority'),
        });
      }
    }

    const selfClosing = /\/\s*>$/.test(token) || VOID_ELEMENTS.has(tagName);
    if (!selfClosing) {
      stack.push(tagName);
      maxDepth = Math.max(maxDepth, stack.length);
      if (tagName === 'main') mainStackDepth = stack.length - 1;
    }

    if (!selfClosing && RAW_TEXT_ELEMENTS.has(tagName)) {
      const closePattern = new RegExp(`</${tagName}\\s*>`, 'ig');
      closePattern.lastIndex = end + 1;
      const closeMatch = closePattern.exec(html);
      if (closeMatch) {
        stack.pop();
        index = closePattern.lastIndex;
        continue;
      }
    }

    index = end + 1;
  }

  return {
    totalElements,
    maxDepth,
    mainDirectChildren,
    tagHistogram,
    headings,
    fragmentIds,
    imageAlts,
    stylesheets,
    preloads,
  };
}

function getInlineJsonLd(html) {
  const scripts = [];
  const pattern = /<script\b([^>]*)\btype\s*=\s*(["'])application\/ld\+json\2([^>]*)>([^]*?)<\/script\s*>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    scripts.push({
      markupBytes: byteLength(match[0]),
      payloadBytes: byteLength(match[4]),
      payloadSha256: sha256(match[4]),
    });
  }
  return scripts;
}

export function analyzeHtml(html, source = {}) {
  const inspected = inspectHtml(html);
  const head = extractRegion(html, 'head');
  const main = extractRegion(html, 'main');
  const jsonLdScripts = getInlineJsonLd(html);
  const rawBytes = byteLength(html);
  const gzipBytes = gzipSync(Buffer.from(html), { level: 9 }).byteLength;
  const brotliBytes = brotliCompressSync(Buffer.from(html), {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
      [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
    },
  }).byteLength;
  const normalizedMainText = normalizeText(main.markup);
  const identityCharacterOffset = html.indexOf(IDENTITY_TEXT_MARKER);
  const identityByteOffset = identityCharacterOffset < 0 ? -1 : byteLength(html.slice(0, identityCharacterOffset));

  return {
    schemaVersion: 1,
    generatedBy: 'doctor-ghezelbaash-performance-observatory',
    source,
    document: {
      path: 'dist/index.html',
      rawBytes,
      gzipBytes,
      brotliBytes,
      sha256: sha256(html),
      compressionRatios: {
        gzip: Number((gzipBytes / rawBytes).toFixed(6)),
        brotli: Number((brotliBytes / rawBytes).toFixed(6)),
      },
    },
    regions: {
      head: {
        rawBytes: byteLength(head.markup),
        shareOfDocument: rawBytes ? Number((byteLength(head.markup) / rawBytes).toFixed(6)) : 0,
      },
      main: {
        rawBytes: byteLength(main.markup),
        shareOfDocument: rawBytes ? Number((byteLength(main.markup) / rawBytes).toFixed(6)) : 0,
      },
      inlineJsonLd: {
        count: jsonLdScripts.length,
        markupBytes: jsonLdScripts.reduce((sum, item) => sum + item.markupBytes, 0),
        payloadBytes: jsonLdScripts.reduce((sum, item) => sum + item.payloadBytes, 0),
        payloadSha256: sha256(jsonLdScripts.map((item) => item.payloadSha256).join('\n')),
      },
    },
    dom: {
      totalElements: inspected.totalElements,
      maxDepth: inspected.maxDepth,
      mainDirectChildren: inspected.mainDirectChildren,
      headings: inspected.headings.length,
      fragmentIds: inspected.fragmentIds.length,
      images: inspected.tagHistogram.img ?? 0,
      links: inspected.tagHistogram.a ?? 0,
      tables: inspected.tagHistogram.table ?? 0,
      rows: inspected.tagHistogram.tr ?? 0,
      cells: (inspected.tagHistogram.td ?? 0) + (inspected.tagHistogram.th ?? 0),
      details: inspected.tagHistogram.details ?? 0,
      tagHistogram: Object.fromEntries(Object.entries(inspected.tagHistogram).sort(([a], [b]) => a.localeCompare(b))),
    },
    criticalPathInventory: {
      stylesheets: inspected.stylesheets,
      preloads: inspected.preloads,
      identityText: {
        marker: IDENTITY_TEXT_MARKER,
        found: identityCharacterOffset >= 0,
        byteOffset: identityByteOffset,
        shareOfDocument: identityByteOffset >= 0 && rawBytes ? Number((identityByteOffset / rawBytes).toFixed(6)) : null,
      },
    },
    fingerprints: {
      normalizedMainTextSha256: sha256(normalizedMainText),
      headingSequenceSha256: sha256(JSON.stringify(inspected.headings)),
      fragmentIdsSha256: sha256(JSON.stringify([...inspected.fragmentIds].sort())),
      imageAltSequenceSha256: sha256(JSON.stringify(inspected.imageAlts)),
    },
    budgets: {
      enforcement: 'observation-only',
      note: 'Phase 1 records an exact baseline and intentionally introduces no performance thresholds.',
    },
  };
}

export async function analyzeBuild({
  inputPath = path.join(process.cwd(), 'dist', 'index.html'),
  outputPath = process.env.PERFORMANCE_REPORT_PATH,
  source = {
    commit: process.env.GITHUB_SHA ?? process.env.CF_PAGES_COMMIT_SHA ?? null,
    branch: process.env.GITHUB_HEAD_REF ?? process.env.GITHUB_REF_NAME ?? process.env.CF_PAGES_BRANCH ?? null,
    environment: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : process.env.CF_PAGES === '1' ? 'cloudflare-pages' : 'local',
  },
} = {}) {
  const html = await readFile(inputPath, 'utf8');
  const report = analyzeHtml(html, source);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized);
  }

  return { report, serialized };
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  const { report, serialized } = await analyzeBuild();
  if (!process.env.PERFORMANCE_REPORT_PATH) process.stdout.write(serialized);
  else {
    console.log(
      `Performance baseline: ${report.document.rawBytes} raw bytes, ${report.document.brotliBytes} Brotli bytes, ` +
      `${report.dom.totalElements} elements, ${report.dom.mainDirectChildren} direct <main> children.`,
    );
  }
}
