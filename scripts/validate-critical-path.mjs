import path from "node:path";
import { access, readFile } from "node:fs/promises";
import {
  HERO_IMAGE_768_HREF,
  HERO_IMAGE_960_HREF,
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
const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const heroPreloadPattern =
  /<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["']image["'])(?=[^>]*\bfetchpriority=["']high["'])(?=[^>]*saeed-ghezelbash-portrait-delivery-640)[^>]*>/gi;
// A fixed HTTP preload can fetch a different candidate from the responsive HTML.
const fixedHeroPreloadPattern =
  /<[^>\r\n]*(?:saeed-ghezelbash-portrait|{{HERO_)[^>\r\n]*>[^<\r\n]*\brel\s*=\s*["']?preload\b/i;

const [
  release,
  documentHeadProfile,
  canonicalGraph,
  documentHead,
  baseLayout,
  indexSource,
  pageSource,
  headersTemplate,
] = await Promise.all([
  readFile(path.join(root, "src/data/release.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "src/data/document-head.json"), "utf8").then(
    JSON.parse,
  ),
  readFile(
    path.join(root, "src/data/semantic/knowledge-graph.jsonld"),
    "utf8",
  ).then(JSON.parse),
  readFile(path.join(root, "src/components/DocumentHead.astro"), "utf8"),
  readFile(path.join(root, "src/layouts/BaseLayout.astro"), "utf8"),
  readFile(path.join(root, "src/pages/index.astro"), "utf8"),
  readFile(path.join(root, "src/content-source/page.md"), "utf8"),
  readFile(path.join(root, "src/data/templates/headers.template"), "utf8"),
]);
assert(
  HERO_PRELOAD_HREF.includes("saeed-ghezelbash-portrait-delivery-640"),
  "Canonical Hero preload href drift",
);
assert(
  HERO_PRELOAD_SRCSET.includes(HERO_PRELOAD_HREF) &&
    HERO_PRELOAD_SRCSET.includes(`${HERO_IMAGE_768_HREF} 768w`) &&
    HERO_PRELOAD_SRCSET.includes(`${HERO_IMAGE_960_HREF} 960w`) &&
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
    documentHead.includes("canonicalGraph") &&
    documentHead.includes("deriveCanonicalAuthority") &&
    documentHead.includes("<slot />") &&
    !/\bHeadStage\b|\bstage\s*=/.test(documentHead),
  "Structured DocumentHead canonical authority contract missing",
);
assert(
  !documentHead.includes("href={HERO_PRELOAD_HREF}"),
  "Responsive Hero preload must not trigger the fallback candidate in browsers that select from imagesrcset",
);
assert(
  !fixedHeroPreloadPattern.test(headersTemplate),
  "Hero candidate selection must remain in the responsive HTML preload, without a fixed HTTP preload",
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
assert(
  !Object.hasOwn(documentHeadProfile, "openGraph"),
  "Presentation-only document-head.json may not own Open Graph semantic metadata",
);
const sourceFrontmatter = pageSource.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/u);
assert(sourceFrontmatter, "Canonical page frontmatter missing for social metadata");
const sourceFrontmatterValue = (key) => {
  const field = sourceFrontmatter[1].match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  assert(field, `Canonical page frontmatter missing ${key}`);
  return JSON.parse(field[1]);
};
const pageLang = sourceFrontmatterValue("lang");
const socialImageAlt = sourceFrontmatterValue("socialImageAlt");
const socialAlternateLocales = sourceFrontmatterValue("socialAlternateLocales");

const graphNodes = canonicalGraph["@graph"] || [];
const websiteNode = graphNodes.find(
  (node) => node?.["@id"] === `${release.canonicalUrl}#website`,
);
const websiteDisplayNames = new Set([
  websiteNode?.name,
  ...([websiteNode?.alternateName].flat().filter((value) => typeof value === "string")),
].filter((value) => typeof value === "string" && value.length > 0));
assert(
  websiteDisplayNames.has(documentHeadProfile.appleMobileWebAppTitle),
  "Apple web-app title must select a canonical WebSite graph label",
);
const types = (node) =>
  Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]];
const socialImages = graphNodes.filter(
  (node) =>
    types(node).includes("ImageObject") &&
    Number(node?.width?.value) === 1200 &&
    Number(node?.height?.value) === 630 &&
    typeof node?.contentUrl === "string" &&
    new URL(node.contentUrl).origin === new URL(release.canonicalUrl).origin,
);
assert(
  socialImages.length === 1,
  `Canonical social ImageObject must be unique; found ${socialImages.length}`,
);
const [socialImage] = socialImages;
const canonicalPage = graphNodes.find(
  (node) => node?.["@id"] === `${release.canonicalUrl}#webpage`,
);
const canonicalPageTypes = types(canonicalPage);
assert(
  canonicalPageTypes.includes("ProfilePage"),
  "Canonical graph page must own ProfilePage Open Graph type semantics",
);
assert(
  Array.isArray(canonicalPage?.inLanguage) && canonicalPage.inLanguage.includes(pageLang),
  "Canonical page language must be declared by graph",
);
const primaryLocaleMatch = /^([a-z]{2,3})-([A-Z]{2})$/.exec(pageLang);
assert(primaryLocaleMatch, "Canonical page language cannot project Open Graph locale");
const graphLanguageBases = new Set(
  canonicalPage.inLanguage.map((value) => String(value).split("-")[0]),
);
assert(
  Array.isArray(socialAlternateLocales) &&
    socialAlternateLocales.length > 0 &&
    new Set(socialAlternateLocales).size === socialAlternateLocales.length &&
    socialAlternateLocales.every((locale) => {
      const match = /^([a-z]{2,3})_([A-Z]{2})$/.exec(locale);
      return Boolean(match && graphLanguageBases.has(match[1]));
    }),
  "Canonical Markdown social alternate locale contract is invalid",
);
const socialProfile = Object.freeze({
  type: "profile",
  locale: `${primaryLocaleMatch[1]}_${primaryLocaleMatch[2]}`,
  alternateLocales: socialAlternateLocales,
  image: socialImage.contentUrl,
  imageType: socialImage.encodingFormat,
  imageWidth: Number(socialImage.width.value),
  imageHeight: Number(socialImage.height.value),
  imageAlt: socialImageAlt,
  twitterCard: documentHeadProfile.twitter?.card,
});
assert(
  typeof socialProfile.type === "string" &&
    typeof socialProfile.locale === "string" &&
    Array.isArray(socialProfile.alternateLocales) &&
    socialProfile.alternateLocales.length > 0 &&
    typeof socialProfile.image === "string" &&
    typeof socialProfile.imageType === "string" &&
    Number.isInteger(socialProfile.imageWidth) &&
    socialProfile.imageWidth === 1200 &&
    Number.isInteger(socialProfile.imageHeight) &&
    socialProfile.imageHeight === 630 &&
    typeof socialProfile.imageAlt === "string" &&
    socialProfile.imageAlt.length > 0 &&
    typeof socialProfile.twitterCard === "string" &&
    socialProfile.twitterCard.length > 0,
  "Canonical Graph + presentation social profile is incomplete",
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
  const metaHas = (attribute, name, content) =>
    new RegExp(
      `<meta\\b(?=[^>]*\\b${escapeRegExp(attribute)}=["']${escapeRegExp(name)}["'])(?=[^>]*\\bcontent=["']${escapeRegExp(content)}["'])[^>]*>`,
      "i",
    ).test(html);
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
    !fixedHeroPreloadPattern.test(headers),
    "DIST fixed HTTP Hero preload conflicts with responsive candidate selection",
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
    metaHas("property", "og:type", socialProfile.type) &&
      metaHas("property", "og:locale", socialProfile.locale) &&
      socialProfile.alternateLocales.every((locale) =>
        metaHas("property", "og:locale:alternate", locale),
      ) &&
      metaHas("property", "og:image", socialProfile.image) &&
      metaHas("property", "og:image:secure_url", socialProfile.image) &&
      metaHas("property", "og:image:type", socialProfile.imageType) &&
      metaHas("property", "og:image:width", String(socialProfile.imageWidth)) &&
      metaHas("property", "og:image:height", String(socialProfile.imageHeight)) &&
      metaHas("property", "og:image:alt", socialProfile.imageAlt) &&
      metaHas("name", "twitter:card", socialProfile.twitterCard) &&
      metaHas("name", "twitter:image", socialProfile.image) &&
      metaHas("name", "twitter:image:alt", socialProfile.imageAlt),
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
      semanticHeadAuthority: "markdown-frontmatter+canonical-graph",
      generatedContentAuthority: ".generated/content/home.md",
      discoveryRendering: "astro-native",
      distValidated: Boolean(distArg),
      integrity: "PASS",
    },
    null,
    2,
  ),
);
