import path from "node:path";
import { readFile } from "node:fs/promises";
import { assembleCanonicalContent } from "./lib/assemble-content.mjs";
import {
  canonicalHostRedirectRows,
  loadRedirectRegistry,
  normalizedRedirectPath,
  resolveSingleRedirectTarget,
  singleRedirectRows,
} from "./lib/redirect-registry.mjs";
import {
  STATIC_ARTIFACTS,
  staticArtifactForRoute,
} from "../src/lib/resources.mjs";

const root = process.cwd();
const fail = (message) => {
  throw new Error(message);
};
const contract = await loadRedirectRegistry(root);
const graph = JSON.parse(
  await readFile(
    path.join(root, "src/data/semantic/knowledge-graph.jsonld"),
    "utf8",
  ),
);
const { content } = await assembleCanonicalContent({ root, graph });
const canonicalRows = canonicalHostRedirectRows(contract);
const machineRoutes = new Set(
  STATIC_ARTIFACTS.map(({ path: artifactPath }) => `/${artifactPath}`),
);
const articlePattern = /^\/2025\/\d{2}\/blog-post(?:_?\d+)?\.html$/;
const canonical = new URL(contract.canonicalOrigin);
const fragments = new Set(
  [...content.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]),
);

const validateHttpsTarget = (targetValue, ref) => {
  const target = new URL(targetValue);
  if (target.protocol !== "https:") fail(`Non-HTTPS redirect target ${ref}`);
  return target;
};
const validateVisibleCanonicalTarget = (targetValue, ref) => {
  const target = validateHttpsTarget(targetValue, ref);
  if (
    target.origin !== canonical.origin ||
    target.pathname !== "/" ||
    target.search ||
    !target.hash
  )
    fail(
      `Canonical passage redirect must use a precise visible fragment: ${ref}`,
    );
  const fragment = decodeURIComponent(target.hash.slice(1));
  if (!fragments.has(fragment))
    fail(`Redirect target fragment is absent from canonical HTML: ${fragment}`);
  return target;
};

const single = contract.singleRedirects;
const singleRows = singleRedirectRows(contract);
const singleHosts = new Set(singleRows.map((rule) => rule.host));
for (const rule of singleRows)
  if (rule.host !== contract.zone) {
    if (rule.preserveQueryString !== false || !rule.target)
      fail(`Invalid static Single Redirect behavior ${rule.ref}`);
    validateHttpsTarget(rule.target, rule.ref);
  }
const expectedSingleHosts = new Set([
  contract.zone,
  "doctor.ghezelbaash.ir",
  "github.ghezelbaash.ir",
  "ig.ghezelbaash.ir",
]);
if (
  singleHosts.size !== expectedSingleHosts.size ||
  [...expectedSingleHosts].some((host) => !singleHosts.has(host))
)
  fail(`Managed Single Redirect host drift: ${[...singleHosts].join(", ")}`);
if (singleHosts.has("blog.ghezelbaash.ir"))
  fail("Blog catchall must not pre-empt exact Bulk Redirects");
const apex = singleRows.find((rule) => rule.host === contract.zone);
if (!apex?.targetExpression || apex.preserveQueryString !== true)
  fail("Apex path/query redirect behavior drift");
const apexProbe = `https://${contract.zone}/__apex_redirect_probe__?utm_source=integrity`;
if (
  resolveSingleRedirectTarget(contract, apex, apexProbe) !==
  `${contract.canonicalOrigin}/__apex_redirect_probe__?utm_source=integrity`
)
  fail("Apex redirect path/query projection drift");

