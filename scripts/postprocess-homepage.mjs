import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homepageSections } from '../src/domain/homepage-sections.mjs';

const homepagePath = join(process.cwd(), 'dist', 'index.html');
const source = readFileSync(homepagePath, 'utf8');
const withoutLegacyIds = source.replace(/\s+id="clinical-decision-model-[^"]+"/gu, '');
let cleaned = withoutLegacyIds;
let registryTitlesApplied = 0;

for (const section of homepageSections) {
  const headingPattern = new RegExp(`(<h2\\b[^>]*id="${section.id}-title"[^>]*>)[\\s\\S]*?(<\\/h2>)`, 'u');
  if (!headingPattern.test(cleaned)) throw new Error(`Canonical Homepage H2 is absent from final HTML: ${section.id}`);
  cleaned = cleaned.replace(headingPattern, `$1${section.title}$2`);
  registryTitlesApplied += 1;
}

writeFileSync(homepagePath, cleaned);

console.log(JSON.stringify({
  status: 'pass',
  removedLegacyNumericIds: (source.match(/\s+id="clinical-decision-model-[^"]+"/gu) ?? []).length,
  registryTitlesApplied,
}, null, 2));
