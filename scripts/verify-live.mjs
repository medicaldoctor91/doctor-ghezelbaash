import { fetchRepresentation } from "./lib/http-representation.mjs";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import {
  huggingFaceDatasetRepo,
  verifyHuggingFaceRemoteDistribution,
} from "./lib/hugging-face-distribution.mjs";
import {
  resourcesForTarget,
  sourceForDistribution,
} from "../src/lib/resources.mjs";

const localDistributionFile = (resource, dist = "dist") =>
  sourceForDistribution(resource, dist);

function assertRequiredCompression(
  rel,
  offered,
  received,
  requireMachineCompression = false,
) {
  const required =
    rel === "index.html" ||
    (requireMachineCompression && /\.(csv|ttl)$/.test(rel));
  if (required && ["br", "gzip"].includes(offered) && received !== offered)
    throw new Error(
      `${rel} ${offered} required compression is not effective: ${received}`,
    );
}

function assertEncodingVary(rel, lane, value) {
  if (
    !String(value || "")
      .split(",")
      .some((part) => part.trim().toLowerCase() === "accept-encoding")
  )
    throw new Error(
      `${rel} ${lane} negotiated response lacks Vary: Accept-Encoding`,
    );
}

async function command_test_transport() {
  const { default: assert } = await import("node:assert/strict");
  for (const encoding of ["br", "gzip"]) {
    assertRequiredCompression("index.html", encoding, encoding);
    assert.throws(
      () => assertRequiredCompression("index.html", encoding, "identity"),
      /required compression is not effective/,
    );
    for (const file of ["entity-facts.csv", "graph.ttl"]) {
      assertRequiredCompression(file, encoding, "identity");
      assert.throws(
        () => assertRequiredCompression(file, encoding, "identity", true),
        /required compression is not effective/,
      );
      assertRequiredCompression(file, encoding, encoding, true);
    }
  }
  assertRequiredCompression("index.html", "identity", "identity");
  assertRequiredCompression("index.html", "zstd", "identity");
  for (const file of ["index.html", "graph.jsonld", "entity-facts.csv"])
    for (const lane of [
      "ordinary/identity",
      "ordinary/br",
      "cacheBusted/gzip",
    ]) {
      assertEncodingVary(file, lane, "Origin, Accept-Encoding");
      assertEncodingVary(file, lane, "accept-encoding");
      assert.throws(() => assertEncodingVary(file, lane, null), /lacks Vary/);
      assert.throws(
        () => assertEncodingVary(file, lane, "Accept"),
        /lacks Vary/,
      );
    }
  console.log("REQUIRED_COMPRESSION_CONTRACT_PASS");
}
const walkRelative = async (directory, prefix = "") => {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      files.push(
        ...(await walkRelative(path.join(directory, entry.name), relative)),
      );
    else if (entry.isFile()) files.push(relative);
  }
  return files;
};

function releaseLocations(args, cwd = process.cwd()) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index],
      value = args[index + 1];
    if (!["--source-root", "--dist-root"].includes(name))
      throw new Error(`Unknown release verifier option: ${name}`);
    if (!value || value.startsWith("--") || values.has(name))
      throw new Error(`Missing or duplicate release verifier option: ${name}`);
    values.set(name, value);
  }
  const sourceRoot = path.resolve(cwd, values.get("--source-root") || ".");
  return {
    sourceRoot,
    distRoot: path.resolve(sourceRoot, values.get("--dist-root") || "dist"),
  };
}

