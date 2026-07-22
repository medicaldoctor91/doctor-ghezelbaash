import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('has no automatically detectable WCAG 2.2 A/AA violations', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The axe ruleset is engine-independent; run it once.');
  test.setTimeout(120_000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('details').evaluateAll((details) => {
    details.forEach((detail) => {
      (detail as HTMLDetailsElement).open = true;
    });
  });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations,
    results.violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.help} (${violation.nodes.length} node(s))`,
      )
      .join('\n'),
  ).toEqual([]);
});
