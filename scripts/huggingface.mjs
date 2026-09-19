import { loadPublicationData } from "./lib/publication-context.mjs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { parse } from "parse5";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { resourcesForTarget } from "../src/lib/resources.mjs";
import {
  HUGGING_FACE_MANIFEST_FILE,
  huggingFaceConfigs,
  huggingFaceManifestFiles,
  stageHuggingFaceDistributionResources,
  verifyHuggingFaceRemoteDistribution,
} from "./lib/hugging-face-distribution.mjs";
import { verifyHuggingFaceViewer } from "./lib/hugging-face-viewer.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const sourcePathForConfig = (hf, config) =>
  hf.viewerPackaging?.derivatives.find((row) => row.config === config.name)?.source || config.path;

function profileResourceUrl(release, hf, registry, file) {
  const resource = registry.resources.find((entry) => entry.path === file);
  must(resource?.targets.includes(hf.resourceTarget), `HF profile resource is not distributed: ${file}`);
  return resource.targets.includes("website")
    ? new URL(file, release.canonicalUrl).href
    : `${release.dataset.huggingFace.dataset}/resolve/main/${file}`;
}

// A static organization Space renders index.html. Keep that public card and its
// README/configuration in one commit, independent of the frozen Dataset payload.
function organizationProfileFiles(release, hf, registry) {
  const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const link = (label, url) => `<li>${escape(label)}: <a href="${escape(url)}">${escape(url)}</a></li>`;
  const datasetUrl = release.dataset.huggingFace.dataset;
  const instagram = release.primaryEntity.verifiedWebIdentityMesh.find((url) =>
    new URL(url).hostname === "www.instagram.com");
  const configs = hf.configs;
  const queryConfig = configs.find((config) => config.name === "query_matrix");
  must(queryConfig, "HF profile requires the registered query_matrix config");
  const sections = [
    ["Canonical identity", [
      ["Official website", release.canonicalUrl],
      ["Physician", release.primaryEntity.id],
      ["Physician Wikidata", `https://www.wikidata.org/wiki/${release.primaryEntity.wikidata}`],
      ["ORCID", `https://orcid.org/${release.primaryEntity.orcid}`],
      ["Google Knowledge Graph", `https://www.google.com/search?kgmid=${release.primaryEntity.googleKnowledgeGraphId}`],
      ["Supporting clinic", release.clinic.id],
      ...(instagram ? [["Instagram", instagram]] : []),
    ]],
    ["Canonical AI / machine entrypoints", [
      ["JSON-LD entity graph", "graph.jsonld"],
      ["Full LLM/RAG corpus", "llms-full.txt"],
      ["Entity facts", "entity-facts.csv"],
      ["Query matrix", sourcePathForConfig(hf, queryConfig)],
      ["Croissant metadata", "croissant.json"],
      ["DCAT catalog", "dcat.ttl"],
      ["Provenance", "provenance.jsonld"],
    ].map(([label, file]) => [label, profileResourceUrl(release, hf, registry, file)])],
    ["Source, preservation and AI distribution", [
      ["Version-controlled source", release.dataset.github.repository],
      [`Current immutable Version DOI (v${release.release})`, `https://doi.org/${release.dataset.zenodo.versionDoi}`],
      ["Hugging Face Dataset", datasetUrl],
      ["Immutable Hugging Face release", `${datasetUrl}/tree/v${release.release}`],
    ]],
  ];
  const title = `Dr. ${release.primaryEntity.name}`;
  const description = `Physician-owned public knowledge graph and AI/retrieval distribution for ${title}.`;
  const body = `<main>
  <h1>${escape(title)}</h1>
  <p>${escape(description)} The physician is the primary entity; the clinic is the supporting clinical/local entity. These are first-party publications.</p>
${sections.map(([heading, links]) => `  <section>
    <h2>${escape(heading)}</h2>
    <ul>\n${links.map(([label, url]) => `      ${link(label, url)}`).join("\n")}\n    </ul>
  </section>`).join("\n")}
  <p>The Dataset supports multilingual question answering, text retrieval, text generation, RAG and entity resolution. Its release DOI and immutable tag identify the preserved version; main may contain later verified distribution updates.</p>
</main>`;
  const frontmatter = [
    "---", `title: ${JSON.stringify(title)}`, "emoji: 🩺", "colorFrom: blue",
    "colorTo: indigo", "sdk: static", "app_file: index.html", "pinned: false",
    "datasets:", `- ${datasetUrl.replace("https://huggingface.co/datasets/", "")}`, "---",
  ].join("\n");
  return new Map([
    ["README.md", `${frontmatter}\n\n${body}\n`],
    ["index.html", `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escape(title)} — Public Knowledge Graph</title>
  <meta name="description" content="${escape(description)}">
</head>
<body>
${body}
</body>
</html>
`],
  ]);
}

