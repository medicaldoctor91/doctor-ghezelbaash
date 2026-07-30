from __future__ import annotations

import base64
import hashlib
import json
import re
from pathlib import Path

ROOT = Path.cwd()
BASE = 'https://www.ghezelbaash.ir/'
CANONICAL_CLINIC_FA = 'کلینیک زیبایی دکتر سعید قزلباش'
LEGACY_CLINIC_FA = 'کلینیک دکتر سعید قزلباش'


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_required(text: str, old: str, new: str, *, label: str, minimum: int = 1) -> str:
    count = text.count(old)
    if count < minimum:
        raise RuntimeError(f'{label}: expected at least {minimum} occurrence(s), found {count}: {old!r}')
    return text.replace(old, new)


def hrefs(text: str) -> list[str]:
    return re.findall(r'\bhref\s*=\s*["\']([^"\']+)["\']', text, flags=re.I)


index_path = 'src/pages/index.md'
index_before = read(index_path)
index = index_before.replace(LEGACY_CLINIC_FA, CANONICAL_CLINIC_FA)

hero_pattern = re.compile(
    r'(<img\s+[^>]*src="/media/images/physician/saeed-ghezelbash-portrait-delivery-640\.webp"[^>]*)(/>)',
    re.I | re.S,
)
hero_match = hero_pattern.search(index)
if not hero_match:
    raise RuntimeError('canonical hero image element was not found')
hero_tag = hero_match.group(1)
hero_tag = replace_required(hero_tag, 'loading="lazy"', 'loading="eager"', label='hero loading')
hero_tag = replace_required(hero_tag, 'fetchpriority="low"', 'fetchpriority="high"', label='hero priority')
index = index[:hero_match.start(1)] + hero_tag + index[hero_match.end(1):]

project_sentence = 'The project publishes canonical entity identifiers, public clinic information, service taxonomy, linked-source relationships and reusable JSON and JSON-LD files. The'
project_replacement = 'The project publishes canonical entity identifiers, public clinic information, service taxonomy, linked-source relationships and reusable JSON and JSON-LD files. The current live knowledge graph is version 1.2.1; version 1.0.0 remains the archived DOI release. The'
index = replace_required(index, project_sentence, project_replacement, label='structured-data live version sentence')

facts_marker = '<dt><strong>Published release</strong></dt>\n<dd><a href="https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/v1.0.0">Version 1.0.0</a> — 25 February 2026</dd>'
facts_replacement = '<dt><strong>Current live graph version</strong></dt>\n<dd>Version 1.2.1 — synchronized canonical JSON-LD and Turtle serializations</dd>\n\n<dt><strong>Archived DOI release</strong></dt>\n<dd><a href="https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/v1.0.0">Version 1.0.0</a> — 25 February 2026</dd>'
index = replace_required(index, facts_marker, facts_replacement, label='structured-data version facts')
index = replace_required(index, '<strong>Preferred citation:</strong>', '<strong>Archived DOI release citation:</strong>', label='structured-data citation label')

if hrefs(index_before) != hrefs(index):
    raise RuntimeError('existing index.md hyperlink destinations changed')
write(index_path, index)


def full_projection(markdown: str) -> str:
    body = re.sub(r'\A---\r?\n[\s\S]*?\r?\n---\r?\n?', '', markdown, count=1)
    body = re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', body, flags=re.I)
    body = re.sub(r'<style\b[^>]*>[\s\S]*?</style>', '', body, flags=re.I)
    body = re.sub(r'<script\b[^>]*/\s*>', '', body, flags=re.I)
    body = re.sub(r'\s+type=["\']application/ld\+json["\']', '', body, flags=re.I)
    body = re.sub(r'\n{3,}', '\n\n', body).strip()
    return (
        '# Dr. Saeed Ghezelbash — Full canonical page export\n\n'
        f'Canonical: {BASE}\n'
        f'About: {BASE}#saeed-ghezelbash\n'
        f'Source: {BASE}\n'
        'Language: fa-IR\n'
        'Indexing: noindex, follow\n'
        'Purpose: deterministic machine-readable projection of the complete canonical page content\n\n'
        '---\n\n' + body + '\n'
    )


write('public/llms-full.txt', full_projection(index))

full_path = 'public/graph.jsonld'
full_data = json.loads(read(full_path))
action_targets_before = {
    node.get('@id'): node.get('target')
    for node in full_data.get('@graph', [])
    if isinstance(node, dict) and str(node.get('@type', '')).endswith('Action')
}


def replace_strings(value):
    if isinstance(value, str):
        return value.replace(LEGACY_CLINIC_FA, CANONICAL_CLINIC_FA)
    if isinstance(value, list):
        return [replace_strings(item) for item in value]
    if isinstance(value, dict):
        return {key: replace_strings(item) for key, item in value.items()}
    return value


