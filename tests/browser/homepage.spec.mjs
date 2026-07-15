import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const canonicalH1 = 'دکتر سعید قزلباش؛ پزشک زیبایی، پوست و مو در کرمانشاه';
const screenshotDirectory = 'test-results/screenshots';

const collectRuntimeFailures = (page) => {
  const failures = [];
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown';
    failures.push(`requestfailed: ${request.method()} ${request.url()} ${failure}`);
  });
  return failures;
};

const assertNoHorizontalOverflow = async (page) => {
  const dimensions = await page.evaluate(() => ({
    document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    body: { scrollWidth: document.body.scrollWidth, clientWidth: document.body.clientWidth },
  }));
  expect(dimensions.document.scrollWidth).toBeLessThanOrEqual(dimensions.document.clientWidth + 1);
  expect(dimensions.body.scrollWidth).toBeLessThanOrEqual(dimensions.body.clientWidth + 1);
};

test('initial HTML, runtime and viewport remain stable', async ({ page }, testInfo) => {
  const failures = collectRuntimeFailures(page);
  const response = await page.goto('/', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa-IR');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(canonicalH1);
  await expect(page.locator('#mohammad-saeed-ghezelbash[data-main-entity="Person"]')).toHaveCount(1);
  await expect(page.locator('#dr-saeed-ghezelbash-aesthetic-clinic')).toHaveCount(1);
  await assertNoHorizontalOverflow(page);
  expect(failures).toEqual([]);

  if (['chromium', 'mobile-safari'].includes(testInfo.project.name)) {
    mkdirSync(screenshotDirectory, { recursive: true });
    await page.screenshot({ path: `${screenshotDirectory}/${testInfo.project.name}-hero.png`, fullPage: false });
  }
});

test('fragment focus, browser history and mobile navigation work progressively', async ({ page }) => {
  await page.goto('/#aesthetic-services-kermanshah', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#aesthetic-services-kermanshah')).toBeFocused();
  await expect(page.locator('[href="#aesthetic-services-kermanshah"][aria-current="location"]')).toHaveCount(2);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const desktopLink = page.locator('.home-header__links [href="#content-table"]');
  if (await desktopLink.isVisible()) {
    await desktopLink.click();
  } else {
    const summary = page.locator('.mobile-menu summary');
    await summary.click();
    await expect(summary).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#mobile-navigation [href="#content-table"]').click();
  }
  await expect(page).toHaveURL(/#content-table$/u);
  await expect(page.locator('#content-table')).toBeFocused();
  await page.goBack();
  await expect(page).not.toHaveURL(/#content-table$/u);
  await page.goForward();
  await expect(page).toHaveURL(/#content-table$/u);

  await page.setViewportSize({ width: 390, height: 844 });
  const summary = page.locator('.mobile-menu summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await assertNoHorizontalOverflow(page);
});

test('video posters do not load before need and activate near viewport', async ({ page }) => {
  const posterRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/videos/thumbnails/')) posterRequests.push(request.url());
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  expect(posterRequests).toEqual([]);
  const firstVideo = page.locator('video[data-deferred-poster]').first();
  await expect(firstVideo).toHaveAttribute('poster', /^data:image\/svg\+xml,/u);
  await firstVideo.scrollIntoViewIfNeeded();
  await expect.poll(() => posterRequests.length).toBeGreaterThan(0);
  await expect(firstVideo).toHaveAttribute('poster', /\/videos\/thumbnails\//u);
});

test('reduced motion and small-phone reflow remain usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const scrollBehavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
  expect(scrollBehavior).toBe('auto');
  await assertNoHorizontalOverflow(page);
  await expect(page.locator('#conversion-dock')).toBeVisible();
  const dockBox = await page.locator('#conversion-dock').boundingBox();
  expect(dockBox?.width ?? 0).toBeLessThanOrEqual(320);
});

test('JavaScript-disabled access keeps content, anchors and media fallback discoverable', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, locale: 'fa-IR' });
  const page = await context.newPage();
  const response = await page.goto('/#aesthetic-treatment-selection', { waitUntil: 'load' });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(canonicalH1);
  await expect(page.locator('#aesthetic-treatment-selection')).toHaveCount(1);
  await expect(page.locator('noscript img[src^="/videos/thumbnails/"]')).toHaveCount(12);
  await assertNoHorizontalOverflow(page);
  await context.close();
});

test('404 and duplicate Homepage path recover correctly', async ({ page, request }) => {
  const duplicate = await request.get('/index.html', { maxRedirects: 0 });
  expect(duplicate.status()).toBe(301);
  expect(duplicate.headers().location).toBe('/');

  const response = await page.goto('/missing-stage-11-route', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(404);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('این نشانی به جایی نمی‌رسد');
  await expect(page.locator('a[href="/"]')).toHaveCount(2);
  await expect(page.locator('a[href^="tel:+98"]')).toHaveCount(1);
  await expect(page.locator('a[href^="/#"]')).toHaveCount(5);
  await assertNoHorizontalOverflow(page);
});