const machineEntrypoints = new Map([
  ["github.ghezelbaash.ir", { route: "/graph.jsonld" }],
]);
for (const [host, expected] of machineEntrypoints) {
  const rule = singleRows.find((row) => row.host === host);
  const expectedTarget = `${contract.canonicalOrigin}${expected.route}`;
  if (rule?.target !== expectedTarget) fail(`${host} machine entrypoint drift`);
  const target = new URL(rule.target);
  if (
    target.origin !== canonical.origin ||
    target.pathname !== expected.route ||
    target.search ||
    target.hash
  )
    fail(`${host} must terminate on its exact first-party machine endpoint`);
  if (!machineRoutes.has(expected.route))
    fail(`${host} target is not an approved machine representation`);
  const artifact = staticArtifactForRoute(expected.route);
  if (!artifact)
    fail(`Missing static artifact registry entry for ${expected.route}`);
  await readFile(path.join(root, artifact.source), "utf8").catch(() =>
    fail(
      `Missing static artifact source for ${expected.route}: ${artifact.source}`,
    ),
  );
}
const ig = singleRows.find((rule) => rule.host === "ig.ghezelbaash.ir");
if (ig?.target !== `${contract.canonicalOrigin}/`)
  fail("ig.ghezelbaash.ir entity-home redirect drift");
const igTarget = new URL(ig.target);
if (
  igTarget.origin !== canonical.origin ||
  igTarget.pathname !== "/" ||
  igTarget.search ||
  igTarget.hash
)
  fail("ig.ghezelbaash.ir must consolidate to the exact canonical entity home");
const doctor = singleRows.find((rule) => rule.host === "doctor.ghezelbaash.ir");
if (!doctor?.target.includes("query_place_id=ChIJBT0YDOTt-j8RD-7mAPy6Zas"))
  fail("doctor subdomain lost the canonical Google Maps Place ID");

const bulk = contract.bulkRedirects;
if (bulk?.cloudflareProduct !== "Bulk Redirects" || bulk.planUrlLimit !== 10000)
  fail("Invalid Cloudflare Free Bulk Redirect contract");
if (
  !/^[a-z0-9_]{1,50}$/.test(bulk.listName) ||
  !/^[a-z0-9_]+$/.test(bulk.ruleRef)
)
  fail("Invalid Bulk Redirect list or rule name");
if (
  bulk.host !== "blog.ghezelbaash.ir" ||
  bulk.unmatchedPathPolicy !== "return-404"
)
  fail("Blog Bulk Redirect host/unmatched-path policy drift");
if (!Array.isArray(bulk.groups) || !bulk.groups.length)
  fail("Bulk Redirect groups are empty");

const bulkRefs = new Set();
const sourcePaths = new Set();
const targetFragments = new Set();
for (const group of bulk.groups) {
  if (!/^[a-z0-9_]+$/.test(group.ref) || bulkRefs.has(group.ref))
    fail(`Invalid or duplicate Bulk Redirect group ref ${group.ref}`);
  bulkRefs.add(group.ref);
  if (!Array.isArray(group.paths) || !group.paths.length)
    fail(`Bulk Redirect group has no paths: ${group.ref}`);
  if (group.statusCode !== 301 || group.preserveQueryString !== false)
    fail(`Invalid Bulk Redirect behavior: ${group.ref}`);
  const target = validateVisibleCanonicalTarget(group.target, group.ref);
  targetFragments.add(target.hash.slice(1));
  for (const source of group.paths) {
    if (
      typeof source !== "string" ||
      !source.startsWith("/") ||
      source.includes("?") ||
      source.includes("#") ||
      decodeURI(source) !==
        decodeURI(new URL(source, `https://${bulk.host}`).pathname)
    )
      fail(`Invalid exact Bulk Redirect source path ${source}`);
    if (sourcePaths.has(source))
      fail(`Duplicate Bulk Redirect source path ${source}`);
    sourcePaths.add(source);
  }
}
if (sourcePaths.size > bulk.planUrlLimit)
  fail(`Bulk Redirect URL quota exceeded: ${sourcePaths.size}`);

const articlePaths = [...sourcePaths].filter((pathValue) =>
  articlePattern.test(pathValue),
);
const labelPaths = [...sourcePaths].filter((pathValue) =>
  pathValue.startsWith("/search/label/"),
);
const excluded404 = [
  "/2025/02/blog-post_57.html",
  "/2025/02/blog-post_87.html",
  "/2025/03/blog-post_06.html",
];
for (const excluded of excluded404)
  if (sourcePaths.has(excluded))
    fail(`Historical 404 must not be redirected: ${excluded}`);