full_data = replace_strings(full_data)
action_targets_after = {
    node.get('@id'): node.get('target')
    for node in full_data.get('@graph', [])
    if isinstance(node, dict) and str(node.get('@type', '')).endswith('Action')
}
if action_targets_before != action_targets_after:
    raise RuntimeError('Full Graph action targets changed')
full_min = json.dumps(full_data, ensure_ascii=False, separators=(',', ':'))
write(full_path, full_min)
write('public/graph.ttl', read('public/graph.ttl').replace(LEGACY_CLINIC_FA, CANONICAL_CLINIC_FA))

head_path = 'src/data/semantic/head-graph.min.jsonld'
head_data = json.loads(read(head_path))
full_nodes = [node for node in full_data.get('@graph', []) if isinstance(node, dict) and node.get('@id')]
full_by = {node['@id']: node for node in full_nodes}
head_nodes = [node for node in head_data.get('@graph', []) if isinstance(node, dict) and node.get('@id')]
head_order = [node['@id'] for node in head_nodes]
head_by = {node['@id']: node for node in head_nodes}

question_fragments = [
    'question-botox-mechanism-indications-and-limitations',
    'question-botox-doctor-selection-criteria-kermanshah',
    'question-filler-volume-shadow-and-proportion-assessment',
    'question-lip-filler-migration-causes',
    'question-filler-vascular-occlusion',
    'question-filler-doctor-selection-criteria-kermanshah',
    'question-thread-lift-vs-surgical-facelift-decision',
    'question-thread-lift-doctor-selection-criteria-kermanshah',
    'question-melasma-recurrence-and-multimodal-treatment',
    'question-subcision-acne-scar-candidacy',
    'question-hair-loss-red-flags',
    'question-hair-loss-doctor-selection-criteria-kermanshah',
    'question-revision-decision-wait-correct-dissolve-refer',
    'question-revision-intake-information',
    'question-jawline-and-submental-doctor-selection-criteria-kermanshah',
    'question-skin-rejuvenation-doctor-selection-criteria',
]
selected_ids: list[str] = []
for fragment in question_fragments:
    qid = BASE + '#' + fragment
    question = full_by.get(qid)
    if not question:
        raise RuntimeError(f'selected Question missing from Full Graph: {qid}')
    selected_ids.append(qid)
    accepted = question.get('acceptedAnswer')
    aid = accepted.get('@id') if isinstance(accepted, dict) else None
    if not aid or aid not in full_by:
        raise RuntimeError(f'selected Question has no resolvable acceptedAnswer: {qid}')
    selected_ids.append(aid)

for node in full_nodes:
    types = node.get('@type', [])
    types = [types] if isinstance(types, str) else types
    if 'VideoObject' in types or any(str(t).endswith('Action') for t in types):
        selected_ids.append(node['@id'])

for identifier in selected_ids:
    if identifier not in head_by:
        head_order.append(identifier)
    head_by[identifier] = full_by[identifier]
head_data['@graph'] = [head_by[identifier] for identifier in head_order]
head_min = json.dumps(head_data, ensure_ascii=False, separators=(',', ':'))
write(head_path, head_min)

head_component_path = 'src/components/DocumentHead.astro'
doc_head = read(head_component_path)
preload_marker = '<link rel="canonical" href={canonicalURL} />'
preload_block = '''<link rel="canonical" href={canonicalURL} />
<link
  rel="preload"
  as="image"
  href="/media/images/physician/saeed-ghezelbash-portrait-delivery-640.webp"
  type="image/webp"
  imagesrcset="/media/images/physician/saeed-ghezelbash-portrait-delivery-640.webp 640w, /media/images/physician/saeed-ghezelbash-portrait-delivery-960.webp 960w, /media/images/physician/saeed-ghezelbash-portrait-1600.webp 1600w"
  imagesizes="(max-width: 720px) calc(100vw - 4rem), (max-width: 960px) calc(100vw - 5rem), 960px"
  fetchpriority="high"
/>'''
doc_head = replace_required(doc_head, preload_marker, preload_block, label='hero preload')
manifest_marker = '<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />'
doc_head = replace_required(doc_head, manifest_marker, manifest_marker + '\n<link rel="manifest" href="/site.webmanifest" />', label='manifest discovery')
write(head_component_path, doc_head)

dock_path = 'src/components/FloatingActionDock.astro'
dock_before = read(dock_path)
maps_constant_before = re.search(r"const maps = '([^']+)';", dock_before)
if not maps_constant_before:
    raise RuntimeError('maps constant not found in FloatingActionDock')
dock = dock_before
for old, new in {
    'دسترسی سریع به دکتر سعید قزلباش و مطب': 'دسترسی سریع به دکتر سعید قزلباش و کلینیک زیبایی',
    'تماس با مطب دکتر سعید قزلباش': 'تماس با کلینیک زیبایی دکتر سعید قزلباش',
    'تماس با مطب': 'تماس با کلینیک زیبایی',
    'مسیریابی به مطب دکتر سعید قزلباش در Google Maps': 'مسیریابی به کلینیک زیبایی دکتر سعید قزلباش در Google Maps',
    'مسیر مطب': 'مسیر کلینیک زیبایی',
}.items():
    dock = replace_required(dock, old, new, label='floating dock canonical naming')
