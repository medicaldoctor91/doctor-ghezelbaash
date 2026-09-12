import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";
import {
  withStaticSite,
  waitForPageLayout,
} from "./lib/render-measurement.mjs";

const directory = path.resolve(process.argv[2] || "dist");
const frames = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

// A computed outline alone does not prove visible keyboard focus. Account for
// the scrollport or clip of each ancestor and the actual outline footprint.
async function focusFootprint(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    const css = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const extent = parseFloat(css.outlineWidth) + parseFloat(css.outlineOffset);
    const footprint = {
      left: rect.left - extent,
      right: rect.right + extent,
      top: rect.top - extent,
      bottom: rect.bottom + extent,
    };
    const clipped = [];
    for (
      let ancestor = element.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      const style = getComputedStyle(ancestor);
      const bounds = ancestor.getBoundingClientRect();
      // clientLeft includes a possible RTL scrollbar. clientWidth/clientHeight
      // describe the padding-box scrollport, excluding borders and scrollbars.
      const client = {
        left: bounds.left + ancestor.clientLeft,
        top: bounds.top + ancestor.clientTop,
      };
      client.right = client.left + ancestor.clientWidth;
      client.bottom = client.top + ancestor.clientHeight;
      const paint = style.contain
        .split(/\s+/)
        .some((value) => ["paint", "content", "strict"].includes(value));
      const clipMarginValue = style.overflowClipMargin || "0px";
      const clipMarginMatch = clipMarginValue.match(
        /^(?:padding-box\s+)?([\d.]+)px$/,
      );
      if (
        !clipMarginMatch &&
        (paint || style.overflowX === "clip" || style.overflowY === "clip")
      ) {
        throw new Error(
          `Unsupported clip-edge value in focus test: ${clipMarginValue}`,
        );
      }
      const clipMargin = Number(clipMarginMatch?.[1] || 0);
      // overflow-clip-margin expands the paint/clip edge, never a scrolling or
      // hidden-overflow scrollport, even when paint containment also applies.
      const marginX = ["auto", "scroll", "hidden"].includes(style.overflowX)
        ? 0
        : clipMargin;
      const marginY = ["auto", "scroll", "hidden"].includes(style.overflowY)
        ? 0
        : clipMargin;
      const clipX =
        paint || ["auto", "scroll", "hidden", "clip"].includes(style.overflowX);
      const clipY =
        paint || ["auto", "scroll", "hidden", "clip"].includes(style.overflowY);
      if (
        (clipX &&
          (footprint.left < client.left - marginX - 0.5 ||
            footprint.right > client.right + marginX + 0.5)) ||
        (clipY &&
          (footprint.top < client.top - marginY - 0.5 ||
            footprint.bottom > client.bottom + marginY + 0.5))
      ) {
        clipped.push({
          tag: ancestor.tagName,
          id: ancestor.id,
          class: ancestor.className,
        });
      }
    }
    return {
      tag: element.tagName,
      id: element.id,
      visible: element.matches(":focus-visible"),
      outlineStyle: css.outlineStyle,
      outlineWidth: parseFloat(css.outlineWidth),
      clipped,
    };
  });
}

function assertVisibleFocus(focus, description, minimumWidth = 3) {
  assert.equal(
    focus.visible,
    true,
    `${description}: keyboard focus is missing`,
  );
  assert.equal(
    focus.outlineStyle,
    "solid",
    `${description}: explicit focus outline is missing`,
  );
  assert.ok(
    focus.outlineWidth >= minimumWidth,
    `${description}: focus outline is too thin`,
  );
  assert.deepEqual(
    focus.clipped,
    [],
    `${description}: focus outline is clipped`,
  );
}

