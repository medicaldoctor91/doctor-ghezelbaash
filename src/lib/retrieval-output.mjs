import { createHash } from 'node:crypto';

const values = value => Array.isArray(value) ? value : value == null ? [] : [value];
const ids = value => values(value).map(item => typeof item === 'string' ? item : item?.['@id']).filter(Boolean);
const unique = value => [...new Set(value)].sort();
const normalize = value => String(value).normalize('NFC').replace(/\r\n?/g, '\n').trim();
const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
const typed = (node, type) => values(node?.['@type']).includes(type);

function literal(value, language = '') {
  const list = values(value);
  const base = language.split('-')[0];
  const selected = list.find(item => item?.['@language'] === language)
    ?? (base ? list.find(item => item?.['@language']?.split('-')[0] === base) : undefined)
    ?? list.find(item => !item?.['@language']) ?? list[0];
  return selected == null ? '' : normalize(selected?.['@value'] ?? selected);
}

// Hash canonical content rather than object insertion order or build timestamps.
function stableContent(value) {
  if (typeof value === 'string') return normalize(value);
  if (Array.isArray(value)) return value.map(stableContent);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, stableContent(value[key])]));
  }
  return value;
}

function releaseMetadata(source) {
  const dataset = source.graph['@graph'].find(node => node['@id'] === source.canonicalOrigin + '/graph.jsonld/dataset');
  return { version: literal(dataset?.version), edition: literal(source.edition) };
}

function sourceLocation(source, question, answer, byId) {
  const routes = source.routes?.resources ?? [];
  const paths = new Set(routes.map(route => route.path));
  const canonicalUrl = raw => {
    if (typeof raw !== 'string') return null;
    try {
      const url = new URL(raw);
      return url.origin === source.canonicalOrigin && paths.has(url.pathname) && !url.username && !url.password ? url : null;
    } catch { return null; }
  };
  const exact = node => values(node?.url).map(item => canonicalUrl(typeof item === 'string' ? item : item?.['@id'])).find(Boolean);
  // Generic Home edges cannot override either node's explicit authored route.
  let location = exact(question) ?? exact(answer);
  if (!location) {
    const references = unique([question, answer].flatMap(node => [...ids(node.mainEntityOfPage), ...ids(node.isPartOf)]));
    const pages = references.map(id => {
      const authored = exact(byId.get(id));
      if (authored) return authored;
      const reference = canonicalUrl(id);
      // A page entity IRI's fragment (for example #webpage) is not an HTML target.
      if (reference) reference.hash = '';
      return reference;
    }).filter(Boolean);
    location = pages.find(url => url.pathname !== '/') ?? pages[0];
  }
  if (!location) location = canonicalUrl(source.canonicalOrigin + '/');
  if (!location) throw new Error(`No canonical source route for Question ${question['@id']}`);
  const sourceUrl = location.origin + location.pathname + location.search;
  const route = routes.find(entry => entry.path === location.pathname);
  // Only authored fragments and registered route content targets are HTML anchors.
  const htmlId = location.hash ? location.hash.slice(1) : route?.htmlId ?? '';
  const htmlUrl = htmlId ? `${sourceUrl}#${htmlId}` : sourceUrl;
  const page = byId.get(location.origin + location.pathname + '#webpage')
    ?? source.graph['@graph'].find(node => values(node['@type']).some(type => ['WebPage', 'MedicalWebPage', 'ProfilePage', 'FAQPage'].includes(type)) && exact(node)?.pathname === location.pathname);
  return { sourceUrl, htmlId, htmlUrl, page };
}

/** Project only explicit evidence edges; this classification does not assert verification. */
function evidenceReferences(question, answer, aboutIds, byId) {
  const nodes = [question, answer];
  const claimNodes = unique([...aboutIds, ...nodes.flatMap(node => ids(node.citation))]).map(id => byId.get(id)).filter(node => typed(node, 'Claim'));
  const claimEvidenceIds = unique([...nodes, ...claimNodes].flatMap(node => ids(node.claimEvidence)));
  const entityEvidenceIds = unique([...nodes, ...aboutIds.map(id => byId.get(id)).filter(node => node && !typed(node, 'Claim'))].flatMap(node => ids(node.entityEvidence)));
  const evidenceIds = unique([
    ...nodes.flatMap(node => [...ids(node.citation).filter(id => !typed(byId.get(id), 'Claim')), ...ids(node.isBasedOn), ...ids(node['prov:wasDerivedFrom'])]),
    ...claimNodes.flatMap(node => [...ids(node.isBasedOn), ...ids(node['prov:wasDerivedFrom'])]),
    ...claimEvidenceIds, ...entityEvidenceIds,
  ]);
  return { evidenceIds, claimEvidenceIds, entityEvidenceIds };
}

