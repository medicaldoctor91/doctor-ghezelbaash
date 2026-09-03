import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const write = (relative, value) => {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, value.endsWith("\n") ? value : `${value}\n`, "utf8");
};
const fail = (message) => {
  throw new Error(message);
};
const assert = (condition, message) => {
  if (!condition) fail(message);
};
const replaceOnce = (value, oldValue, newValue, label) => {
  const count = value.split(oldValue).length - 1;
  assert(count === 1, `${label}: expected one match, found ${count}`);
  return value.replace(oldValue, newValue);
};
const trackedFiles = () =>
  execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);

function findMatchingClose(value, start, tag) {
  const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  token.lastIndex = start;
  let depth = 0;
  for (let match; (match = token.exec(value)); ) {
    const closing = /^<\//.test(match[0]);
    if (!closing) depth += 1;
    else depth -= 1;
    if (depth === 0) return match.index + match[0].length;
  }
  fail(`Unbalanced <${tag}> element at ${start}`);
}

function elementById(value, id) {
  const open = new RegExp(`<([a-z][a-z0-9-]*)\\b[^>]*\\bid=["']${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i").exec(value);
  assert(open, `Missing element #${id}`);
  const start = open.index;
  const end = findMatchingClose(value, start, open[1]);
  return { start, end, tag: open[1], text: value.slice(start, end) };
}

function removeElementById(value, id) {
  const element = elementById(value, id);
  return `${value.slice(0, element.start)}${value.slice(element.end).replace(/^\s*\n?/, "\n")}`;
}

function enclosingElementContaining(value, needle, allowedTags, preferredClass) {
  const at = value.indexOf(needle);
  assert(at >= 0, `Missing text marker: ${needle}`);
  const token = new RegExp(`<\\/?(${allowedTags.join("|")})\\b[^>]*>`, "gi");
  const stack = [];
  for (let match; (match = token.exec(value)) && match.index < at; ) {
    const closing = /^<\//.test(match[0]);
    const tag = match[1].toLowerCase();
    if (!closing) stack.push({ tag, start: match.index, open: match[0] });
    else {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].tag === tag) {
          stack.splice(index, 1);
          break;
        }
      }
    }
  }
  const candidates = [...stack].reverse();
  const chosen =
    candidates.find((item) => preferredClass && item.open.includes(preferredClass)) ||
    candidates[0];
  assert(chosen, `No enclosing element for ${needle}`);
  const end = findMatchingClose(value, chosen.start, chosen.tag);
  assert(end > at, `Enclosing <${chosen.tag}> does not contain marker ${needle}`);
  return { ...chosen, end, text: value.slice(chosen.start, end) };
}

function removeElementContaining(value, tag, needle, required = true) {
  const pattern = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
  const matches = [...value.matchAll(pattern)].filter((match) => match[0].includes(needle));
  if (!matches.length && !required) return value;
  assert(matches.length === 1, `${needle}: expected one <${tag}>, found ${matches.length}`);
  const match = matches[0];
  return `${value.slice(0, match.index)}${value.slice(match.index + match[0].length)}`;
}

function extractScript(value, token) {
  const scripts = [...value.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].filter((match) =>
    match[0].includes(token),
  );
  assert(scripts.length === 1, `Expected one script containing ${token}, found ${scripts.length}`);
  const full = scripts[0][0];
  const openEnd = full.indexOf(">");
  const closeStart = full.lastIndexOf("</script>");
  return {
    start: scripts[0].index,
    end: scripts[0].index + full.length,
    open: full.slice(0, openEnd + 1),
    code: full.slice(openEnd + 1, closeStart),
    close: full.slice(closeStart),
  };
}

