import { readFile } from 'node:fs/promises';
import { parse } from 'parse5';

const html = await readFile(new URL('./dist/index.html', import.meta.url), 'utf8');
const doc = parse(html);
const children = (node) => node.childNodes || [];
const attrs = (node) => Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value]));
const text = (node) => node.nodeName === '#text'
  ? node.value || ''
  : children(node).map(text).join(' ');
const normalize = (value) => value
  .replace(/[\u200c\u200d\u200e\u200f\u202a-\u202e]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const all = [];
const walk = (node) => {
  if (node.tagName) all.push(node);
  for (const child of children(node)) walk(child);
};
walk(doc);

const paragraphs = all.filter((node) => node.tagName === 'p').map((node) => ({
  id: attrs(node).id || null,
  cls: attrs(node).class || null,
  value: normalize(text(node)),
})).filter(({ value }) => value.split(' ').length >= 12);
const groups = new Map();
for (const p of paragraphs) groups.set(p.value, [...(groups.get(p.value) || []), p]);
const duplicated = [...groups.entries()]
  .filter(([, instances]) => instances.length > 1)
  .sort((a, b) => (b[1].length * b[0].length) - (a[1].length * a[0].length));

const headings = all.filter((node) => /^h[1-6]$/.test(node.tagName)).map((node) => ({
  level: node.tagName,
  id: attrs(node).id || null,
  value: normalize(text(node)),
}));
const headingGroups = new Map();
for (const h of headings) headingGroups.set(h.value, [...(headingGroups.get(h.value) || []), h]);
const duplicateHeadings = [...headingGroups.entries()].filter(([, instances]) => instances.length > 1);

console.log(JSON.stringify({
  paragraphs: paragraphs.length,
  exactDuplicateParagraphGroups: duplicated.length,
  exactDuplicateParagraphInstances: duplicated.reduce((n, [, instances]) => n + instances.length, 0),
  duplicatedCharacters: duplicated.reduce((n, [value, instances]) => n + value.length * (instances.length - 1), 0),
  topDuplicateParagraphs: duplicated.slice(0, 40).map(([value, instances]) => ({ count: instances.length, value, instances })),
  duplicateHeadingGroups: duplicateHeadings.map(([value, instances]) => ({ value, instances })),
}, null, 2));