export function buildRetrievalRecords(source) {
  const nodes = source.graph['@graph'];
  const byId = new Map(nodes.map(node => [node['@id'], node]));
  const release = releaseMetadata(source);
  const records = [];
  for (const question of nodes.filter(node => typed(node, 'Question') && node.acceptedAnswer)) {
    for (const accepted of values(question.acceptedAnswer)) {
      const answerId = typeof accepted === 'string' ? accepted : accepted?.['@id'];
      const answer = byId.get(answerId) ?? (accepted?.text != null ? accepted : undefined);
      if (!answer || !answerId) throw new Error(`Missing canonical accepted Answer for ${question['@id']}`);
      const { sourceUrl, htmlId, htmlUrl, page } = sourceLocation(source, question, answer, byId);
      const language = literal(question.inLanguage ?? answer.inLanguage ?? page?.inLanguage)
        || values(question.name).find(item => item?.['@language'])?.['@language'] || '';
      const questionText = literal(question.name, language);
      const answerText = literal(answer.text, language);
      const aboutIds = unique([...ids(question.about), ...ids(answer.about)]);
      const { evidenceIds, claimEvidenceIds, entityEvidenceIds } = evidenceReferences(question, answer, aboutIds, byId);
      const reviewNodes = [answer, question, page].filter(Boolean);
      const reviewer = reviewNodes.find(node => ids(node.reviewedBy).length);
      const reviewDate = reviewNodes.find(node => node.reviewedAt != null || node.lastReviewed != null);
      records.push({
        questionId: question['@id'], answerId,
        question: questionText, answer: answerText, language,
        sourceUrl, htmlId, htmlUrl,
        passageId: `${source.canonicalOrigin}/provenance.jsonld/passage-${sha256(question['@id'] + '\u0000' + answerId)}`,
        aboutIds,
        graphNodeIds: unique([question['@id'], answerId, ...aboutIds, ...evidenceIds, ...ids(question.citation), ...ids(answer.citation), ...(page?.['@id'] ? [page['@id']] : [])]),
        evidenceIds, claimEvidenceIds, entityEvidenceIds,
        provenanceClass: 'first-party-canonical',
        reviewedBy: unique(ids(reviewer?.reviewedBy)),
        reviewedAt: literal(reviewDate?.reviewedAt ?? reviewDate?.lastReviewed),
        release,
        // sourceHash binds canonical Q&A content and location; it is not an HTML byte hash.
        sourceHashSha256: sha256(JSON.stringify(stableContent({ question, answer, sourceUrl, htmlUrl }))),
        answerHashSha256: sha256(answerText),
        passageHashSha256: sha256(JSON.stringify({ question: questionText, answer: answerText, language, htmlUrl })),
      });
    }
  }
  return records.sort((a, b) => a.questionId < b.questionId ? -1 : a.questionId > b.questionId ? 1 : a.answerId < b.answerId ? -1 : a.answerId > b.answerId ? 1 : 0);
}

const textFields = [
  ['questionId', 'Question ID'], ['answerId', 'Answer ID'], ['question', 'Question'], ['answer', 'Answer'],
  ['language', 'Language'], ['sourceUrl', 'Source'], ['htmlId', 'HTML ID'], ['htmlUrl', 'HTML URL'], ['passageId', 'Passage ID'],
  ['aboutIds', 'About IDs'], ['graphNodeIds', 'Graph Node IDs'], ['evidenceIds', 'Evidence IDs'],
  ['claimEvidenceIds', 'Claim Evidence IDs'], ['entityEvidenceIds', 'Entity Evidence IDs'], ['provenanceClass', 'Provenance Class'],
  ['reviewedBy', 'Reviewed By'], ['reviewedAt', 'Reviewed At'], ['release', 'Release'],
  ['sourceHashSha256', 'Source Hash SHA-256'], ['answerHashSha256', 'Answer Hash SHA-256'], ['passageHashSha256', 'Passage Hash SHA-256'],
];

export function serializeAnswersText(records) {
  return records.map(record => textFields.map(([field, label]) => `${label}: ${JSON.stringify(record[field])}`).join('\n')).join('\n\n---\n\n') + '\n';
}

export function buildAnswersText(source) {
  return serializeAnswersText(buildRetrievalRecords(source));
}

export function buildFactMap(source, records = buildRetrievalRecords(source)) {
  return {
    schemaVersion: 2,
    canonicalOrigin: source.canonicalOrigin,
    canonicalEntity: source.canonicalOrigin + '/#saeed-ghezelbash',
    sourceOfTruth: source.canonicalOrigin + '/graph.jsonld',
    release: releaseMetadata(source),
    records,
  };
}
