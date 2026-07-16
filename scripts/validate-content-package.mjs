import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = 'ghezelbaash-content-final';
const MANIFEST_ENTRY_KEYS = ['format', 'language', 'path', 'render_fields', 'role', 'sha256', 'strip_frontmatter'];
const ALLOWED_LANGUAGES = new Set(['fa-IR', 'en', 'mul', 'und']);
const ALLOWED_FORMATS = new Set(['markdown', 'json', 'jsonl']);
const ALLOWED_ROLES = new Set(['renderable', 'internal-fact', 'retrieval-plan', 'validation-only']);
const REQUIRED_FILES = [
  'package-manifest.json',
  'NON_VISIBLE_README.md',
  'facts/entities.json',
  'facts/claim-permissions.json',
  'facts/sources.json',
  'facts/claim-source-map.jsonl',
  'facts/media.json',
  'visible/00-hero.md',
  'visible/01-doctor.md',
  'visible/02-clinic.md',
  'visible/03-evidence.md',
  'visible/04-diagnostic-framework.md',
  'visible/05-selection-criteria.md',
  'visible/06-anatomic-atlas-intro.md',
  'visible/07-method-atlas-intro.md',
  'visible/08-complications-and-revision.md',
  'visible/09-local-national.md',
  'visible/10-references.md',
  'visible/11-contact.md',
  'visible/comparisons.json',
  'visible/faq.json',
  'visible/videos.json',
  'retrieval/passage-plan.json',
  'retrieval/aliases.json',
  'retrieval/intent-map.json',
  'validation/coverage-matrix.json',
  'validation/blocking-facts.json',
  'validation/report.md',
];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const normalizePath = (value) => value.replaceAll('\\', '/').replace(/^\.\//u, '');
const read = (path) => readFileSync(path, 'utf8');
const expectedRole = (path) => {
  if (path.startsWith('visible/')) return 'renderable';
  if (path.startsWith('facts/') || path === 'NON_VISIBLE_README.md') return 'internal-fact';
  if (path.startsWith('retrieval/')) return 'retrieval-plan';
  if (path.startsWith('validation/')) return 'validation-only';
  return null;
};
const expectedFormat = (path) => path.endsWith('.jsonl') ? 'jsonl' : path.endsWith('.json') ? 'json' : path.endsWith('.md') ? 'markdown' : null;
const expectedRenderFields = (path) => {
  if (/^visible\/.+\.md$/u.test(path)) return ['body'];
  if (path === 'visible/faq.json') return ['question', 'answer_md'];
  if (path === 'visible/comparisons.json') return ['title', 'intro_md', 'columns', 'rows', 'takeaway_md'];
  if (path === 'visible/videos.json') return ['title', 'summary_md', 'caption', 'poster_alt'];
  return [];
};
const sameStringArray = (actual, expected) => Array.isArray(actual)
  && actual.length === expected.length
  && actual.every((value, index) => value === expected[index]);

const filesRecursive = (directory, root = directory) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) return [{ path: normalizePath(relative(root, fullPath)), fullPath, symlink: true }];
    if (entry.isDirectory()) return filesRecursive(fullPath, root);
    return [{ path: normalizePath(relative(root, fullPath)), fullPath, symlink: false }];
  });
};

