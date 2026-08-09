import { readFile } from 'node:fs/promises';
import { parse } from 'parse5';

const html = await readFile(new URL('./dist/index.html', import.meta.url), 'utf8');
const doc = parse(html, { sourceCodeLocationInfo: true });

const children = (node) => node.childNodes || [];
const attrs = (node) => Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value]));
const text = (node) => {
  if (node.nodeName === '#text') return node.value || '';
  return children(node).map(text).join('').replace(/\s+/g, ' ').trim();
};
const all = [];
const walk = (node, parent = null, depth = 0) => {
  node.__parent = parent;
  node.__depth = depth;
  if (node.tagName) all.push(node);
  for (const child of children(node)) walk(child, node, depth + 1);
};
walk(doc);

const byId = new Map(all.map((node) => [attrs(node).id, node]).filter(([id]) => id));
const closest = (node, predicate) => {
  for (let current = node; current; current = current.__parent) if (predicate(current)) return current;
  return null;
};
const descendants = (node, predicate, out = []) => {
  for (const child of children(node)) {
    if (predicate(child)) out.push(child);
    descendants(child, predicate, out);
  }
  return out;
};

const toc = byId.get('aesthetic-medicine-table-of-contents');
const tocLinks = toc ? descendants(toc, (node) => node.tagName === 'a' && (attrs(node).href || '').startsWith('#')) : [];
const tocReport = tocLinks.map((link) => {
  const id = attrs(link).href.slice(1);
  const target = byId.get(id);
  const heading = target && (/^h[1-6]$/.test(target.tagName) ? target : descendants(target, (node) => /^h[1-6]$/.test(node.tagName))[0]);
  const chunk = target && closest(target, (node) => (attrs(node).class || '').split(/\s+/).includes('render-chunk'));
  return {
    link: text(link),
    href: attrs(link).href,
    targetTag: target?.tagName || null,
    targetText: target ? text(target).slice(0, 180) : null,
    firstHeadingId: heading ? attrs(heading).id || null : null,
    firstHeading: heading ? text(heading) : null,
    closestChunk: chunk ? attrs(chunk).id || null : null,
    targetByte: target?.sourceCodeLocation?.startOffset ?? null,
  };
});

const bestHeadings = all.filter((node) => /^h[1-6]$/.test(node.tagName) && /بهترین (?:دکتر|پزشک)/.test(text(node)));
const bestReport = bestHeadings.map((node) => {
  const chunk = closest(node, (x) => (attrs(x).class || '').split(/\s+/).includes('render-chunk'));
  const section = closest(node, (x) => x.tagName === 'section');
  const priorHeadings = all.filter((x) => /^h[1-6]$/.test(x.tagName) && (x.sourceCodeLocation?.startOffset ?? -1) < (node.sourceCodeLocation?.startOffset ?? -1));
  const priorFaq = [...priorHeadings].reverse().find((x) => /پرسش|سؤال|FAQ|faq/i.test(text(x)));
  const anchors = descendants(node, (x) => x.tagName === 'a');
  return {
    level: node.tagName,
    id: attrs(node).id || null,
    text: text(node),
    retrievalAlias: attrs(node)['data-retrieval-alias'] || null,
    linked: anchors.length > 0,
    href: anchors[0] ? attrs(anchors[0]).href || null : null,
    section: section ? attrs(section).id || null : null,
    chunk: chunk ? attrs(chunk).id || null : null,
    nearestPriorFaq: priorFaq ? { id: attrs(priorFaq).id || null, text: text(priorFaq) } : null,
  };
});

const tagCounts = Object.fromEntries([...new Set(all.map((node) => node.tagName))].sort().map((tag) => [tag, all.filter((node) => node.tagName === tag).length]));
const jsonLdScripts = all.filter((node) => node.tagName === 'script' && attrs(node).type === 'application/ld+json');
const jsonLd = jsonLdScripts.map((node) => {
  const raw = children(node).map((child) => child.value || '').join('');
  const parsed = JSON.parse(raw);
  const nodes = parsed['@graph'] || [];
  return {
    id: attrs(node).id || null,
    bytes: Buffer.byteLength(raw),
    nodes: nodes.length,
    types: Object.fromEntries([...new Set(nodes.flatMap((item) => [item['@type']].flat().filter(Boolean)))].sort().map((type) => [type, nodes.filter((item) => [item['@type']].flat().includes(type)).length])),
    datasets: nodes.filter((item) => [item['@type']].flat().includes('Dataset')).map((item) => item['@id']),
  };
});

const imgReport = all.filter((node) => node.tagName === 'img').map((node) => ({
  src: attrs(node).src,
  width: attrs(node).width || null,
  height: attrs(node).height || null,
  loading: attrs(node).loading || null,
  decoding: attrs(node).decoding || null,
  fetchpriority: attrs(node).fetchpriority || null,
  alt: attrs(node).alt ?? null,
}));
const videoReport = all.filter((node) => node.tagName === 'video').map((node) => ({
  id: attrs(node).id || null,
  width: attrs(node).width || null,
  height: attrs(node).height || null,
  preload: attrs(node).preload || null,
  poster: attrs(node).poster || null,
  tracks: descendants(node, (x) => x.tagName === 'track').map((x) => attrs(x)),
}));

const sectionTree = all.filter((node) => node.tagName === 'section').map((node) => {
  const parentSection = closest(node.__parent, (x) => x.tagName === 'section');
  const directHeading = children(node).find((x) => /^h[1-6]$/.test(x.tagName));
  return {
    id: attrs(node).id || null,
    parentSection: parentSection ? attrs(parentSection).id || null : null,
    directHeading: directHeading ? text(directHeading) : null,
    startByte: node.sourceCodeLocation?.startOffset ?? null,
    endByte: node.sourceCodeLocation?.endOffset ?? null,
  };
});

const idValues = all.map((node) => attrs(node).id).filter(Boolean);
const duplicateIds = [...new Set(idValues.filter((id, index) => idValues.indexOf(id) !== index))];
const fragmentLinks = all.filter((node) => node.tagName === 'a' && (attrs(node).href || '').startsWith('#'));
const missingFragments = [...new Set(fragmentLinks.map((node) => attrs(node).href.slice(1)).filter((id) => !byId.has(id)))];
const ariaRefs = all.flatMap((node) => ['aria-labelledby', 'aria-describedby', 'aria-controls'].flatMap((name) => (attrs(node)[name] || '').split(/\s+/).filter(Boolean).map((id) => ({ source: attrs(node).id || node.tagName, name, id }))));
const missingAriaRefs = ariaRefs.filter(({ id }) => !byId.has(id));

console.log(JSON.stringify({
  htmlBytes: Buffer.byteLength(html),
  elements: all.length,
  maxDepth: Math.max(...all.map((node) => node.__depth)),
  ids: byId.size,
  duplicateIds,
  missingFragments,
  missingAriaRefs,
  headings: all.filter((node) => /^h[1-6]$/.test(node.tagName)).length,
  tagCounts,
  tocReport,
  bestReport,
  jsonLd,
  sectionTree,
  images: imgReport,
  videos: videoReport,
}, null, 2));
