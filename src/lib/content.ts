import type { MarkdownHeading } from 'astro';
import { createHash } from 'node:crypto';
import { site } from '../data/site';
// @ts-expect-error Shared canonical URL registry.
import { getServiceAnchorMap } from '../domain/url-architecture.mjs';
// @ts-expect-error Canonical semantic registry for authored answer-first sections.
import { authoredAnswerMappingFor } from '../domain/answer-hub.mjs';
// @ts-expect-error Shared ESM metadata module used by Astro and rehype.
import { buildSectionRelationships, classifyHeading, getTopicGroup, procedures, topicGroups } from '../data/knowledge.mjs';
// @ts-expect-error Shared ESM authority and intent data.
import { allAuthorityClaims, buildIntentRegistry, evidenceSources, granularConcepts } from '../data/authority.mjs';

export type HeadingMetadata = {
  groupId: string;
  groupLabel: string;
  intents: string[];
  modalities: string[];
  procedureIds: string[];
};

export type TocNode = MarkdownHeading & HeadingMetadata & { children: TocNode[] };

export type TocGroup = {
  id: string;
  label: string;
  shortLabel: string;
  sections: TocNode[];
};

export function buildToc(headings: MarkdownHeading[]): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];

  for (const heading of headings.filter((item) => item.depth >= 2 && item.depth <= 4)) {
    const node: TocNode = {
      ...heading,
      ...classifyHeading(heading.text, heading.depth),
      children: [],
    };
    while (stack.length && stack[stack.length - 1].depth >= node.depth) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }

  return roots;
}

export function buildGroupedToc(headings: MarkdownHeading[]): TocGroup[] {
  const roots = buildToc(headings);
  return topicGroups
    .map((group: { id: string; label: string; shortLabel: string }) => ({
      id: group.id,
      label: group.label,
      shortLabel: group.shortLabel,
      sections: roots.filter((section) => section.groupId === group.id),
    }))
    .filter((group: TocGroup) => group.sections.length > 0);
}

export function choosePrimaryNavigation(headings: MarkdownHeading[]) {
  const grouped = buildGroupedToc(headings);
  const priority = [
    'physician-entity-authority',
    'botulinum-toxin',
    'dermal-fillers',
    'thread-lift',
    'surgery-and-referral',
    'faq',
  ];

  return priority.flatMap((id) => {
    const group = grouped.find((item) => item.id === id);
    const first = group?.sections[0];
    return first ? [{ label: group.shortLabel, href: `#${first.slug}` }] : [];
  });
}