for (const required of [
  "/",
  "/2025/02/",
  "/2025/03/",
  "/2025/04/",
  "/2025/05/",
  "/2025/08/",
  "/search",
])
  if (!sourcePaths.has(required))
    fail(`Missing historical redirect path ${required}`);

const canonicalBySource = new Map(
  canonicalRows.map((row) => [row.source, row]),
);
const canonicalByNormalizedSource = new Map();
for (const row of canonicalRows) {
  const target = new URL(row.target, canonical);
  if (target.origin !== canonical.origin || target.search)
    fail(`Canonical-host target escaped its scope: ${row.source}`);
  if (target.hash) {
    if (target.pathname !== "/")
      fail(
        `Canonical-host passage target must use the root document: ${row.source}`,
      );
    const fragment = decodeURIComponent(target.hash.slice(1));
    if (!fragments.has(fragment))
      fail(
        `Canonical-host target fragment is absent from canonical HTML: ${row.source} -> ${fragment}`,
      );
  } else if (target.pathname !== "/" && !machineRoutes.has(target.pathname)) {
    fail(
      `Canonical-host target is not a visible passage or registered machine endpoint: ${row.source} -> ${row.target}`,
    );
  }
  const normalizedSource = normalizedRedirectPath(row.source, canonical);
  const prior = canonicalByNormalizedSource.get(normalizedSource);
  if (
    prior &&
    (prior.target !== row.target || prior.statusCode !== row.statusCode)
  )
    fail(
      `Equivalent canonical-host aliases disagree: ${prior.source} and ${row.source}`,
    );
  canonicalByNormalizedSource.set(normalizedSource, row);
}

let crossSurfaceMatches = 0;
for (const group of bulk.groups) {
  const target = new URL(group.target);
  const relativeTarget = `${target.pathname}${target.search}${target.hash}`;
  for (const source of group.paths) {
    const canonicalRule = canonicalByNormalizedSource.get(
      normalizedRedirectPath(source, `https://${bulk.host}`),
    );
    if (!canonicalRule) continue;
    crossSurfaceMatches += 1;
    if (
      canonicalRule.target !== relativeTarget ||
      canonicalRule.statusCode !== group.statusCode
    )
      fail(`Canonical/Blog redirect parity drift: ${source}`);
  }
}
for (const source of [...canonicalBySource.keys()].filter((pathValue) =>
  articlePattern.test(pathValue),
)) {
  if (!sourcePaths.has(source))
    fail(
      `Historical Blogspot path is missing from Bulk Redirect contract: ${source}`,
    );
}
if (canonicalBySource.has("/"))
  fail("Canonical-host redirects must never redirect the root path");
for (const excluded of excluded404)
  if (canonicalBySource.has(excluded))
    fail(`Historical 404 leaked into canonical-host redirects: ${excluded}`);

console.log(
  JSON.stringify(
    {
      valid: true,
      registrySchema: contract.schemaVersion,
      canonicalHost: contract.canonicalHostRedirects.host,
      canonicalHostRuleCount: canonicalRows.length,
      crossSurfaceMatches,
      singleRedirectProduct: single.cloudflareProduct,
      singleRedirectRuleCount: single.rules.length,
      singleRedirectRuleLimit: single.planRuleLimit,
      bulkRedirectProduct: bulk.cloudflareProduct,
      bulkRedirectUrlCount: sourcePaths.size,
      bulkRedirectUrlLimit: bulk.planUrlLimit,
      historicalArticlePaths: articlePaths.length,
      historicalLabelPaths: labelPaths.length,
      canonicalFragments: targetFragments.size,
      machineEntrypoints: Object.fromEntries(
        [...machineEntrypoints].map(([host, { route }]) => [host, route]),
      ),
      machineArtifactRegistry: STATIC_ARTIFACTS.length,
      unmatchedBlogPaths: bulk.unmatchedPathPolicy,
    },
    null,
    2,
  ),
);
