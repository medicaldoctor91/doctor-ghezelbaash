import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { validateContentPackage } from './validate-content-package.mjs';

const root = mkdtempSync(resolve(tmpdir(), 'ghezelbaash-content-contract-'));
const packageRoot = resolve(root, 'ghezelbaash-content-final');
const files = new Map();
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const add = (path, value) => files.set(path, value);

const visibleMarkdown = [
  '00-hero.md',
  '01-doctor.md',
  '02-clinic.md',
  '03-evidence.md',
  '04-diagnostic-framework.md',
  '05-selection-criteria.md',
  '06-anatomic-atlas-intro.md',
  '07-method-atlas-intro.md',
  '08-complications-and-revision.md',
  '09-local-national.md',
  '10-references.md',
  '11-contact.md',
];

for (const [index, name] of visibleMarkdown.entries()) {
  const heading = index === 0 ? '# راهنمای انتخاب آگاهانه در پزشکی زیبایی' : `## بخش نمونه ${index}`;
  add(`visible/${name}`, `${heading}\n\nاین بدنهٔ آزمایشی روشن می‌کند که انتخاب درست به شناخت مسئله، محدودیت روش و ارزیابی دقیق وابسته است.\n`);
}
add('visible/topics/sample-topic.md', '## یک موضوع مستقل\n\nاین توضیح آزمایشی، سازوکار روش و مرز نتیجهٔ قابل انتظار را با زبان روشن و مستقل بیان می‌کند.\n');

const source = {
  source_id: 'SRC-ONE',
  title: 'منبع نمونه',
  publisher: 'ناشر نمونه',
  url: 'https://example.org/source',
  source_type: 'primary-reference',
  primary_or_secondary: 'primary',
  accessed_at: '2026-07-16',
  supports: ['ادعای نمونه'],
};
const faq = Array.from({ length: 80 }, (_, index) => ({
  id: `faq-${index + 1}`,
  question: `پرسش آزمایشی شماره ${index + 1} چیست؟`,
  answer_md: 'پاسخ مستقیم این است که تصمیم به ارزیابی علت، شرایط فرد و محدودیت واقعی هر روش وابسته است.',
  source_ids: ['SRC-ONE'],
  topic_ids: ['sample-topic'],
  intent_id: 'intent-one',
}));

add('visible/faq.json', json({ items: faq }));
add('visible/comparisons.json', json({ items: [{
  id: 'comparison-one',
  title: 'مقایسهٔ دو مسیر',
  intro_md: 'این دو مسیر برای مسئله‌های یکسان طراحی نشده‌اند.',
  columns: ['معیار', 'روش نخست', 'روش دوم'],
  rows: [['لایهٔ هدف', 'سطحی', 'عمقی']],
  takeaway_md: 'انتخاب نهایی از نوع مسئله شروع می‌شود.',
}] }));
add('visible/videos.json', json({ items: [{
  id: 'video-one',
  title: 'ویدئوی آموزشی نمونه',
  summary_md: 'این خلاصه تفاوت دو انتخاب را روشن می‌کند.',
  caption: 'نمونهٔ آموزشی',
  poster_alt: 'نمای ویدئوی آموزشی',
}] }));

