import { readFile } from "node:fs/promises";
import { deriveSiteData } from "../src/lib/site-data.mjs";
import { assembleCanonicalContent } from "./lib/assemble-content.mjs";
import { loadRedirectRegistry } from "./lib/redirect-registry.mjs";
import {
  assertRenderedClinicReputation,
  validateReputationObservation,
} from "../src/lib/reputation-observation.mjs";

const [quick, runtime, observationSource] = await Promise.all([
  readFile("src/components/FloatingActionDock.astro", "utf8"),
  readFile("src/components/GuideNavigator.astro", "utf8"),
  readFile("src/data/reputation-observation.json", "utf8"),
]);
const release = JSON.parse(await readFile("src/data/release.json", "utf8"));
const graph = JSON.parse(
  await readFile("src/data/semantic/knowledge-graph.jsonld", "utf8"),
);
const observation = validateReputationObservation(
  JSON.parse(observationSource),
  release,
);
const redirectRegistry = await loadRedirectRegistry();
const site = deriveSiteData(release, graph);
const { content: source } = await assembleCanonicalContent({ graph });
assertRenderedClinicReputation(source, {
  observation,
  release,
  mapsUrl: site.mapsUrl,
});

const fail = (message) => {
  throw new Error(message);
};
const heroActions = source.match(
  /<div\b[^>]*class=["'][^"']*\bhero-actions\b[^"']*["'][^>]*>[\s\S]*?<\/div>/i,
)?.[0];
if (!heroActions) fail("Critical hero CTA container is missing");
const hero = [
  ...heroActions.matchAll(
    /<a\b[^>]*class=["'][^"']*\bhero-action\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi,
  ),
].map((m) => m[0]);
if (hero.length !== 3)
  fail(`Critical hero CTA count drift: ${hero.length} != 3`);

const heroContract = [
  { label: "رزرو وقت مشاوره رایگان", href: site.telHref, primary: true },
  { label: "مشاهده نمونه‌کارهای دکتر قزلباش", href: site.instagramUrl },
  { label: "آدرس دقیق کلینیک", href: "https://doctor.ghezelbaash.ir/" },
];
const visibleText = (anchor) =>
  anchor
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const heroFacts = source.match(
  /<div\b[^>]*class=["'][^"']*\bhero-caption-facts\b[^"']*["'][^>]*>[\s\S]*?<\/div>/i,
)?.[0];
if (!heroFacts) fail("Hero trust facts container is missing");
const heroMapsLinks = [
  ...heroFacts.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi),
].filter((match) => match[1] === site.mapsUrl);
if (heroMapsLinks.length !== 1)
  fail(`Hero Maps evidence link drift: ${heroMapsLinks.length} != 1`);
if (!visibleText(heroMapsLinks[0][0]))
  fail("Hero Maps evidence link has no accessible text");
if (
  !/<data\b(?=[^>]*\bdata-clinic-rating\b)(?=[^>]*\bvalue=["'][^"']+["'])[^>]*>[\s\S]*?<\/data>/i.test(
    heroFacts,
  ) ||
  !/<data\b(?=[^>]*\bdata-clinic-review-count\b)(?=[^>]*\bvalue=["'][^"']+["'])[^>]*>[\s\S]*?<\/data>/i.test(
    heroFacts,
  ) ||
  !/<span\b(?=[^>]*\bclass=["']google-maps-attribution["'])(?=[^>]*\btranslate=["']no["'])[^>]*>Google Maps<\/span>/i.test(
    heroMapsLinks[0][0],
  )
)
  fail("Static Maps reputation values or attribution drift");
if (/fetch\s*\(/.test(runtime))
  fail("Request-time network retrieval re-entered the page runtime");

for (const contract of heroContract) {
  const hits = hero.filter(
    (anchor) =>
      visibleText(anchor) === contract.label &&
      anchor.includes(`href="${contract.href}"`),
  );
  if (hits.length !== 1)
    fail(`Hero CTA contract drift: ${contract.label} (${hits.length})`);
  if (contract.primary && !hits[0].includes("hero-action--primary"))
    fail("Reservation CTA lost primary hierarchy");
  const text = visibleText(hits[0]);
  if (text !== contract.label)
    fail(`Hero CTA accessible text drift: ${contract.label} -> ${text}`);
}

const doctorRedirect = redirectRegistry.singleRedirects.rules.find(
  (rule) => rule.host === "doctor.ghezelbaash.ir",
);
if (
  doctorRedirect?.statusCode !== 301 ||
  doctorRedirect?.match !== "allPaths" ||
  !/(google\.com\/maps|maps\.google)/i.test(doctorRedirect?.target || "")
)
  fail("doctor subdomain no longer maps to the clinic map redirect contract");
const backToTop = quick.match(
  /<a\b(?=[^>]*\bdata-quick-actions-top\b)[^>]*>/i,
)?.[0];
if (
  !backToTop ||
  !/\bclass=["'][^"']*\bquick-actions__top\b[^"']*["']/i.test(backToTop) ||
  !/\bhidden\b/i.test(backToTop) ||
  !/\bhref=["']#main-content["']/i.test(backToTop)
)
  fail("Deferred back-to-top control drift");
if (
  !/let\s+topFrame\s*=\s*0/.test(runtime) ||
  !/const\s+setTopVisible\s*=\s*\(visible\)\s*=>/.test(runtime) ||
  !/top\.dataset\.visible\s*=\s*["']true["']/.test(runtime) ||
  !/top\.dataset\.visible\s*=\s*["']false["']/.test(runtime) ||
  !/setTopVisible\(scrollY\s*>\s*Math\.max\(960,\s*innerHeight\s*\*\s*1\.2\)\)/.test(
    runtime,
  ) ||
  !/requestAnimationFrame\(\(\)\s*=>/.test(runtime) ||
  !/addEventListener\(["']scroll["']\s*,\s*syncTop\s*,\s*\{\s*passive:\s*true\s*\}\)/.test(
    runtime,
  ) ||
  !/addEventListener\(["']resize["']\s*,\s*syncTop\s*,\s*\{\s*passive:\s*true\s*\}\)/.test(
    runtime,
  ) ||
  !/top\.hidden\s*=\s*true/.test(runtime) ||
  !/top\.hidden\s*=\s*false/.test(runtime)
)
  fail("Modern threshold-driven back-to-top visibility contract drift");
for (const [binding, label] of [
  ["href={site.telHref}", "تماس"],
  ["href={site.chatUrl}", "چت با دکتر قزلباش"],
  ["href={site.directionsUrl}", "مسیریابی"],
])
  if (!quick.includes(binding))
    fail(`Floating CTA canonical binding drift: ${label}`);
const floating = [...quick.matchAll(/<a\b([^>]*)>[\s\S]*?<\/a>/g)]
  .filter((match) =>
    ((match[1].match(/\bclass=["']([^"']+)["']/i) || [])[1] || "")
      .split(/\s+/)
      .includes("quick-actions__item"),
  )
  .map((match) => match[0]);
if (floating.length !== 3)
  fail(`Floating CTA count drift: ${floating.length} != 3`);
for (const copy of [
  "<span>تماس</span>",
  "<strong>چت با دکتر قزلباش</strong>",
  "<span>مسیریابی</span>",
])
  if (!floating.some((anchor) => anchor.includes(copy)))
    fail(`Floating CTA copy drift: ${copy}`);
for (const [binding, label] of [
  ["href={site.telHref}", "تماس"],
  ["href={site.chatUrl}", "چت با دکتر قزلباش"],
  ["href={site.directionsUrl}", "مسیریابی"],
])
  if (floating.filter((anchor) => anchor.includes(binding)).length !== 1)
    fail(`Floating CTA unique binding drift: ${label}`);
for (const [index, anchor] of floating.entries())
  if (!/aria-label=["'][^"']+["']/i.test(anchor))
    fail(`Floating CTA aria-label missing at index ${index}`);
const directions = new URL(site.directionsUrl);
if (
  directions.searchParams.get("destination_place_id") !== release.clinic.placeId
)
  fail("Floating directions Place ID drift");

console.log(
  JSON.stringify(
    {
      criticalCtas: "PASS",
      hero: heroContract.map((item) => item.label),
      floating: ["تماس", "چت با دکتر قزلباش", "مسیریابی"],
      reputation: {
        delivery: "INITIAL_HTML",
        entity: observation.entity,
        placeId: observation.placeId,
        rating: observation.rating,
        reviewCount: observation.reviewCount,
      },
      backToTop: "HIDDEN_UNTIL_SCROLL_THRESHOLD",
      directionsPlaceId: release.clinic.placeId,
      heroMapsEvidence: "STATIC_VALIDATED_GOOGLE_MAPS_OBSERVATION",
      contactAuthority: "release+canonical-graph",
      validationSurface: "assembled-canonical-content",
      destinationsLocked: true,
    },
    null,
    2,
  ),
);