function removeJsStatementsContaining(html, tokens) {
  const script = extractScript(html, tokens[0]);
  const source = ts.createSourceFile(
    "inline-site-runtime.js",
    script.code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const ranges = new Map();
  const tokenHits = new Set();
  const visit = (node) => {
    const text = script.code.slice(node.getStart(source), node.getEnd());
    const matched = tokens.filter((token) => text.includes(token));
    if (matched.length) {
      for (const token of matched) tokenHits.add(token);
      let statement = node;
      while (
        statement.parent &&
        !(ts.isStatement(statement) && ts.isBlock(statement.parent))
      )
        statement = statement.parent;
      if (ts.isStatement(statement) && ts.isBlock(statement.parent)) {
        const statementText = script.code.slice(
          statement.getFullStart(),
          statement.getEnd(),
        );
        const forbidden = [
          "guide-search",
          "tocLinks",
          "syncTarget",
          "data-quick-actions-top",
          "IntersectionObserver",
        ];
        assert(
          !forbidden.some((marker) => statementText.includes(marker)),
          `Runtime reputation code shares a statement with unrelated ${forbidden.find((marker) => statementText.includes(marker))}`,
        );
        ranges.set(statement.getFullStart(), statement.getEnd());
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const token of tokens)
    assert(tokenHits.has(token), `Inline runtime token was not found by AST: ${token}`);
  assert(ranges.size > 0, "No removable runtime reputation statements found");
  let code = script.code;
  for (const [start, end] of [...ranges.entries()].sort((a, b) => b[0] - a[0]))
    code = `${code.slice(0, start)}${code.slice(end)}`;
  for (const token of tokens)
    assert(!code.includes(token), `Runtime reputation token remains: ${token}`);
  return `${html.slice(0, script.start)}${script.open}${code}${script.close}${html.slice(script.end)}`;
}

function removeStatementsFromModuleContaining(value, fileName, tokens) {
  const source = ts.createSourceFile(
    fileName,
    value,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );
  const ranges = new Map();
  const visit = (node) => {
    const text = value.slice(node.getStart(source), node.getEnd());
    if (tokens.some((token) => text.includes(token))) {
      let statement = node;
      while (
        statement.parent &&
        !(ts.isStatement(statement) && (ts.isBlock(statement.parent) || ts.isSourceFile(statement.parent)))
      )
        statement = statement.parent;
      if (
        ts.isStatement(statement) &&
        (ts.isBlock(statement.parent) || ts.isSourceFile(statement.parent))
      )
        ranges.set(statement.getFullStart(), statement.getEnd());
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!ranges.size) return value;
  let output = value;
  for (const [start, end] of [...ranges.entries()].sort((a, b) => b[0] - a[0]))
    output = `${output.slice(0, start)}${output.slice(end)}`;
  return output;
}

function removeSimpleCssRulesContaining(value, selectorToken) {
  let previous;
  let output = value;
  const pattern = /(^|\n)([ \t]*)([^@{}][^{}]*?)\{([^{}]*)\}/g;
  do {
    previous = output;
    output = output.replace(pattern, (full, prefix, indent, selector) =>
      selector.includes(selectorToken) ? prefix : full,
    );
  } while (output !== previous && output.includes(selectorToken));
  return output;
}

function setCssDeclarations(block, declarations) {
  const map = new Map();
  const order = [];
  for (const piece of block.split(";")) {
    const at = piece.indexOf(":");
    if (at < 0) continue;
    const key = piece.slice(0, at).trim();
    const value = piece.slice(at + 1).trim();
    if (!key) continue;
    if (!map.has(key)) order.push(key);
    map.set(key, value);
  }
  for (const [key, value] of Object.entries(declarations)) {
    if (!map.has(key)) order.push(key);
    map.set(key, value);
  }
  return `\n${order.map((key) => `  ${key}: ${map.get(key)};`).join("\n")}\n`;
}

function pruneJson(value, forbidden) {
  if (Array.isArray(value))
    return value
      .filter((item) => !(typeof item === "string" && forbidden.some((token) => item.includes(token))))
      .map((item) => pruneJson(item, forbidden));
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (forbidden.some((token) => key.includes(token))) continue;
      if (typeof item === "string" && forbidden.some((token) => item.includes(token))) continue;
      result[key] = pruneJson(item, forbidden);
    }
    return result;
  }
  return value;
}

// 1. Remove the only runtime Cloudflare Pages Function.
const functionPath = "functions/api/google-maps-reputation.js";
assert(existsSync(path.join(root, functionPath)), `Missing expected runtime Function ${functionPath}`);
unlinkSync(path.join(root, functionPath));

// 2. Convert both physician figure captions to native, closed disclosures.
const pagePath = "src/content-source/page.md";
let page = read(pagePath);
const originalVideoCount = (page.match(/<video\b/gi) || []).length;
assert(originalVideoCount >= 4, `Expected at least four real video players, found ${originalVideoCount}`);

const heroCaption = elementById(page, "caption-saeed-ghezelbash-portrait-master");
let heroInner = heroCaption.text
  .replace(/^<figcaption\b[^>]*>/i, "")
  .replace(/<\/figcaption>$/i, "");
heroInner = replaceOnce(
  heroInner,
  '<div class="hero-caption-title">دکتر سعید قزلباش، پزشک زیبایی</div>',
  "",
  "Hero caption title",
);
const reputationSpan = (() => {
  const marker = heroInner.indexOf("data-google-maps-reputation");
  assert(marker >= 0, "Missing runtime reputation marker in hero caption");
  const opens = [...heroInner.slice(0, marker).matchAll(/<span\b[^>]*>/gi)];
  assert(opens.length, "Could not locate reputation wrapper span");
  const start = opens.at(-1).index;
  const end = findMatchingClose(heroInner, start, "span");
  return { start, end };
})();
heroInner = `${heroInner.slice(0, reputationSpan.start)}<span class="hero-caption-reputation">{{CLINIC_REPUTATION_HTML}}</span>${heroInner.slice(reputationSpan.end)}`;
const heroOpen = heroCaption.text.match(/^<figcaption\b[^>]*>/i)[0];
const heroReplacement = `${heroOpen}\n<details class="caption-disclosure caption-disclosure--hero">\n<summary class="hero-caption-title">دکتر سعید قزلباش، پزشک زیبایی</summary>${heroInner}\n</details>\n</figcaption>`;
page = `${page.slice(0, heroCaption.start)}${heroReplacement}${page.slice(heroCaption.end)}`;

const clinicalCaption = elementById(page, "caption-saeed-ghezelbash-clinical-office-master");
let clinicalInner = clinicalCaption.text
  .replace(/^<figcaption\b[^>]*>/i, "")
  .replace(/<\/figcaption>$/i, "");
clinicalInner = replaceOnce(
  clinicalInner,
  '<div class="figure-caption-title">دکتر سعید قزلباش در محیط بالینی</div>',
  "",
  "Clinical caption title",
);
clinicalInner = replaceOnce(
  clinicalInner,
  ' id="verified-physician-identity-core"',
  "",
  "Move verified physician identity fragment",
);
const clinicalOpen = clinicalCaption.text.match(/^<figcaption\b[^>]*>/i)[0];
const clinicalReplacement = `${clinicalOpen}\n<details class="caption-disclosure caption-disclosure--clinical" id="verified-physician-identity-core">\n<summary class="figure-caption-title">دکتر سعید قزلباش در محیط بالینی</summary>${clinicalInner}\n</details>\n</figcaption>`;
page = `${page.slice(0, clinicalCaption.start)}${clinicalReplacement}${page.slice(clinicalCaption.end)}`;

// 3. Delete only the redundant video navigation box, never the real videos.
page = removeElementById(page, "video-library");
assert((page.match(/<video\b/gi) || []).length === originalVideoCount, "Video player count changed while removing the navigation box");
const firstVideo = /<video\b[^>]*\bid=["']([^"']+)["']/i.exec(page)?.[1];
assert(firstVideo, "Could not resolve the first stable video target");

// 4. Delete the redundant end-of-page quick-start navigation block.
const quickStart = enclosingElementContaining(
  page,
  "مسیر سریع در این راهنمای جامع",
  ["aside", "section", "nav", "div"],
  "quick-start",
);
page = `${page.slice(0, quickStart.start)}${page.slice(quickStart.end).replace(/^\s*\n?/, "\n")}`;
assert(!page.includes("مسیر سریع در این راهنمای جامع"), "Quick-start block remains");
write(pagePath, page);

// 5. Remove the browser-time reputation request while retaining all unrelated site runtime behavior.
const navigatorPath = "src/components/GuideNavigator.astro";
let navigator = read(navigatorPath);
navigator = removeJsStatementsContaining(navigator, [
  "/api/google-maps-reputation",
  "data-google-maps-reputation",
]);

// Replace the current back-to-top state machine with a thresholded, accessible, low-cost controller.
const oldTopBlock = /  const syncTop = \(\) => \{[\s\S]*?  \} else addEventListener\("scroll", syncTop, \{ passive: true \}\);/;
assert(oldTopBlock.test(navigator), "Could not locate the existing back-to-top controller");
const newTopBlock = `  const hero = d.querySelector(".entity-hero"),\n    reducedMotion = matchMedia("(prefers-reduced-motion: reduce)"),\n    setTopVisible = (visible) => {\n      if (!top) return;\n      if (top.hidden) top.hidden = false;\n      top.dataset.visible = visible ? "true" : "false";\n      top.setAttribute("aria-hidden", visible ? "false" : "true");\n      top.tabIndex = visible ? 0 : -1;\n    };\n  let topFrame = 0;\n  const syncTop = () => {\n    topFrame = 0;\n    const threshold = Math.max(640, innerHeight * 0.85),\n      heroPassed = !hero || hero.getBoundingClientRect().bottom <= 0;\n    setTopVisible(scrollY >= threshold && heroPassed);\n  },\n    requestTopSync = () => {\n      if (!topFrame) topFrame = requestAnimationFrame(syncTop);\n    };\n  setTopVisible(false);\n  if ("IntersectionObserver" in window && top && hero) {\n    const topObserver = new IntersectionObserver(requestTopSync, { threshold: 0 });\n    topObserver.observe(hero);\n  }\n  addEventListener("scroll", requestTopSync, { passive: true });\n  addEventListener("resize", requestTopSync, { passive: true });\n  addEventListener("pageshow", requestTopSync);\n  top?.addEventListener("click", (event) => {\n    event.preventDefault();\n    const target = d.getElementById("main-content") || d.body;\n    target.scrollIntoView({\n      behavior: reducedMotion.matches ? "auto" : "smooth",\n      block: "start",\n    });\n    if (location.hash === "#main-content") history.replaceState(null, "", location.pathname + location.search);\n  });`;
navigator = navigator.replace(oldTopBlock, newTopBlock);
write(navigatorPath, navigator);

// Keep the control absent before JavaScript has enough context, then animate state without layout movement.
const dockPath = "src/components/FloatingActionDock.astro";
let dock = read(dockPath);
dock = replaceOnce(
  dock,
  '    data-quick-actions-top\n    hidden\n    href="#main-content"',
  '    data-quick-actions-top\n    hidden\n    aria-hidden="true"\n    tabindex="-1"\n    href="#main-content"',
  "Back-to-top initial accessibility state",
);
write(dockPath, dock);

// 6. Clean the user-facing footer while retaining useful contact and machine discoverability.
const footerPath = "src/components/SiteFooter.astro";
let footer = read(footerPath);
footer = removeElementContaining(footer, "p", "موجودیت اصلی این وب‌سایت");
footer = removeElementContaining(footer, "p", "اثر انگشت هویتی");
footer = removeElementContaining(footer, "p", "آخرین بازبینی پزشکی ثبت‌شده", false);

const privacyElement = enclosingElementContaining(
  footer,
  "بازبینی پزشکی، حریم خصوصی و شرایط استفاده",
  ["details"],
);
const privacySummary = /<summary\b[^>]*>[\s\S]*?<\/summary>/i.exec(privacyElement.text)?.[0];
assert(privacySummary, "Privacy disclosure has no summary");
const privacyOpen = privacyElement.text.match(/^<details\b[^>]*>/i)?.[0];
assert(privacyOpen, "Privacy disclosure has no opening tag");
const googleTermsHref =
  [...privacyElement.text.matchAll(/href=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .find((href) => /terms|termsofservice|help\/terms_maps/i.test(href)) ||
  "https://www.google.com/help/terms_maps/";
const googlePrivacyHref =
  [...privacyElement.text.matchAll(/href=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .find((href) => /policies\.google\.com\/privacy/i.test(href)) ||
  "https://policies.google.com/privacy";
const privacyReplacement = `${privacyOpen}\n${privacySummary}\n<p>محتوای پزشکی این صفحه توسط دکتر سعید قزلباش بازبینی می‌شود و جایگزین معاینه و تصمیم درمانی حضوری نیست. اطلاعات حساس پزشکی را در پیام عمومی شبکه‌های اجتماعی ارسال نکنید؛ در صورت نشانه‌های اورژانسی پس از اقدام پزشکی، ارزیابی حضوری فوری اولویت دارد.</p>\n<p>امتیاز و تعداد نظر کلینیک، یک مشاهده زمان‌دار از Google Maps است که حداکثر هر شش ساعت بررسی می‌شود. متن نظرها و اطلاعات شخصی کاربران ذخیره نمی‌شود و منبع داده با پیوند مستقیم مشخص است. استفاده از این داده تابع <a href="${googleTermsHref}" rel="external noopener">شرایط استفاده Google Maps</a> و <a href="${googlePrivacyHref}" rel="external noopener">خط‌مشی حریم خصوصی Google</a> است.</p>\n</details>`;
footer = `${footer.slice(0, privacyElement.start)}${privacyReplacement}${footer.slice(privacyElement.end)}`;

if (!footer.includes("داده‌های ساختاریافته و منابع ماشینی")) {
  const machineBlock = enclosingElementContaining(
    footer,
    "RDF/Turtle",
    ["nav", "p", "div", "section"],
  );
  assert(machineBlock.text.includes("JSON-LD") && machineBlock.text.includes("SHACL"), "Machine resource block detection was not specific enough");
  const wrapped = `<details class="footer-machine-resources">\n<summary>داده‌های ساختاریافته و منابع ماشینی</summary>\n${machineBlock.text}\n</details>`;
  footer = `${footer.slice(0, machineBlock.start)}${wrapped}${footer.slice(machineBlock.end)}`;
}
write(footerPath, footer);

// 7. Add static reputation observation primitives.
write(
  "src/data/reputation-observation.json",
  JSON.stringify(
    {
      schemaVersion: 1,
      entityScope: "clinic",
      placeId: "ChIJBT0YDOTt-j8RD-7mAPy6Zas",
      rating: null,
      userRatingCount: null,
      source: "Google Places API (New)",
      observedAt: null,
      tupleSha256: null,
    },
    null,
    2,
  ),
);

write(
  "src/lib/reputation-observation.mjs",
  `import { createHash } from "node:crypto";\nimport { readFileSync } from "node:fs";\nimport { fileURLToPath } from "node:url";\n\nconst FALLBACK_URL = new URL("../data/reputation-observation.json", import.meta.url);\nconst RELEASE_URL = new URL("../data/release.json", import.meta.url);\nconst SOURCE = "Google Places API (New)";\nconst readJson = (location) => JSON.parse(readFileSync(location, "utf8"));\nconst release = readJson(RELEASE_URL);\nconst EXPECTED_PLACE_ID = release.clinic.placeId;\nconst canonicalTuple = ({ placeId, rating, userRatingCount }) =>\n  JSON.stringify({ placeId, rating, userRatingCount });\nconst tupleSha256 = (value) =>\n  createHash("sha256").update(canonicalTuple(value)).digest("hex");\nconst escapeText = (value) =>\n  String(value).replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);\nconst escapeAttribute = (value) =>\n  escapeText(value).replace(/[\"']/g, (character) => (character === \"\\\"\" ? "&quot;" : "&#39;"));\n\nexport function normalizeReputationObservation(value) {\n  const rating = Number(value?.rating);\n  const userRatingCount = Number(value?.userRatingCount);\n  const observedAt =\n    typeof value?.observedAt === "string" && Number.isFinite(Date.parse(value.observedAt))\n      ? new Date(value.observedAt).toISOString()\n      : null;\n  const normalized = {\n    schemaVersion: 1,\n    entityScope: "clinic",\n    placeId: value?.placeId,\n    rating,\n    userRatingCount,\n    source: SOURCE,\n    observedAt,\n  };\n  if (\n    value?.schemaVersion !== 1 ||\n    value?.entityScope !== "clinic" ||\n    normalized.placeId !== EXPECTED_PLACE_ID ||\n    !Number.isFinite(rating) || rating < 1 || rating > 5 ||\n    !Number.isSafeInteger(userRatingCount) || userRatingCount < 1 ||\n    !observedAt\n  ) return null;\n  const expectedHash = tupleSha256(normalized);\n  if (typeof value?.tupleSha256 === "string" && value.tupleSha256 !== expectedHash) return null;\n  return { ...normalized, tupleSha256: expectedHash };\n}\n\nexport function resolveReputationObservation() {\n  const configured = process.env.REPUTATION_OBSERVATION_PATH?.trim();\n  const location = configured ? fileURLToPath(new URL(\`file://\${pathResolve(configured)}\`)) : fileURLToPath(FALLBACK_URL);\n  try { return normalizeReputationObservation(readJson(location)); } catch { return null; }\n}\n\nfunction pathResolve(value) {\n  if (value.startsWith("/")) return value;\n  return new URL(value, \`file://\${process.cwd()}/\`).pathname;\n}\n\nexport function renderClinicReputationHtml() {\n  const observation = resolveReputationObservation();\n  const mapsHref = \`https://www.google.com/maps/search/?api=1&query_place_id=\${encodeURIComponent(EXPECTED_PLACE_ID)}\`;\n  if (!observation)\n    return \`<a href="\${escapeAttribute(mapsHref)}" rel="external noopener noreferrer">نظرها و امتیازهای عمومی در <span class="google-maps-attribution" translate="no">Google Maps</span></a>\`;\n  const rating = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(observation.rating);\n  const count = new Intl.NumberFormat("fa-IR").format(observation.userRatingCount);\n  return \`<a class="clinic-google-reputation" data-clinic-reputation data-clinic-place-id="\${escapeAttribute(observation.placeId)}" data-clinic-rating="\${observation.rating}" data-clinic-review-count="\${observation.userRatingCount}" data-clinic-reputation-observed-at="\${escapeAttribute(observation.observedAt)}" data-clinic-reputation-tuple-sha256="\${observation.tupleSha256}" href="\${escapeAttribute(mapsHref)}" rel="external noopener noreferrer">امتیاز <data value="\${observation.rating}">\${escapeText(rating)}</data> از ۵ بر پایه <data value="\${observation.userRatingCount}">\${escapeText(count)}</data> نظر در <span class="google-maps-attribution" translate="no">Google Maps</span></a>\`;\n}\n\nexport const reputationPlaceId = EXPECTED_PLACE_ID;\nexport { tupleSha256 as reputationTupleSha256 };\n`,
);

write(
  "scripts/fetch-google-places-reputation.mjs",
  `import { createHash } from "node:crypto";\nimport { readFile, rename, writeFile } from "node:fs/promises";\nimport path from "node:path";\nimport { pathToFileURL } from "node:url";\n\nconst RELEASE_URL = new URL("../src/data/release.json", import.meta.url);\nconst FIELD_MASK = ["id", "rating", "userRatingCount", "businessStatus", "movedPlace", "movedPlaceId"].join(",");\nconst readJson = async (location) => JSON.parse(await readFile(location, "utf8"));\nconst canonicalTuple = ({ placeId, rating, userRatingCount }) => JSON.stringify({ placeId, rating, userRatingCount });\nconst tupleSha256 = (value) => createHash("sha256").update(canonicalTuple(value)).digest("hex");\n\nexport function normalizeGooglePlacesObservation(value, placeId, now = new Date()) {\n  const rating = Number(value?.rating);\n  const userRatingCount = Number(value?.userRatingCount);\n  if (\n    value?.id !== placeId || value?.businessStatus !== "OPERATIONAL" || value?.movedPlace || value?.movedPlaceId ||\n    !Number.isFinite(rating) || rating < 1 || rating > 5 ||\n    !Number.isSafeInteger(userRatingCount) || userRatingCount < 1 ||\n    !Number.isFinite(now.getTime())\n  ) return null;\n  const observation = {\n    schemaVersion: 1, entityScope: "clinic", placeId, rating, userRatingCount,\n    source: "Google Places API (New)", observedAt: now.toISOString(),\n  };\n  return { ...observation, tupleSha256: tupleSha256(observation) };\n}\n\nconst previousTuple = (value) => {\n  const rating = Number(value?.rating), userRatingCount = Number(value?.userRatingCount);\n  return Number.isFinite(rating) && Number.isSafeInteger(userRatingCount)\n    ? { placeId: value.placeId, rating, userRatingCount }\n    : null;\n};\nconst suspiciousRegression = (previous, current) => {\n  const count = Number(previous?.userRatingCount);\n  if (!Number.isSafeInteger(count) || count < 1) return false;\n  const drop = count - current.userRatingCount;\n  return drop > Math.max(3, Math.ceil(count * 0.02));\n};\n\nexport async function fetchGooglePlacesObservation({ apiKey, placeId, previous }) {\n  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("GOOGLE_PLACES_API_KEY is unavailable");\n  const endpoint = new URL(\`https://places.googleapis.com/v1/places/\${encodeURIComponent(placeId)}\`);\n  endpoint.searchParams.set("languageCode", "fa");\n  endpoint.searchParams.set("regionCode", "IR");\n  const response = await fetch(endpoint, {\n    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),\n    headers: { Accept: "application/json", "X-Goog-Api-Key": apiKey.trim(), "X-Goog-FieldMask": FIELD_MASK },\n  });\n  if (!response.ok) throw new Error(\`Google Places returned HTTP \${response.status}\`);\n  const observation = normalizeGooglePlacesObservation(await response.json(), placeId);\n  if (!observation) throw new Error("Google Places returned an invalid clinic reputation observation");\n  if (suspiciousRegression(previous, observation))\n    throw new Error(\`Suspicious review-count regression: \${previous.userRatingCount} -> \${observation.userRatingCount}\`);\n  return observation;\n}\n\nasync function main() {\n  const args = process.argv.slice(2);\n  const outputAt = args.indexOf("--output");\n  const output = outputAt >= 0 ? args[outputAt + 1] : "src/data/reputation-observation.json";\n  const release = await readJson(RELEASE_URL);\n  let previous = null;\n  try { previous = await readJson(path.resolve(output)); } catch {}\n  const current = await fetchGooglePlacesObservation({\n    apiKey: process.env.GOOGLE_PLACES_API_KEY,\n    placeId: release.clinic.placeId,\n    previous,\n  });\n  const oldTuple = previousTuple(previous);\n  const newTuple = previousTuple(current);\n  const changed = JSON.stringify(oldTuple) !== JSON.stringify(newTuple);\n  if (changed) {\n    const target = path.resolve(output);\n    const temporary = \`\${target}.tmp-\${process.pid}\`;\n    await writeFile(temporary, \`\${JSON.stringify(current, null, 2)}\\n\`, "utf8");\n    await rename(temporary, target);\n  }\n  if (process.env.GITHUB_OUTPUT)\n    await writeFile(process.env.GITHUB_OUTPUT, \`changed=\${changed ? "true" : "false"}\\n\`, { flag: "a" });\n  console.log(JSON.stringify({ changed, placeId: current.placeId, rating: current.rating, userRatingCount: current.userRatingCount, tupleSha256: current.tupleSha256 }, null, 2));\n}\n\nif (import.meta.url === pathToFileURL(process.argv[1] || "").href)\n  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });\n`,
);

// Inject the static HTML token into the existing canonical content-token registry.
const tokenCandidates = trackedFiles()
  .filter((file) => /\.(?:mjs|js|ts|astro)$/.test(file) && file !== navigatorPath)
  .map((file) => ({ file, text: read(file) }))
  .filter(({ text }) => text.includes("CLINIC_MAPS_URL") && text.includes("CLINIC_HOURS_COMPACT_FA"));
assert(tokenCandidates.length >= 1, "Could not find the canonical content-token registry");
const scored = tokenCandidates
  .map((candidate) => ({
    ...candidate,
    score:
      (candidate.text.includes("page.md") ? 4 : 0) +
      (candidate.text.includes("replace") ? 2 : 0) +
      (candidate.text.includes("CLINIC_TEL_HREF") ? 2 : 0),
  }))
  .sort((a, b) => b.score - a.score);
assert(scored.length === 1 || scored[0].score > scored[1].score, `Ambiguous token registries: ${scored.map(({ file, score }) => `${file}:${score}`).join(", ")}`);
const registry = scored[0];
let registryText = registry.text;
const propertyPattern = /^(\s*)(["']?)CLINIC_MAPS_URL\2\s*:\s*[^\n]+$/m;
const propertyMatch = propertyPattern.exec(registryText);
assert(propertyMatch, `CLINIC_MAPS_URL is not an object property in ${registry.file}`);
const relativeImportRaw = path.relative(path.dirname(registry.file), "src/lib/reputation-observation.mjs").replaceAll(path.sep, "/");
const relativeImport = relativeImportRaw.startsWith(".") ? relativeImportRaw : `./${relativeImportRaw}`;
const importLine = `import { renderClinicReputationHtml } from "${relativeImport}";`;
if (!registryText.includes(importLine)) {
  const imports = [...registryText.matchAll(/^import .*;$/gm)];
  assert(imports.length, `${registry.file} has no import section`);
  const last = imports.at(-1);
  registryText = `${registryText.slice(0, last.index + last[0].length)}\n${importLine}${registryText.slice(last.index + last[0].length)}`;
}
const indent = propertyMatch[1];
const quote = propertyMatch[2];
const key = quote ? `${quote}CLINIC_REPUTATION_HTML${quote}` : "CLINIC_REPUTATION_HTML";
const insertionAt = propertyMatch.index + propertyMatch[0].length;
registryText = `${registryText.slice(0, insertionAt)}\n${indent}${key}: renderClinicReputationHtml(),${registryText.slice(insertionAt)}`;
write(registry.file, registryText);

// 8. Remove Function-specific routing introduced on the conformance branch.
const materializerPath = "scripts/materialize-static-artifacts.mjs";
let materializer = read(materializerPath);
materializer = materializer.replace(/const platformContract = JSON\.parse\([\s\S]*?throw new Error\(`Invalid Cloudflare Function route: \$\{functionRoute\}`\);\n/, "");
materializer = materializer.replace(/await writeExact\(\n  "_routes\.json",[\s\S]*?\n\);\n/, "");
materializer = materializer.replace(/^\s*functionRoutes:\s*1,\s*$/m, "");
write(materializerPath, materializer);

const distValidatorPath = "scripts/validate-dist.mjs";
let distValidator = read(distValidatorPath);
distValidator = distValidator.replace(/^\s*"_routes\.json",\s*$/m, "");
distValidator = distValidator.replace(/,\n\s*routes = await readJson\(path\.join\(dist, "_routes\.json"\)\),\n\s*platformContract = await readJson\([\s\S]*?fail\("Cloudflare Pages Function routing drift"\);\n/, ";\n");
write(distValidatorPath, distValidator);

const architecturePath = "scripts/validate-architecture.mjs";
let architecture = read(architecturePath);
architecture = architecture.replace(
  /assert\(\n\s*\/from\\s\+\[[\s\S]*?"Static materializer must own resources, generated public files, and exact Function routing",\n\);/,
  `assert(\n  /from\\s+['\"]\\.\\.\\/src\\/lib\\/resources\\.mjs['\"]/.test(materializer) &&\n    /path\\.join\\(root,\\s*['\"]\\.generated\\/public['\"]\\)/.test(materializer),\n  "Static materializer must use the resource registry and generated public workspace",\n);`,
);
write(architecturePath, architecture);

const platformPath = ".release/policy/platform-contract.json";
let platform = JSON.parse(read(platformPath));
if (platform.cloudflare && typeof platform.cloudflare === "object") {
  delete platform.cloudflare.function;
  delete platform.cloudflare.functions;
  delete platform.cloudflare.functionRoute;
  platform.cloudflare.deliveryModel = "static-assets-only";
  platform.cloudflare.pagesFunctions = false;
}
write(platformPath, JSON.stringify(platform, null, 2));

// Remove obsolete validator statements that enforce deleted UI/runtime artifacts.
for (const file of trackedFiles().filter((file) => /^scripts\/.*\.(?:mjs|js)$/.test(file))) {
  let value = read(file);
  if (
    value.includes("/api/google-maps-reputation") ||
    value.includes("data-google-maps-reputation") ||
    value.includes("#video-library") ||
    value.includes("quick-start-title") ||
    value.includes('"_routes.json"') ||
    value.includes("cloudflare.function")
  ) {
    value = removeStatementsFromModuleContaining(value, file, [
      "/api/google-maps-reputation",
      "data-google-maps-reputation",
      "#video-library",
      "quick-start-title",
      '"_routes.json"',
      "cloudflare.function",
    ]);
    write(file, value);
  }
}

// Update redirect/contract/graph references from the deleted video navigation node to a real player.
for (const file of trackedFiles().filter((file) => /\.(?:json|jsonld|mjs|js|txt|md|astro)$/.test(file))) {
  if (!existsSync(path.join(root, file))) continue;
  let value = read(file);
  if (value.includes("#video-library")) {
    value = value.replaceAll("#video-library", `#${firstVideo}`);
    write(file, value);
  }
}
for (const file of [
  ".release/policy/authority-surface-contract.json",
  "src/data/semantic/knowledge-graph.jsonld",
]) {
  if (!existsSync(path.join(root, file))) continue;
  const parsed = JSON.parse(read(file));
  write(file, JSON.stringify(pruneJson(parsed, ["video-library", "quick-start-title"]), null, 2));
}

// 9. Canonical CSS for disclosures and the contextual back-to-top control.
const cssPath = "src/styles/global.css";
let css = read(cssPath);
css = removeSimpleCssRulesContaining(css, ".quick-start");
const topRule = /(\.quick-actions__top\s*\{)([^{}]*)(\})/;
const topMatch = topRule.exec(css);
assert(topMatch, "Missing canonical .quick-actions__top rule");
const topBody = setCssDeclarations(topMatch[2], {
  opacity: "0",
  visibility: "hidden",
  "pointer-events": "none",
  transform: "translateY(0.5rem) scale(0.96)",
  transition: "opacity 180ms ease, transform 180ms ease, visibility 0s linear 180ms",
  "will-change": "opacity, transform",
});
css = `${css.slice(0, topMatch.index)}${topMatch[1]}${topBody}${topMatch[3]}${css.slice(topMatch.index + topMatch[0].length)}`;
css = removeSimpleCssRulesContaining(css, '.quick-actions__top[data-visible="true"]');
const cssAddition = `\n\n.caption-disclosure {\n  margin: 0;\n  border: 0;\n  padding: 0;\n  background: transparent;\n  box-shadow: none;\n}\n\n.caption-disclosure > summary {\n  cursor: pointer;\n  list-style: none;\n}\n\n.caption-disclosure > summary::-webkit-details-marker {\n  display: none;\n}\n\n.caption-disclosure > summary::marker {\n  content: "";\n}\n\n.caption-disclosure[open] > summary {\n  margin-block-end: 0.75rem;\n}\n\n.quick-actions__top[data-visible="true"] {\n  opacity: 1;\n  visibility: visible;\n  pointer-events: auto;\n  transform: translateY(0) scale(1);\n  transition-delay: 0s;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .quick-actions__top {\n    transition: none;\n  }\n}\n`;
assert(!css.includes(".caption-disclosure {"), "Caption disclosure CSS already exists unexpectedly");
css += cssAddition;
write(cssPath, css);

// 10. Permanent bounded six-hour observer: one API request; data-only commit only when tuple changes.
write(
  ".github/workflows/refresh-clinic-reputation.yml",
  `name: Refresh static clinic reputation\n\non:\n  schedule:\n    - cron: "17 */6 * * *"\n  workflow_dispatch:\n\npermissions:\n  contents: write\n\nconcurrency:\n  group: refresh-static-clinic-reputation\n  cancel-in-progress: false\n\njobs:\n  refresh:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 10\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n        with:\n          ref: main\n          fetch-depth: 0\n      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020\n        with:\n          node-version-file: .nvmrc\n          cache: npm\n      - name: Fetch one validated Google Places observation\n        id: reputation\n        env:\n          GOOGLE_PLACES_API_KEY: \${{ secrets.GOOGLE_PLACES_API_KEY }}\n        run: node scripts/fetch-google-places-reputation.mjs --output src/data/reputation-observation.json\n      - name: Commit only a changed, validated clinic reputation tuple\n        if: steps.reputation.outputs.changed == 'true'\n        shell: bash\n        run: |\n          set -euo pipefail\n          test "$(git diff --name-only)" = "src/data/reputation-observation.json"\n          git config user.name "github-actions[bot]"\n          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"\n          git add src/data/reputation-observation.json\n          git commit -m "data: refresh static clinic reputation observation"\n          git push origin HEAD:main\n`,
);

// Remove runtime secret-provisioning steps from the Cloudflare deployment workflow; the API key remains build-time only.
const deployWorkflowPath = ".github/workflows/cloudflare-pages-deploy.yml";
let deployWorkflow = read(deployWorkflowPath);
const workflowLines = deployWorkflow.split(/(?<=\n)/);
const starts = workflowLines
  .map((line, index) => (/^      - (?:name|uses|run):/.test(line) ? index : -1))
  .filter((index) => index >= 0);
const removeLines = new Set();
for (let position = 0; position < starts.length; position += 1) {
  const start = starts[position];
  const end = position + 1 < starts.length ? starts[position + 1] : workflowLines.length;
  const block = workflowLines.slice(start, end).join("");
  if (
    /wrangler pages secret|Pages Function|google-maps-reputation/i.test(block) &&
    /GOOGLE_PLACES_API_KEY|secret|function/i.test(block)
  )
    for (let index = start; index < end; index += 1) removeLines.add(index);
}
deployWorkflow = workflowLines.filter((_, index) => !removeLines.has(index)).join("");
write(deployWorkflowPath, deployWorkflow);

// 11. Strong positive validators for the final architecture.
write(
  "scripts/validate-approved-visible-cleanup.mjs",
  `import { readFile } from "node:fs/promises";\n\nconst fail = (message) => { throw new Error(message); };\nconst page = await readFile("src/content-source/page.md", "utf8");\nconst footer = await readFile("src/components/SiteFooter.astro", "utf8");\nconst dock = await readFile("src/components/FloatingActionDock.astro", "utf8");\nconst navigator = await readFile("src/components/GuideNavigator.astro", "utf8");\nconst css = await readFile("src/styles/global.css", "utf8");\nconst captionDetails = page.match(/<details\\b[^>]*class=["'][^"']*caption-disclosure[^"']*["'][^>]*>/g) || [];\nif (captionDetails.length !== 2) fail(\`Expected two caption disclosures, found \${captionDetails.length}\`);\nfor (const title of ["دکتر سعید قزلباش، پزشک زیبایی", "دکتر سعید قزلباش در محیط بالینی"]) {\n  const escaped = title.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");\n  if (!new RegExp(\`<summary\\\\b[^>]*>\\\\s*\${escaped}\\\\s*<\\\\/summary>\`).test(page))\n    fail(\`Caption title is not the sole native summary: \${title}\`);\n}\nif (page.includes("video-library") || page.includes("مسیر سریع در این راهنمای جامع"))\n  fail("Redundant visible navigation remains");\nif ((page.match(/<video\\b/g) || []).length < 4) fail("Real video players were removed");\nfor (const phrase of ["موجودیت اصلی این وب‌سایت", "اثر انگشت هویتی", "آخرین بازبینی پزشکی ثبت‌شده"])\n  if (footer.includes(phrase)) fail(\`Visible footer repetition remains: \${phrase}\`);\nif (!footer.includes("داده‌های ساختاریافته و منابع ماشینی")) fail("Machine resources are not grouped");\nif (!footer.includes("حداکثر هر شش ساعت بررسی می‌شود")) fail("Privacy text does not describe the static observation cadence");\nif (!dock.includes('data-quick-actions-top') || !dock.includes('aria-hidden="true"') || !dock.includes('tabindex="-1"'))\n  fail("Back-to-top initial state is incomplete");\nfor (const marker of ["setTopVisible", "requestAnimationFrame(syncTop)", "prefers-reduced-motion: reduce", 'data.visible = visible ? "true" : "false"'])\n  if (!navigator.includes(marker)) fail(\`Modern back-to-top controller missing: \${marker}\`);\nif (!css.includes('.quick-actions__top[data-visible="true"]') || !css.includes(".caption-disclosure > summary::marker"))\n  fail("Canonical disclosure/back-to-top CSS is incomplete");\nconsole.log(JSON.stringify({ captionDisclosures: 2, videoPlayers: (page.match(/<video\\b/g) || []).length, redundantVideoNavigation: false, redundantQuickStart: false, footerIdentityRepetition: false, contextualBackToTop: true }, null, 2));\n`,
);

write(
  "scripts/validate-static-reputation.mjs",
  `import { execFileSync } from "node:child_process";\nimport { existsSync } from "node:fs";\nimport { readFile } from "node:fs/promises";\nimport { normalizeReputationObservation } from "../src/lib/reputation-observation.mjs";\n\nconst fail = (message) => { throw new Error(message); };\nconst tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\\0").filter(Boolean);\nif (tracked.some((file) => file.startsWith("functions/")) || existsSync("functions")) fail("Cloudflare Pages Functions remain");\nconst forbidden = ["/api/google-maps-reputation", "data-google-maps-reputation", "_routes.json", "wrangler pages secret"];\nfor (const file of tracked.filter((file) => /\\.(?:mjs|js|astro|md|json|jsonld|yml|yaml|txt)$/.test(file))) {\n  const value = await readFile(file, "utf8");\n  for (const token of forbidden) if (value.includes(token)) fail(\`Runtime reputation artifact \${token} remains in \${file}\`);\n}\nconst observation = normalizeReputationObservation(JSON.parse(await readFile("src/data/reputation-observation.json", "utf8")));\nif (!observation) fail("Tracked clinic reputation observation is invalid");\nconst workflow = await readFile(".github/workflows/refresh-clinic-reputation.yml", "utf8");\nif (!workflow.includes('cron: "17 */6 * * *"') || !workflow.includes("steps.reputation.outputs.changed == 'true'"))\n  fail("Bounded six-hour observation workflow drift");\nconst html = await readFile("dist/index.html", "utf8");\nif (html.includes("{{CLINIC_REPUTATION_HTML}}")) fail("Static reputation token leaked into dist");\nfor (const [attribute, expected] of [["data-clinic-place-id", observation.placeId], ["data-clinic-rating", String(observation.rating)], ["data-clinic-review-count", String(observation.userRatingCount)], ["data-clinic-reputation-tuple-sha256", observation.tupleSha256]]) {\n  const matches = html.match(new RegExp(\`\${attribute}=["']\${expected.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&")}["']\`, "g")) || [];\n  if (matches.length !== 1) fail(\`Expected one \${attribute}=\${expected}, found \${matches.length}\`);\n}\nif (!/<details\\b[^>]*caption-disclosure--hero[\\s\\S]*?data-clinic-reputation[\\s\\S]*?<\\/details>/i.test(html))\n  fail("Static reputation is not materialized inside the closed physician caption disclosure");\nconst jsonLd = [...html.matchAll(/<script\\b[^>]*type=["']application\\/ld\\+json["'][^>]*>([\\s\\S]*?)<\\/script>/gi)].map((match) => match[1]).join("\\n");\nif (/\"@type\"\\s*:\\s*\"Person\"[\\s\\S]{0,2000}\"aggregateRating\"/.test(jsonLd))\n  fail("Clinic reputation leaked into the Person entity");\nconsole.log(JSON.stringify({ deliveryModel: "static-assets-only", cloudflareFunctions: 0, runtimeReputationRequests: 0, placeId: observation.placeId, rating: observation.rating, userRatingCount: observation.userRatingCount, tupleSha256: observation.tupleSha256 }, null, 2));\n`,
);

// Register validators without changing any commercial/search-intent content.
const packagePath = "package.json";
const packageJson = JSON.parse(read(packagePath));
packageJson.scripts["validate:approved-visible-cleanup"] = "node scripts/validate-approved-visible-cleanup.mjs";
packageJson.scripts["validate:static-reputation"] = "node scripts/validate-static-reputation.mjs";
if (!packageJson.scripts["validate:source"].includes("validate:approved-visible-cleanup"))
  packageJson.scripts["validate:source"] += " && npm run validate:approved-visible-cleanup";
if (!packageJson.scripts["compile:dist"].includes("validate:static-reputation"))
  packageJson.scripts["compile:dist"] = packageJson.scripts["compile:dist"].replace(
    "node scripts/validate-dist.mjs",
    "node scripts/validate-dist.mjs && npm run validate:static-reputation",
  );
write(packagePath, JSON.stringify(packageJson, null, 2));

// Final source assertions before the real build and existing release validators run.
const allText = trackedFiles()
  .filter((file) => existsSync(path.join(root, file)) && /\.(?:mjs|js|astro|md|json|jsonld|yml|yaml|txt|css)$/.test(file))
  .map((file) => [file, read(file)]);
for (const [file, value] of allText) {
  if (file === "scripts/migrations/apply-approved-release-ready.mjs") continue;
  for (const token of ["/api/google-maps-reputation", "data-google-maps-reputation", '"_routes.json"', "wrangler pages secret"])
    assert(!value.includes(token), `Forbidden runtime artifact ${token} remains in ${file}`);
}
assert(!existsSync(path.join(root, "functions")) || trackedFiles().every((file) => !file.startsWith("functions/")), "Tracked Cloudflare Function surface remains");
assert(read(pagePath).includes("{{CLINIC_REPUTATION_HTML}}"), "Static reputation source token is missing");
assert(!read(pagePath).includes("video-library"), "Deleted video navigation identifier remains in visible source");
assert(!read(pagePath).includes("مسیر سریع در این راهنمای جامع"), "Deleted quick-start text remains in visible source");

console.log(JSON.stringify({ migration: "approved-release-ready", cloudflareFunctionsRemoved: true, staticReputationSourceInstalled: true, captionDisclosures: 2, videoNavigationRemoved: true, videoPlayersPreserved: originalVideoCount, quickStartRemoved: true, footerDeduplicated: true, contextualBackToTop: true, firstVideoRedirectTarget: firstVideo }, null, 2));
