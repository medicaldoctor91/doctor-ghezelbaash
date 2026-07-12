import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(process.cwd(), 'dist');
const site = 'https://www.ghezelbaash.ir/';
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const files = [];
const walk = (dir) => { for (const name of readdirSync(dir)) { const path = join(dir, name); statSync(path).isDirectory() ? walk(path) : files.push(path); } };
walk(root);
const htmlPath = join(root, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const htmlBytes = Buffer.byteLength(html);
const bodyStart = Buffer.byteLength(html.slice(0, html.indexOf('<body')));
check(htmlBytes < 1_800_000, `index.html exceeds 1.8MB: ${htmlBytes}`);
check(bodyStart < 100_000, `<body> starts after 100KB: ${bodyStart}`);
check(html.includes('</html>') && html.indexOf('</html>') < 2_000_000, 'closing HTML is not within first 2MB');
check(/<h1\b/.test(html), 'H1 missing');
const instagramUrl = 'https://www.instagram.com/doctor.ghezelbaash/';
const relMeHead = [...html.matchAll(/<link\b[^>]*>/gi)]
  .filter((match) => /\brel="[^"]*\bme\b[^"]*"/i.test(match[0]) && match[0].includes(`href="${instagramUrl}"`));
check(relMeHead.length === 1, `expected one Instagram rel=me link in head, found ${relMeHead.length}`);
const instagramAnchors = [...html.matchAll(/<a\b[^>]*>/gi)]
  .filter((match) => match[0].includes(`href="${instagramUrl}"`));
check(instagramAnchors.length > 0, 'no visible Instagram links found');
check(instagramAnchors.every((match) => /\brel="[^"]*\bme\b[^"]*"/i.test(match[0])), 'an Instagram anchor is missing rel=me');
check((html.match(/aria-label="فهرست واحد محتوای صفحه"/g) ?? []).length === 1, 'semantic TOC must appear exactly once');
const answerHubStart = html.indexOf('data-section-id="best-aesthetic-doctor-kermanshah-answers"');
const authorityStart = html.indexOf('id="entity-authority-panel"');
check(answerHubStart > html.indexOf('<main'), 'answer-first query hub missing from homepage');
check(answerHubStart < authorityStart, 'answer-first query hub must precede authority/navigation panels');
const answerHubEnd = html.indexOf('</section>', answerHubStart);
const answerHubHtml = answerHubStart >= 0 && answerHubEnd > answerHubStart ? html.slice(answerHubStart, answerHubEnd) : '';
check((answerHubHtml.match(/data-question="true"/g) ?? []).length === 10, 'answer-first query hub must contain 10 direct questions');
check((answerHubHtml.match(/data-answer-role="question-answer"/g) ?? []).length === 10, 'answer-first query hub must contain 10 direct answers');
check((html.match(/\bdata-nosnippet\b/g) ?? []).length === 0, 'v7.1 snippet restrictions must be fully removed');
for (const id of [
  'best-aesthetic-doctor-kermanshah',
  'best-botox-doctor-kermanshah',
  'best-filler-doctor-kermanshah',
  'best-lip-filler-doctor-kermanshah',
  'best-under-eye-filler-doctor-kermanshah',
  'best-thread-lift-doctor-kermanshah',
  'best-acne-scar-subcision-doctor-kermanshah',
  'best-skin-rejuvenation-doctor-kermanshah',
  'best-hair-loss-prp-doctor-kermanshah',
  'best-submental-liposuction-doctor-kermanshah',
]) check(html.includes(`id="${id}"`), `answer-first stable anchor missing: ${id}`);
const jsonLd = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
check(jsonLd.length === 1, `expected one inline JSON-LD block, found ${jsonLd.length}`);
if (jsonLd[0]) {
  try {
    const graph = JSON.parse(jsonLd[0][1]);
    const nodes = graph['@graph'] ?? [];
    const types = nodes.flatMap((node) => Array.isArray(node['@type']) ? node['@type'] : [node['@type']]);
    for (const banned of ['FAQPage', 'Dataset', 'DefinedTermSet', 'AggregateRating']) check(!types.includes(banned), `inline graph includes banned type ${banned}`);

    const profilePages = nodes.filter((node) => {
      const nodeTypes = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      return nodeTypes.includes('ProfilePage');
    });
    check(profilePages.length === 0, `homepage mega-landing must not claim ProfilePage; found ${profilePages.length}`);
    const medicalPages = nodes.filter((node) => {
      const nodeTypes = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      return nodeTypes.includes('MedicalWebPage');
    });
    check(medicalPages.length === 1, `expected exactly one inline MedicalWebPage, found ${medicalPages.length}`);
    if (medicalPages[0]) {
      const mainIds = (Array.isArray(medicalPages[0].mainEntity) ? medicalPages[0].mainEntity : [medicalPages[0].mainEntity]).map((item) => item?.['@id']);
      check(mainIds.includes('https://www.ghezelbaash.ir/#person'), 'MedicalWebPage mainEntity is missing canonical Person');
      check(mainIds.includes('https://www.ghezelbaash.ir/#clinic'), 'MedicalWebPage mainEntity is missing canonical Clinic');
      check(medicalPages[0].url === 'https://www.ghezelbaash.ir/', 'MedicalWebPage URL must be canonical');
      check(medicalPages[0].primaryImageOfPage?.['@id'] === 'https://www.ghezelbaash.ir/#image-doctor-portrait', 'MedicalWebPage primary image is missing');
      check(Boolean(medicalPages[0].dateCreated), 'MedicalWebPage dateCreated is missing');
      check(Boolean(medicalPages[0].dateModified), 'MedicalWebPage dateModified is missing');
    }

    const personNodes = nodes.filter((node) => node['@id'] === 'https://www.ghezelbaash.ir/#person');
    const clinicNodes = nodes.filter((node) => node['@id'] === 'https://www.ghezelbaash.ir/#clinic');
    check(personNodes.length === 1, 'Person ID is not unique');
    check(clinicNodes.length === 1, 'Clinic ID is not unique');
    if (personNodes[0]) {
      check((personNodes[0].sameAs ?? []).includes('https://www.instagram.com/doctor.ghezelbaash/'), 'Person sameAs is missing Instagram');
      check((personNodes[0].identifier ?? []).some((item) => item?.propertyID === 'Instagram' && item?.url === 'https://www.instagram.com/doctor.ghezelbaash/'), 'Person identifier is missing Instagram');
    }
    if (clinicNodes[0]) {
      check((clinicNodes[0].sameAs ?? []).includes('https://www.instagram.com/doctor.ghezelbaash/'), 'Clinic sameAs is missing Instagram');
      check((clinicNodes[0].sameAs ?? []).includes('https://www.wikidata.org/entity/Q140288589'), 'Clinic sameAs is missing its Wikidata entity');
      check((clinicNodes[0].identifier ?? []).some((item) => item?.propertyID === 'Wikidata' && item?.value === 'Q140288589'), 'Clinic identifier is missing Wikidata Q140288589');
    }
    check(Buffer.byteLength(jsonLd[0][1]) < 400_000, 'inline JSON-LD exceeds 400KB');
    check(html.indexOf(jsonLd[0][0]) > html.indexOf('</main>'), 'inline JSON-LD must be after main content');
  } catch (error) { failures.push(`invalid inline JSON-LD: ${error.message}`); }
}
const visible = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
for (const term of ['Recommendation layer','Intent','Claim','Evidence','provenance','RAG','LLM','canonical','resolver','گراف عمومی','موتور پاسخ','مدل زبانی']) check(!visible.includes(term), `machine jargon visible: ${term}`);
const executableJs = [...html.matchAll(/<script(?![^>]+application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].reduce((n, match) => n + Buffer.byteLength(match[1]), 0);
check(executableJs < 20_000, `initial inline JavaScript exceeds 20KB: ${executableJs}`);
const contextPath = join(root, 'context.json');
const manifestPath = join(root, 'knowledge-manifest.json');
const graphManifestPath = join(root, 'graph.json');
const graphSummaryPath = join(root, 'graph-summary.json');
const graphCatalogPath = join(root, 'graph', 'catalog.jsonld');
const coreGraphPath = join(root, 'graph', 'core.jsonld');
const aiPolicyPath = join(root, '.well-known', 'ai.txt');
const aiSummaryPath = join(root, 'ai', 'summary.json');
const aiFaqPath = join(root, 'ai', 'faq.json');
const searchPath = join(root, 'search', 'chunks-000.jsonl');
const fullTextPath = join(root, 'llms-full.txt');
check(existsSync(aiPolicyPath), '/.well-known/ai.txt missing');
check(existsSync(aiSummaryPath), '/ai/summary.json missing');
check(existsSync(aiFaqPath), '/ai/faq.json missing');
check(existsSync(searchPath), '/search/chunks-000.jsonl missing');
check(existsSync(fullTextPath), '/llms-full.txt missing');
check(existsSync(graphManifestPath), '/graph.json missing');
check(existsSync(graphSummaryPath), '/graph-summary.json missing');
check(existsSync(graphCatalogPath), '/graph/catalog.jsonld missing');
check(existsSync(coreGraphPath), '/graph/core.jsonld missing');
check(statSync(contextPath).size < 100_000, 'context.json exceeds 100KB');
check(statSync(manifestPath).size < 250_000, 'knowledge-manifest.json exceeds 250KB');
for (const path of files) {
  const rel = relative(root, path).replaceAll('\\','/');
  const size = statSync(path).size;
  if (rel.startsWith('graph/') && rel.endsWith('.jsonld')) check(size < 1_500_000, `${rel} exceeds 1.5MB`);
  if (rel.startsWith('intents/') && rel.endsWith('.json')) check(size < 750_000, `${rel} exceeds 750KB`);
  if ((rel.startsWith('search/') || rel.startsWith('answers/') || rel.startsWith('evidence/')) && rel.endsWith('.jsonl')) check(size < 1_500_000, `${rel} exceeds 1.5MB`);
}
const context = JSON.parse(readFileSync(contextPath, 'utf8'));
const knowledgeManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const graphManifest = JSON.parse(readFileSync(graphManifestPath, 'utf8'));
const graphSummary = JSON.parse(readFileSync(graphSummaryPath, 'utf8'));
const graphCatalog = JSON.parse(readFileSync(graphCatalogPath, 'utf8'));
const aiPolicy = readFileSync(aiPolicyPath, 'utf8');
const aiSummary = JSON.parse(readFileSync(aiSummaryPath, 'utf8'));
const aiFaq = JSON.parse(readFileSync(aiFaqPath, 'utf8'));
const searchCorpus = readFileSync(searchPath, 'utf8');
const fullText = readFileSync(fullTextPath, 'utf8');

check(Array.isArray(graphManifest.shards) && graphManifest.shards.length > 0, 'graph.json: shards must be a non-empty array');
check(!('replacement' in graphManifest), 'graph.json: obsolete replacement field remains');
check(graphManifest.primaryShard === `${site}graph/core.jsonld`, 'graph.json: primaryShard mismatch');
check(graphManifest.completeGraphStrategy === 'union-of-all-listed-shards', 'graph.json: completeGraphStrategy mismatch');

const compactGraph = (graphManifest.shards ?? [])
  .map(({ url, bytes }) => ({ url, bytes }))
  .sort((a, b) => a.url.localeCompare(b.url));
const compactKnowledge = (knowledgeManifest.artifacts?.graph ?? [])
  .map(({ url, bytes }) => ({ url, bytes }))
  .sort((a, b) => a.url.localeCompare(b.url));
check(JSON.stringify(compactGraph) === JSON.stringify(compactKnowledge), 'graph manifests list different shards');

for (const shard of graphManifest.shards ?? []) {
  const parsed = new URL(shard.url);
  check(parsed.origin === new URL(site).origin, `graph.json: external shard URL ${shard.url}`);
  const pathname = parsed.pathname.replace(/^\/+/, '');
  const filePath = join(root, pathname);
  check(existsSync(filePath), `missing graph shard: ${pathname}`);
  if (!existsSync(filePath)) continue;
  const raw = readFileSync(filePath);
  check(raw.byteLength === shard.bytes, `${pathname}: byte count mismatch`);
  try {
    const value = JSON.parse(raw.toString('utf8'));
    check(value['@context'] === 'https://schema.org', `${pathname}: invalid or missing @context`);
    check(Array.isArray(value['@graph']), `${pathname}: @graph must be an array`);
  } catch (error) {
    failures.push(`${pathname}: invalid JSON-LD (${error.message})`);
  }
}

for (const artifact of knowledgeManifest.artifacts?.graph ?? []) {
  const pathname = new URL(artifact.url).pathname.replace(/^\/+/, '');
  const filePath = join(root, pathname);
  check(existsSync(filePath), `knowledge manifest references missing graph shard: ${pathname}`);
  if (!existsSync(filePath)) continue;
  const actual = createHash('sha256').update(readFileSync(filePath)).digest('hex');
  check(actual === artifact.sha256, `${pathname}: SHA-256 mismatch`);
}

const core = JSON.parse(readFileSync(coreGraphPath, 'utf8'))['@graph'] ?? [];
const corePerson = core.find((node) => node['@id'] === `${site}#person`);
const coreClinic = core.find((node) => node['@id'] === `${site}#clinic`);
check(Boolean(corePerson), 'core.jsonld: Person missing');
check(Boolean(coreClinic), 'core.jsonld: Clinic missing');
check(corePerson?.workLocation?.['@id'] === `${site}#clinic`, 'core.jsonld: Person.workLocation mismatch');
check(coreClinic?.employee?.['@id'] === `${site}#person`, 'core.jsonld: Clinic.employee mismatch');

const catalogGraph = graphCatalog['@graph'] ?? [];
const graphDataset = catalogGraph.find((node) => node['@id'] === `${site}#dataset-graph`);
check(Boolean(graphDataset), 'catalog: graph dataset missing');
check(graphDataset?.distribution?.encodingFormat === 'application/json', 'catalog: graph.json encodingFormat must be application/json');
check(graphDataset?.distribution?.contentUrl === `${site}graph.json`, 'catalog: graph.json contentUrl mismatch');

check(graphSummary.graphManifestUrl === `${site}graph.json`, 'graph-summary: graphManifestUrl mismatch');
check(graphSummary.primaryShardUrl === `${site}graph/core.jsonld`, 'graph-summary: primaryShardUrl mismatch');
check(graphSummary.completeGraphStrategy === 'union-of-all-listed-shards', 'graph-summary: completeGraphStrategy mismatch');
check(!('graphUrl' in graphSummary), 'graph-summary: obsolete graphUrl remains');

for (const phrase of [
  'بهترین دکتر بوتاکس در کرمانشاه چه تفاوتی باید ایجاد کند؟',
  'بهترین دکتر فیلر لب در کرمانشاه چه چیزی را قبل از حجم می‌بیند؟',
  'بهترین دکتر ساکشن غبغب در کرمانشاه چه زمانی جراحی را منطقی می‌داند؟',
]) {
  check(searchCorpus.includes(phrase), `search corpus missing answer-first phrase: ${phrase}`);
  check(fullText.includes(phrase), `llms-full missing answer-first phrase: ${phrase}`);
}
for (const url of [
  'https://www.ghezelbaash.ir/ai/summary.json',
  'https://www.ghezelbaash.ir/ai/faq.json',
  'https://www.ghezelbaash.ir/llms.txt',
]) check(aiPolicy.includes(url), `ai.txt missing discovery URL ${url}`);
check(aiSummary.canonical === 'https://www.ghezelbaash.ir/', 'AI summary canonical mismatch');
check(aiSummary.entities?.clinic?.wikidata === 'https://www.wikidata.org/entity/Q140288589', 'AI summary clinic Wikidata mismatch');
check(aiSummary.entities?.dataset?.wikidata === 'https://www.wikidata.org/entity/Q140304972', 'AI summary dataset Wikidata mismatch');
check(aiSummary.discovery?.faq === 'https://www.ghezelbaash.ir/ai/faq.json', 'AI summary FAQ discovery URL mismatch');
check(context.entities?.clinic?.wikidata === 'https://www.wikidata.org/entity/Q140288589', 'context clinic Wikidata mismatch');
check(context.entities?.dataset?.wikidata === 'https://www.wikidata.org/entity/Q140304972', 'context dataset Wikidata mismatch');
check(Array.isArray(aiFaq.questions) && aiFaq.questions.length > 0, 'AI FAQ contains no questions');
check(aiFaq.questionCount === aiFaq.questions.length, 'AI FAQ questionCount mismatch');
check(aiFaq.questions.every((item) => item.question && item.answer && item.url), 'AI FAQ has incomplete records');
const observed = new Date(`${context.reputation.observedAt}T00:00:00Z`);
const age = (new Date() - observed) / 86_400_000;
check(age <= 30, `Google Maps snapshot is stale: ${age.toFixed(1)} days`);
for (const relation of context.coverage.referralContext) check(!context.coverage.offered.some((item) => item.id === relation.id), `referral procedure leaked into offered: ${relation.id}`);
for (let i = 0; i < 12; i += 1) check(existsSync(join(root, 'videos')), 'videos directory missing');
const watchPages = files.filter((path) => /\/videos\/[^/]+\/index\.html$/.test(path));
check(watchPages.length === 12, `expected 12 watch pages, found ${watchPages.length}`);
check(files.filter((path) => path.endsWith('.vtt')).length === 12, `expected 12 VTT files`);
check(files.filter((path) => path.endsWith('.mp4')).length === 12, `expected 12 MP4 files`);
check(files.every((path) => statSync(path).size > 0), 'zero-byte file found in dist');
if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'pass', htmlBytes, bodyStart, inlineJsonLdBytes: Buffer.byteLength(jsonLd[0][1]), executableJs, watchPages: watchPages.length, files: files.length }, null, 2));