function renderedProfileEvidence(html) {
  const values = [];
  const visit = (node) => {
    if (["head", "script", "style", "template"].includes(node.tagName)) return;
    if (node.nodeName === "#text") values.push(node.value);
    if (node.tagName === "a") values.push(node.attrs.find((attr) => attr.name === "href")?.value || "");
    for (const child of node.childNodes || []) visit(child);
  };
  visit(parse(html));
  return values.join(" ");
}
async function walkFiles(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (current === root && entry.name === ".git") continue;
    if (current === root && entry.name === ".gitattributes") continue;
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(root, target)));
    else if (entry.isFile())
      files.push(path.relative(root, target).split(path.sep).join("/"));
  }
  return files.sort();
}

async function cleanDistributionRoot(hub) {
  const root = path.resolve(hub);
  const releaseRoot = path.resolve(".release"),
    relative = path.relative(releaseRoot, root);
  must(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    "Hugging Face distribution root must be a child of .release",
  );
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === ".gitattributes") continue;
    await rm(path.join(root, entry.name), {
      recursive: entry.isDirectory(),
      force: true,
    });
  }
}

const safePushRef =
  /^(?:HEAD:(?:main|release\/v\d+\.\d+\.\d+)|refs\/tags\/v\d+\.\d+\.\d+)$/;
const safeDeleteRef = /^release\/v\d+\.\d+\.\d+$/;

