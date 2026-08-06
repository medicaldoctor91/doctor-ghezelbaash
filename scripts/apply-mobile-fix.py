from pathlib import Path
import re

page_path = Path('src/pages/index.md')
source = page_path.read_text()

if len(source.encode()) > 700_000 or '<h5' in source:
    heading_re = re.compile(r'(^<h([1-5])\b[^\n]*>.*?</h\2>\s*$)', re.M)
    parts = heading_re.split(source)
    output = [parts[0]]

    def first_answer(content: str) -> str:
        blocks = [block.strip() for block in re.split(r'\n\s*\n', content) if block.strip()]
        if not blocks:
            return ''
        block = blocks[0]
        limit = 1100
        if len(block) <= limit:
            return block
        prefix = suffix = ''
        inner = block
        if block.startswith('<p') and block.endswith('</p>'):
            opening_end = block.find('>') + 1
            prefix, suffix = block[:opening_end], '</p>'
            inner = block[opening_end:-4]
        elif block.startswith('<'):
            return block
        cut = max(320, limit - len(prefix) - len(suffix))
        sentence_end = max(inner.rfind(mark, 0, cut) for mark in ('.', '؟', '!', '؛'))
        if sentence_end < 300:
            sentence_end = cut - 1
        return prefix + inner[:sentence_end + 1].rstrip() + suffix

    for index in range(1, len(parts), 3):
        heading = parts[index]
        level = int(parts[index + 1])
        content = parts[index + 2]
        if level <= 3:
            output.append(heading + content)
        elif level == 4:
            answer = first_answer(content)
            output.append(heading + ('\n\n' + answer + '\n\n' if answer else '\n'))
        else:
            match = re.search(r'\bid="([^"]+)"', heading)
            if match:
                output.append(
                    f'<span id="{match.group(1)}" class="semantic-alias-anchor" aria-hidden="true"></span>\n'
                )

    candidate = ''.join(output)
    ids = set(re.findall(r'\bid="([^"]+)"', candidate))
    targets = set(re.findall(r'href="#([^"]+)"', candidate))
    broken = sorted(targets - ids)
    if broken:
        raise SystemExit(f'Broken fragment targets: {broken[:20]}')
    if len(candidate.encode()) > 700_000:
        raise SystemExit(f'Canonical Markdown remains too large: {len(candidate.encode())} bytes')
    if candidate.count('<h2') != 19 or candidate.count('<h3') != 158 or candidate.count('<h4') != 624:
        raise SystemExit('Topical heading inventory changed unexpectedly')
    page_path.write_text(candidate)

# Keep a small permanent regression contract instead of a performance-observability subsystem.
tests_path = Path('tests/dataset-entity.test.mjs')
tests = tests_path.read_text().rstrip()
budget_test = r'''

test('canonical page stays within the measured mobile content budget', async () => {
  const source = await readFile(pagePath, 'utf8');
  const sourceBytes = Buffer.byteLength(source, 'utf8');
  assert.ok(sourceBytes <= 700_000, `canonical Markdown exceeds mobile budget: ${sourceBytes} bytes`);
  assert.equal((source.match(/<h2\b/g) ?? []).length, 19);
  assert.equal((source.match(/<h3\b/g) ?? []).length, 158);
  assert.equal((source.match(/<h4\b/g) ?? []).length, 624);
  assert.equal((source.match(/<h5\b/g) ?? []).length, 0);

  const ids = new Set([...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const targets = new Set([...source.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]));
  for (const target of targets) assert.ok(ids.has(target), `broken fragment target: #${target}`);
});
'''
if 'canonical page stays within the measured mobile content budget' not in tests:
    tests_path.write_text(tests + budget_test + '\n')

live_path = Path('scripts/verify-live.mjs')
live = live_path.read_text()
marker = "  assert.match(body, /<html\\b[^>]*\\blang=[\"']fa-IR[\"']/i);"
insertion = """  const canonicalHtmlBytes = Buffer.byteLength(body, 'utf8');
  assert.ok(
    canonicalHtmlBytes <= 800_000,
    `live canonical HTML exceeds the mobile budget: ${canonicalHtmlBytes} bytes`,
  );

"""
if 'live canonical HTML exceeds the mobile budget' not in live:
    if marker not in live:
        raise SystemExit('verify-live insertion point not found')
    live_path.write_text(live.replace(marker, insertion + marker))

for temporary_path in [
    '.github/workflows/mobile-source-audit.yml',
    '.github/workflows/live-mobile-audit.yml',
    '.github/workflows/apply-mobile-fix.yml',
    'scripts/apply-mobile-fix.py',
]:
    Path(temporary_path).unlink(missing_ok=True)
