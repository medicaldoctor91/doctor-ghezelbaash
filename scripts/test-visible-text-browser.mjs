import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { CONTRACT_PATH, assertUnchanged, digest } from './lib/visible-text-contract.mjs';
import { withStaticSite, waitForPageLayout } from './lib/render-measurement.mjs';

const args = process.argv.slice(2);
const initialize = args[0] === '--initialize-baseline';
const directory = path.resolve(args[initialize ? 1 : 0] || 'dist');
const baselinePath = path.resolve(CONTRACT_PATH);
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
if (initialize && (!args.includes('--acknowledge-frozen-text') || baseline.browser)) throw new Error('Browser baseline requires explicit initialization and must not already exist.');
if (!initialize && !baseline.browser) throw new Error('CLOSED_VISIBLE_TEXT: actual-browser baseline missing; parser validation is not browser proof.');
if (initialize) {
  // The browser baseline must be captured from the same original bytes.
  for (const [name, original] of Object.entries(baseline.documents)) assertUnchanged(original.rawSha256, digest(await readFile(path.join(directory, name), 'utf8')), `original browser input ${name}`);
}

const actual = { engine: 'chromium', states: {} };
await withStaticSite(directory, async (url) => {
  const browser = await chromium.launch({ headless: true });
  actual.browserVersion = browser.version();
  try {
    for (const width of [390, 1440]) {
      for (const javascript of [false, true]) {
        const context = await browser.newContext({ viewport: { width, height: 936 }, javaScriptEnabled: javascript, locale: 'fa-IR', timezoneId: 'UTC', reducedMotion: 'reduce' });
        try {
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
          const key = `${width}/${javascript ? 'javascript' : 'no-javascript'}`;
          await page.goto(url, { waitUntil: 'load' });
          if (javascript) await waitForPageLayout(page);
          actual.states[`${key}/initial`] = await snapshot(page, context, javascript);
          // Expose every authored disclosure and measure all offscreen chunks.
          // This changes only the measurement state, never the shipped CSS.
          // addStyleTag waits on a script-driven load callback and hangs with
          // JavaScript disabled; this synchronous instrumentation works in both.
          await page.evaluate(() => {
            const style = document.createElement('style');
            style.textContent = '.render-chunk { content-visibility: visible !important; }';
            document.head.append(style);
          });
          await page.evaluate(() => document.querySelectorAll('details').forEach((node) => { node.open = true; }));
          await settle(page, javascript);
          actual.states[`${key}/disclosures-open`] = await snapshot(page, context, javascript);
          if (javascript) {
            await page.locator('[data-guide-search-open]').click();
            await page.waitForFunction(() => document.querySelector('#guide-search')?.open);
            actual.states[`${key}/search-open`] = await snapshot(page, context, javascript);
            for (const [state, query] of [['short', 'ب'], ['no-results', 'zzzzzzzzzzzzzzzz'], ['results', 'بوتاکس']]) {
              await page.locator('#guide-search-input').fill(query);
              await settle(page);
              actual.states[`${key}/search-${state}`] = await snapshot(page, context, javascript);
            }
          }
          await page.goto(`${url}404.html`, { waitUntil: 'load' });
          if (javascript) await waitForPageLayout(page);
          actual.states[`${key}/404`] = await snapshot(page, context, javascript);
          if (errors.length) throw new Error(`Visible-text browser resource/runtime errors: ${errors.join('; ')}`);
          console.log(`VISIBLE_TEXT_BROWSER_CAPTURED ${key}`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
});

if (initialize) {
  baseline.browser = actual;
  await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`VISIBLE_TEXT_BROWSER_BASELINE_CREATED ${Object.keys(actual.states).length} states, Chromium ${actual.browserVersion}`);
} else {
  assertUnchanged(baseline.browser.engine, actual.engine, 'browser engine');
  assertUnchanged(baseline.browser.browserVersion, actual.browserVersion, 'pinned browser version');
  assertUnchanged(Object.keys(baseline.browser.states), Object.keys(actual.states), 'browser state coverage');
  for (const [state, original] of Object.entries(baseline.browser.states)) assertUnchanged(original, actual.states[state], `browser ${state}`);
  console.log(`CLOSED_VISIBLE_TEXT_BROWSER PASS ${Object.keys(actual.states).length} states, Chromium ${actual.browserVersion}`);
}

async function settle(page, javascript = true) {
  if (javascript) await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  else await page.evaluate(() => document.documentElement.getBoundingClientRect().height);
}

async function snapshot(page, context, javascript) {
  await settle(page, javascript);
  const rendered = await page.evaluate(() => {
    const norm = (value) => String(value || '').normalize('NFC').replace(/\s+/gu, ' ').trim();
    const pseudo = [];
    for (const element of document.body.querySelectorAll('*')) {
      if (['SCRIPT', 'STYLE', 'TEMPLATE'].includes(element.tagName) || !element.checkVisibility()) continue;
      for (const kind of ['::before', '::after', '::marker']) {
        const content = getComputedStyle(element, kind).content;
        if (content && !['none', 'normal', '""', '" "'].includes(content)) pseudo.push([kind, norm(content)]);
      }
    }
    return { title: norm(document.title), text: norm(document.body.innerText), pseudo };
  });
  const session = await context.newCDPSession(page);
  let names;
  try {
    const { nodes } = await session.send('Accessibility.getFullAXTree');
    const byId = new Map(nodes.map((node) => [node.nodeId, node]));
    names = [];
    const visit = (node) => {
      if (!node) return;
      const name = String(node.name?.value || '').normalize('NFC').replace(/\s+/gu, ' ').trim();
      if (!node.ignored && name && node.role?.value !== 'InlineTextBox') names.push(name);
      for (const id of node.childIds || []) visit(byId.get(id));
    };
    visit(nodes.find((node) => node.role?.value === 'RootWebArea'));
  } finally {
    await session.detach();
  }
  return { title: rendered.title, renderedTextSha256: digest(rendered.text), renderedCharacters: rendered.text.length, generatedTextSha256: digest(rendered.pseudo), accessibilityNamesSha256: digest(names), accessibilityNameCount: names.length };
}
