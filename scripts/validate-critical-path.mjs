import path from "node:path";
import { access, readFile } from "node:fs/promises";
import {
  HERO_EARLY_HINT_HREF,
  HERO_IMAGE_SIZES,
  HERO_PRELOAD_HREF,
  HERO_PRELOAD_SRCSET,
} from "../src/lib/hero-image-contract.mjs";

const root = process.cwd();
const fail = (message) => {
  throw new Error(message);
};
const assert = (condition, message) => {
  if (!condition) fail(message);
};
const count = (source, pattern) => (String(source).match(pattern) || []).length;
const heroPreloadPattern =
  /<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["']image["'])(?=[^>]*\bfetchpriority=["']high["'])(?=[^>]*saeed-ghezelbash-portrait-delivery-640)[^>]*>/gi;
const heroEarlyHint = `Link: <${HERO_EARLY_HINT_HREF}>; rel=preload; as=image; type="image/avif"; media="screen and (max-width: 540px) and (min-resolution: 1.25dppx) and (max-resolution: 2.5dppx)"; fetchpriority=high`;

const [
  release,
  documentHeadProfile,
  documentHead,
  baseLayout,
  indexSource,
  headersTemplate,
] = await Promise.all([
  readFile(path.join(root, "src/data/release.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "src/data/document-head.json"), "utf8").then(
    JSON.parse,
  ),
  readFile(path.join(root, "src/components/DocumentHead.astro"), "utf8"),
  readFile(path.join(root, "src/layouts/BaseLayout.astro"), "utf8"),
  readFile(path.join(root, "src/pages/index.astro"), "utf8"),
  readFile(path.join(root, "src/data/templates/headers.template"), "utf8"),
]);
assert(
  HERO_PRELOAD_HREF.includes("saeed-ghezelbash-portrait-delivery-640"),
  "Canonical Hero preload href drift",
);
assert(
  HERO_PRELOAD_SRCSET.includes(HERO_PRELOAD_HREF) &&
    HERO_PRELOAD_SRCSET.includes(`${HERO_EARLY_HINT_HREF} 960w`) &&
    HERO_PRELOAD_SRCSET.includes(" 1600w"),
  "Canonical Hero preload srcset drift",
);
assert(HERO_IMAGE_SIZES.length > 0, "Canonical Hero sizes contract missing");
assert(
  /const\s+discoveryLinks\s*:\s*DiscoveryLink\[\]\s*=/.test(documentHead) &&
    /discoveryLinks\.map\s*\(\s*\(?\s*link\s*\)?\s*=>\s*<link\s+\{\.\.\.link\}/.test(
      documentHead,
    ),
  "Astro-native discovery Head contract missing",
);
assert(
  /HEAD_RESOURCES\.map\s*\(/.test(documentHead) &&
    /rel\s*:\s*["']me["']/.test(documentHead) &&
    /rel\s*:\s*["']related["']/.test(documentHead),
  "Discovery Head must retain machine-readable relations",
);
assert(
  documentHead.includes("document-head.json") &&
    documentHead.includes("release.json") &&
    documentHead.includes("HERO_PRELOAD_SRCSET") &&
    documentHead.includes("headGraph") &&
    documentHead.includes("<slot />") &&
    !/\bHeadStage\b|\bstage\s*=/.test(documentHead),
  "Structured DocumentHead contract missing",
);
assert(
  !documentHead.includes("href={HERO_PRELOAD_HREF}"),
  "Responsive Hero preload must not trigger the fallback candidate in browsers that select from imagesrcset",
);
assert(
  headersTemplate.includes("Link: <{{HERO_EARLY_HINT_HREF}}>;"),
  "Mobile Hero Early Hint must bind the canonical Hero contract",
);
assert(
  documentHead.includes("release.canonicalUrl"),
  "DocumentHead canonical URL binding missing",
);
assert(
  baseLayout.includes("release.json") &&
    baseLayout.includes("frontmatter.title") &&
    baseLayout.includes("frontmatter.description"),
  "BaseLayout canonical content metadata authority missing",
);
assert(
  baseLayout.includes("new URL(release.canonicalUrl)"),
  "BaseLayout canonical URL authority drift",
);
for (const token of [
  "addEventListener('load'",
  "addEventListener('error'",
  "link.sheet",
  "setTimeout(activate, 2500)",
])
  assert(
    baseLayout.includes(token),
    `Deferred stylesheet recovery missing: ${token}`,
  );
assert(
  /import\s*\{[^}]*\bfrontmatter\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/\.generated\/content\/home\.md['"]/.test(
    indexSource,
  ),
  "Index must consume canonical generated Markdown frontmatter",
);
assert(
  count(baseLayout, /<DocumentHead\b/g) === 1 &&
    count(baseLayout, /<\/DocumentHead>/g) === 1,
  "BaseLayout must compose one DocumentHead instance",
);
for (const field of [
  "title",
  "description",
  "robots",
  "lang",
  "dir",
  "canonicalUrl",
])
  assert(
    !Object.hasOwn(documentHeadProfile, field),
    `Document Head metadata may not own page field: ${field}`,
  );
assert(
  /^https:\/\/www\.ghezelbaash\.ir\/$/.test(release.canonicalUrl),
  "Canonical release URL identity drift",
);
const sourceOrder = [
  "<DocumentHead",
  "<style is:inline",
  'fetchpriority="low"',
  'id="deferred-stylesheet-loader"',
  'id="entity-core"',
  "</DocumentHead>",
].map((token) => baseLayout.indexOf(token));
assert(
  sourceOrder.every((index) => index >= 0) &&
    sourceOrder.every(
      (value, index) => index === 0 || sourceOrder[index - 1] < value,
    ),
  "BaseLayout critical-path source order drift",
);
assert(
  !/static\.cloudflareinsights\.com/i.test(documentHead + baseLayout),
  "Cloudflare Insights must not be authored into canonical source",
);

const distArg = process.argv[2];
if (distArg) {
  const dist = path.resolve(root, distArg);
  await access(path.join(dist, "index.html"));
  const [html, headers] = await Promise.all([
    readFile(path.join(dist, "index.html"), "utf8"),
    readFile(path.join(dist, "_headers"), "utf8"),
  ]);
  const heroPreloads = html.match(heroPreloadPattern) || [];
  const heroPreload = heroPreloads[0];
  const criticalStyle = html.match(
    /<style(?:\s[^>]*)?>[\s\S]*?<\/style>/i,
  )?.[0];
  const deferredPreload = html.match(
    /<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["']style["'])(?=[^>]*\bfetchpriority=["']low["'])(?=[^>]*\bdata-deferred-stylesheet\b)[^>]*>/i,
  )?.[0];
  const loader = html.match(
    /<script\b(?=[^>]*\bid=["']deferred-stylesheet-loader["'])[^>]*>[\s\S]*?<\/script>/i,
  )?.[0];
  const core = html.match(
    /<script\b(?=[^>]*\bid=["']entity-core["'])(?=[^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/i,
  )?.[0];
  const discovery = html.match(
    /<link\b(?=[^>]*\brel=["']describedby["'])[^>]*>/i,
  )?.[0];
  for (const [value, label] of [
    [heroPreload, "Hero preload"],
    [criticalStyle, "critical CSS"],
    [deferredPreload, "low-priority deferred CSS preload"],
    [loader, "deferred stylesheet loader"],
    [core, "entity-core JSON-LD"],
    [discovery, "discovery Head relation"],
  ])
    assert(value, `DIST ${label} missing`);
  for (const token of [
    "addEventListener('load'",
    "addEventListener('error'",
    "link.sheet",
    "setTimeout(activate, 2500)",
  ])
    assert(
      loader.includes(token),
      `DIST deferred stylesheet recovery missing: ${token}`,
    );
  assert(heroPreloads.length === 1, "DIST duplicate Hero preload detected");
  assert(
    headers.split(/\r?\n/).filter((line) => line.trim() === heroEarlyHint)
      .length === 1,
    "DIST mobile Hero Early Hint header drift",
  );
  const order = [
    heroPreload,
    criticalStyle,
    deferredPreload,
    loader,
    core,
    discovery,
  ].map((value) => html.indexOf(value));
  assert(
    order.every((value, index) => index === 0 || order[index - 1] < value),
    "DIST critical-path ordering drift",
  );
  assert(
    count(html, /<title>/gi) === 1 &&
      count(html, /\bname=["']description["']/gi) === 1 &&
      count(html, /\brel=["']canonical["']/gi) === 1,
    "DIST primary metadata duplication detected",
  );
  assert(
    count(html, /\bproperty=["']og:title["']/gi) === 1 &&
      count(html, /\bname=["']twitter:title["']/gi) === 1,
    "DIST social metadata duplication detected",
  );
  assert(
    html.includes(`href="${release.canonicalUrl}" rel="canonical"`) ||
      html.includes(`rel="canonical" href="${release.canonicalUrl}"`),
    "DIST canonical URL diverges from release identity",
  );
  assert(
    html.includes(documentHeadProfile.openGraph.image) &&
      html.includes(documentHeadProfile.openGraph.imageAlt),
    "DIST social presentation profile drift",
  );
  assert(
    !/static\.cloudflareinsights\.com/i.test(html),
    "Cloudflare Insights unexpectedly entered static DIST",
  );
}

console.log(
  JSON.stringify(
    {
      stage: "CRITICAL_PATH",
      headAuthority: "astro-native-single-pass",
      contentMetadataAuthority: "markdown-frontmatter",
      canonicalUrlAuthority: "release.json",
      presentationAuthority: "document-head.json",
      generatedContentAuthority: ".generated/content/home.md",
      discoveryRendering: "astro-native",
      distValidated: Boolean(distArg),
      integrity: "PASS",
    },
    null,
    2,
  ),
);
