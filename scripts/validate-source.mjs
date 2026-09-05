import path from "node:path";
import { readFile, readdir, access } from "node:fs/promises";
import { assembleCanonicalContent } from "./lib/assemble-content.mjs";
import { deriveGraphProjections } from "./lib/projections/graph-projections.mjs";
import { analyzeGraphClosure } from "./lib/graph-integrity.mjs";
import { validateCoreEntityIdentity } from "./lib/core-entity-identity.mjs";
import {
  loadRedirectRegistry,
  renderCanonicalHostRedirects,
} from "./lib/redirect-registry.mjs";
import {
  assembleCssSource,
  RENDER_CALIBRATION_SLOT,
  RENDER_CALIBRATION_WIDTHS,
} from "../src/lib/css-delivery.mjs";
import {
  canonicalSemanticSource,
  deriveCanonicalSemanticSets,
} from "../src/lib/semantic-projection.mjs";

const root = process.cwd(),
  data = path.join(root, "src/data");
const readJson = async (p) =>
  JSON.parse(await readFile(path.join(root, p), "utf8"));
const fail = (m) => {
  throw new Error(m);
};
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const id = (v) => (typeof v === "string" ? v : v?.["@id"]);
const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const release = await readJson("src/data/release.json"),
  retrievalPolicy = await readJson(
    "src/data/retrieval/query-matrix-policy.json",
  ),
  graph = await readJson(canonicalSemanticSource(retrievalPolicy)),
  machineResourceRegistry = await readJson("src/data/machine-resources.json"),
  authority = await readJson(".release/policy/authority-surface-contract.json"),
  platform = await readJson(".release/policy/platform-contract.json"),
  headProfile = await readJson("src/data/semantic/head-profile.json"),
  supportProfile = await readJson("src/data/semantic/support-profile.json"),
  hf = authority.surfaces.huggingFace;
const { services, answers } = deriveCanonicalSemanticSets(graph, release);
const machineResourcesByPath = new Map(
  machineResourceRegistry.resources.map((resource) => [
    resource.path,
    resource,
  ]),
);

const requiredFiles = [
  "CITATION.cff",
  "codemeta.json",
  "src/content-source/page.md",
  "src/layouts/BaseLayout.astro",
  "src/lib/css-delivery.mjs",
  "src/lib/google-page-microdata.mjs",
  "src/lib/semantic-projection.mjs",
  "src/lib/hero-image-contract.mjs",
  "src/lib/release-tokens.mjs",
  "src/data/semantic/head-profile.json",
  "src/data/semantic/support-profile.json",
  "src/data/semantic/shapes.ttl",
  "src/data/evidence-registry.json",
  "src/data/render-calibration.json",
  "src/data/retrieval/query-matrix-policy.json",
  "src/data/machine-resources.json",
  "src/data/redirects.json",
  ".release/policy/platform-contract.json",
  ".release/policy/authority-surface-contract.json",
  "scripts/lib/css-rules.mjs",
  "scripts/lib/graph-integrity.mjs",
  "scripts/lib/release-graph.mjs",
  "scripts/lib/projection-context.mjs",
  "scripts/lib/hugging-face-distribution.mjs",
  "scripts/lib/core-entity-identity.mjs",
  "scripts/lib/projections/page-assets.mjs",
  "scripts/lib/projections/graph-projections.mjs",
  "scripts/lib/projections/semantic-corpus.mjs",
  "scripts/lib/projections/retrieval-corpus.mjs",
  "scripts/lib/projections/contact-discovery.mjs",
  "scripts/update-render-calibration.mjs",
  "scripts/generate-retrieval-projections.mjs",
  "scripts/generate-descriptors.mjs",
  "scripts/generate-deployment-headers.mjs",
  "scripts/promote-release.mjs",
  "scripts/write-release-attestation.mjs",
  "scripts/zenodo_release.py",
  "scripts/validate-media-references.mjs",
  "scripts/validate-release-contract.mjs",
  "scripts/validate-semantic-html.mjs",
  "scripts/platform-contract.mjs",
  "scripts/huggingface.mjs",
];
for (const f of requiredFiles) await access(path.join(root, f));

