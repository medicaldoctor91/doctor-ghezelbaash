import { readFile, writeFile, unlink } from "node:fs/promises";

const OLD = "https://www.ghezelbaash.ir/saeed-ghezelbash";
const NEW = "https://www.ghezelbaash.ir/#saeed-ghezelbash";

async function replaceExact(path, oldValue, newValue, expectedMinimum = 1) {
  const source = await readFile(path, "utf8");
  const count = source.split(oldValue).length - 1;
  if (count < expectedMinimum) throw new Error(`${path}: expected at least ${expectedMinimum} replacements, found ${count}`);
  const next = source.replaceAll(oldValue, newValue);
  await writeFile(path, next, "utf8");
  return count;
}

// Canonical JSON-LD: replace only the exact quoted Person IRI token. This cannot
// touch longer page IRIs such as /saeed-ghezelbash-diagnostic-philosophy.
const graphPath = "src/data/semantic/knowledge-graph.jsonld";
const graphSource = await readFile(graphPath, "utf8");
const oldToken = JSON.stringify(OLD);
const newToken = JSON.stringify(NEW);
const graphCount = graphSource.split(oldToken).length - 1;
if (graphCount < 1000) throw new Error(`Unexpected old Person IRI count: ${graphCount}`);
const graphNext = graphSource.replaceAll(oldToken, newToken);
if (graphNext.includes(oldToken)) throw new Error("Old exact Person IRI survived graph migration");
await writeFile(graphPath, graphNext, "utf8");

// Homepage authored Microdata identifies the same Person fragment. No self-link
// is invented; the existing H1 id remains the navigable same-document target.
const pagePath = "src/content-source/page.md";
const pageSource = await readFile(pagePath, "utf8");
const oldItem = `itemid="${OLD}"`;
const newItem = `itemid="${NEW}"`;
const pageCount = pageSource.split(oldItem).length - 1;
if (pageCount !== 2) throw new Error(`Expected exactly 2 physician itemid values, found ${pageCount}`);
let pageNext = pageSource.replaceAll(oldItem, newItem);
pageNext = pageNext
  .replaceAll(`href="${OLD}"`, 'href="#saeed-ghezelbash"')
  .replaceAll('href="/saeed-ghezelbash"', 'href="#saeed-ghezelbash"')
  .replaceAll('href="/#saeed-ghezelbash"', 'href="#saeed-ghezelbash"');
await writeFile(pagePath, pageNext, "utf8");

// HTTP Link headers expose the canonical Person IRI as rel=about.
const headerCount = await replaceExact("src/data/templates/headers.template", OLD, NEW, 1);

// The LLM guide has one dedicated primary-entity declaration; do not substring-
// replace legitimate longer canonical page URLs containing the physician slug.
const llmsPath = "src/content-source/llms-guide.md";
const llmsSource = await readFile(llmsPath, "utf8");
const oldPrimary = `Primary entity: ${OLD}.`;
const newPrimary = `Primary entity: ${NEW}.`;
if (!llmsSource.includes(oldPrimary)) throw new Error("LLM primary entity declaration not found");
await writeFile(llmsPath, llmsSource.replace(oldPrimary, newPrimary), "utf8");

// The artificial HTTP path never existed historically. Remove the source-level
// redirect decision while keeping the authored H1 fragment target.
const architecturePath = "src/data/url-architecture.json";
const architecture = JSON.parse(await readFile(architecturePath, "utf8"));
const before = architecture.decisions.length;
architecture.decisions = architecture.decisions.filter((entry) => entry.path !== "/saeed-ghezelbash");
if (architecture.decisions.length !== before - 1) throw new Error("Expected one /saeed-ghezelbash URL decision");
if (architecture.htmlIdTargets?.["saeed-ghezelbash"] !== "/#saeed-ghezelbash") throw new Error("Physician H1 fragment target drifted");
await writeFile(architecturePath, JSON.stringify(architecture, null, 2) + "\n", "utf8");

console.log(JSON.stringify({ graphReferencesMigrated: graphCount, pageMicrodataMigrated: pageCount, headerReferencesMigrated: headerCount, removedArtificialRouteDecision: true }, null, 2));

// Remove this one-time helper and its trigger from the resulting branch tree.
await unlink("scripts/one-time-physician-identity-migration.mjs");
await unlink(".github/workflows/one-time-physician-identity-migration.yml");
