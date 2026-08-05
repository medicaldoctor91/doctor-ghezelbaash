import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import { parse } from 'parse5';

const IDENTITY_TEXT_MARKER = 'دکتر سعید قزلباش';
const IDENTITY_TEXT_PATTERN = /دکتر\s+(?:محمد\s*)?سعید\s+قزلباش/u;
const IDENTITY_LEAD_PATTERN = /دکتر\s+(?:محمد\s*)?سعید/u;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function attribute(node, name) {
  return node.attrs?.find((item) => item.name.toLowerCase() === name)?.value ?? '';
}

function isElement(node) {
  return typeof node?.tagName === 'string';
}

function normalizedText(node) {
  const values = [];

  function collect(current) {
    if (current.nodeName === '#text') {
      values.push(current.value);
      return;
    }
    if (current.tagName === 'script' || current.tagName === 'style') return;
    for (const child of current.childNodes ?? []) collect(child);
  }

  collect(node);
  return values.join(' ').replace(/\s+/g, ' ').trim();
}

function sourceMarkup(html, node) {
  const location = node?.sourceCodeLocation;
  if (!location || !Number.isInteger(location.startOffset) || !Number.isInteger(location.endOffset)) return '';
  return html.slice(location.startOffset, location.endOffset);
}

function scriptPayload(html, node) {
  const location = node?.sourceCodeLocation;
  const start = location?.startTag?.endOffset;
  const end = location?.endTag?.startOffset;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return '';
  return html.slice(start, end);
}

export function inspectHtml(html) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const tagCounts = new Map();
  const headings = [];
  const fragmentIds = [];
  const imageAlts = [];
  const jsonLdScripts = [];
  const stylesheets = [];
  const preloads = [];
  let totalElements = 0;
  let maxDepth = 0;
  let head = null;
  let main = null;

  function walk(node, depth = 0) {
    const elementDepth = isElement(node) ? depth + 1 : depth;

    if (isElement(node)) {
      totalElements += 1;
      maxDepth = Math.max(maxDepth, elementDepth);
      tagCounts.set(node.tagName, (tagCounts.get(node.tagName) ?? 0) + 1);

      if (node.tagName === 'head' && !head) head = node;
      if (node.tagName === 'main' && !main) main = node;

      const id = attribute(node, 'id');
      if (id) fragmentIds.push(id);

      if (/^h[1-6]$/.test(node.tagName)) {
        headings.push({
          level: Number(node.tagName[1]),
          id,
          text: normalizedText(node),
        });
      }

      if (node.tagName === 'img') imageAlts.push(attribute(node, 'alt'));

      if (node.tagName === 'link') {
        const rel = attribute(node, 'rel').toLowerCase().split(/\s+/).filter(Boolean);
        const href = attribute(node, 'href');
        if (rel.includes('stylesheet')) stylesheets.push(href);
        if (rel.includes('preload')) {
          preloads.push({
            href,
            as: attribute(node, 'as'),
            type: attribute(node, 'type'),
            media: attribute(node, 'media'),
            fetchpriority: attribute(node, 'fetchpriority'),
          });
        }
      }

      if (node.tagName === 'script' && attribute(node, 'type').toLowerCase() === 'application/ld+json') {
        const markup = sourceMarkup(html, node);
        const payload = scriptPayload(html, node);
        jsonLdScripts.push({ markup, payload });
      }
    }

    for (const child of node.childNodes ?? []) walk(child, elementDepth);
  }

  walk(document);

  const count = (tagName) => tagCounts.get(tagName) ?? 0;
  const mainDirectChildren = main?.childNodes?.filter(isElement).length ?? 0;
  const tagHistogram = Object.fromEntries(
    [...tagCounts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );

  return {
    document,
    head,
    main,
    jsonLdScripts,
    totalElements,
    maxDepth,
    mainDirectChildren,
    headings,
    fragmentIds,
    imageAlts,
    stylesheets,
    preloads,
    tagHistogram,
    counts: {
      images: count('img'),
      links: count('a'),
      tables: count('table'),
      rows: count('tr'),
      cells: count('td') + count('th'),
      details: count('details'),
    },
  };
}

export function analyzeHtml(html, source = {}) {
  const inspected = inspectHtml(html);
  const headMarkup = sourceMarkup(html, inspected.head);
  const mainMarkup = sourceMarkup(html, inspected.main);
  const normalizedMainText = normalizedText(inspected.main ?? { childNodes: [] });
  const identityMatch = IDENTITY_TEXT_PATTERN.exec(normalizedMainText);
  const normalizedIdentityCharacterOffset = identityMatch?.index ?? -1;
  const rawIdentityCharacterOffset = identityMatch ? html.search(IDENTITY_LEAD_PATTERN) : -1;
  const rawIdentityByteOffset = rawIdentityCharacterOffset < 0
    ? null
    : byteLength(html.slice(0, rawIdentityCharacterOffset));
  const rawBytes = byteLength(html);
  const gzipBytes = gzipSync(Buffer.from(html), { level: 9 }).byteLength;
  const brotliBytes = brotliCompressSync(Buffer.from(html), {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
      [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
    },
  }).byteLength;
  const jsonLdMarkup = inspected.jsonLdScripts.map(({ markup }) => markup).join('\n');
  const jsonLdPayload = inspected.jsonLdScripts.map(({ payload }) => payload).join('\n');
  const headBytes = byteLength(headMarkup);
  const mainBytes = byteLength(mainMarkup);

  return {
    schemaVersion: 2,
    generatedBy: 'doctor-ghezelbaash-performance-observatory',
    source,
    document: {
      path: 'dist/index.html',
      rawBytes,
      gzipBytes,
      brotliBytes,
      sha256: sha256(html),
      compressionRatios: {
        gzip: rawBytes ? Number((gzipBytes / rawBytes).toFixed(6)) : 0,
        brotli: rawBytes ? Number((brotliBytes / rawBytes).toFixed(6)) : 0,
      },
    },
    regions: {
      head: {
        rawBytes: headBytes,
        shareOfDocument: rawBytes ? Number((headBytes / rawBytes).toFixed(6)) : 0,
      },
      main: {
        rawBytes: mainBytes,
        shareOfDocument: rawBytes ? Number((mainBytes / rawBytes).toFixed(6)) : 0,
      },
      inlineJsonLd: {
        count: inspected.jsonLdScripts.length,
        markupBytes: byteLength(jsonLdMarkup),
        payloadBytes: byteLength(jsonLdPayload),
        payloadSha256: sha256(jsonLdPayload),
      },
    },
    dom: {
      totalElements: inspected.totalElements,
      maxDepth: inspected.maxDepth,
      mainDirectChildren: inspected.mainDirectChildren,
      headings: inspected.headings.length,
      fragmentIds: inspected.fragmentIds.length,
      ...inspected.counts,
      tagHistogram: inspected.tagHistogram,
    },
    criticalPathInventory: {
      stylesheets: inspected.stylesheets,
      preloads: inspected.preloads,
      identityText: {
        marker: IDENTITY_TEXT_MARKER,
        matchedText: identityMatch?.[0] ?? null,
        found: normalizedIdentityCharacterOffset >= 0,
        normalizedTextCharacterOffset: normalizedIdentityCharacterOffset,
        rawByteOffset: rawIdentityByteOffset,
        shareOfNormalizedMainText: normalizedIdentityCharacterOffset >= 0 && normalizedMainText.length
          ? Number((normalizedIdentityCharacterOffset / normalizedMainText.length).toFixed(6))
          : null,
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
      note: 'The authoritative baseline is recorded before performance budgets are enforced.',
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