const readSource = (file) => readFile(path.join(root, file), "utf8");
const [
  pkg,
  baseGenerator,
  retrievalGenerator,
  descriptorGenerator,
  deploymentHeadersGenerator,
  mediaReferenceValidator,
  calibrationWriter,
  hfVerifier,
  hfDistributionContract,
  baseLayout,
  pageAssetsCompiler,
  graphCompiler,
  semanticCompiler,
  retrievalCompiler,
  contactCompiler,
  platformContractScript,
  hfAuthorityWorkflow,
  stackMonitorWorkflow,
] = await Promise.all([
  readJson("package.json"),
  readSource("scripts/generate-projections.mjs"),
  readSource("scripts/generate-retrieval-projections.mjs"),
  readSource("scripts/generate-descriptors.mjs"),
  readSource("scripts/generate-deployment-headers.mjs"),
  readSource("scripts/validate-media-references.mjs"),
  readSource("scripts/update-render-calibration.mjs"),
  readSource("scripts/huggingface.mjs"),
  readSource("scripts/lib/hugging-face-distribution.mjs"),
  readSource("src/layouts/BaseLayout.astro"),
  readSource("scripts/lib/projections/page-assets.mjs"),
  readSource("scripts/lib/projections/graph-projections.mjs"),
  readSource("scripts/lib/projections/semantic-corpus.mjs"),
  readSource("scripts/lib/projections/retrieval-corpus.mjs"),
  readSource("scripts/lib/projections/contact-discovery.mjs"),
  readSource("scripts/platform-contract.mjs"),
  readSource(".github/workflows/hugging-face-authority.yml"),
  readSource(".github/workflows/stack-monitor.yml"),
]);
const projectionCompilers = [
  pageAssetsCompiler,
  graphCompiler,
  semanticCompiler,
  retrievalCompiler,
  contactCompiler,
];
const projectionCompilerSource = projectionCompilers.join("\n");
const scriptSteps = (name) =>
  String(pkg.scripts?.[name] || "")
    .split("&&")
    .map((x) => x.trim())
    .filter(Boolean);
const hasStep = (name, needle) =>
  scriptSteps(name).some((step) => step === needle || step.includes(needle));
const commandReferences = (file) =>
  Object.entries(pkg.scripts || {}).flatMap(([name]) =>
    scriptSteps(name)
      .filter((step) => step.includes(file))
      .map((step) => ({ name, step })),
  );

if (
  pkg.scripts?.["validate:release-contract"] !==
  "node scripts/validate-release-contract.mjs"
)
  fail("Generic release-contract validator wiring missing");
if (
  JSON.stringify(scriptSteps("prepare:site")) !==
  JSON.stringify([
    "npm run validate:media-references",
    "npm run clean:generated",
    "node scripts/generate-projections.mjs site",
  ])
)
  fail("Site preparation architecture drift");
if (
  JSON.stringify(scriptSteps("prepare:distribution")) !==
  JSON.stringify([
    "npm run validate:media-references",
    "npm run clean:generated",
    "npm run rdf:generate",
    "node scripts/generate-projections.mjs distribution",
    "node scripts/generate-retrieval-projections.mjs",
    "node scripts/generate-descriptors.mjs",
  ])
)
  fail("Distribution preparation architecture drift");
if (
  pkg.scripts?.["validate:media-references"] !==
  "node scripts/validate-media-references.mjs"
)
  fail("Read-only media reference validator wiring missing");
if (/\bwriteFile\b|\bappendFile\b/.test(mediaReferenceValidator))
  fail("Media reference validation must never rewrite source");
if (
  calibrationWriter.includes("src/styles/global.css") ||
  !calibrationWriter.includes("renderCalibrationCss") ||
  !/rename\(\s*temporaryPath\s*,\s*canonicalPath\s*\)/.test(calibrationWriter)
)
  fail(
    "Render calibration writer must update only canonical JSON through the shared renderer",
  );
if (
  !hfVerifier.includes("verifyHuggingFaceRemoteDistribution") ||
  !/resourcesForTarget\(\s*hf\.resourceTarget\s*\)/.test(hfVerifier) ||
  !hfVerifier.includes("HF organization profile authority token missing") ||
  !hfDistributionContract.includes("HF remote repository inventory drift") ||
  !hfDistributionContract.includes("HF remote SHA-256 drift")
)
  fail(
    "Hugging Face verifier is not bound to the canonical dataset, exact inventory and organization surfaces",
  );
