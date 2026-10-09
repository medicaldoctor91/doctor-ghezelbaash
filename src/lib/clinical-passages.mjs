import {parseFragment} from 'parse5';
import {createHash} from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const normalize = value => String(value).normalize('NFC').replace(/\s+/gu, ' ').trim();
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const values = value => Array.isArray(value) ? value : value == null ? [] : [value];
const refs = value => values(value).map(item => item?.['@id']).filter(Boolean);
const text = node => ['script', 'style', 'template', 'button'].includes(node.tagName) ? ''
  : node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');

/** Citation-sized passages from the published authored corpus, with explicit evidence only. */
export function buildClinicalPassages(source, authoredBody) {
  const origin = source.canonicalOrigin, physician = origin + '/#saeed-ghezelbash';
  const byId = new Map(source.graph['@graph'].map(node => [node['@id'], node]));
  const urls = new Map();
  for (const node of source.graph['@graph']) {
    for (const url of values(node.url)) if (typeof url === 'string') {
      if (!urls.has(url)) urls.set(url, []);
      urls.get(url).push(node['@id']);
    }
  }
  const headingPath = [], result = [], seen = new Set();
  let current = {path: '/', htmlId: 'saeed-ghezelbash'};
  const owned = node => {
    for (let n = node; n; n = n.parentNode) {
      const id = attr(n, 'id'), target = source.routes.htmlIdTargets[id];
      if (target && target !== '/') return {path: new URL(target, origin).pathname, htmlId: id};
    }
    return undefined;
  };
  const language = (node, page) => {
    for (let n = node; n; n = n.parentNode) if (attr(n, 'lang')) return attr(n, 'lang');
    return values(page?.inLanguage)[0] ?? 'fa-IR';
  };
  function walk(node) {
    if (['script', 'style', 'template', 'nav', 'button'].includes(node.tagName)) return;
    if (['section', 'details', 'header'].includes(node.tagName)) current = owned(node) ?? current;
    const heading = /^h([1-6])$/.exec(node.tagName ?? '');
    if (heading) {
      const level = Number(heading[1]);
      headingPath.length = level;
      headingPath[level - 1] = normalize(text(node));
      current = owned(node) ?? current;
    }
    const block = ['p', 'li', 'figcaption', 'blockquote'].includes(node.tagName);
    const nestedBlock = block && (node.childNodes ?? []).some(child => ['p', 'li', 'ul', 'ol', 'blockquote'].includes(child.tagName));
    if (block && !nestedBlock && !attr(node, 'data-medical-trust')) {
      const content = normalize(text(node));
      if (content.length >= 40) {
        const nearest = owned(node);
        const location = attr(node, 'id') && nearest?.path === current.path ? nearest : current;
        const sourceUrl = origin + location.path;
        const htmlUrl = sourceUrl + '#' + location.htmlId;
        const pageId = location.path === '/' ? origin + '/webpage' : sourceUrl + '#webpage';
        const page = byId.get(pageId), entities = new Set([physician, pageId, ...refs(page?.about)]);
        const evidence = new Set(), linkedUrls = new Set();
        const links = n => {
          const href = attr(n, 'href');
          if (href) {
            const url = new URL(href, sourceUrl).href;
            if (/^https?:/.test(url)) linkedUrls.add(url);
            for (const id of urls.get(url) ?? []) {
              const definition = byId.get(id);
              if (values(definition?.['@type']).some(type => type === origin + '/ontology/EvidenceSource')) evidence.add(id);
              else entities.add(id);
            }
            if (byId.has(url)) {
              entities.add(url);
              if (new URL(url).origin !== origin && values(byId.get(url)['@type']).some(type => ['WebPage', 'CreativeWork', 'Article', 'ScholarlyArticle'].includes(type))) evidence.add(url);
            }
          }
          for (const child of n.childNodes ?? []) links(child);
        };
        links(node);
        const lang = language(node, page), headings = headingPath.filter(Boolean);
        const signature = JSON.stringify({htmlUrl, language: lang, headingPath: headings, text: content});
        const contentHash = hash(signature);
        if (!seen.has(contentHash)) {
          seen.add(contentHash);
          result.push({passageId: origin + '/clinical-passages.jsonl#passage-' + contentHash,
            sourceUrl, htmlUrl, htmlId: location.htmlId, language: lang, headingPath: headings, text: content,
            entityIds: [...entities].sort(), evidenceIds: [...evidence].sort(), citedUrls: [...linkedUrls].sort(),
            provenanceClass: 'first-party-authored', evidenceBasis: 'explicit-links-in-passage', sourceHashScope: 'normalized-passage-with-location-language-and-headings',
            sourceHashSha256: contentHash, textHashSha256: hash(content),
            reviewedBy: refs(page?.reviewedBy), lastReviewed: page?.lastReviewed?.['@value'] ?? page?.lastReviewed ?? null,
            datasetId: origin + '/graph.jsonld/dataset',
            version: byId.get(origin + '/graph.jsonld/dataset')?.version ?? null, edition: source.edition});
        }
      }
    }
    for (const child of node.childNodes ?? []) walk(child);
  }
  walk(parseFragment(authoredBody));
  return result;
}