function normalizePlainText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/[|*_`>#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractExternalLinks(markdown: string) {
  return [...markdown.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g)].map((match) => match[1]);
}

export type SearchChunk = {
  id: string;
  url: string;
  canonicalFragment: string;
  title: string;
  queryAliases: string[];
  depth: number;
  sourceSpan: { startLine: number; endLine: number };
  contentHash: { algorithm: 'sha256'; digest: string };
  parentIds: string[];
  breadcrumb: string[];
  group: { id: string; label: string };
  intents: string[];
  intentIds: string[];
  primaryIntentIds: string[];
  secondaryIntentIds: string[];
  intentCoverage: {
    totalMatched: number;
    primaryCount: number;
    secondaryCount: number;
    authorityScore: number;
    coverageStatus: 'direct-answer' | 'supporting-answer' | 'coverage-target';
  };
  doctorAuthoritySignals: string[];
  modalities: string[];
  procedureIds: string[];
  conceptIds: string[];
  primaryConceptId: string | null;
  primaryProcedureId: string | null;
  claimIds: string[];
  evidenceIds: string[];
  citationIds: string[];
  entityIds: string[];
  relatedIds: string[];
  text: string;
  markdown: string;
  externalSources: string[];
  answer?: string;
  answerRole?: 'direct-answer' | 'question-answer';
  medicalSafetyClass: 'general-information' | 'decision-support' | 'safety-critical' | 'urgent-evaluation';
  serviceRelationships: Array<{ id: string; relationship: string; modality: string }>;
  locality: { city: string; region: string; country: string };
};


const intentRegistry = buildIntentRegistry(site.url);

const intentDimensionPatterns: Record<string, RegExp> = {
  informational: /چیست|تعریف|عمل می‌کند|مکانیسم|چگونه/,
  'problem-first': /مشکل|علامت|علت|لایه|تشخیص|می‌بینید/,
  local: /کرمانشاه/,
  'clinic-local': /کلینیک|مراجعه|تماس|کرمانشاه/,
  'best-doctor-local': /بهترین دکتر|بهترین پزشک|کرمانشاه/,
  'best-doctor-national': /بهترین دکتر|بهترین پزشک|ایران|ملی/,
  'national-authority': /مرجع|جامع|ملی|ایران|اتوریتی/,
  candidacy: /کاندید|مناسب|چه کسانی|چه کسی/,
  'non-candidacy': /مناسب نیست|غیرکاندید|نباید|رد درمان|مکث/,
  safety: /عوارض|خطر|هشدار|ایمنی|فوری|اورژانس/,
  contraindications: /منع|احتیاط|بارداری|بیماری|دارو|مکث/,
  comparison: /مقایسه|فرق|بهتر است یا|یکی نیست|در برابر|تفاوت/,
  alternatives: /جایگزین|گزینه دیگر|روش مشابه/,
  price: /قیمت|هزینه/,
  recovery: /نقاهت|مراقبت بعد|بهبود|بعد از/,
  duration: /ماندگاری|زمان نتیجه|شروع اثر|دوام/,
  'complication-management': /عارضه|اصلاح عارضه|چه باید کرد|بررسی سریع/,
  'failed-treatment': /قبلی|ناموفق|اصلاح|نتیجه نداده|مقاوم/,
  'natural-result': /طبیعی|تناسب|مصنوعی/,
  'before-after': /قبل و بعد|نتیجه|عکس/,
  consultation: /مشاوره|معاینه|ارزیابی|تصمیم/,
  booking: /رزرو|تماس|هماهنگی|مراجعه/,
  evidence: /منبع|شواهد|مطالعه|پژوهش|مدرک/,
  'surgical-boundary': /جراحی|مرز|ارجاع|غیرجراحی/,
  referral: /ارجاع|جراح|متخصص/,
  'non-surgical-alternative': /غیرجراحی|کم‌تهاجمی|جایگزین جراحی/,
  'physician-expertise': /دکتر سعید قزلباش|پزشک|رویکرد تشخیصی|آموزش پزشکان/,
  'national-patient-guide': /ایران|ملی|شهر دیگر|سراسر/,
  'complex-case': /پیچیده|مقاوم|قبلی|ترکیبی|چند مشکل/,
  'mechanism-layer': /لایه|مکانیسم|آناتومی|عضله|حجم|چربی|ساختار/,
  'staged-plan': /مرحله‌ای|ترکیبی|ترتیب|برنامه درمان/,
  'doctor-selection': /انتخاب پزشک|چه کسی|معیار|صلاحیت|هویت/,
  'diagnostic-errors': /خطا|اشتباه|غلط|میان‌بر|فریب/,
  'outcome-limits': /محدودیت|مرز نتیجه|قدرت روش|تضمین|کافی نیست/,
  'full-spectrum-map': /جراحی|غیرجراحی|کم‌تهاجمی|نقشه|پیوسته/,
};

function rankIntentMatches(title: string, markdown: string, conceptIds: string[]) {
  const haystack = normalizeForMatch(`${title} ${markdown}`);
  const candidates = intentRegistry.filter((intent: { conceptId: string }) => conceptIds.includes(intent.conceptId));
  return candidates
    .map((intent: { id: string; dimension: string; brandFocus?: boolean; relationship: string }) => {
      let score = 1;
      const pattern = intentDimensionPatterns[intent.dimension];
      if (pattern?.test(haystack)) score += 6;
      if (intent.brandFocus && /قزلباش|پزشک|کلینیک/.test(haystack)) score += 4;
      if (intent.dimension === 'informational' || intent.dimension === 'problem-first' || intent.dimension === 'consultation') score += 2;
      if (intent.dimension === 'best-doctor-local' && /بهترین.*(?:دکتر|پزشک).*کرمانشاه/.test(haystack)) score += 8;
      if (intent.dimension === 'best-doctor-national' && /بهترین.*(?:دکتر|پزشک).*(?:ایران|ملی)/.test(haystack)) score += 8;
      if (intent.relationship === 'referral-context' && /جراحی|ارجاع/.test(haystack)) score += 3;
      return { ...intent, score };
    })
    .sort((a: { score: number; id: string }, b: { score: number; id: string }) => b.score - a.score || a.id.localeCompare(b.id));
}

function authoritySignalsFor(title: string, markdown: string, claims: Array<{ id: string }>, primaryIntents: Array<{ dimension: string }>) {
  const haystack = normalizeForMatch(`${title} ${markdown}`);
  const signals = ['physician-entity', 'clinic-entity'];
  if (/کرمانشاه|کلینیک|مراجعه|تماس/.test(haystack)) signals.push('local-authority');
  if (/ایران|ملی|شهر دیگر|سراسر/.test(haystack) || primaryIntents.some((item) => ['best-doctor-national', 'national-authority', 'national-patient-guide'].includes(item.dimension))) signals.push('national-authority');
  if (/پژوهش|مقاله|pubmed|orcid|آموزش پزشکان/.test(haystack)) signals.push('research-and-education-authority');
  if (/عوارض|خطر|ارجاع|کاندید|تشخیص|محدودیت/.test(haystack)) signals.push('clinical-decision-authority');
  if (claims.some((item) => item.id.startsWith('claim-coverage-'))) signals.push('service-or-knowledge-coverage');
  return [...new Set(signals)];
}

function normalizeForMatch(value: string) {
  return value.toLocaleLowerCase('fa').replace(/[‌‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchGranularConcepts(title: string, markdown: string, procedureIds: string[] = []) {
  const haystack = normalizeForMatch(`${title} ${markdown}`);
  const genericTerms = new Set(['صورت', 'پوست', 'درمان', 'ارزیابی', 'روش', 'تزریق', 'جراحی', 'لیفت', 'فیلر', 'بوتاکس']);
  return granularConcepts.filter((concept: { name: string; keywords: string[]; parentProcedureId: string }) => {
    const directTerms = [concept.name, ...(concept.keywords ?? [])].filter(Boolean);
    if (directTerms.some((term) => haystack.includes(normalizeForMatch(term)))) return true;
    if (!procedureIds.includes(concept.parentProcedureId)) return false;
    const parentAwareTerms = directTerms
      .flatMap((term) => normalizeForMatch(term).split(' '))
      .filter((term) => term.length >= 4 && !genericTerms.has(term));
    return parentAwareTerms.some((term) => haystack.includes(term));
  });
}

function matchAuthorityClaims(title: string, markdown: string, conceptIds: string[]) {
  const haystack = normalizeForMatch(`${title} ${markdown}`);
  return allAuthorityClaims.filter((claim: { id: string; subject: string; value: unknown; label: string; conceptId?: string }) => {
    if (claim.conceptId) return conceptIds.includes(claim.conceptId);
    if (claim.id === 'claim-physician-legal-identity' || claim.id === 'claim-physician-professional-name' || claim.id === 'claim-physician-irimc') {
      return /قزلباش|نظام پزشکی|هویت پزشک|دکتر/.test(haystack);
    }
    if (claim.id === 'claim-practices-at-clinic' || claim.id === 'claim-clinic-address' || claim.id === 'claim-clinic-phone' || claim.id === 'claim-clinic-hours' || claim.id === 'claim-google-rating-snapshot') {
      return /کلینیک|کرمانشاه|آدرس|تماس|گوگل|مراجعه/.test(haystack);
    }
    if (claim.id.startsWith('claim-research-')) return /پژوهش|مقاله|pubmed|orcid|افسردگی|دوقطبی/.test(haystack);
    if (claim.id === 'claim-botox-coverage') return conceptIds.some((id) => id.startsWith('botox-')) || /بوتاکس|توکسین/.test(haystack);
    if (claim.id === 'claim-filler-coverage') return conceptIds.some((id) => id.startsWith('filler-')) || /فیلر|ژل/.test(haystack);
    if (claim.id === 'claim-thread-lift-coverage') return conceptIds.some((id) => id.startsWith('thread-')) || /نخ/.test(haystack);
    if (claim.id === 'claim-concerns-coverage') return /پوست|اسکار|جوش|مو|غبغب|کانتور/.test(haystack);
    if (claim.id === 'claim-surgical-knowledge-boundary') return /جراحی|ارجاع|بلفارو|رینوپلاستی|فیس.?لیفت|کاشت مو|جراحی فک/.test(haystack);
    return false;
  });
}

function safetyClassFor(title: string, markdown: string): SearchChunk['medicalSafetyClass'] {
  const value = normalizeForMatch(`${title} ${markdown}`);
  if (/تنگی نفس|اختلال بلع|ضعف منتشر|نابینایی|انسداد عروقی|اورژانس|فوری/.test(value)) return 'urgent-evaluation';
  if (/عوارض|خطر|هشدار|منع مصرف|حساسیت|نکروز|عفونت|پتوز|دوبینی/.test(value)) return 'safety-critical';
  if (/کاندید|تشخیص|مقایسه|جراحی|ارجاع|درمان قبلی|تصمیم/.test(value)) return 'decision-support';
  return 'general-information';
}

const searchChunkCache = new Map<string, SearchChunk[]>();

function searchChunkCacheKey(raw: string, headings: MarkdownHeading[]) {
  const headingSignature = headings.map((heading) => `${heading.depth}:${heading.slug}:${heading.text}`).join('\n');
  return createHash('sha256').update(raw).update('\0').update(headingSignature).digest('hex');
}

export function buildSearchChunks(raw: string, headings: MarkdownHeading[]): SearchChunk[] {
  const cacheKey = searchChunkCacheKey(raw, headings);
  const cached = searchChunkCache.get(cacheKey);
  if (cached) return cached;
  const lines = raw.split(/\r?\n/);
  const positions: Array<{ line: number; depth: number; title: string; slug: string }> = [];
  let headingCursor = 0;

  lines.forEach((line, lineIndex) => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) return;
    const heading = headings[headingCursor++];
    if (!heading) return;
    positions.push({ line: lineIndex, depth: match[1].length, title: match[2], slug: heading.slug });
  });

  const h2Sections = positions.filter((item) => item.depth === 2).map((item) => ({ text: item.title, slug: item.slug }));
  const relationshipMap = new Map(
    buildSectionRelationships(h2Sections).map((item: { id: string; related: string[] }) => [item.id, item.related]),
  );
  const parentStack: Array<{ depth: number; slug: string; title: string }> = [];
  const chunks: SearchChunk[] = [];

  positions.forEach((position, index) => {
    while (parentStack.length && parentStack[parentStack.length - 1].depth >= position.depth) parentStack.pop();
    const end = positions[index + 1]?.line ?? lines.length;
    const markdown = lines.slice(position.line, end).join('\n').trimEnd();
    const metadata = classifyHeading(position.title, position.depth) as HeadingMetadata;
    const authoredMapping = authoredAnswerMappingFor(position.slug);
    const heuristicConcepts = matchGranularConcepts(position.title, markdown, metadata.procedureIds);
    const matchedConcepts = authoredMapping
      ? authoredMapping.conceptIds.map((id: string) => {
        const concept = granularConcepts.find((item: { id: string }) => item.id === id);
        if (!concept) throw new Error(`Authored answer ${position.slug} references unknown concept ${id}`);
        return concept;
      })
      : heuristicConcepts;
    const conceptIds = matchedConcepts.map((item: { id: string }) => item.id);
    const procedureIds = [...new Set(authoredMapping
      ? [...authoredMapping.procedureIds, ...matchedConcepts.map((item: { parentProcedureId: string }) => item.parentProcedureId)]
      : [...metadata.procedureIds, ...matchedConcepts.map((item: { parentProcedureId: string }) => item.parentProcedureId)])];
    const claims = matchAuthorityClaims(position.title, markdown, conceptIds);
    const claimIds = claims.map((item: { id: string }) => item.id);
    const evidenceIds = [...new Set([
      ...matchedConcepts.flatMap((item: { sourceIds?: string[] }) => item.sourceIds ?? []),
      ...claims.flatMap((item: { evidenceIds?: string[] }) => item.evidenceIds ?? []),
    ])];
    const rankedIntentMatches = rankIntentMatches(position.title, markdown, conceptIds);
    const heuristicIntentIds = rankedIntentMatches.map((intent: { id: string }) => intent.id);
    const primaryIntentMatches = rankedIntentMatches.filter((intent: { score: number }) => intent.score >= 6).slice(0, 24);
    const fallbackPrimaryIntents = primaryIntentMatches.length
      ? primaryIntentMatches
      : rankedIntentMatches.filter((intent: { dimension: string }) => ['informational', 'problem-first', 'consultation', 'physician-expertise', 'national-authority'].includes(intent.dimension)).slice(0, 12);
    const primaryIntentIds = authoredMapping
      ? [...authoredMapping.primaryIntentIds]
      : fallbackPrimaryIntents.map((intent: { id: string }) => intent.id);
    for (const intentId of primaryIntentIds) {
      if (!intentRegistry.some((intent: { id: string }) => intent.id === intentId)) {
        throw new Error(`Authored answer ${position.slug} references unknown intent ${intentId}`);
      }
    }
    const matchedIntentIds = [...new Set([...primaryIntentIds, ...heuristicIntentIds])];
    const primaryIntentSet = new Set(primaryIntentIds);
    const secondaryIntentIds = matchedIntentIds.filter((id: string) => !primaryIntentSet.has(id));
    const selectedPrimaryIntents = primaryIntentIds
      .map((id: string) => intentRegistry.find((intent: { id: string }) => intent.id === id))
      .filter(Boolean);
    const h2Parent = position.depth === 2
      ? position.slug
      : [...parentStack].reverse().find((parent) => parent.depth === 2)?.slug;
    const relatedIds = h2Parent ? relationshipMap.get(h2Parent) ?? [] : [];
    const plain = normalizePlainText(markdown);
    const isQuestion = Boolean(position.title.trim().match(/[؟?]$/));
    const externalSources = extractExternalLinks(markdown);

    chunks.push({
      id: position.slug,
      url: `${site.url}#${position.slug}`,
      canonicalFragment: `#${position.slug}`,
      title: position.title,
      queryAliases: authoredMapping ? [...new Set([authoredMapping.question, ...authoredMapping.queryVariants])] : [],
      depth: position.depth,
      sourceSpan: { startLine: position.line + 1, endLine: end },
      contentHash: { algorithm: 'sha256', digest: createHash('sha256').update(markdown, 'utf8').digest('hex') },
      parentIds: parentStack.map((parent) => parent.slug),
      breadcrumb: parentStack.map((parent) => parent.title),
      group: { id: metadata.groupId, label: metadata.groupLabel },
      intents: authoredMapping ? [...new Set([authoredMapping.dimensionId, ...metadata.intents])] : metadata.intents,
      intentIds: matchedIntentIds,
      primaryIntentIds,
      secondaryIntentIds,
      intentCoverage: {
        totalMatched: matchedIntentIds.length,
        primaryCount: primaryIntentIds.length,
        secondaryCount: secondaryIntentIds.length,
        authorityScore: Math.min(100, 20 + claims.length * 6 + evidenceIds.length * 4 + primaryIntentIds.length * 2 + conceptIds.length * 5),
        coverageStatus: position.depth === 2 ? 'direct-answer' : isQuestion ? 'direct-answer' : primaryIntentIds.length ? 'supporting-answer' : 'coverage-target',
      },
      doctorAuthoritySignals: authoritySignalsFor(position.title, markdown, claims, selectedPrimaryIntents.length ? selectedPrimaryIntents : fallbackPrimaryIntents),
      modalities: [...new Set([...(authoredMapping ? [] : metadata.modalities), ...matchedConcepts.map((item: { modality: string }) => item.modality)])],
      procedureIds,
      conceptIds,
      primaryConceptId: authoredMapping ? authoredMapping.primaryConceptId : (conceptIds[0] ?? null),
      primaryProcedureId: authoredMapping ? authoredMapping.primaryProcedureId : (procedureIds[0] ?? null),
      claimIds,
      evidenceIds,
      citationIds: externalSources.map((url) => `citation-${createHash('sha256').update(url).digest('hex').slice(0, 16)}`),
      entityIds: [
        `${site.url}#person`,
        `${site.url}#clinic`,
        ...procedureIds.map((id) => `${site.url}#procedure-${id}`),
        ...conceptIds.map((id) => `${site.url}#concept-${id}`),
      ],
      relatedIds,
      text: plain,
      markdown,
      externalSources,
      ...(isQuestion ? { answer: plain.replace(position.title, '').trim(), answerRole: 'question-answer' as const } : position.depth === 2 ? { answerRole: 'direct-answer' as const } : {}),
      medicalSafetyClass: safetyClassFor(position.title, markdown),
      serviceRelationships: procedureIds.map((id) => {
        const procedure = procedures.find((item: { id: string }) => item.id === id);
        return { id, relationship: procedure?.relationship ?? 'knowledge-context', modality: procedure?.modality ?? 'cross-modality' };
      }),
      locality: { city: site.city, region: site.region, country: site.countryCode },
    });
    parentStack.push({ depth: position.depth, slug: position.slug, title: position.title });
  });

  searchChunkCache.set(cacheKey, chunks);
  return chunks;
}

