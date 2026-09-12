import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse, parseFragment } from 'parse5';
import ts from 'typescript';

export const CONTRACT_PATH = 'src/data/visible-text-contract.json';
export const normalizeText = (value) => String(value).normalize('NFC').replace(/\s+/gu, ' ').trim();
export const digest = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const BLOCKS = new Set('address article aside blockquote br caption dd details dialog div dl dt figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre search section summary table tbody td tfoot th thead tr ul'.split(' '));
const OMIT = new Set(['script', 'style', 'template']);
const PROTECTED = new Set(['alt', 'aria-label', 'aria-description', 'aria-valuetext', 'title', 'placeholder', 'label']);
const RELATIONS = new Set(['aria-labelledby', 'aria-describedby']);
const attrs = (node) => Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value]));
const children = (node) => node.childNodes || [];

// Raw text is concatenated through inline wrappers; block boundaries are spaces.
// The separate strict per-node hash additionally preserves text-node boundaries;
// wrapping an entire node and changing heading levels remain possible.
export function readingText(node) {
  if (OMIT.has(node.tagName)) return '';
  if (node.nodeName === '#text') return node.value.normalize('NFC');
  const content = children(node).map(readingText).join('');
  return BLOCKS.has(node.tagName) ? ` ${content} ` : content;
}

export function htmlContract(html, { fragment = false } = {}) {
  // scriptingEnabled=false parses body <noscript> as its actual fallback DOM.
  const tree = (fragment ? parseFragment : parse)(html, { scriptingEnabled: false });
  const ids = new Map();
  const walk = (node, visit) => { visit(node); for (const child of children(node)) walk(child, visit); };
  walk(tree, (node) => { const id = attrs(node).id; if (id) ids.set(id, node); });
  const textNodes = [], attributes = [];
  const inspect = (node) => {
    if (OMIT.has(node.tagName)) return;
    if (node.nodeName === '#text') {
      const text = normalizeText(node.value);
      if (text) textNodes.push(text);
    }
    const attributesByName = attrs(node);
    for (const [name, value] of Object.entries(attributesByName)) {
      if (PROTECTED.has(name) || (name === 'value' && ['button', 'input', 'option'].includes(node.tagName) && attributesByName.type !== 'hidden')) {
        attributes.push([name, normalizeText(value)]);
      } else if (RELATIONS.has(name)) {
        // IDs may change; the text the relation names/describes may not.
        const text = value.trim().split(/\s+/u).map((id) => {
          if (!ids.has(id)) throw new Error(`Unresolved ${name}: ${id}`);
          return readingText(ids.get(id));
        }).join(' ');
        attributes.push([name, normalizeText(text)]);
      }
    }
    if (node.tagName === 'meta') {
      const name = attributesByName.name || attributesByName.property || '';
      if (name === 'description' || name === 'author' || name === 'application-name' || name === 'apple-mobile-web-app-title' || name.startsWith('og:') || name.startsWith('twitter:')) {
        attributes.push([`meta:${name}`, normalizeText(attributesByName.content || '')]);
      }
    }
    for (const child of children(node)) inspect(child);
  };
  inspect(tree);
  return {
    text: normalizeText(readingText(tree)),
    attributes,
    // Enforced independently: splitting or merging nodes is not permitted.
    textNodeCount: textNodes.length,
    textNodeSequenceSha256: digest(textNodes),
  };
}

export const protectedProjection = ({ text, attributes, textNodeCount, textNodeSequenceSha256 }) => ({ textSha256: digest(text), attributesSha256: digest(attributes), textNodeCount, textNodeSequenceSha256 });
export function assertUnchanged(expected, actual, label) {
  if (digest(expected) !== digest(actual)) {
    throw new Error(`CLOSED_VISIBLE_TEXT: ${label} changed; preserve the approved baseline (do not regenerate it to pass).`);
  }
}

async function filesBelow(directory) {
  const output = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(file));
    else output.push(file);
  }
  return output;
}

export function runtimeTextLiterals(source) {
  const output = [];
  for (const script of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gu)) {
    const tree = ts.createSourceFile('runtime.js', script[1], ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const collect = (node) => {
      if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) output.push(normalizeText(node.text));
      ts.forEachChild(node, collect);
    };
    const visit = (node) => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left) && ['textContent', 'innerText', 'innerHTML'].includes(node.left.name.text)) collect(node.right);
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  return output;
}

export async function sourceContract(root) {
  const page = await readFile(path.join(root, 'src/content-source/page.md'), 'utf8');
  const match = page.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u);
  if (!match) throw new Error('Visible source frontmatter missing');
  const frontmatter = Object.fromEntries(['title', 'description'].map((key) => {
    const field = match[1].match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    if (!field) throw new Error(`Visible source ${key} missing`);
    return [key, normalizeText(JSON.parse(field[1]))];
  }));
  const graph = JSON.parse(await readFile(path.join(root, 'src/data/semantic/knowledge-graph.jsonld'), 'utf8'));
  const answers = graph['@graph'].filter((node) => [node['@type']].flat().includes('Answer')).map((node) => [node['@id'], node.text]).sort(([a], [b]) => a.localeCompare(b, 'en'));
  const runtime = runtimeTextLiterals(await readFile(path.join(root, 'src/components/GuideNavigator.astro'), 'utf8'));
  const captions = {};
  for (const file of (await filesBelow(path.join(root, 'public/media/video-tracks'))).filter((file) => file.endsWith('.vtt'))) {
    // Timing and cue IDs are structural; cue payload and order are frozen.
    const vtt = await readFile(file, 'utf8');
    captions[path.relative(root, file)] = vtt.split(/\r?\n\s*\r?\n/u).filter((block) => block.includes('-->')).map((block) => normalizeText(block.split(/\r?\n/u).slice(block.split(/\r?\n/u).findIndex((line) => line.includes('-->')) + 1).join(' ')));
  }
  return { page: { ...frontmatter, ...protectedProjection(htmlContract(match[2], { fragment: true })) }, documentHead: JSON.parse(await readFile(path.join(root, 'src/data/document-head.json'), 'utf8')), answers, runtime, captions };
}

export async function sourceRawHashes(root) {
  const files = ['src/content-source/page.md', 'src/data/document-head.json', 'src/data/media-metadata.json', 'src/data/release.json', 'src/data/reputation-observation.json', 'src/data/semantic/knowledge-graph.jsonld', 'src/components/GuideNavigator.astro', 'src/components/SiteFooter.astro', 'src/components/FloatingActionDock.astro', 'src/components/DocumentHead.astro', 'src/layouts/BaseLayout.astro', 'src/pages/404.astro'];
  return Object.fromEntries(await Promise.all(files.map(async (file) => [file, digest(await readFile(path.join(root, file), 'utf8'))])));
}

export async function distContract(directory) {
  const output = {};
  for (const name of ['index.html', '404.html']) {
    const html = await readFile(path.join(directory, name), 'utf8');
    output[name] = { rawSha256: digest(html), bytes: Buffer.byteLength(html), ...htmlContract(html) };
  }
  return output;
}