async function commandPush() {
  const [repo, ...pushArgs] = process.argv.slice(2);
  must(
    repo && pushArgs.length,
    "Usage: node scripts/huggingface.mjs push <repo-under-.release> <refspec | --delete ref>",
  );
  must(
    (pushArgs.length === 1 && safePushRef.test(pushArgs[0])) ||
      (pushArgs.length === 2 &&
        pushArgs[0] === "--delete" &&
        safeDeleteRef.test(pushArgs[1])),
    "Unsafe Hugging Face push arguments",
  );
  const hfToken = process.env.HF_TOKEN;
  must(
    typeof hfToken === "string" && hfToken.length > 0,
    "HF_TOKEN is required",
  );
  const nonSecretEnvironment = { ...process.env };
  delete nonSecretEnvironment.HF_TOKEN;

  const [releaseRoot, repositoryRoot] = await Promise.all([
    realpath(".release"),
    realpath(repo),
  ]);
  const relative = path.relative(releaseRoot, repositoryRoot);
  must(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    "Hugging Face repository must be a child of .release",
  );

  const remote = spawnSync(
    "git",
    ["-C", repositoryRoot, "remote", "get-url", "origin"],
    {
      encoding: "utf8",
      env: { ...nonSecretEnvironment, GIT_TERMINAL_PROMPT: "0" },
    },
  );
  must(remote.status === 0, "Unable to resolve Hugging Face origin");
  must(
    /^https:\/\/huggingface\.co\/datasets\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(
      remote.stdout.trim(),
    ),
    "Hugging Face origin must be an HTTPS dataset repository without embedded credentials",
  );

  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "ghezelbaash-hf-askpass-"),
  );
  const askpass = path.join(temporaryDirectory, "askpass.sh");
  try {
    await writeFile(
      askpass,
      `#!/bin/sh
case "$1" in
  *Username*) printf '%s\\n' "$HF_GIT_USERNAME" ;;
  *Password*) printf '%s\\n' "$HF_TOKEN" ;;
  *) exit 1 ;;
esac
`,
      { mode: 0o700 },
    );
    await chmod(askpass, 0o700);
    const pushed = spawnSync(
      "git",
      [
        "-C",
        repositoryRoot,
        "-c",
        "credential.helper=",
        "-c",
        "core.hooksPath=/dev/null",
        "push",
        "origin",
        ...pushArgs,
      ],
      {
        stdio: "inherit",
        env: {
          ...nonSecretEnvironment,
          GIT_ASKPASS: askpass,
          GIT_TERMINAL_PROMPT: "0",
          HF_GIT_USERNAME: "oauth2",
          HF_TOKEN: hfToken,
        },
      },
    );
    must(
      pushed.status === 0,
      `Hugging Face push failed${pushed.signal ? ` (${pushed.signal})` : ""}`,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function commandPrepare() {
  const [dist = "dist", hub = ".release/huggingface"] = process.argv.slice(2);
  const [release, authority, retrievalPolicy] = await Promise.all([
    loadPublicationData(),
    readJson(".release/policy/authority-surface-contract.json"),
    readJson("src/data/retrieval/query-matrix-policy.json"),
  ]);
  const hf = authority.surfaces.huggingFace;
  const configs = huggingFaceConfigs(hf);
  const zenodo = release.dataset.zenodo;
  must(
    authority.resourceRegistry === "src/data/machine-resources.json",
    "Authority resource registry drift",
  );
  must(
    authority.retrievalPolicySource === hf.retrievalPolicyRef,
    "Hugging Face retrieval policy reference drift",
  );

  await cleanDistributionRoot(hub);

  const resources = resourcesForTarget(hf.resourceTarget);
  const descriptor = await stageHuggingFaceDistributionResources({ hf, dist, hub, release });

  const tags = [
    "saeed-ghezelbash",
    "dr-saeed-ghezelbash",
    "physician-entity",
    "medical-knowledge-graph",
    "knowledge-graph",
    "knowledge-base",
    "entity-resolution",
    "json-ld",
    "rdf",
    "schema-org",
    "wikidata",
    "fair-data",
    "question-answering",
    "text-retrieval",
    "text-generation",
    "rag",
    "evidence-bound-retrieval",
    "aesthetic-medicine",
    "healthcare",
    "medical",
    "physician",
    "kermanshah",
    "iran",
    "croissant",
    "dcat",
    "datasets",
    "multilingual",
    "tabular",
  ];
  const frontmatter = [
    "---",
    `pretty_name: ${release.dataset.name}`,
    "language:",
    ...retrievalPolicy.languages.map((language) => `- ${language}`),
    "license: cc-by-4.0",
    "multilinguality:",
    "- multilingual",
    "source_datasets:",
    "- original",
    "task_categories:",
    ...hf.taskCategories.map((task) => `- ${task}`),
    "size_categories:",
    "- 1K<n<10K",
    "tags:",
    ...tags.map((tag) => `- ${tag}`),
    "configs:",
    ...configs.flatMap((config) => [
      `- config_name: ${config.name}`,
      ...(config.default ? ["  default: true"] : []),
      "  data_files:",
      "  - split: train",
      `    path: ${config.path}`,
    ]),
    "---",
  ].join("\n");
  const packaging = await readJson(path.join(hub, hf.viewerPackaging.manifestPath));
  const repo = release.dataset.huggingFace.dataset.replace("https://huggingface.co/datasets/", "");
  const readme = `${frontmatter}

# ${release.dataset.name}

A public, physician-authored knowledge graph and multilingual retrieval dataset by **Dr. ${release.primaryEntity.name}**, a physician in Kermanshah, Iran. It connects physician identity, aesthetic medicine services, published question-answer content and cited evidence for entity resolution and evidence-grounded AI retrieval.

The canonical source is the [official website](${release.canonicalUrl}) and [Dataset graph](${release.dataset.id}). This Hugging Face repository is its AI distribution. The physician is the creator and primary entity; the clinic is the supporting clinical and local entity.

## Identity and source

| Identifier | Canonical link |
| --- | --- |
| Physician | [Dr. ${release.primaryEntity.name}](${release.primaryEntity.id}) |
| Wikidata | [${release.primaryEntity.wikidata}](https://www.wikidata.org/wiki/${release.primaryEntity.wikidata}) |
| ORCID | [${release.primaryEntity.orcid}](https://orcid.org/${release.primaryEntity.orcid}) |
| Iran Medical Council | ${release.primaryEntity.irimc} |
| Google Knowledge Graph | [${release.primaryEntity.googleKnowledgeGraphId}](https://www.google.com/search?kgmid=${release.primaryEntity.googleKnowledgeGraphId}) |
| Source code | [GitHub](${release.dataset.github.repository}) |
| Preserved source release | [v${release.release} — ${zenodo.versionDoi}](https://doi.org/${zenodo.versionDoi}) |
| License | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

## Dataset configurations

- **entity_facts**: one graph statement per row, with 16 string columns. The default configuration provides linked subjects, predicates, values, provenance and release identifiers.
- **query_matrix**: multilingual query aliases that resolve to canonical answer atoms or service entities. It contains 19 source fields and one reversible packaging helper. Languages: Persian (fa), English (en), Arabic (ar) and Central Kurdish (ckb). Query scopes include unspecified, Kermanshah and Iran.

Both configurations use typed Parquet files under [viewer/](${release.dataset.huggingFace.dataset}/tree/main/viewer) and expose a single split named \`train\`. That split is a distribution convention; it does not imply an evaluated model-training benchmark or a held-out test set. Exact row counts, source hashes, schemas and packaging details are recorded in [viewer/packaging.json](${release.dataset.huggingFace.dataset}/resolve/main/viewer/packaging.json).

The original [entity-facts.csv](${release.dataset.huggingFace.dataset}/resolve/main/entity-facts.csv), [query-matrix.jsonl](${release.dataset.huggingFace.dataset}/resolve/main/query-matrix.jsonl), [graph.jsonld](${release.dataset.huggingFace.dataset}/resolve/main/graph.jsonld) and all other canonical release resources are preserved unchanged. Parquet avoids mixed CSV/JSONL loader inference and preserves string identifiers, multilingual text, list ordering and source row order.

## Load a reproducible revision

Install \`datasets\` and \`huggingface_hub\`, then resolve one commit and use it for both configurations:

\`\`\`python
from datasets import load_dataset
from huggingface_hub import HfApi

repo = "${repo}"
revision = HfApi().dataset_info(repo).sha
print("Record this Hugging Face revision:", revision)
facts = load_dataset(repo, "entity_facts", split="train", revision=revision)
queries = load_dataset(repo, "query_matrix", split="train", revision=revision)

# Resolve one query's answer or services to graph statements.
query = queries[0]
subject_ids = [query["canonical_subject_iri"], *query["service_ids"]]
if query["answer_id"] is not None:
    subject_ids.append(query["answer_id"])
resolved = facts.filter(lambda row: row["subject"] in subject_ids)
\`\`\`

Use [the Viewer](${release.dataset.huggingFace.dataset}/viewer) to inspect both configurations. [Hugging Face Croissant metadata](https://huggingface.co/api/datasets/${repo}/croissant) describes Hub access. The preserved [croissant.json](${release.dataset.huggingFace.dataset}/resolve/main/croissant.json) describes the canonical entity-facts resource; [datapackage.json](${release.dataset.huggingFace.dataset}/resolve/main/datapackage.json), [DCAT](${release.dataset.huggingFace.dataset}/resolve/main/dcat.ttl) and [provenance.jsonld](${release.dataset.huggingFace.dataset}/resolve/main/provenance.jsonld) provide complementary source metadata.

## Data dictionary

All entity-facts columns are strings, including empty strings. They are not automatically converted to dates, numbers or nulls.

| Fields | Meaning |
| --- | --- |
| subject, type, name | Graph subject IRI, entity type and display name |
| predicate, value | Statement predicate and literal representation |
| object, object_name | Linked object IRI and label, when applicable |
| language, datatype | Literal language and datatype |
| provenance | Source provenance attached to the statement |
| dataset, version, modified | Dataset IRI, source release and source modification value |
| row_id | Stable identifier for the statement |
| value_kind, value_media_type | Literal/object classification and media representation |

| Query-matrix fields | Meaning |
| --- | --- |
| query, language, query_scope, practice_location | Query text, language and geographic context |
| row_kind, intent_family | Alias category and clinical/service intent |
| canonical_subject, canonical_subject_iri, dataset_iri | Physician Wikidata identifier, physician IRI and Dataset IRI |
| release, version_doi | Preserved source release and its DOI |
| retrieval_policy, resolution_mode, answer_strategy | Resolution policy and intended downstream handling |
| answer_id | Canonical answer atom IRI for intent aliases; absent in service aliases |
| service_ids, service_families, service_types | Ordered lists of linked service identifiers, families and types; service_types is absent in intent aliases |
| stable_evidence_refs | Ordered evidence-node IRIs; resolve these nodes in graph.jsonld and inspect the cited sources |
| _source_omitted_fields | Packaging-only list of source keys absent from that JSONL row |

To reconstruct the source query object, remove precisely the keys listed in \`_source_omitted_fields\`, then remove the helper itself. This preserves the distinction between a missing key, null and an empty list. Parquet schemas and every row are checked against the original CSV/JSONL during packaging.

## Retrieval and evidence

Retrieval policy: **${retrievalPolicy.retrievalPolicy}**. Resolution mode: **${retrievalPolicy.resolutionMode}**. Join \`answer_id\`, \`service_ids\`, \`canonical_subject_iri\` and \`stable_evidence_refs\` to graph node identifiers; use those nodes and their cited sources to construct attributable answers.

Treatment efficacy can be described where the linked clinical sources support the specific treatment, indication and outcome. Identity records establish who the physician is; clinical publications support their own reported findings. Query aliases, first-party service descriptions and mirrored copies do not establish measured outcomes for this individual practice. Queries containing superlatives are retrieval aliases, not comparative rankings. This dataset contains no patient-level treatment-outcome study or model performance evaluation. It is intended for research and information retrieval, not individual diagnosis or prescribing.

## Versioning, integrity and citation

Source release **${release.release}** and DOI **${zenodo.versionDoi}** remain unchanged. The immutable [v${release.release} snapshot](${release.dataset.huggingFace.dataset}/tree/v${release.release}) preserves the original release packaging. Current \`main\` adds Viewer packaging revision **${packaging.packagingRevision}** and this expanded card; these access derivatives are separate from the DOI snapshot. Pin a Hugging Face commit when reproducing the Viewer representation. [dist-sha256.json](${release.dataset.huggingFace.dataset}/resolve/main/dist-sha256.json) covers the exact current file inventory; the packaging manifest links each derivative to its original source hash.

Cite the preserved source: **${release.primaryEntity.name}. ${release.dataset.name}. Version ${release.release}. Zenodo. https://doi.org/${zenodo.versionDoi}**. Also report the Hugging Face commit used for derived access. Attribution and [CITATION.cff](${release.dataset.github.repository}/blob/v${release.release}/CITATION.cff) identify the author; redistribution follows CC BY 4.0. Corrections should be submitted through [the source repository](${release.dataset.github.repository}).
`;
  await writeFile(path.join(hub, "README.md"), readme);

  const manifestFiles = huggingFaceManifestFiles(hf, descriptor);
  const hashes = {
    release: release.release,
    canonicalDatasetIri: release.dataset.id,
    zenodoVersionDoi: zenodo.versionDoi,
    files: {},
  };
  for (const file of manifestFiles) {
    const bytes = await readFile(path.join(hub, file));
    hashes.files[file] = { bytes: bytes.length, sha256: sha256(bytes) };
  }
  await writeFile(
    path.join(hub, HUGGING_FACE_MANIFEST_FILE),
    JSON.stringify(hashes, null, 2) + "\n",
  );

  const expected = [...manifestFiles, HUGGING_FACE_MANIFEST_FILE].sort();
  const actual = await walkFiles(hub);
  must(
    JSON.stringify(actual) === JSON.stringify(expected),
    `Hugging Face distribution inventory drift: ${actual.filter((file) => !expected.includes(file)).join(", ") || "missing expected file"}`,
  );
  must(
    hf.taskCategories.every((task) => readme.includes(task)) &&
      configs.every(
        (config) =>
          readme.includes(config.name) && readme.includes(config.path),
      ),
    "HF README contract incomplete",
  );

  console.log(
    JSON.stringify(
      {
        prepared: true,
        release: release.release,
        coreFiles: resources.length,
        distributionFiles: expected.length,
        queryMatrix: true,
        tasks: hf.taskCategories,
        languages: retrievalPolicy.languages,
        retrievalPolicy: retrievalPolicy.retrievalPolicy,
        resolutionMode: retrievalPolicy.resolutionMode,
        identityContract: "PASS",
      },
      null,
      2,
    ),
  );
}

async function commandVerify() {
  const [release, authority, retrievalPolicy, registry] = await Promise.all([
    loadPublicationData(),
    readJson(".release/policy/authority-surface-contract.json"),
    readJson("src/data/retrieval/query-matrix-policy.json"),
    readJson("src/data/machine-resources.json"),
  ]);
  const hf = authority.surfaces.huggingFace;
  const configs = huggingFaceConfigs(hf);
  const mode = process.argv.includes("--profile")
    ? "profile"
    : process.argv.includes("--viewer")
      ? "viewer"
      : "full";
  const datasetUrl = release.dataset.huggingFace.dataset;
  const repo = datasetUrl.replace(/^https:\/\/huggingface\.co\/datasets\//, "");
  const nonce = () => String(Date.now()) + Math.random().toString(16).slice(2);
  const get = async (url) => {
    const response = await fetch(url, {
      headers: {
        "cache-control": "no-cache",
        "user-agent": "ghezelbaash-hf-authority-verifier/2.0",
      },
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error(`HF HTTP ${response.status} ${url}`);
    return response;
  };
  const text = async (url) => (await get(url)).text();
  const json = async (url) => (await get(url)).json();
  const meta = await json(
    `https://huggingface.co/api/datasets/${repo}?full=true&blobs=false&_=${nonce()}`,
  );
  if (
    meta.private ||
    ![false, null, undefined, "false"].includes(meta.gated)
  )
    throw new Error("HF Dataset unexpectedly private/gated");
  const tags = new Set(meta.tags || []);
  for (const language of retrievalPolicy.languages)
    if (!tags.has(`language:${language}`))
      throw new Error(`HF language tag missing ${language}`);
  for (const task of hf.taskCategories)
    if (!tags.has(`task_categories:${task}`))
      throw new Error(`HF task tag missing ${task}`);

  const remote = await verifyHuggingFaceRemoteDistribution({
    release,
    hf,
    metadata: meta,
    fetchBytes: async (file) =>
      Buffer.from(
        await (
          await get(
            `${datasetUrl}/resolve/${meta.sha}/${file}?download=true&_=${nonce()}`,
          )
        ).arrayBuffer(),
      ),
  });
  const readme = remote.files.get("README.md").toString("utf8");
  const requiredTokens = [
    release.primaryEntity.name,
    release.primaryEntity.wikidata,
    release.primaryEntity.googleKnowledgeGraphId,
    release.primaryEntity.orcid,
    release.primaryEntity.irimc,
    release.dataset.id,
    release.dataset.zenodo.versionDoi,
    retrievalPolicy.retrievalPolicy,
    retrievalPolicy.resolutionMode,
    ...hf.taskCategories,
    ...configs.flatMap((config) => [config.name, config.path]),
  ];
  for (const token of requiredTokens)
    if (!readme.includes(String(token)))
      throw new Error(`HF README authority token missing ${token}`);

  if (mode !== "viewer") {
    const queryConfig = configs.find((config) => config.name === "query_matrix");
    must(queryConfig, "HF profile requires the registered query_matrix config");
    const queryPath = sourcePathForConfig(hf, queryConfig);
    const queryUrl = profileResourceUrl(release, hf, registry, queryPath);
    const requiredProfileTokens = [
      release.primaryEntity.name,
      release.primaryEntity.wikidata,
      release.canonicalUrl,
      datasetUrl,
      release.dataset.zenodo.versionDoi,
      release.clinic.id,
      queryUrl,
    ];
    // Hub commit success does not prove that the organization card was rendered.
    // Wait briefly for the public static Space and card, then fail closed.
    for (let attempt = 1; attempt <= 7; attempt++) {
      const [profile, profileMetadata] = await Promise.all([
        text(`https://huggingface.co/${hf.organization}?_=${nonce()}`),
        json(`https://huggingface.co/api/spaces/${hf.organization}/README?_=${nonce()}`),
      ]);
      must(profileMetadata.private === false, "HF organization profile must be public");
      const evidence = renderedProfileEvidence(profile);
      const missing = requiredProfileTokens.filter((token) => !evidence.includes(String(token)));
      const websiteQueryUrl = new URL(queryPath, release.canonicalUrl).href;
      const forbidden = ["Q140304972", "Q140288589", ...(queryUrl !== websiteQueryUrl ? [websiteQueryUrl] : [])]
        .filter((token) => evidence.includes(token));
      const runtime = profileMetadata.runtime?.stage;
      const configured = profileMetadata.cardData?.sdk === "static" &&
        profileMetadata.cardData?.app_file === "index.html";
      if (configured && runtime === "RUNNING" && !missing.length && !forbidden.length) break;
      const problem = `HF organization profile drift: configured=${configured} runtime=${runtime || "missing"} missing=${missing.join(",") || "none"} retired=${forbidden.join(",") || "none"}`;
      must(attempt < 7, problem);
      console.error(`${problem}; waiting for public rendering (${attempt}/7)`);
      await delay(5000);
    }
  }
  let viewer = null;
  if (mode !== "profile") {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "hf-source-verification-"));
    try {
      const hub = path.join(temporary, "hub");
      const required = new Set([hf.viewerPackaging.manifestPath,
        ...hf.viewerPackaging.derivatives.flatMap((row) => [row.source, row.path])]);
      for (const file of required) {
        must(remote.files.has(file), `HF Viewer source missing ${file}`);
        await mkdir(path.dirname(path.join(hub, file)), { recursive: true });
        await writeFile(path.join(hub, file), remote.files.get(file));
      }
      const expectationsFile = path.join(temporary, "expectations.json");
      const check = spawnSync("python3", ["scripts/build-hf-viewer.py", "--hub", hub,
        "--release", release.release, "--doi", release.dataset.zenodo.versionDoi,
        "--dataset", release.dataset.id, "--check", "--expectations-out", expectationsFile,
      ], { encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024 });
      must(!check.error && check.status === 0,
        `HF source/Parquet semantic verification failed: ${check.error?.message || check.stderr || check.stdout}`);
      const expectations = await readJson(expectationsFile);
      viewer = await verifyHuggingFaceViewer({ repo, configs: expectations.configs, expectedRevision: meta.sha });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  console.log(
    JSON.stringify(
      {
        hfAuthority: "PASS",
        mode,
        repo,
        primaryEntity: release.primaryEntity.wikidata,
        datasetIri: release.dataset.id,
        versionDoi: release.dataset.zenodo.versionDoi,
        tasks: hf.taskCategories,
        languages: retrievalPolicy.languages,
        configs: configs.map((config) => config.name),
        remoteFiles: remote.repositoryFiles.length,
        remoteInventory: "EXACT",
        remoteHashes: "PASS",
        revision: meta.sha,
        viewer,
      },
      null,
      2,
    ),
  );
}

// Publish only distribution packaging. Source resources must remain byte-for-byte
// equal to the existing immutable tag. parentCommit prevents concurrent overwrites.
async function commandSyncDataset() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const options = args.filter((arg) => arg !== "--check");
  must(options.length === 3 && options[1] === "--source-root",
    "Usage: node scripts/huggingface.mjs sync-dataset <hub> --source-root <frozen-root> [--check]");
  const [hub, , frozenRoot] = options;
  const [release, frozenRelease, authority, frozenAuthority] = await Promise.all([
    loadPublicationData(), loadPublicationData(path.resolve(frozenRoot)),
    readJson(".release/policy/authority-surface-contract.json"),
    readJson(path.join(frozenRoot, ".release/policy/authority-surface-contract.json")),
  ]);
  must(JSON.stringify(release) === JSON.stringify(frozenRelease),
    "Packaging synchronization requires the exact frozen publication context");
  const hf = authority.surfaces.huggingFace;
  const frozenHf = frozenAuthority.surfaces.huggingFace;
  const datasetUrl = release.dataset.huggingFace.dataset;
  const repo = datasetUrl.replace(/^https:\/\/huggingface\.co\/datasets\//, "");
  must(/^[\w-]+\/[\w.-]+$/.test(repo), "Invalid HF Dataset repository");
  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(60000), ...options,
      headers: { "cache-control": "no-cache", "user-agent": "ghezelbaash-hf-packaging-sync/1.0", ...options.headers },
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      const detail = String(failure.error || failure.message || "").slice(0, 1200)
        .replaceAll(process.env.HF_TOKEN || "__NO_HF_TOKEN__", "[REDACTED]");
      throw new Error(`HF dataset request failed HTTP ${response.status}: ${new URL(url).pathname} ${detail}`);
    }
    return response;
  };
  const metadata = async (revision) => {
    const meta = await (await request(`https://huggingface.co/api/datasets/${repo}/revision/${revision}?blobs=false&_=${Date.now()}`)).json();
    must(meta.private === false && [false, null, undefined, "false"].includes(meta.gated) && /^[a-f0-9]{40}$/.test(meta.sha),
      "HF Dataset must be public, ungated and pinned to a commit");
    return meta;
  };
  const remoteDistribution = async (meta, policy) => verifyHuggingFaceRemoteDistribution({
    release, hf: policy, metadata: meta,
    fetchBytes: async (file) => Buffer.from(await (await request(`${datasetUrl}/resolve/${meta.sha}/${file}?download=true`)).arrayBuffer()),
  });
  const frozenMeta = await metadata(`v${release.release}`);
  const frozen = await remoteDistribution(frozenMeta, frozenHf);
  const stagedFiles = await walkFiles(hub);
  const staged = await verifyHuggingFaceRemoteDistribution({
    release, hf, metadata: { siblings: [...stagedFiles, ".gitattributes"].map((rfilename) => ({ rfilename })) },
    fetchBytes: (file) => readFile(path.join(hub, file)),
  });
  const allowedChanges = new Set(["README.md", HUGGING_FACE_MANIFEST_FILE,
    hf.viewerPackaging.manifestPath, ...hf.viewerPackaging.derivatives.map((row) => row.path)]);
  for (const [file, bytes] of frozen.files) {
    if (allowedChanges.has(file)) continue;
    must(staged.files.get(file)?.equals(bytes), `Staged packaging changes frozen source bytes: ${file}`);
  }
  for (const file of staged.repositoryFiles)
    must(frozen.repositoryFiles.includes(file) || allowedChanges.has(file), `Undeclared packaging addition: ${file}`);

  const currentMeta = await metadata("main");
  const hasPackaging = currentMeta.siblings?.some((row) => row.rfilename === hf.viewerPackaging.manifestPath);
  const current = await remoteDistribution(currentMeta, hasPackaging ? hf : frozenHf);
  for (const [file, bytes] of frozen.files) {
    if (allowedChanges.has(file)) continue;
    must(current.files.get(file)?.equals(bytes), `HF main source differs from frozen release: ${file}`);
  }
  const updates = [];
  for (const file of stagedFiles) {
    const bytes = await readFile(path.join(hub, file));
    const previous = file === HUGGING_FACE_MANIFEST_FILE
      ? Buffer.from(await (await request(`${datasetUrl}/resolve/${currentMeta.sha}/${file}`)).arrayBuffer())
      : current.files.get(file);
    if (!previous?.equals(bytes)) {
      must(allowedChanges.has(file), `Packaging attempted to mutate source resource: ${file}`);
      updates.push([file, bytes]);
    }
  }
  let publishedSha = currentMeta.sha;
  if (checkOnly) must(updates.length === 0, `HF packaging source drift: ${updates.map(([file]) => file).join(", ")}`);
  else if (updates.length) {
    must(process.env.HF_TOKEN, "HF_TOKEN is required to synchronize Dataset packaging");
    const response = await request(`https://huggingface.co/api/datasets/${repo}/commit/main`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.HF_TOKEN}`, "content-type": "application/x-ndjson" },
      body: [
        { key: "header", value: {
          summary: `Repair typed Viewer access for source v${release.release}`,
          description: "Preserve every frozen source byte and version tag; publish reversible typed Parquet, provenance and dataset documentation atomically.",
          parentCommit: currentMeta.sha,
        } },
        ...updates.map(([file, bytes]) => ({ key: "file", value: { path: file, content: bytes.toString("base64"), encoding: "base64" } })),
      ].map((row) => JSON.stringify(row)).join("\n") + "\n",
    });
    const result = await response.json();
    must(result.success === true, "HF Dataset packaging commit did not succeed");
    const published = await metadata("main");
    must(published.sha !== currentMeta.sha, "HF Dataset publication did not advance main");
    publishedSha = published.sha;
    const readback = await remoteDistribution(published, hf);
    for (const [file, bytes] of staged.files)
      must(readback.files.get(file)?.equals(bytes), `HF post-publication readback differs: ${file}`);
    const frozenAfter = await metadata(`v${release.release}`);
    must(frozenAfter.sha === frozenMeta.sha, "HF immutable release tag changed during packaging");
  }
  console.log(JSON.stringify({ datasetPackaging: "PASS", repo, release: release.release,
    versionDoi: release.dataset.zenodo.versionDoi, checkOnly, changed: updates.length > 0,
    files: updates.map(([file]) => file), previousCommit: currentMeta.sha, publishedCommit: publishedSha,
    frozenCommit: frozenMeta.sha, frozenSourceBytes: "UNCHANGED" }, null, 2));
}

async function commandSyncProfile() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const options = args.filter((arg) => arg !== "--check");
  must(
    options.length === 0 || (options.length === 2 && options[0] === "--source-root"),
    "Usage: node scripts/huggingface.mjs sync-profile [--source-root path] [--check]",
  );
  const root = path.resolve(options[1] || ".");
  const [release, authority, registry] = await Promise.all([
    loadPublicationData(root),
    readJson(path.join(root, ".release/policy/authority-surface-contract.json")),
    readJson(path.join(root, "src/data/machine-resources.json")),
  ]);
  const hf = authority.surfaces.huggingFace;
  const organization = hf.organization;
  must(/^[A-Za-z0-9_-]+$/.test(organization), "Invalid HF organization");
  const repo = `${organization}/README`;
  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(60000),
      ...options,
      headers: {
        "cache-control": "no-cache",
        "user-agent": "ghezelbaash-profile-release-sync/1.0",
        ...options.headers,
      },
    });
    must(response.ok, `HF profile request failed HTTP ${response.status}`);
    return response;
  };
  const metadata = await (await request(`https://huggingface.co/api/spaces/${repo}?_=${Date.now()}`)).json();
  must(metadata.private === false && /^[a-f0-9]{40}$/.test(metadata.sha), "HF profile must be public with a pinned commit");
  const expected = organizationProfileFiles(release, hf, registry);
  const original = new Map(await Promise.all([...expected.keys()].map(async (file) => [
    file, await (await request(`https://huggingface.co/spaces/${repo}/raw/${metadata.sha}/${file}`)).text(),
  ])));
  for (const [file, content] of original)
    for (const token of [release.primaryEntity.name, release.primaryEntity.wikidata, release.canonicalUrl, release.dataset.huggingFace.dataset])
      must(content.includes(token), `HF profile identity missing ${token} in ${file}`);
  const updates = [...expected].filter(([file, content]) => original.get(file) !== content);
  const changed = updates.length > 0;
  if (checkOnly) {
    must(!changed, `HF profile source drift in ${updates.map(([file]) => file).join(", ")}; expected v${release.release} / ${release.dataset.zenodo.versionDoi}`);
  } else if (changed) {
    must(process.env.HF_TOKEN, "HF_TOKEN is required to synchronize the organization profile");
    const result = await (await request(`https://huggingface.co/api/spaces/${repo}/commit/main`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.HF_TOKEN}`, "content-type": "application/x-ndjson" },
      body: [
        { key: "header", value: { summary: `Synchronize public organization profile v${release.release}`, parentCommit: metadata.sha } },
        ...updates.map(([file, content]) => ({ key: "file", value: { path: file, content, encoding: "utf-8" } })),
      ].map((row) => JSON.stringify(row)).join("\n") + "\n",
    })).json();
    must(result.success === true, "HF profile commit did not succeed");
    const published = await (await request(`https://huggingface.co/api/spaces/${repo}?_=${Date.now()}`)).json();
    must(published.private === false && /^[a-f0-9]{40}$/.test(published.sha) && published.sha !== metadata.sha,
      "HF profile publication did not advance the public commit");
    for (const [file, content] of expected) {
      const readback = await (await request(`https://huggingface.co/spaces/${repo}/raw/${published.sha}/${file}`)).text();
      must(readback === content, `HF profile post-publication readback drift in ${file}`);
    }
  }
  console.log(JSON.stringify({ profileRelease: "PASS", repo, release: release.release,
    versionDoi: release.dataset.zenodo.versionDoi, changed, checkOnly,
    files: [...expected.keys()], previousCommit: metadata.sha }));
}

const usage =
  "Usage: node scripts/huggingface.mjs <prepare|verify|push|sync-profile|sync-dataset> [options]";
const command = process.argv[2];
if (!command) throw new Error(usage);
process.argv.splice(2, 1);
switch (command) {
  case "sync-dataset":
    await commandSyncDataset();
    break;
  case "sync-profile":
    await commandSyncProfile();
    break;
  case "prepare":
    await commandPrepare();
    break;
  case "verify":
    await commandVerify();
    break;
  case "push":
    await commandPush();
    break;
  default:
    throw new Error(usage);
}