maps_constant_after = re.search(r"const maps = '([^']+)';", dock)
if not maps_constant_after or maps_constant_before.group(1) != maps_constant_after.group(1):
    raise RuntimeError('FloatingActionDock maps destination changed')
write(dock_path, dock)

not_found = '''---
import '../styles/global.css';
import FloatingActionDock from '../components/FloatingActionDock.astro';
---
<!doctype html>
<html lang="fa-IR" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>صفحه پیدا نشد | دکتر سعید قزلباش</title>
    <meta name="description" content="صفحه درخواستی پیدا نشد؛ از مسیرهای اصلی وب‌سایت رسمی دکتر سعید قزلباش و کلینیک زیبایی دکتر سعید قزلباش استفاده کنید." />
    <meta name="robots" content="noindex, follow" />
    <meta name="theme-color" content="#075244" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon-48x48.png" sizes="48x48" type="image/png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
    <link rel="manifest" href="/site.webmanifest" />
  </head>
  <body>
    <main id="main-content" class="not-found-page">
      <p class="not-found-page__code" aria-hidden="true">404</p>
      <h1>این صفحه پیدا نشد؛ مسیر اصلی همچنان در دسترس است</h1>
      <p>این نشانی در وب‌سایت رسمی دکتر سعید قزلباش وجود ندارد. برای ادامه، مستقیماً به بخش موردنظر در راهنمای پزشکی زیبایی یا اطلاعات کلینیک زیبایی دکتر سعید قزلباش بروید.</p>
      <nav class="not-found-page__links" aria-label="مسیرهای اصلی وب‌سایت دکتر سعید قزلباش">
        <a href="/#botox">بوتاکس</a>
        <a href="/#filler">فیلر</a>
        <a href="/#thread-lift">لیفت نخ</a>
        <a href="/#acne-pigmentation-and-scars">جوش، لک و اسکار</a>
        <a href="/#hair-loss">ریزش مو</a>
        <a href="/#aesthetic-treatment-failure-from-diagnostic-error">اصلاح نتایج و نظر دوم</a>
        <a href="/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah">کلینیک زیبایی دکتر سعید قزلباش</a>
      </nav>
      <div class="not-found-page__actions">
        <a class="not-found-page__primary" href="/">بازگشت به صفحه اصلی</a>
        <a href="tel:+989308209494">تماس با کلینیک زیبایی</a>
        <a href="https://ig.me/m/doctor.ghezelbaash" rel="external">ارزیابی اولیه آنلاین</a>
        <a href="https://www.google.com/maps?cid=12350483144643112463" rel="external">مسیریابی در Google Maps</a>
      </div>
    </main>
    <FloatingActionDock />
  </body>
</html>

<style>
  .not-found-page { min-height: 100svh; display: grid; align-content: center; gap: 1rem; padding-block: clamp(2rem, 8vw, 7rem) 8rem; }
  .not-found-page__code { margin: 0; color: var(--accent); font-size: clamp(4rem, 18vw, 10rem); font-weight: 900; line-height: 0.8; letter-spacing: -0.06em; }
  .not-found-page h1 { max-width: 18ch; margin-block: 0.4rem 0.8rem; }
  .not-found-page__links, .not-found-page__actions { display: flex; flex-wrap: wrap; gap: 0.7rem; max-width: var(--reading-measure); }
  .not-found-page__links { margin-block: 1rem; padding: 1rem; border: 1px solid var(--line); border-radius: 1rem; background: var(--surface-soft); }
  .not-found-page__links a, .not-found-page__actions a { display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0.55rem 0.85rem; border: 1px solid #cfe3dc; border-radius: 999px; background: #fff; font-weight: 720; text-decoration: none; }
  .not-found-page__actions .not-found-page__primary { background: var(--accent-strong); color: #fff; }
</style>
'''
write('src/pages/404.astro', not_found)

headers_path = 'public/_headers'
headers = read(headers_path)
headers = replace_required(headers, '/404.html\n  X-Robots-Tag: noindex, nofollow', '/404.html\n  X-Robots-Tag: noindex, follow', label='404 X-Robots policy')
script_hash = base64.b64encode(hashlib.sha256(head_min.encode('utf-8')).digest()).decode('ascii')
headers, count = re.subn(r"script-src 'self' 'sha256-[^']+'", f"script-src 'self' 'sha256-{script_hash}'", headers, count=1)
if count != 1:
    raise RuntimeError('homepage CSP script hash was not replaced exactly once')
write(headers_path, headers)

print('Applied approved entity-authority upgrades without changing existing hyperlink destinations.')
