import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'dist', 'page-context.json');
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

if (!fs.existsSync(file)) {
  fail('missing dist/page-context.json');
} else {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.schema !== 'ghezelbash.page_context.astro.v1') fail('invalid page context schema');
  if (!Array.isArray(data.pages) || data.pages.length < 8) fail('page context has too few pages');

  for (const page of data.pages || []) {
    if (!page.path || !page.url || !page.kind) fail('page context entry missing required fields');
    if (!Array.isArray(page.schemaTargets) || page.schemaTargets.length < 2) fail(`page context missing schema targets for ${page.path}`);
    if (!Array.isArray(page.breadcrumbs) || page.breadcrumbs.length < 1) fail(`page context missing breadcrumbs for ${page.path}`);
    if (!Array.isArray(page.outgoingLinks) || page.outgoingLinks.length < 1) fail(`page context missing outgoing links for ${page.path}`);
  }

  const servicePages = data.pages.filter((page) => page.kind === 'service');
  if (servicePages.length < 5) fail('page context missing service pages');
  for (const page of servicePages) {
    if (!page.schemaTargets.includes('Service')) fail(`service page missing Service schema target: ${page.path}`);
    if (!page.schemaTargets.includes('FAQPage')) fail(`service page missing FAQPage schema target: ${page.path}`);
  }
}

if (failed) process.exit(1);
console.log('Page context validation passed');