for (const [label, pattern] of [
  ["command", /async\s+function\s+commandPush\s*\(\s*\)/],
  ["release root", /realpath\(\s*["']\.release["']\s*\)/],
  ["credential helper", /["']-c["']\s*,\s*["']credential\.helper=["']/],
  ["hooks", /["']-c["']\s*,\s*["']core\.hooksPath=\/dev\/null["']/],
  ["askpass", /GIT_ASKPASS\s*:\s*askpass/],
  ["noninteractive", /GIT_TERMINAL_PROMPT\s*:\s*["']0["']/],
  ["username", /HF_GIT_USERNAME\s*:\s*["']oauth2["']/],
  [
    "cleanup",
    /await\s+rm\(\s*temporaryDirectory\s*,\s*\{\s*recursive\s*:\s*true\s*,\s*force\s*:\s*true\s*,?\s*\}\s*\)/,
  ],
])
  if (!pattern.test(hfVerifier))
    fail(`Canonical Hugging Face push implementation incomplete: ${label}`);
const forbiddenHuggingFaceAuthVariable = ["HF", "AUTH"].join("_");
const forbiddenHuggingFaceHeader = [
  "http.https://huggingface.co/",
  ".extraheader",
].join("");
if (hfVerifier.includes(forbiddenHuggingFaceHeader))
  fail(
    "Canonical Hugging Face push implementation must not use authorization headers on the command line",
  );
if (
  /node:child_process|GIT_ASKPASS|HF_TOKEN|credential\.helper|process\.env\.PATH|\b(?:spawnSync|writeFile|chmod|mkdtemp)\b/.test(
    platformContractScript,
  )
)
  fail(
    "Platform contract must remain a read-only environment exporter without Git/auth wrappers",
  );
const hfMutationWorkflows = [
  [
    "hugging-face-authority.yml",
    hfAuthorityWorkflow,
    new Map([
      ["node scripts/huggingface.mjs push .release/huggingface HEAD:main", 2],
      [
        'node scripts/huggingface.mjs push .release/huggingface "HEAD:$HF_BRANCH"',
        1,
      ],
      [
        'node scripts/huggingface.mjs push .release/huggingface "refs/tags/v$RELEASE_TARGET"',
        1,
      ],
      [
        'node scripts/huggingface.mjs push .release/huggingface "refs/tags/$HF_TAG"',
        1,
      ],
      [
        'node scripts/huggingface.mjs push .release/huggingface --delete "release/v$RELEASE_TARGET"',
        1,
      ],
    ]),
  ],
  [
    "stack-monitor.yml",
    stackMonitorWorkflow,
    new Map([
      [
        "node scripts/huggingface.mjs push .release/huggingface-monitor HEAD:main",
        1,
      ],
    ]),
  ],
];
for (const [name, source, commands] of hfMutationWorkflows) {
  if (
    source.includes(forbiddenHuggingFaceAuthVariable) ||
    source.includes(forbiddenHuggingFaceHeader) ||
    /git\s+-C\s+\.release\/huggingface\S*[^\n]*\bpush\b/.test(source)
  )
    fail(`${name} bypasses the canonical Hugging Face push command`);
  const expected = [...commands.values()].reduce(
      (sum, count) => sum + count,
      0,
    ),
    actual = (source.match(/node scripts\/huggingface\.mjs push\b/g) || [])
      .length;
  if (actual !== expected)
    fail(`${name} Hugging Face push ownership drift: ${actual}/${expected}`);
  for (const [command, count] of commands)
    if (source.split(command).length - 1 !== count)
      fail(`${name} canonical Hugging Face push wiring drift: ${command}`);
}

if (/\b(?:readFile|writeFile|readdir|unlink)\b/.test(baseGenerator))
  fail("Projection orchestrator contains artifact implementation I/O");
for (const symbol of [
  "compilePageAssets",
  "compileGraphProjections",
  "compileSemanticCorpus",
  "compileRetrievalCorpus",
  "compileContactDiscovery",
])
  if (!baseGenerator.includes(symbol))
    fail(`Projection orchestrator missing compiler owner: ${symbol}`);
if (!baseGenerator.includes("loadProjectionContext"))
  fail("Projection orchestrator does not share canonical projection context");
if (
  !/\[\s*["']site["']\s*,\s*["']distribution["']\s*\]\.includes\(target\)/.test(
    baseGenerator,
  ) ||
  !/if\s*\(\s*target\s*===\s*["']distribution["']\s*\)/.test(baseGenerator)
)
  fail("Projection orchestrator target ownership drift");

const descriptorOwners = commandReferences("scripts/generate-descriptors.mjs");
if (
  JSON.stringify(descriptorOwners) !==
  JSON.stringify([
    {
      name: "prepare:distribution",
      step: "node scripts/generate-descriptors.mjs",
    },
  ])
)
  fail(
    "Descriptor projection must have exactly one distribution pipeline owner",
  );
if (
  !/const\s+outputDir\s*=\s*projections/.test(descriptorGenerator) ||
  !/const\s+out\s*=\s*\(?\s*rel\s*\)?\s*=>\s*path\.join\(\s*outputDir\s*,\s*rel\s*\)/.test(
    descriptorGenerator,
  )
)
  fail(
    "Descriptor generator must write directly to the generated projection workspace",
  );
const packagingScripts = Object.fromEntries(
  Object.entries(pkg.scripts || {}).filter(([name]) =>
    name.startsWith("package:"),
  ),
);
if (
  pkg.scripts?.["release:attest"] !==
    "node scripts/write-release-attestation.mjs" ||
  JSON.stringify(packagingScripts) !==
    JSON.stringify({ "package:dist": "node scripts/package-dist.mjs" }) ||
  !hasStep("release", "npm run release:attest") ||
  !hasStep("release", "npm run package:dist")
)
  fail("Single-artifact release packaging drift");
const releaseSteps = scriptSteps("release");
if (
  releaseSteps.indexOf("npm run release:attest") <
    releaseSteps.indexOf("npm run compile:dist") ||
  releaseSteps.indexOf("npm run release:attest") >
    releaseSteps.indexOf("npm run package:dist")
)
  fail("Release attestation ordering drift");
if (
  !hasStep("build", "npm run prepare:distribution") ||
  !hasStep("build", "npm run validate:source") ||
  !hasStep("build", "npm run compile:dist")
)
  fail("Build source/compiler ordering drift");
for (const required of [
  "astro build",
  "npm run materialize:static",
  "npm run indexnow:prepare",
  "node scripts/generate-deployment-headers.mjs",
])
  if (!hasStep("compile:dist", required))
    fail(`DIST compiler missing ${required}`);
for (const [resourcePath, source, targets] of [
  [
    "query-matrix.jsonl",
    ".generated/projections/query-matrix.jsonl",
    ["huggingFace", "zenodo"],
  ],
  [
    "current-release-matrix.json",
    ".generated/projections/current-release-matrix.json",
    ["huggingFace", "zenodo"],
  ],
]) {
  const resource = machineResourcesByPath.get(resourcePath);
  if (
    resource?.source !== source ||
    JSON.stringify(resource.targets) !== JSON.stringify(targets)
  )
    fail(`Machine resource lane drift: ${resourcePath}`);
}
for (const artifact of [
  "query-matrix.jsonl",
  "current-release-matrix.json",
])
  if (
    !new RegExp(
      `path\\.join\\(generated\\.projections,\\s*["']${artifact.replaceAll(".", "\\.")}["']\\)`,
    ).test(retrievalGenerator)
  )
    fail(`Retrieval generator does not own ${artifact}`);
if (
  (deploymentHeadersGenerator.match(/\bwriteFile\(/g) || []).length !== 1 ||
  !/writeFile\(\s*path\.join\(\s*dist\s*,\s*["']_headers["']\s*\)\s*,\s*headers\s*\)/.test(
    deploymentHeadersGenerator,
  )
)
  fail(
    "Deployment header generator must write only the canonical _headers artifact",
  );
if (
  !baseLayout.includes("../lib/css-delivery.mjs") ||
  !pageAssetsCompiler.includes("../../../src/lib/css-delivery.mjs")
)
  fail(
    "CSS delivery contract is not shared by Layout and page-assets compiler",
  );

for (const name of [
  "datapackage.json",
  "croissant.json",
  "dcat.ttl",
  "void.ttl",
  "linkset.json",
]) {
  const escapedName = escapeRegExp(name);
  if (
    new RegExp(
      `writeFile\\(\\s*path\\.join\\(\\s*projections\\s*,\\s*["']${escapedName}["']`,
    ).test(projectionCompilerSource)
  )
    fail(`Projection compiler illegally writes descriptor ${name}`);
  if (
    new RegExp(
      `writeFile\\(\\s*path\\.join\\(\\s*dist\\s*,\\s*["']${escapedName}["']`,
    ).test(deploymentHeadersGenerator)
  )
    fail(`Deployment header generator illegally rewrites descriptor ${name}`);
  if (
    !new RegExp(`writeFile\\(\\s*out\\(\\s*["']${escapedName}["']\\s*\\)`).test(
      descriptorGenerator,
    )
  )
    fail(`Descriptor generator missing canonical writer for ${name}`);
}
for (const [label, pattern] of [
  [
    "DOI source",
    /const\s+datasetLandingPage\s*=\s*`https:\/\/doi\.org\/\$\{release\.dataset\.zenodo\.versionDoi\}`/,
  ],
  ["VoID landing page", /foaf:homepage <\$\{datasetLandingPage\}>/],
  ["DCAT landing page", /dcat:landingPage <\$\{datasetLandingPage\}>/],
  ["Croissant landing page", /homepage\s*:\s*datasetLandingPage/],
  ["Data package landing page", /url\s*:\s*datasetLandingPage/],
])
  if (!pattern.test(descriptorGenerator))
    fail(`Dataset landing-page role drift in descriptor generator: ${label}`);

if (
  authority.identitySource !== "src/data/release.json" ||
  authority.resourceRegistry !== "src/data/machine-resources.json" ||
  authority.retrievalPolicySource !==
    "src/data/retrieval/query-matrix-policy.json" ||
  hf.retrievalPolicyRef !== authority.retrievalPolicySource ||
  platform.canonicalUrl !== release.canonicalUrl ||
  platform.repository !==
    release.dataset.github.repository.replace(/^https:\/\/github\.com\//, "")
)
  fail("Platform/authority policy source drift");
const hfConfigNames = new Set(),
  hfConfigPaths = new Set(),
  hfConfigs = hf.configs || [];
if (
  !hfConfigs.length ||
  hfConfigs.filter((config) => config?.default === true).length !== 1
)
  fail("Hugging Face config/default contract drift");
for (const config of hfConfigs) {
  if (
    !config ||
    JSON.stringify(Object.keys(config).sort()) !==
      JSON.stringify(["default", "name", "path"]) ||
    !/^[a-z][a-z0-9_]*$/.test(config.name) ||
    typeof config.path !== "string" ||
    typeof config.default !== "boolean" ||
    hfConfigNames.has(config.name) ||
    hfConfigPaths.has(config.path)
  )
    fail(`Hugging Face config shape drift: ${config?.name || "unknown"}`);
  hfConfigNames.add(config.name);
  hfConfigPaths.add(config.path);
}
if (!release.medicalReviewedAt) fail("Explicit medicalReviewedAt missing");
if (release.dataset.zenodo.conceptDoi === release.dataset.zenodo.versionDoi)
  fail("Concept DOI collapsed with current Version DOI");

const nodes = graph["@graph"] || [],
  byId = new Map(nodes.filter((n) => n?.["@id"]).map((n) => [n["@id"], n])),
  person = byId.get(release.primaryEntity.id),
  clinic = byId.get(release.clinic.id),
  dataset = byId.get(release.dataset.id),
  page = byId.get(`${release.canonicalUrl}#webpage`);
if (!person || !clinic || !dataset || !page)
  fail("Person/Clinic/Dataset/ProfilePage graph constitution broken");
validateCoreEntityIdentity({ release, nodes });
if (
  id(dataset.creator) !== release.primaryEntity.id ||
  id(dataset.publisher) !== release.primaryEntity.id
)
  fail("Dataset creator/publisher is not the physician");
if (Object.hasOwn(release.dataset, "wikidata") || arr(dataset.sameAs).length)
  fail("Dataset external identity-equivalence contract must remain absent");
if (
  !arr(page["@type"]).includes("ProfilePage") ||
  !arr(page["@type"]).includes("MedicalWebPage") ||
  id(page.mainEntity) !== release.primaryEntity.id ||
  id(person.mainEntityOfPage) !== page["@id"]
)
  fail("Physician entity-home ProfilePage topology broken");
for (const machineId of [
  `${release.canonicalUrl}#doctor-ghezelbaash-structured-data-project`,
  `${release.canonicalUrl}#data-catalog`,
  release.dataset.id,
])
  if (arr(page.mentions).map(id).includes(machineId))
    fail(`Machine Dataset entity leaked into page mentions: ${machineId}`);
for (const slug of [
  "alopecia",
  "androgenetic-alopecia",
  "acne-vulgaris",
  "scar",
  "hyperpigmentation",
  "melasma",
])
  if (
    !arr(
      byId.get(`${release.canonicalUrl}#biomedical-concept-${slug}`)?.["@type"],
    ).includes("MedicalCondition")
  )
    fail(`MedicalCondition semantics missing: ${slug}`);
if (
  arr(dataset.sameAs)
    .map(id)
    .some((x) =>
      /github\.com|huggingface\.co|doi\.org|zenodo\.org/.test(x || ""),
    )
)
  fail("Source/distribution collapsed into Dataset sameAs");
const catalog = byId.get(`${release.canonicalUrl}#data-catalog`),
  github = byId.get(`${release.canonicalUrl}#project-github-source`),
  graphDownload = byId.get(`${release.canonicalUrl}graph.jsonld#download`),
  distributionIds = new Set(arr(dataset.distribution).map(id)),
  sourceIds = new Set(arr(dataset.isBasedOn).map(id));
if (
  catalog?.url !== `${release.canonicalUrl}dcat.ttl` ||
  Object.hasOwn(dataset, "url") ||
  graphDownload?.contentUrl !== `${release.canonicalUrl}graph.jsonld` ||
  !distributionIds.has(graphDownload?.["@id"])
)
  fail("Catalog/Dataset/download semantic destination contract broken");
if (
  github?.["@type"] !== "SoftwareSourceCode" ||
  github?.url !== release.dataset.github.repository ||
  github?.codeRepository !== release.dataset.github.repository ||
  Object.hasOwn(github, "contentUrl") ||
  distributionIds.has(github?.["@id"]) ||
  !sourceIds.has(github?.["@id"])
)
  fail("GitHub source-code role contract broken");
for (const externalId of [
  `${release.canonicalUrl}#project-huggingface-dataset`,
  `${release.canonicalUrl}#project-zenodo-release`,
])
  if (Object.hasOwn(byId.get(externalId) || {}, "contentUrl"))
    fail(`External landing page misdeclared as contentUrl: ${externalId}`);

const fullGraphOnlyMemberships = [
  [
    "https://www.ghezelbaash.ir/#organization-american-academy-of-anti-aging-medicine",
    "https://www.wikidata.org/entity/Q4742869",
  ],
  [
    "https://www.ghezelbaash.ir/#organization-international-association-for-physicians-in-aesthetic-medicine",
    "https://www.wikidata.org/entity/Q15995193",
  ],
];
const personMembershipIds = new Set(arr(person.memberOf).map(id));
for (const [organizationId, wikidataId] of fullGraphOnlyMemberships) {
  const organization = byId.get(organizationId);
  if (
    !personMembershipIds.has(organizationId) ||
    !organization ||
    !arr(organization["@type"]).includes("Organization") ||
    !arr(organization.sameAs).map(id).includes(wikidataId)
  )
    fail(`Full-graph membership drift ${organizationId}`);
}
const graphClosure = analyzeGraphClosure(graph, {
  baseUrl: release.canonicalUrl,
});
if (graphClosure.duplicateIds.length || graphClosure.danglingSameSiteCount > 0)
  fail(
    `Graph closure drift: duplicates=${graphClosure.duplicateIds.length}, dangling=${graphClosure.danglingSameSiteCount}`,
  );
const graphIds = new Set(byId.keys());
for (const [name, profile] of [
  ["head", headProfile],
  ["support", supportProfile],
])
  for (const ref of profile.ids || [])
    if (!graphIds.has(ref))
      fail(`${name} profile references missing graph node ${ref}`);

const serviceIds = new Set(services.map((service) => service.id));
if (serviceIds.size < 100)
  fail("Graph-derived service set is unexpectedly sparse");
if (
  ![...serviceIds].some((x) =>
    x.includes("botulinum-toxin-chronic-migraine"),
  )
)
  fail("Migraine Botox offered-service identity missing");
const assembled = await assembleCanonicalContent({ root, graph });
if (/{{[A-Z0-9_]+}}/.test(assembled.content))
  fail("Canonical page assembly contains unresolved release/content tokens");
const authoredPage = await readSource("src/content-source/page.md");
if (authoredPage.split(/\r?\n/).length < 3000)
  fail(
    "Canonical HTML source collapsed back into an unreadable single-line authority",
  );
if (/>\s*\r?\n\s*</.test(assembled.content))
  fail("Readable authored HTML layout leaked into delivery content bytes");
if (
  !assembled.content.includes(
    'id="saeed-ghezelbash-clinical-decision-framework"',
  ) ||
  !assembled.content.includes('id="verified-physician-identity-core"')
)
  fail("Physician-specific diagnostic/identity surface missing");
const headIds = headProfile.ids,
  personHeadProfile = headProfile.nodes?.[release.primaryEntity.id],
  clinicHeadProfile = headProfile.nodes?.[release.clinic.id],
  allowedHeadMemberships = new Set(personHeadProfile?.refAllow?.memberOf || []);
if (
  !Array.isArray(personHeadProfile?.include) ||
  !personHeadProfile.include.includes("memberOf") ||
  !Array.isArray(personHeadProfile?.refAllow?.memberOf)
)
  fail("Head Person membership projection policy incomplete");
const primaryClinicName = "کلینیک زیبایی دکتر سعید قزلباش",
  clinicNamePolicy = arr(clinicHeadProfile?.valueAllow?.name),
  clinicImageRefPolicy = clinicHeadProfile?.refAllow?.image;
if (
  clinicNamePolicy.length !== 1 ||
  clinicNamePolicy[0] !== primaryClinicName ||
  !Array.isArray(clinicImageRefPolicy) ||
  clinicImageRefPolicy.length
)
  fail(
    "Google Organization/LocalBusiness projection must use one primary name and direct image URLs",
  );
const canonicalClinicNames = arr(clinic.name).map(
    (value) => value?.["@value"] ?? value,
  ),
  canonicalClinicImages = arr(clinic.image);
if (
  !canonicalClinicNames.includes(primaryClinicName) ||
  !canonicalClinicNames.includes("Dr. Saeed Ghezelbash Aesthetic Clinic") ||
  canonicalClinicImages.filter((value) => typeof value === "string").length <
    6 ||
  !canonicalClinicImages.some(
    (value) =>
      id(value) ===
      `${release.canonicalUrl}#image-doctor-ghezelbaash-clinic-logo`,
  )
)
  fail("Canonical multilingual Clinic name/image richness drift");
const googleProjectionProfiles = [
  ...Object.entries(headProfile.typeProfiles || {}).map(([key, profile]) => [
    `head:type:${key}`,
    profile,
  ]),
  ...Object.entries(headProfile.nodes || {}).map(([key, profile]) => [
    `head:${key}`,
    profile,
  ]),
  ...Object.entries(supportProfile.typeProfiles || {}).map(([key, profile]) => [
    `support:type:${key}`,
    profile,
  ]),
  ...Object.entries(supportProfile.idProfiles || {}).map(([key, profile]) => [
    `support:id:${key}`,
    profile,
  ]),
];
const reversePageProjectionPolicies = googleProjectionProfiles
  .filter(([, profile]) => arr(profile?.include).includes("mainEntityOfPage"))
  .map(([key]) => key);
if (reversePageProjectionPolicies.length)
  fail(
    `Google projection must keep ProfilePage top-level; reverse mainEntityOfPage policy=${reversePageProjectionPolicies.join(", ") || "none"}`,
  );
const finalProjection = deriveGraphProjections({ graph, release, headProfile, supportProfile });
if (JSON.stringify(finalProjection.headIds) !== JSON.stringify(headIds) ||
    JSON.stringify(finalProjection.supportIds) !== JSON.stringify(supportProfile.ids))
  fail("Final graph compiler selection differs from the declarative profiles");
for (const [organizationId] of fullGraphOnlyMemberships)
  if (
    headIds.includes(organizationId) ||
    allowedHeadMemberships.has(organizationId)
  )
    fail(
      `Full-graph-only membership admitted by Head source policy ${organizationId}`,
    );

const headNodes = finalProjection.headDoc["@graph"],
  headRefs = new Set();
const collectHeadRefs = (value) => {
  if (Array.isArray(value)) return value.forEach(collectHeadRefs);
  if (!value || typeof value !== "object") return;
  if (typeof value["@id"] === "string") headRefs.add(value["@id"]);
  for (const [key, item] of Object.entries(value))
    if (key !== "@id") collectHeadRefs(item);
};
headNodes.forEach(collectHeadRefs);
const speakableId = `${release.canonicalUrl}#speakable-primary-content`,
  speakable = byId.get(speakableId);
if (
  !headRefs.has(speakableId) ||
  !headIds.includes(speakableId) ||
  !speakable ||
  !arr(speakable["@type"]).includes("SpeakableSpecification")
)
  fail("Speakable projection closure drift");
const speakableSelectors = arr(speakable.cssSelector);
if (!speakableSelectors.length || speakable.xpath)
  fail("Speakable selector contract drift");
for (const selector of speakableSelectors) {
  if (
    selector.startsWith("#") &&
    !assembled.content.includes(`id="${selector.slice(1)}"`)
  )
    fail(`Speakable ID selector missing ${selector}`);
  if (
    selector.startsWith(".") &&
    !new RegExp(`class=["'][^"']*\\b${selector.slice(1)}\\b`).test(
      assembled.content,
    )
  )
    fail(`Speakable class selector missing ${selector}`);
}

const contentFiles = (await readdir(path.join(root, "src/content-source")))
  .filter((x) => /\.(html|md)$/i.test(x))
  .sort();
let source = "";
for (const f of contentFiles)
  source +=
    (await readFile(path.join(root, "src/content-source", f), "utf8")) + "\n";
if (!source.includes('id="saeed-ghezelbash"'))
  fail("Canonical physician H1 missing");
if (
  source.includes("Public Knowledge Graph") ||
  source.includes("doctor-ghezelbaash-structured-data-repository")
)
  fail("Visible content contains a machine Dataset landing surface");
const identitySurfaceTokens = [
  'id="verified-physician-identity-core"',
  "Wikidata Q140287622",
  "نظام پزشکی ۱۶۷۴۳۰",
  "ORCID 0009-0001-9346-8475",
  "Google KG <code>/g/11nqdfk76c</code>",
];
if (identitySurfaceTokens.some((token) => !source.includes(token)))
  fail("Verified physician identity surface contract drift");
if (
  !/<a\b(?=[^>]*\bhero-search-launch\b)(?=[^>]*\bdata-guide-search-open\b)(?=[^>]*href="#aesthetic-medicine-table-of-contents")(?=[^>]*aria-label="باز کردن جست‌وجوی راهنمای جامع")[^>]*>/i.test(
    source,
  )
)
  fail("Accessible Hero search launcher contract drift");
const robots = await readFile(path.join(root, "public/robots.txt"), "utf8");
if (
  !robots.includes(
    "Content-Signal: search=yes, ai-input=yes, ai-train=yes, use=full",
  )
)
  fail("Maximum Content-Signal policy drift");
if (
  (robots.match(/^User-agent:/gm) || []).length !== 1 ||
  !/^User-agent: \*$/m.test(robots) ||
  !/^Allow: \/$/m.test(robots) ||
  !/^Disallow: \/cdn-cgi\/$/m.test(robots) ||
  !robots.includes(`Sitemap: ${release.canonicalUrl}sitemap.xml`)
)
  fail("Minimal wildcard robots policy drift");
const headers = await readFile(
  path.join(data, "templates/headers.template"),
  "utf8",
);
if (
  !headers.includes(
    "Content-Signal: search=yes, ai-input=yes, ai-train=yes, use=full",
  )
)
  fail("Headers Content-Signal contract drift");
for (const t of ["question-answering", "text-retrieval", "text-generation"])
  if (!hf.taskCategories.includes(t)) fail(`HF task contract missing ${t}`);
if (
  JSON.stringify(retrievalPolicy.languages) !==
  JSON.stringify(["fa", "en", "ar", "ckb"])
)
  fail("Retrieval language contract drift");
if (
  retrievalPolicy.retrievalPolicy !== "evidence_bound" ||
  retrievalPolicy.resolutionMode !== "canonical_entity_resolution"
)
  fail("Evidence-bound retrieval policy drift");

const redirects = renderCanonicalHostRedirects(
    await loadRedirectRegistry(root),
  ),
  sources = new Set();
for (const line of redirects
  .split(/\r?\n/)
  .map((x) => x.trim())
  .filter(Boolean)) {
  const [from, to, code] = line.split(/\s+/);
  if (!from || !to || code !== "301") fail(`Malformed redirect: ${line}`);
  if (sources.has(from)) fail(`Duplicate redirect source: ${from}`);
  sources.add(from);
  if (to.includes("#")) {
    const frag = decodeURIComponent(to.split("#")[1] || "");
    if (
      frag &&
      !source.includes(`id="${frag}"`) &&
      !source.includes(`id='${frag}'`)
    )
      fail(`Redirect fragment target missing: ${line}`);
  }
}

const renderCalibrationRaw = await readFile(
    path.join(root, "src/data/render-calibration.json"),
    "utf8",
  ),
  authoredCss = await readFile(
    path.join(root, "src/styles/global.css"),
    "utf8",
  );
if (
  (authoredCss.match(/\/\*DIST_CHUNK_INTRINSIC_SLOT\*\//g) || []).length !==
    1 ||
  !authoredCss.includes(RENDER_CALIBRATION_SLOT)
)
  fail("Authored CSS render calibration slot drift");
if (
  /DIST_CHUNK_CALIBRATION_SHA256:|DIST_CHUNK_INTRINSIC_(?:START|END)/.test(
    authoredCss,
  )
)
  fail("Materialized render calibration leaked into authored CSS");
const { cssSource: assembledCss, calibration } = assembleCssSource(
    authoredCss,
    renderCalibrationRaw,
  ),
  renderChunkIds = calibration.data["360"].chunks.map((x) => x.id);
if (
  calibration.widths.join(",") !== RENDER_CALIBRATION_WIDTHS.join(",") ||
  calibration.chunkCount !== renderChunkIds.length
)
  fail("Render calibration shared contract drift");
if (
  !assembledCss.includes(
    `/*DIST_CHUNK_CALIBRATION_SHA256:${calibration.sha256}*/`,
  ) ||
  (assembledCss.match(/#[A-Za-z][\w:-]*\{--cis:/g) || []).length !==
    calibration.ruleCount
)
  fail("In-memory render calibration assembly drift");

console.log(
  JSON.stringify(
    {
      stage: "SOURCE_SEMANTIC_CONTRACT",
      release: release.release,
      services: serviceIds.size,
      answers: answers.length,
      renderChunks: renderChunkIds.length,
      canonicalWriterTopology: "PASS",
      projectionCompilerTopology: "PASS",
      googleForwardPageTopology: "PASS",
      googleOrganizationProjection: "PASS",
      platformContract: "PASS",
      authoritySurfaceContract: "PASS",
      coreWikidataOwnership: "PASS",
      headProjectionPolicy: "SOURCE_VALIDATED",
      generatedFilePrerequisite: "NONE",
      buildSourceMutation: "FORBIDDEN",
      descriptorOwner: descriptorOwners[0].name,
      integrity: "PASS",
    },
    null,
    2,
  ),
);
