import { mkdir } from "node:fs/promises";
import { loadProjectionContext } from "./lib/projection-context.mjs";
import { compilePageAssets } from "./lib/projections/page-assets.mjs";
import { compileGraphProjections } from "./lib/projections/graph-projections.mjs";
import { compileSemanticCorpus } from "./lib/projections/semantic-corpus.mjs";
import { compileRetrievalCorpus } from "./lib/projections/retrieval-corpus.mjs";
import { compileContactDiscovery } from "./lib/projections/contact-discovery.mjs";

const target = process.argv[2];
if (!["site", "distribution"].includes(target))
  throw new Error(
    "Usage: node scripts/generate-projections.mjs <site|distribution>",
  );

const context = await loadProjectionContext();
const page = await compilePageAssets(context);
const graphs = await compileGraphProjections(context);

const report = {
  generated: true,
  target,
  release: context.release.release,
  graphNodes: context.graph["@graph"].length,
  head: graphs.headIds.length,
  headBytes: Buffer.byteLength(graphs.headRaw),
  support: graphs.supportIds.length,
  supportBytes: Buffer.byteLength(graphs.supportRaw),
  cssAsset: page.externalCssAssetName,
};

if (target === "distribution") {
  await mkdir(context.projections, { recursive: true });
  const semantic = await compileSemanticCorpus(context);
  const retrieval = await compileRetrievalCorpus(context, {
    answerRecords: semantic.answerRecords,
  });
  const discovery = await compileContactDiscovery(context);
  Object.assign(report, {
    facts: semantic.rowsCount,
    answers: semantic.answersCount,
    markdownBytes: retrieval.markdownBytes,
    passages: retrieval.passages,
    maxPassageChars: retrieval.maxPassageChars,
    sitemapImages: discovery.imageCount,
    sitemapVideos: discovery.videoCount,
  });
}

console.log(JSON.stringify(report, null, 2));