add('NON_VISIBLE_README.md', '# Internal package notes\n');
add('facts/entities.json', json({
  doctor: { entity_key: 'doctor', name: 'پزشک نمونه', google_knowledge_graph_id: '/g/doctor', wikidata_id: 'Q1', same_as: ['https://example.org/doctor'], source_ids: ['SRC-ONE'], facts: { city: 'کرمانشاه' } },
  clinic: { entity_key: 'clinic', name: 'کلینیک نمونه', google_knowledge_graph_id: '/g/clinic', wikidata_id: 'Q2', same_as: ['https://example.org/clinic'], source_ids: ['SRC-ONE'], facts: { city: 'کرمانشاه' } },
}));
add('facts/claim-permissions.json', json({ items: [{ topic_id: 'sample-topic', allowed_claims: [], forbidden_claims: ['ادعای اجرای تأییدنشده'], evidence_source_ids: ['SRC-ONE'], verified_at: '2026-07-16' }] }));
add('facts/sources.json', json({ items: [source] }));
add('facts/claim-source-map.jsonl', `${JSON.stringify({ claim_id: 'claim-one', visible_file: 'visible/00-hero.md', paragraph_or_field: 'پاراگراف نخست', claim_summary: 'انتخاب وابسته به ارزیابی است', source_ids: ['SRC-ONE'], support_level: 'direct' })}\n`);
add('facts/media.json', json({ items: [{ id: 'video-one', transcript_status: 'unavailable' }] }));
add('retrieval/passage-plan.json', json({ items: [{ passage_id: 'passage-one', source_file: 'visible/00-hero.md', start_heading_or_field: 'عنوان', end_heading_or_field: 'پایان بدنه', primary_entity_ids: ['doctor'], topic_ids: ['sample-topic'], intent_ids: ['intent-one'], source_ids: ['SRC-ONE'] }] }));
add('retrieval/aliases.json', json({ items: [{ alias: 'پزشک نمونه', normalized: 'پزشک نمونه', language: 'fa-IR', target_type: 'entity', target_id: 'doctor' }] }));
add('retrieval/intent-map.json', json({ items: [{ intent_id: 'intent-one', label: 'انتخاب روش', aliases: ['انتخاب درمان'], primary_block_ids: ['sample-topic'], supporting_block_ids: [] }] }));
add('validation/coverage-matrix.json', json({ items: [{ id: 'sample-topic', primary_block_id: 'sample-topic', supporting_block_ids: [], source_ids: ['SRC-ONE'], aliases: ['موضوع نمونه'], coverage_status: 'complete' }] }));
add('validation/blocking-facts.json', json({ items: [{ id: 'caption-one', type: 'caption', status: 'deferred' }] }));
add('validation/report.md', '# Validation report\n\nPASS\n');

const expectedRole = (path) => path.startsWith('visible/') ? 'renderable' : path.startsWith('facts/') || path === 'NON_VISIBLE_README.md' ? 'internal-fact' : path.startsWith('retrieval/') ? 'retrieval-plan' : 'validation-only';
const expectedFormat = (path) => path.endsWith('.jsonl') ? 'jsonl' : path.endsWith('.json') ? 'json' : 'markdown';
const renderFields = (path) => path.startsWith('visible/') && path.endsWith('.md') ? ['body'] : path === 'visible/faq.json' ? ['question', 'answer_md'] : path === 'visible/comparisons.json' ? ['title', 'intro_md', 'columns', 'rows', 'takeaway_md'] : path === 'visible/videos.json' ? ['title', 'summary_md', 'caption', 'poster_alt'] : [];
const digest = (value) => createHash('sha256').update(value).digest('hex');

try {
  for (const [path, value] of files) {
    const target = resolve(packageRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, value, 'utf8');
  }
  const manifest = {
    package_name: 'ghezelbaash-content-final',
    schema_version: 1,
    files: [...files.entries()].map(([path, value]) => ({
      path,
      role: expectedRole(path),
      language: path.startsWith('visible/') ? 'fa-IR' : 'und',
      format: expectedFormat(path),
      render_fields: renderFields(path),
      strip_frontmatter: path.startsWith('visible/') && path.endsWith('.md'),
      sha256: digest(value),
    })),
  };
  writeFileSync(resolve(packageRoot, 'package-manifest.json'), json(manifest), 'utf8');

  const valid = validateContentPackage(packageRoot);
  if (!valid.passed) throw new Error(`Valid fixture was rejected:\n${valid.errors.join('\n')}`);

  const faqPath = resolve(packageRoot, 'visible/faq.json');
  const invalidFaq = JSON.parse(readFileSync(faqPath, 'utf8'));
  invalidFaq.items.pop();
  writeFileSync(faqPath, json(invalidFaq), 'utf8');
  const invalid = validateContentPackage(packageRoot);
  if (invalid.passed || !invalid.errors.some((error) => error.includes('FAQ count must be exactly 80'))) throw new Error('Invalid FAQ fixture was not rejected by the intended gate.');

  process.stdout.write('Content-package validator contract tests passed.\n');
} finally {
  rmSync(root, { recursive: true, force: true });
}
