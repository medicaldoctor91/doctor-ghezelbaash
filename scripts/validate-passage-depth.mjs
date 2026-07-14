import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homepageArticleSubsections } from '../src/domain/homepage-article-registry.mjs';
import { homepageSubsectionSummaries } from '../src/domain/homepage-subsection-summaries.mjs';

const homepage = readFileSync(join(process.cwd(), 'dist', 'index.html'), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const plain = (value) => value
  .replace(/<script[\s\S]*?<\/script>/giu, ' ')
  .replace(/<style[\s\S]*?<\/style>/giu, ' ')
  .replace(/<[^>]+>/gu, ' ')
  .replace(/&[a-zA-Z#0-9]+;/gu, ' ')
  .replace(/\s+/gu, ' ')
  .trim();
const words = (value) => plain(value).split(/\s+/u).filter(Boolean).length;
const positions = homepageArticleSubsections
  .map((subsection) => ({ ...subsection, position: homepage.indexOf(`id="${subsection.id}"`) }))
  .sort((a, b) => a.position - b.position);
const passageWords = {};

for (let index = 0; index < positions.length; index += 1) {
  const subsection = positions[index];
  check(subsection.position >= 0, `subsection missing from final HTML: ${subsection.id}`);
  if (subsection.position < 0) continue;
  const later = positions.slice(index + 1).find((item) => item.position > subsection.position)?.position;
  const parentEnd = homepage.indexOf('</section>', subsection.position);
  const end = later && later < parentEnd ? later : parentEnd;
  const count = words(homepage.slice(subsection.position, end));
  passageWords[subsection.id] = count;
  check(count >= 40, `${subsection.id}: independent H3 passage is too thin (${count} words)`);
  check(!homepage.includes(`href="#${subsection.id}">${subsection.id}</a>`), `${subsection.id}: raw fragment ID is exposed as link text`);
}

for (const [subsectionId, summary] of Object.entries(homepageSubsectionSummaries)) {
  check(homepage.includes(summary), `${subsectionId}: required independent summary is absent`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures, passageWords }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  minimumPassageWords: Math.min(...Object.values(passageWords)),
  subsectionCount: Object.keys(passageWords).length,
  supplementalSummaries: Object.keys(homepageSubsectionSummaries).length,
}, null, 2));
