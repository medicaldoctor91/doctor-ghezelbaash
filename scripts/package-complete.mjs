import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {createDeterministicZip} from './lib/deterministic-zip.mjs';
import {releaseArtifactNames} from './lib/release-artifacts.mjs';

const root=process.cwd(),release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8')),artifact=JSON.parse(await readFile(path.join(root,'dist/artifact-manifest.json'),'utf8')),names=releaseArtifactNames(release);
const releaseDir=path.join(root,'release'),dist=await readFile(path.join(releaseDir,names.dist)),source=await readFile(path.join(releaseDir,names.source)),sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
const manifest={release:release.release,dateModified:release.dateModified,canonicalUrl:release.canonicalUrl,primaryEntity:release.primaryEntity.id,priceRange:release.clinic.priceRange,quality:{htmlBytes:artifact.invariants.htmlBytes,graphNodes:artifact.invariants.externalGraphNodeCount,rdfTriples:artifact.invariants.externalRdfTripleCount,ragPassages:artifact.invariants.ragPassageCount,renderChunks:artifact.invariants.renderChunkCount,captionTracks:artifact.video.captionTrackCount},artifacts:[{name:names.source,bytes:source.length,sha256:sha256(source),role:'production-clean reproducible source'},{name:names.dist,bytes:dist.length,sha256:sha256(dist),role:'validated deploy-ready static distribution'}]};
const manifestBytes=Buffer.from(`${JSON.stringify(manifest,null,2)}\n`),entries=[{name:names.source,data:source},{name:names.dist,data:dist},{name:'release-manifest.json',data:manifestBytes}];
const archive=createDeterministicZip(entries),output=path.join(releaseDir,names.complete);
await writeFile(output,archive);
console.log(JSON.stringify({output,entries:entries.map(entry=>entry.name),archiveBytes:archive.length,sha256:sha256(archive)},null,2));
