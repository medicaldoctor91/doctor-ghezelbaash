import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assembleCanonicalContent } from "./lib/assemble-content.mjs";
import {
  loadRedirectRegistry,
  projectGithubPagesBridge,
} from "./lib/redirect-registry.mjs";

const root = process.cwd(),
  redirectRegistry = await loadRedirectRegistry(root),
  bridge = projectGithubPagesBridge(redirectRegistry),
  { canonical, humanRoutes, machineRoutes } = bridge;
const graph = JSON.parse(
  await readFile(
    path.join(root, "src/data/semantic/knowledge-graph.jsonld"),
    "utf8",
  ),
);
const release = JSON.parse(
    await readFile(path.join(root, "src/data/release.json"), "utf8"),
  ),
  canonicalEntity = release.primaryEntity?.id;
assert.equal(
  release.canonicalUrl,
  canonical,
  "GitHub Pages bridge canonical URL drift",
);
assert.equal(
  typeof canonicalEntity,
  "string",
  "Release primary entity ID must be a string",
);
const canonicalUrl = new URL(canonical),
  canonicalEntityUrl = new URL(canonicalEntity),
  canonicalEntityNodes = graph["@graph"].filter(
    (node) => node?.["@id"] === canonicalEntity,
  );
assert.equal(
  canonicalEntityUrl.origin,
  canonicalUrl.origin,
  "Release primary entity must use the canonical origin",
);
assert.equal(
  canonicalEntityUrl.pathname,
  canonicalUrl.pathname,
  "Release primary entity must identify the canonical page",
);
assert.ok(
  canonicalEntityUrl.hash,
  "Release primary entity must use a stable fragment ID",
);
assert.equal(
  canonicalEntityNodes.length,
  1,
  "Release primary entity must resolve to exactly one graph node",
);
const canonicalEntityTypes = Array.isArray(canonicalEntityNodes[0]["@type"])
  ? canonicalEntityNodes[0]["@type"]
  : [canonicalEntityNodes[0]["@type"]];
