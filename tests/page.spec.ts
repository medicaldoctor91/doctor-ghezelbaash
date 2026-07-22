import { expect, test } from '@playwright/test';

const canonical = 'https://www.ghezelbaash.ir/';

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
});

test('keeps the doctor as the single page identity', async ({ page }) => {
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa-IR');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('provides a working keyboard skip link', async ({ page }) => {
  const skipLink = page.locator('.skip-link');
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toHaveAttribute('href', '#main-content');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main-content$/u);
});

test('resolves every in-page link and table-of-contents target', async ({ page }) => {
  const result = await page.evaluate(() => {
    const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
    const tableOfContentsLinks = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        '#aesthetic-medicine-table-of-contents a[href^="#"]',
      ),
    ];
    const missing = links
      .map((link) => link.hash.slice(1))
      .filter((id) => !id || !document.getElementById(decodeURIComponent(id)));
    return { linkCount: links.length, missing, tocCount: tableOfContentsLinks.length };
  });
  expect(result.linkCount).toBeGreaterThan(100);
  expect(result.tocCount).toBe(15);
  expect(result.missing).toEqual([]);
});

test('keeps multilingual sections in their correct language direction', async ({ page }) => {
  const sections = [
    ['#iraqi-arabic-facial-aesthetic-doctor-section', 'ar-IQ', 'rtl'],
    ['#english-facial-aesthetic-doctor-section', 'en', 'ltr'],
    ['#sorani-kurdish-facial-aesthetic-doctor-section', 'ckb-IQ', 'rtl'],
    ['#doctor-ghezelbaash-structured-data-section', 'en', 'ltr'],
  ];
  for (const [selector, lang, dir] of sections) {
    await expect(page.locator(selector)).toHaveAttribute('lang', lang);
    await expect(page.locator(selector)).toHaveAttribute('dir', dir);
  }
});

test('does not overflow horizontally at the WCAG reflow width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.locator('details').evaluateAll((details) => {
    details.forEach((detail) => {
      (detail as HTMLDetailsElement).open = true;
    });
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('keeps anchor targets visible instead of hiding them under fixed UI', async ({ page }) => {
  await page.goto('/#botox', { waitUntil: 'domcontentloaded' });
  const positions = await page.evaluate(() => {
    const target = document.getElementById('botox');
    if (!target) return null;
    const fixedBottom = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          (style.position === 'fixed' || style.position === 'sticky') &&
          rect.top <= 1 &&
          rect.bottom > 0
        );
      })
      .reduce(
        (bottom, element) => Math.max(bottom, element.getBoundingClientRect().bottom),
        0,
      );
    return { targetTop: target.getBoundingClientRect().top, fixedBottom };
  });
  expect(positions).not.toBeNull();
  expect(positions!.targetTop).toBeGreaterThanOrEqual(positions!.fixedBottom - 1);
});

test('loads every image and preserves intrinsic dimensions', async ({ page }) => {
  const images = page.locator('img');
  const count = await images.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate((element) => {
          const htmlImage = element as HTMLImageElement;
          return htmlImage.complete && htmlImage.naturalWidth > 0;
        }),
      )
      .toBe(true);
  }
});

test('keeps contact and clinic route links exact', async ({ page }) => {
  await expect(page.locator('a[href="tel:+989308209494"]')).not.toHaveCount(0);
  await expect(
    page.locator('a[href="https://www.instagram.com/doctor.ghezelbaash/"]'),
  ).not.toHaveCount(0);
  await expect(
    page.locator('a[href="https://www.google.com/maps?cid=12350483144643112463"]'),
  ).not.toHaveCount(0);
});

test('has no runtime errors or failed same-origin responses', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    const responseUrl = new URL(response.url());
    if (responseUrl.origin === new URL(page.url()).origin && response.status() >= 400) {
      problems.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.reload({ waitUntil: 'load' });
  expect(problems).toEqual([]);
});

test('serves unknown routes as a non-indexable 404', async ({ page }) => {
  const response = await page.goto('/this-route-must-not-exist', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBe(404);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/u,
  );
});