export function buildKnowledgeSummary(headings: MarkdownHeading[]) {
  const grouped = buildGroupedToc(headings);
  return {
    topicGroups: grouped.map((group) => ({
      id: group.id,
      label: group.label,
      sectionIds: group.sections.map((section) => section.slug),
    })),
    procedures: procedures.map((procedure: Record<string, unknown>) => procedure),
    granularConcepts,
    authorityClaims: allAuthorityClaims,
    evidenceSources,
    intentRegistry,
    coverageModalities: ['non-surgical', 'minimally-invasive', 'energy-based', 'surgical', 'referral-boundary', 'medical-referral', 'cross-modality'],
  };
}

export function buildProcedureAnchorMap(_headings: MarkdownHeading[] = []) {
  return getServiceAnchorMap();
}

export function extractFaqEntries(raw: string, headings: MarkdownHeading[]) {
  const chunks = buildSearchChunks(raw, headings);
  const questionPattern = /[؟?]$|^(آیا|چرا|چطور|چگونه|چه |چه‌|کدام|کی |چه زمانی|قیمت|هزینه|آیا می|آیا باید)/;
  return chunks
    .filter((chunk) => chunk.depth >= 3 && questionPattern.test(chunk.title.trim()) && chunk.text.length > chunk.title.length)
    .map((chunk) => {
      const answer = chunk.text.replace(chunk.title, '').trim();
      const bodyMarkdown = chunk.markdown.split(/\r?\n/).slice(1).join('\n').trim();
      const directBlock = bodyMarkdown.split(/\n\s*\n/).find((block) => block.trim() && !/^[-|#]/.test(block.trim())) ?? bodyMarkdown;
      const directAnswer = normalizePlainText(directBlock);
      return {
        id: chunk.id,
        url: chunk.url,
        canonicalFragment: chunk.canonicalFragment,
        question: chunk.title,
        directAnswer,
        answer,
        derivation: 'verbatim-first-substantive-visible-paragraph',
        sourceSpan: chunk.sourceSpan,
        contentHash: chunk.contentHash,
        group: chunk.group,
        intents: chunk.intents,
        intentIds: chunk.intentIds,
        primaryIntentIds: chunk.primaryIntentIds,
        secondaryIntentIds: chunk.secondaryIntentIds,
        intentCoverage: chunk.intentCoverage,
        doctorAuthoritySignals: chunk.doctorAuthoritySignals,
        modalities: chunk.modalities,
        procedureIds: chunk.procedureIds,
        conceptIds: chunk.conceptIds,
        claimIds: chunk.claimIds,
        evidenceIds: chunk.evidenceIds,
        citationIds: chunk.citationIds,
        entityIds: chunk.entityIds,
        medicalSafetyClass: chunk.medicalSafetyClass,
        serviceRelationships: chunk.serviceRelationships,
      };
    });
}

type CitationClassification = {
  domain: string;
  sourceType: string;
  evidenceTier: 1 | 2 | 3 | 4;
  supports: string[];
  timeSensitivity: 'stable' | 'periodic-review' | 'time-sensitive';
};

function classifyCitationUrl(value: string): CitationClassification {
  const url = new URL(value);
  const domain = url.hostname.replace(/^www\./, '').toLowerCase();
  const result = (sourceType: string, evidenceTier: 1 | 2 | 3 | 4, supports: string[], timeSensitivity: CitationClassification['timeSensitivity'] = 'stable') => ({
    domain, sourceType, evidenceTier, supports, timeSensitivity,
  });

  if (domain === 'membersearch.irimc.org') return result('official-medical-registration', 1, ['identity', 'credential', 'medical-registration']);
  if (domain === 'orcid.org') return result('persistent-researcher-identifier', 1, ['identity', 'name-disambiguation', 'research']);
  if (domain === 'pubmed.ncbi.nlm.nih.gov') return result('peer-reviewed-bibliographic-index', 1, ['research', 'publication-identity', 'medical-evidence']);
  if (domain === 'pmc.ncbi.nlm.nih.gov') return result('peer-reviewed-full-text-repository', 1, ['research', 'medical-evidence']);
  if (domain === 'dailymed.nlm.nih.gov' || domain.endsWith('.fda.gov')) return result('regulatory-drug-information', 1, ['safety', 'contraindications', 'drug-label'], 'periodic-review');
  if (domain === 'doi.org') return result('persistent-publication-or-data-identifier', 1, ['publication-identity', 'research', 'data-record']);
  if (domain === 'mdpi.com') return result('peer-reviewed-publisher-page', 1, ['research', 'medical-evidence']);
  if (domain === 'ncbi.nlm.nih.gov') return result('public-research-bibliography', 1, ['research', 'publication-list']);
  if (domain === 'google.com' && url.pathname.includes('/maps')) return result('public-location-and-review-profile', 2, ['location', 'local-entity', 'public-feedback'], 'time-sensitive');
  if (domain === 'zenodo.org') return result('scholarly-data-repository', 2, ['research-data', 'persistent-record']);
  if (domain === 'wikidata.org') return result('collaborative-open-knowledge-record', 3, ['entity-linking', 'name-disambiguation'], 'periodic-review');
  if (domain === 'openstreetmap.org') return result('open-geospatial-record', 3, ['location', 'geospatial-identity'], 'periodic-review');
  if (domain === 'github.com') return result('public-technical-repository', 3, ['technical-provenance', 'public-artifact'], 'periodic-review');
  if (['drdr.ir', 'doctor-yab.ir', 'nobat19.com'].includes(domain)) return result('third-party-doctor-profile', 3, ['identity-corroboration', 'location'], 'time-sensitive');
  if (domain === 'instagram.com') return result('official-social-profile', 4, ['identity-corroboration', 'contact'], 'time-sensitive');
  if (domain.endsWith('.gov') || domain.endsWith('.gov.ir')) return result('government-source', 1, ['regulatory', 'public-information'], 'periodic-review');
  if (domain.endsWith('.edu') || domain.endsWith('.ac.ir')) return result('academic-source', 2, ['medical-evidence', 'education'], 'periodic-review');
  return result('external-reference', 3, ['context'], 'periodic-review');
}

export function extractCitationRecords(raw: string, headings: MarkdownHeading[]) {
  const chunks = buildSearchChunks(raw, headings);
  const records = new Map<string, { url: string; anchorTexts: string[]; sectionIds: string[]; sectionTitles: string[] }>();
  for (const chunk of chunks) {
    const matches = [...chunk.markdown.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)];
    for (const match of matches) {
      const url = match[2];
      const current = records.get(url) ?? { url, anchorTexts: [], sectionIds: [], sectionTitles: [] };
      current.anchorTexts.push(match[1]);
      current.sectionIds.push(chunk.id);
      current.sectionTitles.push(chunk.title);
      records.set(url, current);
    }
  }
  return [...records.values()].map((record) => ({
    ...record,
    ...classifyCitationUrl(record.url),
    anchorTexts: [...new Set(record.anchorTexts)],
    sectionIds: [...new Set(record.sectionIds)],
    sectionTitles: [...new Set(record.sectionTitles)],
  }));
}

export function getGroupForHeading(title: string) {
  return getTopicGroup(title);
}
