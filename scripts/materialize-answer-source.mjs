import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { hydrateReleaseAuthority } from "../src/lib/canonical-authority.mjs";
import {
  deriveCanonicalAnswerProjection,
  projectCanonicalAnswerHtml,
} from "../src/lib/answer-projection.mjs";
import { missingCanonicalAnswerPlacements } from "../src/lib/strict-answer-projection.mjs";

const root = process.cwd();
const readJson = async (file) =>
  JSON.parse(await readFile(path.join(root, file), "utf8"));

const [rawRelease, graph, authorityProfile] = await Promise.all([
  readJson("src/data/release.json"),
  readJson("src/data/semantic/knowledge-graph.jsonld"),
  readJson("src/data/semantic/authority-profile.json"),
]);
const release = hydrateReleaseAuthority(rawRelease, graph, authorityProfile);
const projection = deriveCanonicalAnswerProjection(graph, release);
const file = path.join(root, "src/content-source/page.md");
const source = await readFile(file, "utf8");
const missingBefore = missingCanonicalAnswerPlacements(source, projection);
const projected = projectCanonicalAnswerHtml(source, projection);
const missingAfter = missingCanonicalAnswerPlacements(projected, projection);
if (missingAfter.length)
  throw new Error(
    `Answer materialization incomplete: ${missingAfter.map((x) => x.sourceFragment).join(", ")}`,
  );
if (projected !== source) await writeFile(file, projected, "utf8");
console.log(
  JSON.stringify({
    answers: projection.answers.length,
    missingBefore: missingBefore.length,
    sourceChanged: projected !== source,
    remainingMissing: missingAfter.length,
  }),
);
