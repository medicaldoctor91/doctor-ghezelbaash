import {SOURCE as canonicalSource} from '../src/canonical/source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { finalizeDist } from './finalize-dist.mjs';
import { sealRelease } from './seal-release.mjs';
import { verifyDist } from './verify-dist.mjs';
import {distHashes} from './lib/delivery-contract.mjs';
import { deriveRoutingRows } from '../src/lib/delivery-output.mjs';

const execFileAsync=promisify(execFile);
async function execute(command,args,cwd){const{stdout='',stderr=''}=await execFileAsync(command,args,{cwd,maxBuffer:128*1024*1024,env:process.env});if(stdout)process.stdout.write(stdout);if(stderr)process.stderr.write(stderr);}
function reportFa(report){return `# گزارش Dist V2\n\n- وضعیت: PASS\n- تاریخ منبع: ${report.sourceEdition}\n- Node: ${report.node}\n- صفحات canonical: ${report.verification.canonicalPages}\n- canonical graph nodes: ${report.verification.graphNodes}\n- video sitemap entries: ${report.verification.videoEntries}\n- integrity manifest files: ${report.verification.manifestFiles}\n- SBOM: CycloneDX\n- Content-Digest: فقط eligibility؛ فعال‌سازی نهایی منوط به byte-identity live است.\n- گیت‌های live-only: ${report.liveOnlyGates.join('، ')}\n`;}

export async function runV2Release({projectRoot}){
  const SOURCE=canonicalSource;
  const routes=SOURCE.routes.resources.map(item=>item.path);assert.equal(routes.length,72,'V2 requires 72 canonical routes');
  const byId=new Map(SOURCE.graph['@graph'].map(node=>[node['@id'],node]));
  await execute('npm',['run','test:v2'],projectRoot);
  await execute('npm',['run','build'],projectRoot);
  await execute('npm',['run','verify'],projectRoot);
  const distDir=path.join(projectRoot,'dist');
  const watchPosters=new Map(SOURCE.discovery.sitemapPolicy.videoWatchPages.map(item=>{const thumb=byId.get(item.videoId)?.thumbnailUrl;if(typeof thumb!=='string')throw new Error(`Missing watch-page thumbnail: ${item.videoId}`);const u=new URL(thumb);assert.equal(u.origin,SOURCE.canonicalOrigin,`Cross-origin watch poster: ${item.videoId}`);return[item.path,u.pathname];}));
  const builtGraph=JSON.parse(await fs.readFile(path.join(distDir,'graph.jsonld'),'utf8'));
  const routingRows=deriveRoutingRows(SOURCE,builtGraph);
  await finalizeDist({distDir,routes,routingRows,sourceEdition:SOURCE.edition,origin:SOURCE.canonicalOrigin,watchPosters,securityEmail:'doctor@ghezelbaash.ir',delivery:SOURCE.delivery,machineResources:SOURCE.machineResources});
  const seal=await sealRelease({distDir,projectRoot,releaseDate:SOURCE.edition});
  const sealedHashes=await distHashes(distDir);
  const languageRoutes=(SOURCE.discovery.translationGroups??[]).flatMap(group=>(group.members??[]).map(member=>member.path));
  const verification=await verifyDist({distDir,routes,origin:SOURCE.canonicalOrigin,physicianId:SOURCE.canonicalOrigin+'/#saeed-ghezelbash',clinicId:SOURCE.canonicalOrigin+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah',expectedVideos:SOURCE.discovery.sitemapPolicy.videoWatchPages.length,sourceEdition:SOURCE.edition,languageRoutes,requireMedicalSemantics:true,requireSbom:true,source:SOURCE});
  await execute('node',['infrastructure/test-not-found.mjs',distDir],projectRoot);
  await execute('node',['infrastructure/test-video-layout.mjs',distDir],projectRoot);
  await execute('node',['infrastructure/test-home-layout.mjs',distDir],projectRoot);
  await execute('node',['infrastructure/test-video-contract.mjs',distDir],projectRoot);
  await execute('node',['infrastructure/test-video-seeking.mjs',distDir],projectRoot);
  await execute('node',['infrastructure/test-reader-browser.mjs',distDir],projectRoot);
  assert.equal((await distHashes(distDir)).sha256,sealedHashes.sha256,'Post-seal verification is read-only');
  const report={sourceCommit:JSON.parse(await fs.readFile(path.join(distDir,'release-provenance.json'),'utf8')).sourceCommit,postSealReadOnly:true,browserVerification:'PASS',status:'PASS',sourceEdition:SOURCE.edition,node:process.versions.node,verification,seal,liveOnlyGates:['cloudflare-identity-rewrites-and-response-header-evaluation','machine-mime-cors-link-indexing-live-http','waf-googlebot-bingbot-oai-searchbot-access','sitemap-robots-and-media-live-http','cloudflare-103-early-hints','zstd-br-gzip-negotiation','http2-http3','tls-and-canonical-host-redirects','pages-dev-noindex-live-response','content-digest-live-byte-identity']};
  const releaseDir=path.join(projectRoot,'release');await fs.mkdir(releaseDir,{recursive:true});await fs.writeFile(path.join(releaseDir,'verification-report.json'),JSON.stringify(report,null,2)+'\n');await fs.writeFile(path.join(releaseDir,'verification-report-fa.md'),reportFa(report));return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');console.log(JSON.stringify(await runV2Release({projectRoot}),null,2));}
