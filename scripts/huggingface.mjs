import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  resourcesForTarget,
  sourceForDistribution,
} from "../src/lib/resources.mjs";
import {
  HUGGING_FACE_MANIFEST_FILE,
  huggingFaceConfigs,
  huggingFaceManifestFiles,
  verifyHuggingFaceRemoteDistribution,
} from "./lib/hugging-face-distribution.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
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
    readJson("src/data/release.json"),
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
  for (const resource of resources) {
    const source = sourceForDistribution(resource, dist);
    await mkdir(path.dirname(path.join(hub, resource.path)), {
      recursive: true,
    });
    await cp(source, path.join(hub, resource.path));
  }

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
  const retrievalArchitecture = [
    "**main** is rebuilt from the current canonical source and checked byte-for-byte against this repository's exact distribution manifest.",
    `It is not claimed to be byte-identical to the frozen Zenodo version or the immutable Hugging Face tag \`v${release.release}\`.`,
    "**Query Matrix 2.0** maps Persian, English, Arabic and Central Kurdish queries across unspecified, Kermanshah and Iran scopes to canonical answer atoms and their evidence references.",
  ].join(" ");
  const readme = `${frontmatter}

# ${release.dataset.name}

AI/retrieval distribution of the canonical physician-owned Dataset at \`${release.dataset.id}\`. The physician remains the primary entity, creator and publisher; the clinic is the supporting clinical/local entity; this repository is a distribution namespace rather than a competing identity.

## Authority topology

- Primary physician: **Dr. Saeed Ghezelbash** — Wikidata \`${release.primaryEntity.wikidata}\`
- Google Knowledge Graph: \`${release.primaryEntity.googleKnowledgeGraphId}\`
- ORCID: \`${release.dataset.creatorOrcid}\`
- Iran Medical Council: \`${release.primaryEntity.irimc}\`
- Canonical physician IRI: \`${release.primaryEntity.id}\`
- Supporting clinic: Wikidata \`${release.dataset.supportingClinicWikidata}\`
- Canonical Dataset IRI: \`${release.dataset.id}\`
- Source: \`${release.dataset.github.repository}\`
- Base release lineage: \`${release.release}\`
- Zenodo Concept DOI: \`${zenodo.conceptDoi}\`
- Frozen Zenodo Version DOI: \`${zenodo.versionDoi}\`

## Retrieval architecture

${retrievalArchitecture}

Retrieval policy: **${retrievalPolicy.retrievalPolicy}**. Resolution mode: **${retrievalPolicy.resolutionMode}**.
`;
  await writeFile(path.join(hub, "README.md"), readme);

  const manifestFiles = huggingFaceManifestFiles(hf);
  const hashes = {
    release: release.release,
    canonicalDatasetIri: release.dataset.id,
    conceptDoi: zenodo.conceptDoi,
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
  const [release, authority, retrievalPolicy] = await Promise.all([
    readJson("src/data/release.json"),
    readJson(".release/policy/authority-surface-contract.json"),
    readJson("src/data/retrieval/query-matrix-policy.json"),
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
    ![false, null, undefined, "false", "auto"].includes(meta.gated)
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
            `${datasetUrl}/resolve/main/${file}?download=true&_=${nonce()}`,
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
    release.dataset.supportingClinicWikidata,
    release.dataset.id,
    release.dataset.zenodo.conceptDoi,
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
    const profile = await text(
      `https://huggingface.co/${hf.organization}?_=${nonce()}`,
    );
    for (const token of [
      release.primaryEntity.name,
      release.primaryEntity.wikidata,
      release.canonicalUrl,
      datasetUrl,
    ]) {
      if (!profile.includes(String(token)))
        throw new Error(
          `HF organization profile authority token missing ${token}`,
        );
    }
  }
  if (mode !== "profile") {
    const base = "https://datasets-server.huggingface.co";
    const params = (extra) =>
      new URLSearchParams({ dataset: repo, ...extra, _: nonce() });
    const valid = await json(`${base}/is-valid?${params({})}`);
    for (const key of ["viewer", "preview", "search", "filter", "statistics"])
      if (valid[key] !== true)
        throw new Error(`Dataset Server unhealthy ${key}`);
    const splits = await json(`${base}/splits?${params({})}`);
    const pairs = new Set(
      (splits.splits || []).map((item) => `${item.config}|${item.split}`),
    );
    for (const config of configs)
      if (!pairs.has(`${config.name}|train`))
        throw new Error(`HF Dataset Server config missing ${config.name}`);
  }

  console.log(
    JSON.stringify(
      {
        hfAuthority: "PASS",
        mode,
        repo,
        primaryEntity: release.primaryEntity.wikidata,
        datasetIri: release.dataset.id,
        conceptDoi: release.dataset.zenodo.conceptDoi,
        versionDoi: release.dataset.zenodo.versionDoi,
        tasks: hf.taskCategories,
        languages: retrievalPolicy.languages,
        configs: configs.map((config) => config.name),
        remoteFiles: remote.repositoryFiles.length,
        remoteInventory: "EXACT",
        remoteHashes: "PASS",
      },
      null,
      2,
    ),
  );
}

const usage =
  "Usage: node scripts/huggingface.mjs <prepare|verify|push> [options]";
const command = process.argv[2];
if (!command) throw new Error(usage);
process.argv.splice(2, 1);
switch (command) {
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