assert.ok(
  canonicalEntityTypes.includes("Person"),
  "Release primary entity graph node must be a Person",
);
const { content: sourceHtml } = await assembleCanonicalContent({ root, graph });
assert.ok(sourceHtml.length > 0, "Canonical assembled page is empty");
const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const redirectHtml = (target, title) => {
  const escapedTarget = escapeHtml(target);
  const escapedTitle = escapeHtml(title);
  const style = [
    "body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f7fb;color:#18223a;font:1rem/1.9 system-ui,sans-serif}",
    "main{max-width:42rem;margin:1rem;padding:2rem;border:1px solid #dce3ef;border-radius:1rem;background:#fff;box-shadow:0 1rem 3rem #18223a18}",
    "a{color:#0758b7;font-weight:700}",
  ].join("");
  const body = [
    "<body><main>",
    `<h1>${escapedTitle}</h1>`,
    "<p>این صفحه به نشانی رسمی و به‌روز منتقل شده است.</p>",
    `<p><a href="${escapedTarget}">ورود به وب‌سایت رسمی دکتر سعید قزلباش</a></p>`,
    "</main>",
    `<script>location.replace(${JSON.stringify(target)})</script>`,
    "</body>",
  ].join("");
  return `${[
    "<!doctype html>",
    '<html lang="fa" dir="rtl">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<meta http-equiv="refresh" content="0; url=${escapedTarget}">`,
    `<link rel="canonical" href="${canonical}">`,
    `<title>${escapedTitle} — انتقال به نشانی رسمی</title>`,
    '<meta name="description" content="این نشانی قدیمی به وب‌سایت رسمی و کانونیکال دکتر سعید قزلباش منتقل شده است.">',
    `<style>${style}</style>`,
    "</head>",
    body,
    "</html>",
  ].join("\n")}\n`;
};
async function write(rootDir, relative, content) {
  const destination = path.join(rootDir, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, "utf8");
}
async function build(outDir) {
  await mkdir(outDir, { recursive: false });
  for (const { path: relative, target, title } of humanRoutes) {
    const fragment = new URL(target).hash.slice(1);
    if (fragment)
      assert.match(
        sourceHtml,
        new RegExp(`id=["']${fragment}["']`),
        `Missing canonical fragment ${fragment}`,
      );
    await write(outDir, relative, redirectHtml(target, title));
  }
  await write(
    outDir,
    "404.html",
    redirectHtml(canonical, "نشانی قدیمی وب‌سایت دکتر سعید قزلباش"),
  );
  for (const { path: relative, target } of machineRoutes)
    await write(
      outDir,
      relative,
      `${JSON.stringify({ schemaVersion: 1, status: "moved-permanently", deprecated: true, canonicalEntity, canonicalSite: canonical, movedTo: target }, null, 2)}\n`,
    );
  await write(
    outDir,
    "llms.txt",
    `STATUS: MOVED_PERMANENTLY\nCANONICAL_SITE: ${canonical}\nMOVED_TO: ${canonical}llms.txt\n`,
  );
  await write(
    outDir,
    "nap.csv",
    `status,canonical_site,moved_to\nmoved-permanently,${canonical},${canonical}entity-facts.csv\n`,
  );
  await write(outDir, ".nojekyll", "");
  for (const { path: relative, target } of humanRoutes) {
    const html = await readFile(path.join(outDir, relative), "utf8");
    assert.match(html, /http-equiv="refresh" content="0; url=/);
    assert.match(
      html,
      new RegExp(
        `<link rel="canonical" href="${canonical.replaceAll(".", "\\.")}">`,
      ),
    );
    assert.ok(
      !/noindex/i.test(html),
      "Redirect bridges must remain crawlable for consolidation",
    );
    assert.ok(html.includes(escapeHtml(target)));
  }
  for (const { path: relative, target } of machineRoutes) {
    const payload = JSON.parse(
      await readFile(path.join(outDir, relative), "utf8"),
    );
    assert.equal(payload.deprecated, true);
    assert.equal(payload.movedTo, target);
    assert.equal(payload.canonicalSite, canonical);
    assert.equal(payload.canonicalEntity, canonicalEntity);
  }
  console.log(
    JSON.stringify(
      {
        valid: true,
        canonical,
        humanRedirectBridges: humanRoutes.length,
        machineDeprecationBridges: machineRoutes.length,
        custom404: true,
      },
      null,
      2,
    ),
  );
}
const publicBase = new URL(bridge.origin),
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));
function verifyHumanHtml(html, target) {
  assert.ok(
    html.includes(`content="0; url=${escapeHtml(target)}"`),
    "Zero-second permanent meta refresh drift",
  );
  assert.ok(
    html.includes(`<link rel="canonical" href="${canonical}">`),
    "Cross-domain canonical drift",
  );
  assert.ok(
    html.includes(`href="${escapeHtml(target)}"`),
    "Visible canonical destination link drift",
  );
  assert.ok(
    !/noindex/i.test(html),
    "A noindex directive would weaken redirect consolidation",
  );
}
function verifyMachinePayload(text, target) {
  const payload = JSON.parse(text);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.status, "moved-permanently");
  assert.equal(payload.deprecated, true);
  assert.equal(payload.canonicalSite, canonical);
  assert.equal(payload.canonicalEntity, canonicalEntity);
  assert.equal(payload.movedTo, target);
}
async function request(relative, attempt) {
  const url = new URL(relative, publicBase);
  url.searchParams.set(
    "__bridge_verify",
    `${process.env.GITHUB_SHA || "manual"}-${attempt}`,
  );
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "manual",
    headers: {
      "cache-control": "no-cache, no-store, max-age=0",
      pragma: "no-cache",
      "user-agent": "ghezelbaash-github-pages-bridge-verifier/1.0",
    },
    signal: AbortSignal.timeout(20000),
  });
  return { response, text: await response.text() };
}
async function verifyLive(attempt) {
  const tasks = [];
  for (const { path: relative, target } of humanRoutes) {
    const route =
      relative === "index.html"
        ? ""
        : relative.endsWith("/index.html")
          ? relative.slice(0, -10)
          : relative;
    tasks.push(async () => {
      const { response, text } = await request(route, attempt);
      assert.equal(
        response.status,
        200,
        `Human bridge status drift ${route}: ${response.status}`,
      );
      assert.match(
        response.headers.get("content-type") || "",
        /^text\/html\b/i,
        `Human bridge MIME drift ${route}`,
      );
      verifyHumanHtml(text, target);
    });
  }
  for (const { path: relative, target } of machineRoutes)
    tasks.push(async () => {
      const { response, text } = await request(relative, attempt);
      assert.equal(
        response.status,
        200,
        `Machine bridge status drift ${relative}: ${response.status}`,
      );
      assert.match(
        response.headers.get("content-type") || "",
        /^application\/(?:json|ld\+json)\b/i,
        `Machine bridge MIME drift ${relative}`,
      );
      verifyMachinePayload(text, target);
    });
  tasks.push(async () => {
    const { response, text } = await request("llms.txt", attempt);
    assert.equal(response.status, 200);
    assert.ok(text.includes(`MOVED_TO: ${canonical}llms.txt`));
  });
  tasks.push(async () => {
    const { response, text } = await request("nap.csv", attempt);
    assert.equal(response.status, 200);
    assert.ok(text.includes(`${canonical}entity-facts.csv`));
  });
  tasks.push(async () => {
    const { response, text } = await request(
      "__missing_bridge_probe__",
      attempt,
    );
    assert.equal(
      response.status,
      404,
      `Custom 404 status drift: ${response.status}`,
    );
    verifyHumanHtml(text, canonical);
  });
  let cursor = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      await tasks[index]();
    }
  });
  await Promise.all(workers);
}
async function verifyBridge() {
  let lastError;
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      await verifyLive(attempt);
      console.log(
        JSON.stringify(
          {
            valid: true,
            publicBase: publicBase.href,
            cacheBypass: true,
            humanRedirectBridges: humanRoutes.length,
            machineDeprecationBridges: machineRoutes.length,
            auxiliaryMachineBridges: 2,
            custom404: true,
            liveProbes: humanRoutes.length + machineRoutes.length + 3,
          },
          null,
          2,
        ),
      );
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 20) break;
      console.warn(
        `GITHUB_PAGES_PROPAGATION_WAIT attempt=${attempt} error=${error instanceof Error ? error.message : String(error)}`,
      );
      await sleep(3000);
    }
  }
  if (lastError) throw lastError;
}
async function selfTest() {
  const temp = await mkdtemp(
      path.join(os.tmpdir(), "ghezelbaash-pages-bridge-"),
    ),
    out = path.join(temp, "artifact");
  try {
    await build(out);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  verifyHumanHtml(
    redirectHtml(`${canonical}#botox`, "بوتاکس"),
    `${canonical}#botox`,
  );
  verifyMachinePayload(
    JSON.stringify({
      schemaVersion: 1,
      status: "moved-permanently",
      deprecated: true,
      canonicalEntity,
      canonicalSite: canonical,
      movedTo: `${canonical}graph.jsonld`,
    }),
    `${canonical}graph.jsonld`,
  );
  console.log("GITHUB_PAGES_BRIDGE_SELF_TEST_OK");
}
const command = process.argv[2] || "build";
process.argv.splice(2, 1);
if (command === "build") {
  const out = path.resolve(root, process.argv[2] || "github-pages-bridge-dist");
  assert.ok(
    out.startsWith(`${root}${path.sep}`),
    "Bridge output must remain inside the repository workspace",
  );
  await build(out);
} else if (command === "verify") await verifyBridge();
else if (command === "self-test") await selfTest();
else
  throw new Error(
    "Usage: node scripts/github-pages-bridge.mjs <build|verify|self-test> [output]",
  );
