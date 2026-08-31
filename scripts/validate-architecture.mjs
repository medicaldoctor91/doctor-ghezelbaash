import path from "node:path";
import { existsSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

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
  "src/content-source/page.md",
  "src/data/document-head.json",
  "src/data/machine-resources.json",
  "src/data/release.json",
  "src/data/semantic/head-profile.json",
  "src/data/semantic/support-profile.json",
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
];
for (const file of required) await access(path.join(root, file));
assert(
  !existsSync(path.join(root, "src/lib/css-source.mjs")),
  "Legacy parallel CSS source must not exist",
);

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
    JSON.stringify(["title", "description", "lang", "dir", "robots"]),
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
  read("src/pages/index.astro"),
  read("src/lib/knowledge-graph.ts"),
  read("src/lib/google-page-microdata.mjs"),
  read("src/lib/resources.mjs"),
  read("scripts/materialize-static-artifacts.mjs"),
  read("scripts/generate-deployment-headers.mjs"),
  read("scripts/generate-descriptors.mjs"),
  read("scripts/generate-retrieval-projections.mjs"),
  read("astro.config.mjs"),
  readJson("src/data/release.json"),
  readJson("src/data/machine-resources.json"),
  readJson("src/data/semantic/head-profile.json"),
  readJson("src/data/semantic/support-profile.json"),
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
assert(
  /const\s+headIds\s*=\s*headProfile\.ids/.test(graphCompiler) &&
    /const\s+supportIds\s*=\s*supportProfile\.ids/.test(graphCompiler),
  "Projection selection must live inside its profile",
);
assert(
  /const\s+projectionContext\s*=\s*projectSchemaContext\(graph\[['"]@context['"]\]\)/.test(
    graphCompiler,
  ) && /['"]@context['"]\s*:\s*projectionContext/.test(graphCompiler),
  "Graph compiler must emit the final Schema.org context directly",
);
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
    /import\s*\{\s*headGraph\s*\}\s*from\s*['"]\.\.\/lib\/knowledge-graph['"]/.test(
      documentHead,
    ) &&
    /HEAD_RESOURCES\s*\.map\s*\(/.test(documentHead),
  "Document Head must use its direct metadata and resource sources",
);
assert(
  /discoveryLinks\s*\.map\s*\(\s*\(?\s*link\s*\)?\s*=>\s*<link\s+\{\.\.\.link\}/.test(
    documentHead,
  ),
  "Discovery links must be structured Astro elements",
);
assert(
  baseLayout.includes("../styles/global.css?raw") &&
    baseLayout.includes("../lib/css-delivery.mjs") &&
    !baseLayout.includes("../lib/css-source.mjs"),
  "Layout must assemble the single stylesheet directly",
);
assert(
  !projectionContext.includes("graphByUrl") &&
    /const\s+sourceNodes\s*=\s*sourceNodesForUrl\(sourceUrl\)/.test(
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
  "Static materializer must use the resource registry and generated public workspace",
);
assert(
  deploymentHeadersGenerator.includes("./lib/headers-template.mjs") &&
    /compileHeadersTemplate\(\s*headersTemplate,\s*\{[\s\S]*?mainCsp[\s\S]*?csp404[\s\S]*?heroEarlyHintHref\s*:\s*HERO_EARLY_HINT_HREF[\s\S]*?digests[\s\S]*?\}\s*\)/.test(
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

console.log(
  JSON.stringify(
    {
      stage: "ARCHITECTURE",
      astroRoutes: routes.length,
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
