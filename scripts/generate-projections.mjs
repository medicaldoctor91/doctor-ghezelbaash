import {mkdir} from 'node:fs/promises';
import {loadProjectionContext} from './lib/projection-context.mjs';
import {compilePageAssets} from './lib/projections/page-assets.mjs';
import {compileGraphProjections} from './lib/projections/graph-projections.mjs';
import {compileSemanticCorpus} from './lib/projections/semantic-corpus.mjs';
import {compileRetrievalCorpus} from './lib/projections/retrieval-corpus.mjs';
import {compileContactDiscovery} from './lib/projections/contact-discovery.mjs';

const context=await loadProjectionContext();
await mkdir(context.projections,{recursive:true});

const page=await compilePageAssets(context);
const graphs=await compileGraphProjections(context);
const semantic=await compileSemanticCorpus(context);
const retrieval=await compileRetrievalCorpus(context,{answerRecords:semantic.answerRecords});
const discovery=await compileContactDiscovery(context);

console.log(JSON.stringify({
  generated:true,
  release:context.release.release,
  graphNodes:context.graph['@graph'].length,
  facts:semantic.rowsCount,
  answers:semantic.answersCount,
  head:graphs.headIds.length,
  headBytes:Buffer.byteLength(graphs.headRaw),
  support:graphs.supportIds.length,
  supportBytes:Buffer.byteLength(graphs.supportRaw),
  markdownBytes:retrieval.markdownBytes,
  passages:retrieval.passages,
  maxPassageChars:retrieval.maxPassageChars,
  cssAsset:page.externalCssAssetName,
  sitemapImages:discovery.imageCount,
  sitemapVideos:discovery.videoCount,
},null,2));