async function releaseContext(locations) {
  const { sourceRoot, distRoot } = locations,
    git = (...args) =>
      execFileSync("git", args, {
        cwd: sourceRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim(),
    release = JSON.parse(
      await readFile(path.join(sourceRoot, "src/data/release.json"), "utf8"),
    ),
    tag = `v${release.release}`;
  let tagSha;
  try {
    tagSha = git("rev-parse", "--verify", `refs/tags/${tag}^{commit}`);
  } catch {
    throw new Error(
      `Snapshot verifier requires the finalized release tag: ${tag}`,
    );
  }
  const head = git("rev-parse", "HEAD");
  if (tagSha !== head)
    throw new Error(
      `Snapshot verifier must read release tag source: tag=${tagSha} HEAD=${head}`,
    );
  if (git("diff", "HEAD", "--name-only"))
    throw new Error(
      "Snapshot verifier requires an unchanged tracked release source",
    );
  const registry = JSON.parse(
    await readFile(
      path.join(sourceRoot, "src/data/machine-resources.json"),
      "utf8",
    ),
  );
  if (!Array.isArray(registry.resources) || !registry.resources.length)
    throw new Error("Snapshot machine resource registry is empty");
  const paths = new Set();
  for (const resource of registry.resources) {
    if (
      !resource.path ||
      !resource.source ||
      !resource.mediaType ||
      !Array.isArray(resource.targets) ||
      !resource.targets.length ||
      paths.has(resource.path)
    )
      throw new Error(`Invalid snapshot machine resource: ${resource.path}`);
    for (const value of [resource.path, resource.source])
      if (path.isAbsolute(value) || value.split(/[\\/]/).includes(".."))
        throw new Error(`Snapshot resource escapes its source: ${value}`);
    paths.add(resource.path);
  }
  const core = registry.resources.filter((resource) =>
    resource.targets.includes("zenodo"),
  );
  if (!core.length) throw new Error("Snapshot Zenodo distribution is empty");
  await readdir(distRoot);
  return {
    ...locations,
    release,
    tag,
    head,
    core,
    localFile: (resource) =>
      resource.targets.includes("website")
        ? path.join(distRoot, resource.path)
        : path.join(sourceRoot, resource.source),
  };
}

async function command_test_release_context() {
  const { default: assert } = await import("node:assert/strict"),
    { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    fixture = await mkdtemp(path.join(tmpdir(), "release-context-"));
  try {
    const sourceRoot = path.join(fixture, "historical source"),
      distRoot = path.join(fixture, "historical output"),
      git = (...args) =>
        execFileSync("git", args, {
          cwd: sourceRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }).trim();
    await mkdir(path.join(sourceRoot, "src/data"), { recursive: true });
    await mkdir(distRoot);
    const releasePath = path.join(sourceRoot, "src/data/release.json"),
      releaseBytes = JSON.stringify({ release: "9.8.7" }),
      resource = {
        path: "historical.json",
        source: ".generated/historical.json",
        mediaType: "application/json",
        targets: ["website", "zenodo"],
      };
    await writeFile(releasePath, releaseBytes);
    await writeFile(
      path.join(sourceRoot, "src/data/machine-resources.json"),
      JSON.stringify({
        resources: [
          resource,
          {
            path: "historical-only.json",
            source: ".generated/historical-only.json",
            mediaType: "application/json",
            targets: ["zenodo"],
          },
        ],
      }),
    );
    git("init", "--quiet");
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "Frozen source fixture",
    );
    const args = ["--source-root", sourceRoot, "--dist-root", distRoot],
      locations = releaseLocations(args, fixture);
    assert.deepEqual(locations, { sourceRoot, distRoot });
    await assert.rejects(
      releaseContext(locations),
      /requires the finalized release tag/,
    );
    git("tag", "v9.8.7");
    const context = await releaseContext(locations);
    assert.equal(context.release.release, "9.8.7");
    assert.deepEqual(
      context.core.map(({ path: file }) => file),
      ["historical.json", "historical-only.json"],
    );
    assert.equal(
      context.localFile(context.core[0]),
      path.join(distRoot, "historical.json"),
    );
    assert.equal(
      context.localFile(context.core[1]),
      path.join(sourceRoot, ".generated/historical-only.json"),
    );
    assert.deepEqual(releaseLocations([], sourceRoot), {
      sourceRoot,
      distRoot: path.join(sourceRoot, "dist"),
    });
    for (const invalid of [
      ["--other", sourceRoot],
      ["--source-root"],
      ["--source-root", sourceRoot, "--source-root", sourceRoot],
    ])
      assert.throws(() => releaseLocations(invalid), /release verifier option/);
    await writeFile(releasePath, `${releaseBytes}\n`);
    await assert.rejects(
      releaseContext(locations),
      /unchanged tracked release source/,
    );
    git("add", ".");
    await assert.rejects(
      releaseContext(locations),
      /unchanged tracked release source/,
    );
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "A newer source is not the snapshot",
    );
    await assert.rejects(
      releaseContext(locations),
      /must read release tag source/,
    );
    console.log("RELEASE_CONTEXT_ISOLATION_PASS");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

async function command_current() {
  const [release, authority] = await Promise.all([
    readFile("src/data/release.json", "utf8").then(JSON.parse),
    readFile(".release/policy/authority-surface-contract.json", "utf8").then(
      JSON.parse,
    ),
  ]);
  const websiteOnly = process.argv.includes("--website-only"),
    hfOnly = process.argv.includes("--hf-only");
  if (websiteOnly && hfOnly)
    throw new Error("Choose at most one current-serving verification scope");
  const verifyWebsite = !hfOnly,
    verifyHf = !websiteOnly,
    sha = (b) => createHash("sha256").update(b).digest("hex");
  const websiteResources = resourcesForTarget("website");
  const fetchOne = async (url, noCache = false) => {
    const headers = {
      "User-Agent": "ghezelbaash-current-serving-verifier/2.0",
    };
    if (noCache) headers["Cache-Control"] = "no-cache";
    const representation = await fetchRepresentation(url, {
      headers,
      timeoutMs: 60000,
    });
    if (!representation.r.ok)
      throw new Error(`HTTP ${representation.r.status} ${url}`);
    return representation;
  };
  const results = [];

  if (verifyWebsite) {
    for (const { path: file } of websiteResources) {
      const local = await readFile(`dist/${file}`),
        wanted = sha(local),
        url = `${release.canonicalUrl}${file === "index.html" ? "" : file}`,
        ordinary = await fetchOne(url),
        bypass = await fetchOne(
          `${url}${url.includes("?") ? "&" : "?"}__serving_verify=${Date.now()}`,
          true,
        ),
        oh = sha(ordinary.b),
        bh = sha(bypass.b);
      if (oh !== wanted || bh !== wanted)
        throw new Error(
          `Current serving byte drift ${file}: ordinary=${oh} bypass=${bh} wanted=${wanted}`,
        );
      results.push({
        file,
        sha256: wanted,
        ordinary: ordinary.r.status,
        bypass: bypass.r.status,
        cfCacheStatus: ordinary.r.headers.get("cf-cache-status"),
        age: ordinary.r.headers.get("age"),
      });
    }
  }

  let hfCoreFiles = 0;
  if (verifyHf) {
    const hf = authority.surfaces.huggingFace,
      repo = huggingFaceDatasetRepo(release),
      base = `https://huggingface.co/datasets/${repo}/resolve/main/`,
      nonce = Date.now(),
      core = resourcesForTarget(hf.resourceTarget);
    const metaBytes = (
      await fetchOne(
        `https://huggingface.co/api/datasets/${repo}?full=true&blobs=false&_=${nonce}`,
        true,
      )
    ).b;
    let metadata;
    try {
      metadata = JSON.parse(metaBytes.toString("utf8"));
    } catch {
      throw new Error("HF Dataset API metadata is not valid JSON");
    }
    const remote = await verifyHuggingFaceRemoteDistribution({
      release,
      hf,
      metadata,
      fetchBytes: async (file) =>
        (
          await fetchOne(
            `${base}${file}?download=true&_=${nonce}-${encodeURIComponent(file)}`,
            true,
          )
        ).b,
    });
    for (const resource of core) {
      const local = await readFile(localDistributionFile(resource)),
        wanted = sha(local),
        remoteBytes = remote.files.get(resource.path),
        actual = sha(remoteBytes);
      if (actual !== wanted)
        throw new Error(
          `HF main core byte drift ${resource.path}: actual=${actual} expected=${wanted}`,
        );
    }
    hfCoreFiles = core.length;
  }

  console.log(
    JSON.stringify(
      {
        stage: "CURRENT_SERVING_TRUTH",
        release: release.release,
        websiteExact: verifyWebsite ? true : null,
        hfCurrentCoreExact: verifyHf ? true : null,
        hfRemoteInventoryExact: verifyHf ? true : null,
        hfRemoteManifestExact: verifyHf ? true : null,
        hfCoreFiles,
        files: results.length,
        integrity: "PASS",
        results,
      },
      null,
      2,
    ),
  );
}

async function command_discovery() {
  const root = process.cwd(),
    dist = path.resolve(
      root,
      process.argv.slice(2).find((value) => !value.startsWith("--")) || "dist",
    ),
    base = process.env.VERIFY_BASE_URL || "https://www.ghezelbaash.ir/";
  const release = JSON.parse(
      await readFile(path.join(root, "src/data/release.json"), "utf8"),
    ),
    matrix = JSON.parse(
      await readFile(
        path.join(root, ".generated/projections/current-release-matrix.json"),
        "utf8",
      ),
    );
  for (const [k, v] of Object.entries({
    release: release.release,
    conceptDoi: release.dataset.zenodo.conceptDoi,
    versionDoi: release.dataset.zenodo.versionDoi,
    recordId: String(release.dataset.zenodo.recordId),
    personWikidata: release.primaryEntity.wikidata,
    clinicWikidata: release.dataset.supportingClinicWikidata,
  }))
    if (String(matrix[k]) !== String(v))
      throw new Error(`Current release matrix ${k} drift ${matrix[k]} != ${v}`);
  const websiteResources = resourcesForTarget("website");
  const semantic = websiteResources
    .filter(
      (resource) =>
        resource.materialize &&
        !resource.mutable &&
        resource.path !== "sitemap.xml",
    )
    .map((resource) => resource.path);
  const mutable = websiteResources
    .filter((resource) => resource.mutable)
    .map((resource) => resource.path);
  const endpoints = [...new Set(["index.html", ...semantic, ...mutable])],
    sha = (b) => createHash("sha256").update(b).digest("hex");
  const parseMaxAge = (v) => {
    const m = String(v || "").match(/(?:^|,)\s*max-age=(\d+)/i);
    return m ? Number(m[1]) : null;
  };
  const fetchBytes = (url, encoding = "identity") =>
    fetchRepresentation(url, {
      headers: {
        "user-agent": "ghezelbaash-public-discovery-freshness/2.0",
        accept: "*/*",
        "accept-encoding": encoding,
      },
    });
  const compressionResources = new Set([
    "index.html",
    "graph.jsonld",
    "graph.ttl",
    "entity-facts.csv",
    "answers.txt",
  ]);
  const requireMachineCompression = process.argv.includes(
    "--require-machine-compression",
  );
  const probeZstd = process.argv.includes("--probe-zstd");
  const rows = [];
  for (const rel of endpoints) {
    const expected = Buffer.from(await readFile(path.join(dist, rel))),
      expectedSha = sha(expected),
      url = new URL(rel === "index.html" ? "" : rel, base);
    const encodings = compressionResources.has(rel)
      ? ["identity", "br", "gzip", ...(probeZstd ? ["zstd"] : [])]
      : ["identity"];
    for (const encoding of encodings) {
      const ordinary = await fetchBytes(url, encoding),
        bust = new URL(url);
      bust.searchParams.set(
        "__discovery_freshness",
        `${Date.now()}-${Math.random()}`,
      );
      const fresh = await fetchBytes(bust, encoding);
      for (const [cacheLane, x] of [
        ["ordinary", ordinary],
        ["cacheBusted", fresh],
      ]) {
        const lane = `${cacheLane}/${encoding}`;
        if (x.r.status !== 200 || sha(x.b) !== expectedSha)
          throw new Error(
            `${rel} ${lane} byte drift status=${x.r.status} got=${sha(x.b)} expected=${expectedSha}`,
          );
        const cc = x.r.headers.get("cache-control") || "",
          maxAge = parseMaxAge(cc);
        if (rel === "index.html" || mutable.includes(rel)) {
          if (!/\bno-cache\b/i.test(cc))
            throw new Error(`${rel} ${lane} mutable no-cache drift: ${cc}`);
        } else if (
          !/must-revalidate/i.test(cc) ||
          maxAge === null ||
          maxAge > 3600
        )
          throw new Error(`${rel} ${lane} semantic max-age drift: ${cc}`);
        const rd = x.r.headers.get("repr-digest");
        if (encoding === "identity" && x.contentEncoding !== "identity")
          throw new Error(
            `${rel} ${lane} identity negotiation drift: ${x.contentEncoding}`,
          );
        if (
          encoding !== "identity" &&
          x.contentEncoding !== "identity" &&
          x.contentEncoding !== encoding
        )
          throw new Error(
            `${rel} ${lane} Content-Encoding was not offered: ${x.contentEncoding}`,
          );
        assertEncodingVary(rel, lane, x.r.headers.get("vary"));
        assertRequiredCompression(
          rel,
          encoding,
          x.contentEncoding,
          requireMachineCompression,
        );
        rows.push({
          resource: rel,
          lane,
          status: x.r.status,
          sha256: expectedSha,
          cacheControl: cc,
          age: x.r.headers.get("age"),
          etag: x.r.headers.get("etag"),
          cfCacheStatus: x.r.headers.get("cf-cache-status"),
          reprDigest: rd,
          reprDigestVerified: x.reprDigestVerified,
          requestedEncoding: encoding,
          contentEncoding: x.contentEncoding,
          encodedBytes: x.encodedBytes.length,
          decodedBytes: x.b.length,
          release: matrix.release,
          conceptDoi: matrix.conceptDoi,
          versionDoi: matrix.versionDoi,
        });
      }
    }
  }
  console.log(
    JSON.stringify(
      {
        publicDiscoveryFreshness: "PASS",
        base,
        resources: endpoints.length,
        lanes: rows.length,
        releaseContext: {
          release: matrix.release,
          conceptDoi: matrix.conceptDoi,
          versionDoi: matrix.versionDoi,
          recordId: String(matrix.recordId),
        },
        rows,
      },
      null,
      2,
    ),
  );
}

async function command_release() {
  const { release, tag, head, core, distRoot, localFile } =
      await releaseContext(releaseLocations(process.argv.slice(2))),
    z = release.dataset.zenodo;
  const sha = (b) => createHash("sha256").update(b).digest("hex"),
    fetchBytes = async (url) => {
      const r = await fetch(url, {
        headers: {
          "Cache-Control": "no-cache",
          "User-Agent": "ghezelbaash-release-snapshot-verifier/1.0",
        },
        signal: AbortSignal.timeout(60000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return Buffer.from(await r.arrayBuffer());
    };
  const zenodoResponse = await fetch(
    `https://zenodo.org/api/records/${z.recordId}?_=${Date.now()}`,
    {
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!zenodoResponse.ok)
    throw new Error(`Zenodo HTTP ${zenodoResponse.status}`);
  const zenodo = await zenodoResponse.json(),
    md = zenodo.metadata || {},
    remoteRows = zenodo.files || [],
    remoteFiles = new Map(
      remoteRows.map((row) => [row.key || row.filename, row]),
    );
  if (
    zenodo.doi !== z.versionDoi ||
    zenodo.conceptdoi !== z.conceptDoi ||
    md.version !== release.release ||
    md.title !== release.dataset.name
  )
    throw new Error("Zenodo release identity drift");
  if ((md.creators || [])[0]?.orcid !== release.primaryEntity.orcid)
    throw new Error("Zenodo creator ORCID drift");
  const expectedZenodoFiles = new Set([
    ...core.map((resource) => resource.path),
    "release-attestation.json",
    "dist-sha256.json",
  ]);
  if (
    remoteRows.length !== remoteFiles.size ||
    remoteFiles.size !== expectedZenodoFiles.size ||
    [...expectedZenodoFiles].some((file) => !remoteFiles.has(file))
  )
    throw new Error("Zenodo snapshot inventory drift");
  const zenodoBytes = async (file) => {
    const row = remoteFiles.get(file),
      url = row?.links?.self || row?.links?.download || row?.links?.content;
    if (!url) throw new Error(`Zenodo snapshot download URL missing ${file}`);
    return fetchBytes(url);
  };
  const localHashes = new Map(),
    results = [];
  for (const resource of core) {
    const file = resource.path,
      local = await readFile(localFile(resource)),
      wanted = sha(local),
      zenodoBlob = await zenodoBytes(file),
      zenodoHash = sha(zenodoBlob);
    localHashes.set(file, wanted);
    if (zenodoHash !== wanted)
      throw new Error(
        `Zenodo snapshot byte drift ${file}: ${zenodoHash}/${wanted}`,
      );
    const hfUrl = `${release.dataset.huggingFace.dataset}/resolve/${encodeURIComponent(tag)}/${file}?download=true&_=${Date.now()}`,
      hfHash = sha(await fetchBytes(hfUrl));
    if (hfHash !== wanted)
      throw new Error(`HF ${tag} byte drift ${file}: ${hfHash}/${wanted}`);
    results.push({ file, sha256: wanted });
  }
  const [attestationBytes, distManifestBytes] = await Promise.all([
    zenodoBytes("release-attestation.json"),
    zenodoBytes("dist-sha256.json"),
  ]);
  let attestation, distManifest;
  try {
    attestation = JSON.parse(attestationBytes.toString("utf8"));
    distManifest = JSON.parse(distManifestBytes.toString("utf8"));
  } catch {
    throw new Error("Zenodo release auxiliary JSON is invalid");
  }
  const distFiles = await walkRelative(distRoot),
    localDistManifest = {};
  for (const file of distFiles)
    localDistManifest[file] = sha(await readFile(path.join(distRoot, file)));
  const manifestFiles = Object.keys(distManifest),
    manifestFileSet = new Set(manifestFiles),
    localFileSet = new Set(distFiles),
    missingLocal = manifestFiles.filter((file) => !localFileSet.has(file)),
    extraLocal = distFiles.filter((file) => !manifestFileSet.has(file)),
    hashDrift = manifestFiles.filter(
      (file) =>
        localFileSet.has(file) &&
        distManifest[file] !== localDistManifest[file],
    );
  if (missingLocal.length || extraLocal.length || hashDrift.length)
    throw new Error(
      `Zenodo DIST hash manifest drift ${JSON.stringify({
        missingLocal,
        extraLocal,
        hashDrift: hashDrift.map((file) => ({
          file,
          zenodo: distManifest[file],
          local: localDistManifest[file],
        })),
      })}`,
    );
  const expectedAttestation = {
    schema: "https://www.ghezelbaash.ir/release-attestation/v3",
    release: release.release,
    releasePublishedAt: release.dateModified,
    medicalReviewedAt: release.medicalReviewedAt,
    canonicalDatasetIri: release.dataset.id,
    primaryEntity: release.primaryEntity.wikidata,
    clinicEntity: release.dataset.supportingClinicWikidata,
    sourceRepository: release.dataset.github.repository,
    sourceCommit: head,
    zenodoConceptDoi: z.conceptDoi,
    zenodoVersionDoi: z.versionDoi,
    zenodoRecordId: String(z.recordId),
    releaseHistory: z.releaseHistory,
    graphJsonldSha256: localHashes.get("graph.jsonld"),
    graphTurtleSha256: localHashes.get("graph.ttl"),
    indexHtmlSha256: localHashes.get("index.html"),
    queryMatrixSha256: localHashes.get("query-matrix.jsonl"),
    currentReleaseMatrixSha256: localHashes.get("current-release-matrix.json"),
    distFileCount: distFiles.length,
    validation: "PASS",
  };
  for (const [field, wanted] of Object.entries(expectedAttestation))
    if (JSON.stringify(attestation[field]) !== JSON.stringify(wanted))
      throw new Error(`Zenodo release attestation drift ${field}`);
  const hfReadme = (
    await fetchBytes(
      `${release.dataset.huggingFace.dataset}/resolve/${encodeURIComponent(tag)}/README.md?download=true&_=${Date.now()}`,
    )
  ).toString();
  for (const token of [
    release.release,
    z.versionDoi,
    z.conceptDoi,
    release.primaryEntity.wikidata,
    release.dataset.id,
    "text-retrieval",
    "text-generation",
  ])
    if (!hfReadme.includes(token))
      throw new Error(`HF frozen release card lacks ${token}`);
  console.log(
    JSON.stringify(
      {
        stage: "RELEASE_SNAPSHOT_TRUTH",
        release: release.release,
        sourceCommit: head,
        gitTag: tag,
        versionDoi: z.versionDoi,
        recordId: String(z.recordId),
        coreFiles: core.length,
        zenodoExact: true,
        zenodoAuxiliariesExact: true,
        hfTagCoreExact: true,
        integrity: "PASS",
        results,
      },
      null,
      2,
    ),
  );
}

const command = process.argv[2];
if (!command)
  throw new Error(
    "Usage: node scripts/verify-live.mjs <current|discovery|release|test-transport|test-release-context> [options]; release accepts --source-root and --dist-root",
  );
process.argv.splice(2, 1);
switch (command) {
  case "test-transport":
    await command_test_transport();
    break;
  case "test-release-context":
    await command_test_release_context();
    break;
  case "current":
    await command_current();
    break;
  case "discovery":
    await command_discovery();
    break;
  case "release":
    await command_release();
    break;
  default:
    throw new Error(
      "Usage: node scripts/verify-live.mjs <current|discovery|release|test-transport|test-release-context> [options]; release accepts --source-root and --dist-root",
    );
}
