import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";
import { withStaticSite, waitForPageLayout } from "./lib/render-measurement.mjs";

const directory = path.resolve(process.argv[2] || "dist");

await withStaticSite(directory, async (url) => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 936 },
      reducedMotion: "reduce",
      locale: "fa-IR",
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      });
      await page.goto(url, { waitUntil: "load" });
      await waitForPageLayout(page);

      const opener = page.locator("[data-guide-search-open]");
      const dialog = page.locator("#guide-search");
      const input = page.locator("#guide-search-input");
      await opener.click();
      await expectDialogState(page, true);
      assert.equal(await page.evaluate(() => document.activeElement?.id), "guide-search-input");

      const accessibilitySession = await context.newCDPSession(page);
      const accessibilityTree = await accessibilitySession.send("Accessibility.getFullAXTree");
      const accessibleNodes = accessibilityTree.nodes || [];
      const accessibleName = (node) => String(node?.name?.value || "");
      const dialogNode = accessibleNodes.find((node) => node.role?.value === "dialog");
      const searchboxNode = accessibleNodes.find(
        (node) => ["searchbox", "textbox"].includes(node.role?.value) && /نام درمان/u.test(accessibleName(node)),
      );
      const closeButtonNode = accessibleNodes.find(
        (node) => node.role?.value === "button" && accessibleName(node) === "بستن جست‌وجو",
      );
      assert.ok(dialogNode, "open dialog must be exposed in the browser accessibility tree");
      assert.match(accessibleName(dialogNode), /جست‌وجوی سریع/u);
      assert.ok(searchboxNode, "labelled search input must be exposed as a searchbox/textbox");
      assert.ok(closeButtonNode, "close control must have an accessible name");
      await accessibilitySession.detach();

      for (let index = 0; index < 5; index++) {
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(() => Boolean(document.activeElement?.closest("dialog"))),
          true,
          "modal keyboard focus must remain inside dialog",
        );
      }
      await page.keyboard.press("Escape");
      await expectDialogState(page, false);
      assert.equal(await page.evaluate(() => document.activeElement?.matches("[data-guide-search-open]")), true);

      await opener.click();
      await dialog.locator("[data-guide-search-close]").click();
      await expectDialogState(page, false);
      assert.equal(await page.evaluate(() => document.activeElement?.matches("[data-guide-search-open]")), true);

      await opener.click();
      await input.fill("بوتاکس");
      const result = dialog.locator(".guide-search__results a").first();
      await result.waitFor();
      const targetId = await result.getAttribute("href");
      assert.ok(targetId?.startsWith("#"), "search result must target a same-document fragment");
      await result.click();
      await expectDialogState(page, false);
      const targetFragment = targetId.slice(1);
      assert.equal(await page.evaluate((id) => document.activeElement?.id, targetFragment), targetFragment);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }

    const noJs = await browser.newContext({
      viewport: { width: 390, height: 936 },
      javaScriptEnabled: false,
      locale: "fa-IR",
    });
    try {
      const page = await noJs.newPage();
      await page.goto(`${url}#aesthetic-medicine-table-of-contents`, { waitUntil: "load" });
      const state = await page.evaluate(() => ({
        toc: Boolean(document.querySelector("#aesthetic-medicine-table-of-contents")),
        searchButton: Boolean(document.querySelector("[data-guide-search-open]")),
        stylesheet: [...document.styleSheets].some((sheet) => sheet.href?.includes("/assets/site.")),
      }));
      assert.deepEqual(state, { toc: true, searchButton: true, stylesheet: true });
    } finally {
      await noJs.close();
    }
    console.log(JSON.stringify({ stage: "DIST_INTERACTION_CONTRACT", modal: "PASS", keyboard: "PASS", screenReader: "PASS", noJavaScript: "PASS", integrity: "PASS" }, null, 2));
  } finally {
    await browser.close();
  }
});

async function expectDialogState(page, open) {
  await page.waitForFunction((expected) => document.getElementById("guide-search")?.open === expected, open);
}
