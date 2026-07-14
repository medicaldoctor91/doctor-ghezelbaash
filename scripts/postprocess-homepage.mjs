import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const homepagePath = join(process.cwd(), 'dist', 'index.html');
const source = readFileSync(homepagePath, 'utf8');
const cleaned = source.replace(/\s+id="clinical-decision-model-[^"]+"/gu, '');
writeFileSync(homepagePath, cleaned);

console.log(JSON.stringify({
  status: 'pass',
  removedLegacyNumericIds: (source.match(/\s+id="clinical-decision-model-[^"]+"/gu) ?? []).length,
}, null, 2));
