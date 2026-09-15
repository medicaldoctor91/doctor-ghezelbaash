import { loadPublicationData } from "./lib/publication-context.mjs";
import path from "node:path";
import { access, readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { deriveGraphProjections } from "./lib/projections/graph-projections.mjs";
import { deriveCanonicalAnswerProjection, validateProjectedAnswerHtml } from "../src/lib/answer-projection.mjs";

const root = process.cwd();
const fail = (message) => {
  throw new Error(message);
};
const assert = (condition, message) => {
  if (!condition) fail(message);
};
const read = (relative) => readFile(path.join(root, relative), "utf8");
const readJson = (relative) => read(relative).then(JSON.parse);

const required = [
  "astro.config.mjs",
  ".github/workflows/reputation-refresh.yml",
  "src/lib/reputation-observation.mjs",
  "scripts/reputation.mjs",
  "src/content-source/page.md",
  "src/data/document-head.json",
  "src/data/machine-resources.json",
  "src/data/release.json",
  "src/data/semantic/head-profile.json",
  "src/data/semantic/support-profile.json",
  "src/lib/answer-projection.mjs",
  "src/lib/google-page-microdata.mjs",
  "src/lib/resources.mjs",
  "src/pages/favicon.png.ts",
  "src/styles/global.css",
  "scripts/generated-workspace.mjs",
  "scripts/generate-projections.mjs",
  "scripts/generate-retrieval-projections.mjs",
  "scripts/generate-descriptors.mjs",
  "scripts/materialize-static-artifacts.mjs",
  "scripts/generate-deployment-headers.mjs",
  "scripts/lib/projection-context.mjs",
  "scripts/lib/projections/page-assets.mjs",
  "scripts/lib/projections/graph-projections.mjs",
  "scripts/lib/projections/semantic-corpus.mjs",
  "scripts/lib/projections/retrieval-corpus.mjs",
  "scripts/lib/projections/contact-discovery.mjs",
  "scripts/validate-dist-production.mjs",
  "scripts/test-performance.mjs",
  "scripts/test-dist-interactions.mjs",
  "scripts/test-answer-projection.mjs",
  ".github/workflows/ci.yml",
];
for (const file of required) await access(path.join(root, file));
const routes = (
  await readdir(path.join(root, "src/pages"), { withFileTypes: true })
)
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();
assert(
  JSON.stringify(routes) ===
    JSON.stringify(["404.astro", "favicon.png.ts", "index.astro"]),
  `Astro route surface drift: ${routes.join(", ")}`,
);
const rootEntries = (await readdir(root, { withFileTypes: true })).map(
  (entry) => entry.name,
);
assert(
  !rootEntries.includes("functions"),
  "Static Cloudflare Pages source must not declare a server-runtime surface",
);
const contentSources = (
  await readdir(path.join(root, "src/content-source"), { withFileTypes: true })
)
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();
assert(
  JSON.stringify(contentSources) === JSON.stringify(["page.md"]),
  `Content authority must be page.md only: ${contentSources.join(", ")}`,
);
const styles = (
  await readdir(path.join(root, "src/styles"), { withFileTypes: true })
)
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();
assert(
  JSON.stringify(styles) === JSON.stringify(["global.css"]),
  `Presentation authority must be global.css only: ${styles.join(", ")}`,
);

const pageSource = await read("src/content-source/page.md");
const frontmatter = pageSource.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
assert(frontmatter, "Canonical page frontmatter missing");
const frontmatterKeys = frontmatter[1]
  .split(/\r?\n/)
  .map((line) => line.match(/^([A-Za-z][A-Za-z0-9_-]*):/)?.[1])
  .filter(Boolean);
assert(
  JSON.stringify(frontmatterKeys) ===
    JSON.stringify([
      "title",
      "description",
      "lang",
      "dir",
      "robots",
      "socialImageAlt",
      "socialAlternateLocales",
      "footerGovernance",
    ]),
  `Page frontmatter schema drift: ${frontmatterKeys.join(", ")}`,
);

const [
  pkg,
  orchestrator,
  projectionContext,
  pageAssets,
  graphCompiler,
  semanticCompiler,
  retrievalCompiler,
  contactCompiler,
  documentHead,
  baseLayout,
  guideNavigator,
  contentAssembler,
  reputationModule,
  reputationScript,
  reputationWorkflow,
  platformContract,
  indexPage,
  knowledgeGraph,
  googlePageMicrodata,
  resourceRegistry,
  materializer,
  deploymentHeadersGenerator,
  descriptorGenerator,
  retrievalGenerator,
  astroConfigSource,
  release,
  machineResourceRegistry,
  headProfile,
  supportProfile,
  ciWorkflow,
] = await Promise.all([
  readJson("package.json"),
  read("scripts/generate-projections.mjs"),
  read("scripts/lib/projection-context.mjs"),
  read("scripts/lib/projections/page-assets.mjs"),
  read("scripts/lib/projections/graph-projections.mjs"),
  read("scripts/lib/projections/semantic-corpus.mjs"),
  read("scripts/lib/projections/retrieval-corpus.mjs"),
  read("scripts/lib/projections/contact-discovery.mjs"),
  read("src/components/DocumentHead.astro"),
  read("src/layouts/BaseLayout.astro"),
  read("src/components/GuideNavigator.astro"),
  read("scripts/lib/assemble-content.mjs"),
  read("src/lib/reputation-observation.mjs"),
  read("scripts/reputation.mjs"),
  read(".github/workflows/reputation-refresh.yml"),
  readJson(".release/policy/platform-contract.json"),
  read("src/pages/index.astro"),
  read("src/lib/knowledge-graph.ts"),
  read("src/lib/google-page-microdata.mjs"),
  read("src/lib/resources.mjs"),
  read("scripts/materialize-static-artifacts.mjs"),
  read("scripts/generate-deployment-headers.mjs"),
  read("scripts/generate-descriptors.mjs"),
  read("scripts/generate-retrieval-projections.mjs"),
  read("astro.config.mjs"),
  loadPublicationData(root),
  readJson("src/data/machine-resources.json"),
  readJson("src/data/semantic/head-profile.json"),
  readJson("src/data/semantic/support-profile.json"),
  read(".github/workflows/ci.yml"),
]);
const [siteFooter, canonicalGraphSource] = await Promise.all([
  read("src/components/SiteFooter.astro"),
  readJson("src/data/semantic/knowledge-graph.jsonld"),
]);
const { default: astroConfig } = await import(
  pathToFileURL(path.join(root, "astro.config.mjs")).href
);

assert(
  !/\b(?:readFile|writeFile|readdir|unlink)\b/.test(orchestrator),
  "Projection orchestrator must delegate artifact I/O",
);
for (const owner of [
  "compilePageAssets",
  "compileGraphProjections",
  "compileSemanticCorpus",
  "compileRetrievalCorpus",
  "compileContactDiscovery",
])
  assert(orchestrator.includes(owner), `Projection owner missing: ${owner}`);
assert(
  orchestrator.includes("loadProjectionContext"),
  "Projection context is not centralized",
);

assert(
  /from\s+['"]\.\.\/generated-workspace\.mjs['"]/.test(projectionContext) &&
    /generatedSemantic\s*:\s*generated\.semantic/.test(projectionContext),
  "Projection context must own generated workspace paths",
);
assert(
  pageAssets.includes("generatedContent") &&
    pageAssets.includes("generatedAssets"),
  "Page asset compiler must target generated workspace",
);
assert(
  /path\.join\(semantic,\s*['"]head-profile\.json['"]\)/.test(graphCompiler) &&
    /path\.join\(semantic,\s*['"]support-profile\.json['"]\)/.test(
      graphCompiler,
    ),
  "Graph compiler must consume the two projection profiles directly",
);
const canonicalGraph = await readJson("src/data/semantic/knowledge-graph.jsonld");
const documentHeadPolicy = await readJson("src/data/document-head.json");
const finalProjection = deriveGraphProjections({
  graph: canonicalGraph,
  release,
  headProfile,
  supportProfile,
});
for (const [label, profile, document] of [
  ["Head", headProfile, finalProjection.headDoc],
  ["Support", supportProfile, finalProjection.supportDoc],
]) {
  assert(
    JSON.stringify(profile.ids) ===
      JSON.stringify(document["@graph"].map((node) => node["@id"])),
    `${label} final selection differs from its declarative profile`,
  );
  const context = document["@context"];
  assert(
    context?.["@version"] === 1.1 &&
      context["@vocab"] === "https://schema.org/" &&
      context.schema === "https://schema.org/" &&
      Object.entries(context).every(([term, definition]) =>
        Object.hasOwn(canonicalGraph["@context"], term) &&
        JSON.stringify(definition) === JSON.stringify(canonicalGraph["@context"][term]),
      ),
    `${label} final context must preserve its canonical Schema.org definitions`,
  );
}
assert(
  /path\.join\(generatedSemantic,\s*['"]head-graph\.json['"]\)/.test(
    graphCompiler,
  ) &&
    /path\.join\(generatedSemantic,\s*['"]support-graph\.json['"]\)/.test(
      graphCompiler,
    ),
  "Graph compiler must own both generated graph projections",
);
assert(
  Array.isArray(headProfile.ids) &&
    headProfile.ids.length > 0 &&
    new Set(headProfile.ids).size === headProfile.ids.length,
  "Head profile IDs are invalid",
);
assert(
  Array.isArray(supportProfile.ids) &&
    supportProfile.ids.length > 0 &&
    new Set(supportProfile.ids).size === supportProfile.ids.length,
  "Support profile IDs are invalid",
);
assert(
  /path\.join\(projections,\s*['"]entity-facts\.csv['"]\)/.test(
    semanticCompiler,
  ),
  "Semantic corpus must target the generated projections path",
);
validateProjectedAnswerHtml(
  pageSource,
  deriveCanonicalAnswerProjection(canonicalGraph, release),
);
assert(
  retrievalCompiler.includes("generatedContent") &&
    retrievalCompiler.includes("projections"),
  "Retrieval corpus must use generated content and projections paths",
);
assert(
  contactCompiler.includes("generatedPublic") &&
    contactCompiler.includes("projections"),
  "Contact discovery must use generated public and projections paths",
);

assert(
  /import\s+documentHead\s+from\s+['"]\.\.\/data\/document-head\.json['"]/.test(
    documentHead,
  ) &&
    /import\s+release\s+from\s+['"]\.\.\/data\/release\.json['"]/.test(
      documentHead,
    ) &&
    /deriveCanonicalAuthority/.test(documentHead) &&
    /selectCanonicalSocialImage/.test(documentHead) &&
    /import\s*\{\s*canonicalGraph\s*\}\s*from\s*['"]\.\.\/lib\/knowledge-graph['"]/.test(
      documentHead,
    ) &&
    /HEAD_RESOURCES\s*\.map\s*\(/.test(documentHead) &&
    /exactLanguageLiteral\(\s*person\.name/.test(documentHead) &&
    /typeof website\.name/.test(documentHead) &&
    /values\(website\.alternateName\)/.test(documentHead) &&
    /documentHead\.appleMobileWebAppTitle/.test(documentHead) &&
    /authority\.primaryEntity\.verifiedWebIdentityMesh/.test(documentHead) &&
    /const\s+physicianId\s*=\s*refId\(page\.author\)/.test(documentHead) &&
    /values\(page\.about\)/.test(documentHead) &&
    /values\(page\.mentions\)/.test(documentHead) &&
    /values\(facts\.clinic\.sameAs\)/.test(documentHead) &&
    /authority\.clinicAuthority\.cid/.test(documentHead) &&
    /const\s+openGraphType\s*=\s*pageTypes\.includes\(['"]ProfilePage['"]\)\s*\?\s*['"]profile['"]/.test(documentHead) &&
    /page\.inLanguage/.test(documentHead) &&
    /socialImageAlt/.test(documentHead) &&
    /socialAlternateLocales/.test(documentHead) &&
    !/documentHead\.(?:author|applicationName|openGraph)/.test(documentHead),
  "Document Head must derive semantic identity/type/language directly from canonical graph and Markdown while consuming presentation and release lifecycle policy explicitly",
);
assert(
  JSON.stringify(Object.keys(documentHeadPolicy)) ===
    JSON.stringify(["appleMobileWebAppTitle", "themeColor", "twitter"]) &&
    JSON.stringify(Object.keys(documentHeadPolicy.twitter || {})) ===
      JSON.stringify(["card"]),
  "document-head.json must remain presentation-only and may not own page/Open Graph semantics",
);
assert(
  /discoveryLinks\s*\.map\s*\(\s*\(?\s*link\s*\)?\s*=>\s*<link\s+\{\.\.\.link\}/.test(
    documentHead,
  ),
  "Discovery links must be structured Astro elements",
);
assert(
  baseLayout.includes("../styles/global.css?raw") &&
    baseLayout.includes("../lib/css-delivery.mjs"),
  "Layout must assemble the single stylesheet directly",
);
const governanceField = frontmatter[1].match(/^footerGovernance:\s*(.+)$/m);
assert(governanceField, "Canonical page frontmatter missing footerGovernance");
const footerGovernance = JSON.parse(governanceField[1]);
assert(
  typeof footerGovernance.summary === "string" &&
    typeof footerGovernance.medicalNotice === "string" &&
    typeof footerGovernance.reputationLead === "string" &&
    typeof footerGovernance.mapsTerms?.href === "string" &&
    typeof footerGovernance.mapsTerms?.label === "string" &&
    typeof footerGovernance.privacyPolicy?.href === "string" &&
    typeof footerGovernance.privacyPolicy?.label === "string" &&
    typeof footerGovernance.tail === "string" &&
    siteFooter.includes("governance.medicalNotice") &&
    siteFooter.includes("governance.reputationLead") &&
    !siteFooter.includes("محتوای پزشکی این صفحه توسط دکتر سعید قزلباش بازبینی می‌شود") &&
    !siteFooter.includes("امتیاز و تعداد نظر کلینیک یک مشاهدهٔ زمان‌دار"),
  "Authored footer governance must be page-owned, not component-owned",
);
const reputationNodes = new Map(
  canonicalGraphSource["@graph"].map((node) => [node?.["@id"], node]),
);
const ratingObservation = reputationNodes.get(
  `${release.canonicalUrl}#observation-clinic-google-maps-rating-current`,
);
const reviewCountObservation = reputationNodes.get(
  `${release.canonicalUrl}#observation-clinic-google-maps-review-count-current`,
);
assert(
  !pageSource.includes("data-clinic-reputation-slot") &&
    pageSource.includes("{{CLINIC_GOOGLE_RATING_RAW}}") &&
    pageSource.includes("{{CLINIC_GOOGLE_REVIEW_COUNT_RAW}}") &&
    contentAssembler.includes("bindSiteTokens") &&
    !contentAssembler.includes("bindClinicReputation") &&
    !contentAssembler.includes("reputation-observation.json") &&
    ratingObservation?.measuredProperty === "https://schema.org/ratingValue" &&
    reviewCountObservation?.measuredProperty === "https://schema.org/reviewCount" &&
    ratingObservation?.observationDate?.["@type"] ===
      "http://www.w3.org/2001/XMLSchema#dateTime" &&
    reviewCountObservation?.observationDate?.["@type"] ===
      "http://www.w3.org/2001/XMLSchema#dateTime" &&
    ratingObservation?.observationDate?.["@value"] ===
      reviewCountObservation?.observationDate?.["@value"] &&
    ratingObservation?.measurementMethod === "Google Places API (New)" &&
    reviewCountObservation?.measurementMethod === "Google Places API (New)" &&
    reputationModule.includes("validateReputationObservation") &&
    reputationModule.includes("applyReputationObservation") &&
    reputationScript.includes('src/data/semantic/knowledge-graph.jsonld') &&
    reputationScript.includes("applyReputationObservation") &&
    reputationScript.includes("writeAtomic") &&
    reputationWorkflow.includes('cron: "23 */6 * * *"') &&
    reputationWorkflow.includes("GOOGLE_PLACES_API_KEY") &&
    reputationWorkflow.includes("node scripts/reputation.mjs google") &&
    reputationWorkflow.includes("src/data/semantic/knowledge-graph.jsonld") &&
    reputationWorkflow.split("places.googleapis.com/v1/places/").length - 1 ===
      1 &&
    !reputationWorkflow.includes("--retry") &&
    !reputationWorkflow.includes("huggingface") &&
    !reputationWorkflow.includes("zenodo") &&
    !reputationWorkflow.includes("cloudflare-pages.mjs"),
  "Graph-owned six-hour static clinic reputation pipeline drift",
);
assert(
  platformContract.cloudflare?.delivery?.mode === "static-assets" &&
    platformContract.cloudflare?.delivery?.serverRuntime === "none" &&
    JSON.stringify(platformContract.cloudflare?.delivery?.dynamicRoutes) ===
      JSON.stringify([]) &&
    JSON.stringify(
      platformContract.cloudflare?.delivery?.requiredProductionBindings,
    ) === JSON.stringify([]) &&
    !/fetch\s*\(/.test(guideNavigator),
  "Static-only Cloudflare delivery or client reputation runtime contract drift",
);
assert(
  !projectionContext.includes("graphByUrl") &&
    /const\s+sourceNodes\s*=\s*sourceNodesForUrl\((?:sourceUrl|projection\.sourceUrl)\)/.test(
      semanticCompiler,
    ) &&
    /const\s+graphNodes\s*=\s*sourceNodesForUrl\(anchor\)/.test(
      retrievalCompiler,
    ) &&
    retrievalGenerator.includes("sourceNodesForUrl(row.sourceUrl)") &&
    semanticCompiler.includes("sourceNodes.flatMap(evidenceRefsForNode)") &&
    retrievalCompiler.includes("passage.graphNodeIds.map"),
  "Semantic provenance must preserve every direct URL binding",
);
assert(
  /from\s+["']parse5["']/.test(retrievalCompiler) &&
    /lang\s*:\s*section\.lang/.test(retrievalCompiler) &&
    !/\/-ckb-iq|\/-ar-iq|english\)\(\?:\$\|-\)/.test(retrievalCompiler),
  "Retrieval language must propagate from the authored DOM",
);
assert(
  (baseLayout.match(/<DocumentHead\b/g) || []).length === 1 &&
    (baseLayout.match(/<\/DocumentHead>/g) || []).length === 1 &&
    documentHead.includes("<slot />") &&
    !/\bHeadStage\b|\bstage\s*=/.test(documentHead + baseLayout) &&
    baseLayout.includes("headGraphRaw") &&
    baseLayout.includes("supportGraphRaw"),
  "Layout must own head and semantic delivery",
);
assert(
  ["lang", "dir", "robots"].every((field) =>
    new RegExp(`\\b${field}\\s*:\\s*string`).test(baseLayout),
  ) &&
    /\bisMain\s*:\s*boolean/.test(baseLayout) &&
    !/\b(?:lang|dir|robots)\s*\?:/.test(baseLayout) &&
    !/\bisMain\s*\?:|\bisMain\s*=\s*(?:false|true)\b/.test(baseLayout) &&
    !/frontmatter\.(?:lang|dir|robots)\s*\?\?/.test(baseLayout) &&
    !/Astro\.site\s*\?\?|url\s*\?\?/.test(baseLayout),
  "Layout intent, frontmatter, and canonical resolution must be fail-closed",
);
assert(
  /export\s+function\s+deriveGooglePageMicrodata\b/.test(googlePageMicrodata) &&
    /itemType\s*:\s*['"]https:\/\/schema\.org\/ProfilePage['"]/.test(
      googlePageMicrodata,
    ) &&
    /mainEntityItemType\s*:\s*['"]https:\/\/schema\.org\/Person['"]/.test(
      googlePageMicrodata,
    ),
  "Google page Microdata must be derived by its canonical projection module",
);
for (const [label, pattern] of [
  ["projection call", /deriveGooglePageMicrodata\s*\(\s*headGraph/],
  [
    "itemscope",
    /itemscope=\{\s*googlePageMicrodata\s*\?\s*true\s*:\s*undefined\s*\}/,
  ],
  ["itemtype", /itemtype=\{\s*googlePageMicrodata\?\.itemType\s*\}/],
  ["itemid", /itemid=\{\s*googlePageMicrodata\?\.itemId\s*\}/],
  ["relation links", /googlePageMicrodata\.links\.map\s*\(/],
  ["language metadata", /googlePageMicrodata\.meta\.map\s*\(/],
])
  assert(
    pattern.test(baseLayout),
    `Layout Microdata binding missing: ${label}`,
  );
assert(
  /from ['"]\.\.\/\.\.\/\.generated\/content\/home\.md['"]/.test(indexPage),
  "Index route must consume generated canonical content",
);
assert(
  knowledgeGraph.includes("../../.generated/semantic/head-graph.json?raw") &&
    knowledgeGraph.includes("../../.generated/semantic/support-graph.json?raw"),
  "Astro must consume generated graph projections",
);
assert(
  /headGraphRaw\s*=\s*headGraphRawSource/.test(knowledgeGraph) &&
    /supportGraphRaw\s*=\s*supportGraphRawSource/.test(knowledgeGraph) &&
    !knowledgeGraph.includes("JSON.stringify(parsed)"),
  "Astro must deliver generated graph bytes without runtime rewriting",
);

assert(
  /import\s+registry\s+from\s+['"]\.\.\/data\/machine-resources\.json['"]/.test(
    resourceRegistry,
  ) &&
    resourceRegistry.includes("MACHINE_RESOURCES") &&
    resourceRegistry.includes("STATIC_ARTIFACTS") &&
    resourceRegistry.includes("HEAD_RESOURCES") &&
    resourceRegistry.includes("FOOTER_RESOURCES"),
  "Machine resources must be projected from their canonical registry",
);
const machineResources = machineResourceRegistry.resources;
assert(
  Array.isArray(machineResources) &&
    machineResources.length > 0 &&
    new Set(machineResources.map((resource) => resource.path)).size ===
      machineResources.length,
  "Machine resource registry is invalid",
);
for (const [resourcePath, title] of [
  ["doctor.vcf", "Physician vCard"],
  ["clinic.vcf", "Clinic vCard"],
]) {
  const resource = machineResources.find((row) => row.path === resourcePath);
  assert(
    resource?.source === `.generated/public/${resourcePath}` &&
      resource.mediaType === "text/vcard" &&
      JSON.stringify(resource.targets) === JSON.stringify(["website"]) &&
      resource.materialize === true &&
      resource.head?.rel === "related" &&
      resource.head?.title === title,
    `Canonical contact resource drift: ${resourcePath}`,
  );
}
assert(
  /from\s+['"]\.\.\/src\/lib\/resources\.mjs['"]/.test(materializer) &&
    /path\.join\(root,\s*['"]\.generated\/public['"]\)/.test(materializer),
  "Static materializer must own resources and generated public files",
);
assert(
  deploymentHeadersGenerator.includes("./lib/headers-template.mjs") &&
    /compileHeadersTemplate\(\s*headersTemplate,\s*\{[\s\S]*?mainCsp[\s\S]*?csp404[\s\S]*?httpResourceLinks[\s\S]*?\}\s*\)/.test(
      deploymentHeadersGenerator,
    ),
  "Deployment headers must be generated in one pass",
);
assert(
  !/\bunlink\b/.test(deploymentHeadersGenerator),
  "Deployment header generator may not delete build artifacts",
);

assert(
  JSON.stringify(Object.keys(astroConfig).sort()) ===
    JSON.stringify([
      "build",
      "compressHTML",
      "output",
      "site",
      "trailingSlash",
      "vite",
    ]),
  "Astro config surface must stay minimal and explicit",
);
assert(
  /import\s+release\s+from\s+["']\.\/src\/data\/release\.json["']\s+with\s+\{\s*type\s*:\s*["']json["']\s*\}/.test(
    astroConfigSource,
  ) &&
    /site\s*:\s*release\.canonicalUrl/.test(astroConfigSource) &&
    astroConfig.site === release.canonicalUrl &&
    astroConfig.output === "static" &&
    astroConfig.trailingSlash === "always" &&
    astroConfig.compressHTML === true,
  "Astro must own canonical static HTML generation",
);
assert(
  JSON.stringify(astroConfig.build) ===
    '{"format":"directory","inlineStylesheets":"always"}',
  "Astro build output contract drift",
);
assert(
  JSON.stringify(astroConfig.vite) ===
    '{"build":{"emptyOutDir":true,"sourcemap":false}}',
  "Vite production output contract drift",
);

assert(
  pkg.scripts?.["clean:generated"] ===
    "node scripts/generated-workspace.mjs reset",
  "Generated workspace reset command drift",
);
assert(
  pkg.scripts?.["render:calibration:update"] ===
    "node scripts/update-render-calibration.mjs",
  "Render calibration command drift",
);
assert(
  pkg.scripts?.["validate:reputation"] ===
    "node scripts/reputation.mjs validate" &&
    pkg.scripts?.["reputation:update"] ===
      "node scripts/reputation.mjs google" &&
    String(pkg.scripts?.["validate:source"] || "").includes(
      "npm run validate:reputation",
    ),
  "Static reputation validation/update command drift",
);
const scriptSteps = (name) =>
  String(pkg.scripts?.[name] || "")
    .split("&&")
    .map((step) => step.trim())
    .filter(Boolean);
const scriptReferences = (file) =>
  Object.entries(pkg.scripts || {}).flatMap(([name]) =>
    scriptSteps(name)
      .filter((step) => step.includes(file))
      .map((step) => ({ name, step })),
  );
const descriptorOwners = scriptReferences("scripts/generate-descriptors.mjs");
const projectionOwners = scriptReferences("scripts/generate-projections.mjs");
assert(
  JSON.stringify(scriptSteps("prepare:site")) ===
    JSON.stringify([
      "npm run validate:media-references",
      "npm run clean:generated",
      "node scripts/generate-projections.mjs site",
    ]),
  "Site preparation pipeline drift",
);
assert(
  JSON.stringify(scriptSteps("prepare:distribution")) ===
    JSON.stringify([
      "npm run validate:media-references",
      "npm run clean:generated",
      "npm run rdf:generate",
      "node scripts/generate-projections.mjs distribution",
      "node scripts/generate-retrieval-projections.mjs",
      "node scripts/generate-descriptors.mjs",
    ]),
  "Distribution preparation pipeline drift",
);
assert(
  scriptSteps("dev")[0] === "npm run prepare:site" &&
    scriptSteps("check")[0] === "npm run prepare:site",
  "Interactive Astro workflows must use the site-only preparation pipeline",
);
assert(
  scriptSteps("build")[0] === "npm run prepare:distribution" &&
    scriptSteps("build").includes("npm run compile:dist"),
  "Production build must prepare the complete distribution before compiling DIST",
);
assert(
  JSON.stringify(projectionOwners) ===
    JSON.stringify([
      {
        name: "prepare:site",
        step: "node scripts/generate-projections.mjs site",
      },
      {
        name: "prepare:distribution",
        step: "node scripts/generate-projections.mjs distribution",
      },
    ]),
  "Site and distribution projections must have exactly one pipeline owner each",
);
assert(
  JSON.stringify(descriptorOwners) ===
    JSON.stringify([
      {
        name: "prepare:distribution",
        step: "node scripts/generate-descriptors.mjs",
      },
    ]),
  "Descriptor projection must have exactly one distribution pipeline owner",
);
assert(
  /const\s+outputDir\s*=\s*projections/.test(descriptorGenerator) &&
    /const\s+out\s*=\s*\(?\s*rel\s*\)?\s*=>\s*path\.join\(outputDir,\s*rel\)/.test(
      descriptorGenerator,
    ),
  "Descriptor generator must write directly to the generated projection workspace",
);
for (const step of [
  "astro build",
  "npm run materialize:static",
  "node scripts/generate-deployment-headers.mjs",
  "node scripts/validate-dist.mjs",
  "npm run validate:dist-production",
])
  assert(
    String(pkg.scripts?.["compile:dist"] || "").includes(step),
    `DIST compiler step missing: ${step}`,
  );
assert(
  String(pkg.scripts?.release || "").includes("npm run compile:dist") &&
    String(pkg.scripts?.release || "").includes("npm run release:attest"),
  "Release must reuse the DIST compiler before attestation",
);
assert(
  pkg.scripts?.["test:performance"] === "node scripts/test-performance.mjs" &&
    pkg.scripts?.["test:dist-interactions"] ===
      "node scripts/test-dist-interactions.mjs" &&
    pkg.scripts?.["test:answer-projection"] ===
      "node --test scripts/test-answer-projection.mjs" &&
    ciWorkflow.includes("npm run test:dist-interactions") &&
    ciWorkflow.includes("npm run test:performance") &&
    ciWorkflow.includes("npm run test:css-validation") &&
    ciWorkflow.includes("npm run validate:html-css") &&
    String(pkg.scripts?.["compile:dist"] || "").includes("npm run validate:css") &&
    ciWorkflow.includes("npx playwright install --with-deps --only-shell chromium"),
  "Production browser regression gates must be explicit CI commands",
);

console.log(
  JSON.stringify(
    {
      stage: "ARCHITECTURE",
      astroRoutes: routes.length,
      cloudflareFunctions: 0,
      contentSources: contentSources.length,
      stylesheetSources: styles.length,
      projectionCompilers: 5,
      headProfileIds: headProfile.ids.length,
      supportProfileIds: supportProfile.ids.length,
      generatedWorkspace: ".generated",
      sitePipeline: "prepare:site",
      distributionPipeline: "prepare:distribution",
      staticOutputOwner: "astro",
      descriptorOwner: descriptorOwners[0].name,
      integrity: "PASS",
    },
    null,
    2,
  ),
);
