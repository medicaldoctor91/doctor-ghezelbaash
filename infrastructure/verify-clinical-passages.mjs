import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from 'parse5';
import {SOURCE} from '../src/canonical/source.mjs';

const dist = path.resolve(process.argv[2] ?? 'dist'), origin = SOURCE.canonicalOrigin;
const normalize = value => String(value).normalize('NFC').replace(/\s+/gu, ' ').trim();
const hash = value => createHash('sha256').update(value).digest('hex');
const documents = new Map();
for (const route of SOURCE.routes.resources) {
  const html = await fs.readFile(path.join(dist, route.path === '/' ? 'index.html' : route.path.slice(1) + '.html'), 'utf8');
  const ids = new Set(), chunks = [];
  function visit(node) {
    if (['head', 'script', 'style', 'template', 'button'].includes(node.tagName)) return;
    const id = node.attrs?.find(item => item.name === 'id')?.value;
    if (id) ids.add(id);
    if (node.nodeName === '#text') chunks.push(node.value);
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(parse(html));
  documents.set(origin + route.path, {ids, text: normalize(chunks.join(''))});
}
const graphIds = new Set(SOURCE.graph['@graph'].map(node => node['@id']));
const passages = (await fs.readFile(path.join(dist, 'clinical-passages.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
const ids = new Set(), routes = new Set(), languages = new Set();
for (const record of passages) {
  const doc = documents.get(record.sourceUrl);
  assert(doc, 'Passage names a published route: ' + record.sourceUrl);
  assert(doc.ids.has(record.htmlId), 'Citation anchor exists in the actual distribution: ' + record.htmlUrl);
  assert(doc.text.includes(record.text), 'Cited text occurs in its actual source document: ' + record.htmlUrl);
  assert.equal(record.htmlUrl, record.sourceUrl + '#' + record.htmlId);
  assert(record.headingPath.length, 'A clinical passage retains its heading context');
  assert.equal(record.sourceHashSha256, hash(JSON.stringify({htmlUrl: record.htmlUrl, language: record.language, headingPath: record.headingPath, text: record.text})));
  assert.equal(record.textHashSha256, hash(record.text));
  assert.equal(record.passageId, origin + '/clinical-passages.jsonl#passage-' + record.sourceHashSha256);
  assert(!ids.has(record.passageId), 'No duplicate passage identity');
  for (const id of [...record.entityIds, ...record.evidenceIds]) assert(graphIds.has(id), 'Passage identity/evidence is defined: ' + id);
  assert(record.entityIds.includes(origin + '/#saeed-ghezelbash'));
  ids.add(record.passageId); routes.add(record.sourceUrl); languages.add(record.language);
}
assert(passages.length > 0);
console.log(JSON.stringify({clinicalPassages: 'PASS', passages: passages.length, citedRoutes: routes.size, languages: [...languages].sort(), evidenceLinkedPassages: passages.filter(record => record.evidenceIds.length).length}, null, 2));