await withStaticSite(directory, async (url) => {
  const browser = await chromium.launch({ headless: true });
  const runs = [];
  try {
    for (const width of [360, 412, 430, 768, 1440]) {
      const mobile = width < 768;
      const context = await browser.newContext({
        viewport: { width, height: 936 },
        deviceScaleFactor: mobile ? 1.75 : 1,
        isMobile: mobile,
        hasTouch: mobile,
        locale: "fa-IR",
        reducedMotion: "reduce",
      });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("response", (response) => {
          if (response.status() >= 400)
            errors.push(`${response.status()} ${response.url()}`);
        });
        await page.goto(url, { waitUntil: "load" });
        await waitForPageLayout(page);
        await page.locator("[data-guide-search-open]").click();
        await page.waitForFunction(
          () => document.activeElement?.id === "guide-search-input",
        );
        await page.locator("#guide-search-input").fill("بوتاکس");
        const results = page.locator(".guide-search__results a");
        await results.first().waitFor();
        await page.keyboard.press("Tab");
        assert.equal(
          await results
            .first()
            .evaluate((element) => document.activeElement === element),
          true,
        );
        const first = await focusFootprint(page);
        assertVisibleFocus(first, `${width}px first search result`);

        await results.last().focus();
        await frames(page);
        assertVisibleFocus(
          await focusFootprint(page),
          `${width}px last search result`,
        );
        await page.emulateMedia({ contrast: "more" });
        await results.first().focus();
        await frames(page);
        assertVisibleFocus(
          await focusFootprint(page),
          `${width}px high-contrast search result`,
          4,
        );
        await page.emulateMedia({ contrast: "no-preference" });

        const target = await results.first().getAttribute("href");
        assert.ok(target?.startsWith("#"));
        await page.keyboard.press("Enter");
        const targetId = decodeURIComponent(target.slice(1));
        await page.waitForFunction(
          (id) =>
            !document.getElementById("guide-search").open &&
            document.activeElement?.id === id,
          targetId,
        );
        await frames(page);
        const heading = await focusFootprint(page);
        assert.equal(
          heading.tag,
          "H2",
          "The representative section-heading target changed",
        );
        assertVisibleFocus(
          heading,
          `${width}px search-selected section heading`,
        );

        // A section H2 is outside the render chunks. Also exercise a nested H3
        // so the paint-containment clip edge, not only section overflow, is tested.
        const nestedHeading = page.locator(".render-chunk h3[id]").first();
        const nestedTarget = await nestedHeading.getAttribute("id");
        const nestedQuery = (await nestedHeading.textContent()).trim();
        await page.keyboard.press("/");
        await page.waitForFunction(
          () => document.activeElement?.id === "guide-search-input",
        );
        await page.locator("#guide-search-input").fill(nestedQuery);
        await results.first().waitFor();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Enter");
        await page.waitForFunction(
          (id) =>
            !document.getElementById("guide-search").open &&
            document.activeElement?.id === id,
          nestedTarget,
        );
        await frames(page);
        const nested = await focusFootprint(page);
        assert.equal(nested.tag, "H3");
        assertVisibleFocus(nested, `${width}px search-selected nested heading`);
        await page.emulateMedia({ contrast: "more" });
        await frames(page);
        assertVisibleFocus(
          await focusFootprint(page),
          `${width}px high-contrast nested heading`,
          4,
        );
        await page.emulateMedia({ contrast: "no-preference" });

        // Diagnose horizontal overflow with every chunk rendered. This style is
        // test instrumentation only; the production content-visibility contract
        // remains active and is checked by the separate navigation tests.
        await page.addStyleTag({
          content: ".render-chunk { content-visibility: visible !important; }",
        });
        await frames(page);
        const layout = await page.evaluate(() => ({
          overflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          sections: [...document.querySelectorAll(".content-section")].map(
            (element) => ({
              id: element.id,
              overflow: element.scrollWidth - element.clientWidth,
            }),
          ),
          tables: [...document.querySelectorAll("table")].map((element) => {
            const style = getComputedStyle(element);
            return {
              overflowX: style.overflowX,
              width: element.getBoundingClientRect().width,
            };
          }),
        }));
        assert.ok(
          layout.overflow <= 1,
          `${width}px document has horizontal overflow`,
        );
        assert.ok(
          layout.sections.length > 0 && layout.tables.length > 0,
          "Layout fixtures are missing",
        );
        assert.deepEqual(
          layout.sections.filter((section) => section.overflow > 1),
          [],
          `${width}px a section relies on clipping overflowing content`,
        );
        if (width <= 720) {
          assert.ok(
            layout.tables.every((table) => table.overflowX === "auto"),
            "Mobile tables must retain local horizontal scrolling",
          );
        }
        await page.evaluate(() =>
          document.querySelectorAll("details").forEach((element) => {
            element.open = true;
          }),
        );
        await frames(page);
        const expanded = await page.evaluate(() => ({
          overflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          sections: [...document.querySelectorAll(".content-section")]
            .filter((element) => element.scrollWidth - element.clientWidth > 1)
            .map((element) => element.id),
        }));
        assert.ok(
          expanded.overflow <= 1,
          `${width}px expanded disclosures cause horizontal overflow`,
        );
        assert.deepEqual(
          expanded.sections,
          [],
          `${width}px expanded section content overflows`,
        );

        const motion = await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              ".quick-actions__item, .quick-actions__top",
            ),
          ].map((element) => getComputedStyle(element).transitionDuration),
        );
        assert.ok(
          motion.every((duration) =>
            duration.split(",").every((part) => parseFloat(part) <= 0.000001),
          ),
          "Reduced motion must suppress dock transitions",
        );
        await page.emulateMedia({ media: "print" });
        const print = await page.evaluate(() =>
          [
            ".quick-actions",
            ".hero-actions",
            ".hero-search-launch",
            ".guide-search",
          ].map(
            (selector) =>
              getComputedStyle(document.querySelector(selector)).display,
          ),
        );
        assert.deepEqual(
          print,
          ["none", "none", "none", "none"],
          "Print must hide interactive navigation",
        );
        assert.deepEqual(errors, []);
        runs.push({
          width,
          firstResultFocus: "PASS",
          lastResultFocus: "PASS",
          highContrast: "PASS",
          headingFocus: "PASS",
          nestedHeadingFocus: "PASS",
          horizontalOverflow: layout.overflow,
          tables: layout.tables.length,
          expandedDisclosures: "PASS",
          reducedMotion: "PASS",
          print: "PASS",
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(
    JSON.stringify({ valid: true, test: "css-accessibility", runs }, null, 2),
  );
});