const parseJson = (path, errors) => {
  try {
    return JSON.parse(read(path));
  } catch (error) {
    errors.push(`Invalid JSON: ${path} (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
};

const parseJsonl = (path, errors) => {
  const values = [];
  for (const [index, line] of read(path).split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    try {
      values.push(JSON.parse(line));
    } catch (error) {
      errors.push(`Invalid JSONL at ${path}:${index + 1} (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  return values;
};

const stripFrontmatter = (value) => value.replace(/^---\s*\n[\s\S]*?\n---\s*\n/u, '');
const listFrom = (value, keys) => {
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  return [];
};
const stringsFrom = (value) => {
  const strings = [];
  const visit = (item) => {
    if (typeof item === 'string') strings.push(item);
    else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === 'object') Object.values(item).forEach(visit);
  };
  visit(value);
  return strings;
};

const visibleLeakPatterns = [
  ['search/graph vocabulary', /\b(?:canonical|schema|seo|aeo|geo|llmo|rag|sge|mainentity|supportingentity|machine-readable|knowledge graph|google kg|cloud kg|json-ld)\b/iu],
  ['content-system vocabulary', /\b(?:dataset|frontmatter|manifest|metadata|anchor|slug|chunk|passage|intent|keyword|registry|build)\b/iu],
  ['implementation vocabulary', /\b(?:astro|cloudflare|html|css|javascript|dom|lcp|api)\b/iu],
  ['technical Persian', /(?:شناسه‌های فنی|نمودار دانش|داده‌های ماشین‌خوان|برای موتور جست‌وجو|برای هوش مصنوعی|در سورس)/iu],
  ['source path or internal ID', /(?:src\/data|src\/content|contentFile|(?:facts|retrieval|validation|visible)\/|\bSRC-[A-Z0-9_-]+\b)/iu],
  ['placeholder', /(?:todo|placeholder|نیازمند تکمیل|بعداً اضافه شود|در نسخهٔ بعد)/iu],
  ['authoring instruction', /(?:(?:این بخش|در متن صفحه|این صفحه) باید|هدف این متن)/iu],
  ['internal English heading', /(?:Visible Copy|Short Definition|Sources Used|Visible Relationship|Role in Decision-Making|CTA Usage Notes|Search Intents)/iu],
];

const resolvePackageRoot = (input) => {
  const absolute = resolve(input);
  if (existsSync(resolve(absolute, 'package-manifest.json'))) return absolute;
  if (basename(absolute) === PACKAGE_NAME) return absolute;
  return resolve(absolute, PACKAGE_NAME);
};

export const validateContentPackage = (input) => {
  const root = resolvePackageRoot(input);
  const errors = [];
  const warnings = [];
  const metrics = {};

  if (!existsSync(root) || !lstatSync(root).isDirectory()) {
    return { passed: false, root, errors: [`Package root not found: ${root}`], warnings, metrics };
  }

  const diskFiles = filesRecursive(root);
  const diskPaths = new Set(diskFiles.map((entry) => entry.path));
  for (const entry of diskFiles) if (entry.symlink) errors.push(`Symbolic links are forbidden: ${entry.path}`);
  for (const file of REQUIRED_FILES) if (!diskPaths.has(file)) errors.push(`Required package file is missing: ${file}`);

  const topicFiles = diskFiles.filter((entry) => /^visible\/topics\/.+\.md$/u.test(entry.path));
  if (topicFiles.length === 0) errors.push('No topic Markdown files were supplied.');
  metrics.topicFiles = topicFiles.length;

  const manifestPath = resolve(root, 'package-manifest.json');
  const manifest = existsSync(manifestPath) ? parseJson(manifestPath, errors) : null;
  if (manifest) {
    const topLevelKeys = Object.keys(manifest).sort();
    if (JSON.stringify(topLevelKeys) !== JSON.stringify(['files', 'package_name', 'schema_version'])) {
      errors.push('package-manifest.json must contain exactly package_name, schema_version, and files.');
    }
    if (manifest.package_name !== PACKAGE_NAME) errors.push(`Manifest package_name must be ${PACKAGE_NAME}.`);
    if (manifest.schema_version !== 1) errors.push('Manifest schema_version must be 1.');
  }
  const manifestEntries = listFrom(manifest, ['files', 'entries']);
  if (manifest && manifestEntries.length === 0) errors.push('package-manifest.json must contain a non-empty files array.');
  const manifestByPath = new Map();
  for (const entry of manifestEntries) {
    const path = normalizePath(entry?.path ?? '');
    if (!path) {
      errors.push('Manifest entry is missing path.');
      continue;
    }
    if (path === 'package-manifest.json') {
      errors.push('The manifest must not contain a self-referential SHA entry for package-manifest.json.');
      continue;
    }
    const entryKeys = Object.keys(entry ?? {}).sort();
    if (JSON.stringify(entryKeys) !== JSON.stringify(MANIFEST_ENTRY_KEYS)) {
      errors.push(`Manifest entry ${path || '(missing path)'} must contain exactly ${MANIFEST_ENTRY_KEYS.join(', ')}.`);
    }
    if (manifestByPath.has(path)) errors.push(`Duplicate manifest path: ${path}`);
    manifestByPath.set(path, entry);
  }

  for (const diskFile of diskFiles.filter((entry) => entry.path !== 'package-manifest.json')) {
    const entry = manifestByPath.get(diskFile.path);
    if (!entry) {
      errors.push(`File is not declared in package manifest: ${diskFile.path}`);
      continue;
    }
    if (!ALLOWED_ROLES.has(entry.role)) {
      errors.push(`Invalid manifest role for ${diskFile.path}: ${entry.role}`);
    }
    if (entry.role !== expectedRole(diskFile.path)) errors.push(`Manifest role/path mismatch for ${diskFile.path}.`);
    if (!ALLOWED_LANGUAGES.has(entry.language)) errors.push(`Invalid manifest language for ${diskFile.path}: ${entry.language}`);
    if (diskFile.path.startsWith('visible/') && entry.language !== 'fa-IR') errors.push(`Visible file language must be fa-IR: ${diskFile.path}`);
    if (!ALLOWED_FORMATS.has(entry.format) || entry.format !== expectedFormat(diskFile.path)) errors.push(`Manifest format/path mismatch for ${diskFile.path}.`);
    const renderFields = expectedRenderFields(diskFile.path);
    if (!sameStringArray(entry.render_fields, renderFields)) errors.push(`Manifest render_fields mismatch for ${diskFile.path}.`);
    const stripFrontmatter = /^visible\/.+\.md$/u.test(diskFile.path);
    if (typeof entry.strip_frontmatter !== 'boolean' || entry.strip_frontmatter !== stripFrontmatter) errors.push(`Manifest strip_frontmatter mismatch for ${diskFile.path}.`);
    const expected = entry.sha256;
    const actual = sha256(readFileSync(diskFile.fullPath));
    if (!/^[a-f0-9]{64}$/u.test(expected ?? '') || expected !== actual) {
      errors.push(`SHA-256 mismatch for ${diskFile.path}.`);
    }
  }
  for (const path of manifestByPath.keys()) if (!diskPaths.has(path)) errors.push(`Manifest references a missing file: ${path}`);

  const visibleSegments = [];
  const visibleMarkdown = diskFiles.filter((entry) => /^visible\/.+\.md$/u.test(entry.path));
  let h1Count = 0;
  for (const file of visibleMarkdown) {
    const markdown = read(file.fullPath);
    if (markdown.startsWith('---') && !/^---\s*\n[\s\S]*?\n---\s*\n/u.test(markdown)) errors.push(`Unclosed or malformed frontmatter: ${file.path}`);
    const body = stripFrontmatter(markdown);
    if (body.trim().length < 40) errors.push(`Renderable Markdown body is too short: ${file.path}`);
    visibleSegments.push({ source: file.path, text: body });
    const fileH1Count = [...body.matchAll(/^#\s+.+$/gmu)].length;
    h1Count += fileH1Count;
    if (file.path === 'visible/00-hero.md' && fileH1Count !== 1) errors.push('visible/00-hero.md must contain exactly one H1.');
    if (file.path !== 'visible/00-hero.md' && fileH1Count !== 0) errors.push(`H1 is only allowed in visible/00-hero.md: ${file.path}`);
  }

  const faqPath = resolve(root, 'visible/faq.json');
  const faqJson = existsSync(faqPath) ? parseJson(faqPath, errors) : null;
  const faq = listFrom(faqJson, ['items', 'faq', 'questions']);
  metrics.faq = faq.length;
  if (faq.length !== 80) errors.push(`FAQ count must be exactly 80; found ${faq.length}.`);
  const faqIds = new Set();
  for (const [index, item] of faq.entries()) {
    if (!item?.id || !item?.question || !item?.answer_md) errors.push(`FAQ item ${index + 1} is missing id, question, or answer_md.`);
    if (!Array.isArray(item?.source_ids) || item.source_ids.length === 0 || !Array.isArray(item?.topic_ids) || item.topic_ids.length === 0 || !item?.intent_id) errors.push(`FAQ item ${item?.id ?? index + 1} is missing source_ids, topic_ids, or intent_id.`);
    if (faqIds.has(item?.id)) errors.push(`Duplicate FAQ id: ${item?.id}`);
    faqIds.add(item?.id);
    visibleSegments.push({ source: `visible/faq.json#${item?.id ?? index + 1}`, text: `${item?.question ?? ''}\n${item?.answer_md ?? ''}` });
  }

  const comparisonsPath = resolve(root, 'visible/comparisons.json');
  const comparisonsJson = existsSync(comparisonsPath) ? parseJson(comparisonsPath, errors) : null;
  const comparisons = listFrom(comparisonsJson, ['items', 'comparisons']);
  metrics.comparisons = comparisons.length;
  if (comparisons.length === 0) errors.push('No comparison records were supplied.');
  const comparisonIds = new Set();
  for (const [index, item] of comparisons.entries()) {
    const allowed = {
      title: item?.title,
      intro_md: item?.intro_md,
      columns: item?.columns,
      rows: item?.rows,
      takeaway_md: item?.takeaway_md,
    };
    visibleSegments.push({ source: `visible/comparisons.json#${item?.id ?? index + 1}`, text: stringsFrom(allowed).join('\n') });
    if (!item?.id || comparisonIds.has(item.id)) errors.push(`Comparison ${index + 1} has a missing or duplicate id.`);
    if (item?.id) comparisonIds.add(item.id);
    if (!item?.title || !item?.takeaway_md) errors.push(`Comparison ${item?.id ?? index + 1} is missing title or takeaway_md.`);
    if (!Array.isArray(item?.columns) || item.columns.length < 3) errors.push(`Comparison ${item?.id ?? index + 1} needs a criterion column and at least two independent method columns.`);
    if (!Array.isArray(item?.rows) || item.rows.some((row) => !Array.isArray(row) || row.length !== item.columns.length)) errors.push(`Comparison row width mismatch: ${item?.id ?? index + 1}`);
  }

  const videosPath = resolve(root, 'visible/videos.json');
  const videosJson = existsSync(videosPath) ? parseJson(videosPath, errors) : null;
  const videoItems = listFrom(videosJson, ['items', 'videos']);
  metrics.videos = videoItems.length;
  const videoIds = new Set();
  for (const [index, item] of videoItems.entries()) {
    const allowed = { title: item?.title, summary_md: item?.summary_md, caption: item?.caption, poster_alt: item?.poster_alt };
    visibleSegments.push({ source: `visible/videos.json#${item?.id ?? index + 1}`, text: stringsFrom(allowed).join('\n') });
    if (!item?.id || videoIds.has(item.id)) errors.push(`Video item ${index + 1} has a missing or duplicate id.`);
    if (item?.id) videoIds.add(item.id);
    if (!item?.title || !item?.summary_md || !item?.poster_alt) errors.push(`Video item ${item?.id ?? index + 1} is missing title, summary_md, or poster_alt.`);
  }

  if (h1Count !== 1) errors.push(`Visible Markdown must contain exactly one H1; found ${h1Count}.`);
  for (const segment of visibleSegments) {
    for (const [label, pattern] of visibleLeakPatterns) {
      if (pattern.test(segment.text)) errors.push(`Visible ${label} leak in ${segment.source}.`);
    }
  }

  const coveragePath = resolve(root, 'validation/coverage-matrix.json');
  const coverage = existsSync(coveragePath) ? parseJson(coveragePath, errors) : null;
  const coverageItems = listFrom(coverage, ['items', 'coverage', 'topics']);
  metrics.coverageItems = coverageItems.length;
  if (coverageItems.length === 0) errors.push('Coverage matrix is empty.');
  for (const item of coverageItems) {
    const status = item?.coverage_status ?? item?.coverageStatus;
    if (!item?.primary_block_id && !item?.primaryBlockId) errors.push(`Coverage item has no primary block: ${item?.id ?? item?.topic_id ?? 'unknown'}`);
    if (!status || status === 'missing') errors.push(`Coverage item is not complete: ${item?.id ?? item?.topic_id ?? 'unknown'}`);
    if (!Array.isArray(item?.supporting_block_ids) || !Array.isArray(item?.source_ids) || item.source_ids.length === 0 || !Array.isArray(item?.aliases)) errors.push(`Coverage item lacks supporting_block_ids, source_ids, or aliases: ${item?.id ?? item?.topic_id ?? 'unknown'}`);
  }

  const sourcesPath = resolve(root, 'facts/sources.json');
  const sources = existsSync(sourcesPath) ? parseJson(sourcesPath, errors) : null;
  const sourceItems = listFrom(sources, ['items', 'sources']);
  metrics.sources = sourceItems.length;
  const sourceIds = new Set(sourceItems.map((item) => item?.source_id ?? item?.id).filter(Boolean));
  if (sourceIds.size !== sourceItems.length) errors.push('Source registry contains a missing or duplicate source ID.');
  for (const [index, item] of sourceItems.entries()) {
    const sourceId = item?.source_id ?? item?.id ?? index + 1;
    if (!item?.title || !item?.publisher || !item?.source_type || !item?.primary_or_secondary || !item?.accessed_at || !item?.supports) errors.push(`Source ${sourceId} is missing required descriptive fields.`);
    if (!item?.url && !item?.doi && !item?.pmid) errors.push(`Source ${sourceId} needs a URL, DOI, or PMID.`);
  }

  const assertSourceIds = (ids, owner) => {
    for (const sourceId of ids ?? []) if (!sourceIds.has(sourceId)) errors.push(`${owner} references missing source ${sourceId}.`);
  };
  for (const item of faq) assertSourceIds(item?.source_ids, `FAQ ${item?.id ?? 'unknown'}`);
  for (const item of coverageItems) assertSourceIds(item?.source_ids, `Coverage item ${item?.id ?? item?.topic_id ?? 'unknown'}`);

  const entitiesPath = resolve(root, 'facts/entities.json');
  const entities = existsSync(entitiesPath) ? parseJson(entitiesPath, errors) : null;
  if (entities) {
    const entityKeys = Object.keys(entities).sort();
    if (JSON.stringify(entityKeys) !== JSON.stringify(['clinic', 'doctor'])) errors.push('facts/entities.json must contain exactly doctor and clinic.');
    for (const key of ['doctor', 'clinic']) {
      const entity = entities[key];
      if (!entity || entity.entity_key !== key || !entity.name || !entity.google_knowledge_graph_id || !entity.wikidata_id || !Array.isArray(entity.same_as) || !Array.isArray(entity.source_ids) || !entity.facts || typeof entity.facts !== 'object') errors.push(`Entity ${key} is incomplete.`);
      assertSourceIds(entity?.source_ids, `Entity ${key}`);
    }
    const doctorEntity = entities.doctor;
    const clinicEntity = entities.clinic;
    if (doctorEntity?.google_knowledge_graph_id === clinicEntity?.google_knowledge_graph_id) errors.push('Doctor and clinic Google Knowledge Graph IDs overlap.');
    if (doctorEntity?.wikidata_id === clinicEntity?.wikidata_id) errors.push('Doctor and clinic Wikidata IDs overlap.');
    const doctorSameAs = new Set(doctorEntity?.same_as ?? []);
    if ((clinicEntity?.same_as ?? []).some((url) => doctorSameAs.has(url))) errors.push('Doctor and clinic same_as ownership overlaps.');
  }

  const mediaPath = resolve(root, 'facts/media.json');
  const media = existsSync(mediaPath) ? parseJson(mediaPath, errors) : null;
  if (media && (typeof media !== 'object' || Object.keys(media).length === 0)) errors.push('facts/media.json is empty.');

  const passagePath = resolve(root, 'retrieval/passage-plan.json');
  const passageJson = existsSync(passagePath) ? parseJson(passagePath, errors) : null;
  const passages = listFrom(passageJson, ['items', 'passages']);
  if (passages.length === 0) errors.push('Retrieval passage plan is empty.');
  const passageIds = new Set();
  for (const [index, item] of passages.entries()) {
    if (!item?.passage_id || passageIds.has(item.passage_id)) errors.push(`Passage ${index + 1} has a missing or duplicate passage_id.`);
    if (item?.passage_id) passageIds.add(item.passage_id);
    const sourceFile = normalizePath(String(item?.source_file ?? '')).split('#')[0];
    if (!sourceFile.startsWith('visible/') || !diskPaths.has(sourceFile)) errors.push(`Passage ${item?.passage_id ?? index + 1} references invalid source_file ${sourceFile}.`);
    if (!item?.start_heading_or_field || !item?.end_heading_or_field || !Array.isArray(item?.primary_entity_ids) || item.primary_entity_ids.length === 0 || !Array.isArray(item?.topic_ids) || !Array.isArray(item?.intent_ids) || !Array.isArray(item?.source_ids) || item.source_ids.length === 0) errors.push(`Passage ${item?.passage_id ?? index + 1} is incomplete.`);
    assertSourceIds(item?.source_ids, `Passage ${item?.passage_id ?? index + 1}`);
  }

  const aliasesPath = resolve(root, 'retrieval/aliases.json');
  const aliasesJson = existsSync(aliasesPath) ? parseJson(aliasesPath, errors) : null;
  const aliases = listFrom(aliasesJson, ['items', 'aliases']);
  if (aliases.length === 0) errors.push('Retrieval alias registry is empty.');
  const aliasKeys = new Set();
  for (const [index, item] of aliases.entries()) {
    const key = `${item?.language ?? ''}:${item?.normalized ?? ''}:${item?.target_type ?? ''}:${item?.target_id ?? ''}`;
    if (!item?.alias || !item?.normalized || !item?.language || !item?.target_type || !item?.target_id || aliasKeys.has(key)) errors.push(`Alias ${index + 1} is incomplete or duplicate.`);
    aliasKeys.add(key);
  }

  const intentPath = resolve(root, 'retrieval/intent-map.json');
  const intentJson = existsSync(intentPath) ? parseJson(intentPath, errors) : null;
  const intents = listFrom(intentJson, ['items', 'intents']);
  if (intents.length === 0) errors.push('Retrieval intent map is empty.');
  const intentIds = new Set();
  for (const [index, item] of intents.entries()) {
    if (!item?.intent_id || intentIds.has(item.intent_id) || !item?.label || !Array.isArray(item?.aliases) || !Array.isArray(item?.primary_block_ids) || item.primary_block_ids.length === 0 || !Array.isArray(item?.supporting_block_ids)) errors.push(`Intent ${item?.intent_id ?? index + 1} is incomplete or duplicate.`);
    if (item?.intent_id) intentIds.add(item.intent_id);
  }
  for (const item of faq) if (item?.intent_id && !intentIds.has(item.intent_id)) errors.push(`FAQ ${item.id} references missing intent ${item.intent_id}.`);
  for (const item of passages) {
    for (const intentId of item?.intent_ids ?? []) if (!intentIds.has(intentId)) errors.push(`Passage ${item?.passage_id ?? 'unknown'} references missing intent ${intentId}.`);
    for (const entityId of item?.primary_entity_ids ?? []) if (!['doctor', 'clinic'].includes(entityId)) errors.push(`Passage ${item?.passage_id ?? 'unknown'} references unknown primary entity ${entityId}.`);
  }

  const claimMapPath = resolve(root, 'facts/claim-source-map.jsonl');
  const claims = existsSync(claimMapPath) ? parseJsonl(claimMapPath, errors) : [];
  metrics.claims = claims.length;
  if (claims.length === 0) errors.push('Claim-to-source map is empty.');
  const claimIds = new Set();
  for (const claim of claims) {
    if (!claim?.claim_id || !claim?.visible_file || !claim?.paragraph_or_field || !claim?.claim_summary || !claim?.support_level || !Array.isArray(claim?.source_ids) || claim.source_ids.length === 0) errors.push(`Incomplete claim-source record: ${claim?.claim_id ?? 'unknown'}`);
    if (claimIds.has(claim?.claim_id)) errors.push(`Duplicate claim ID: ${claim?.claim_id}`);
    if (claim?.claim_id) claimIds.add(claim.claim_id);
    const visibleFile = normalizePath(String(claim?.visible_file ?? '')).split('#')[0];
    if (!visibleFile.startsWith('visible/') || !diskPaths.has(visibleFile)) errors.push(`Claim ${claim?.claim_id ?? 'unknown'} references invalid visible_file ${visibleFile}.`);
    assertSourceIds(claim?.source_ids, `Claim ${claim?.claim_id ?? 'unknown'}`);
  }

  const permissionsPath = resolve(root, 'facts/claim-permissions.json');
  const permissions = existsSync(permissionsPath) ? parseJson(permissionsPath, errors) : null;
  const permissionItems = listFrom(permissions, ['items', 'permissions', 'topics']);
  if (permissionItems.length === 0) errors.push('Claim-permissions truth control is empty.');
  const permissionTopicIds = new Set();
  for (const [index, item] of permissionItems.entries()) {
    if (!item?.topic_id || permissionTopicIds.has(item.topic_id)) errors.push(`Claim-permission item ${index + 1} has a missing or duplicate topic_id.`);
    if (item?.topic_id) permissionTopicIds.add(item.topic_id);
    if (!Array.isArray(item?.allowed_claims) || !Array.isArray(item?.forbidden_claims) || item.forbidden_claims.length === 0 || !Array.isArray(item?.evidence_source_ids) || !item?.verified_at) errors.push(`Claim-permission item ${item?.topic_id ?? index + 1} is incomplete.`);
    assertSourceIds(item?.evidence_source_ids, `Claim-permission item ${item?.topic_id ?? index + 1}`);
  }

  const blockingPath = resolve(root, 'validation/blocking-facts.json');
  const blocking = existsSync(blockingPath) ? parseJson(blockingPath, errors) : null;
  const blockingItems = listFrom(blocking, ['items', 'blocking', 'facts']);
  for (const item of blockingItems) {
    const kind = String(item?.type ?? item?.kind ?? '').toLowerCase();
    const status = String(item?.status ?? 'blocking').toLowerCase();
    if (status !== 'resolved' && !kind.includes('transcript') && !kind.includes('caption')) {
      errors.push(`Unresolved non-transcript fact remains: ${item?.id ?? item?.field ?? 'unknown'}`);
    }
  }

  return {
    passed: errors.length === 0,
    root,
    errors,
    warnings,
    metrics,
  };
};

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const input = process.argv[2];
  if (!input) {
    process.stderr.write('Usage: npm run content:validate -- <extracted-package-directory>\n');
    process.exitCode = 2;
  } else {
    const report = validateContentPackage(input);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.passed) process.exitCode = 1;
  }
}
