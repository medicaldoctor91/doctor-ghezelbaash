import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {createDeterministicZip} from './lib/deterministic-zip.mjs';

const root=process.cwd(),release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8')),invariants=JSON.parse(await readFile(path.join(root,'src/data/release-invariants.json'),'utf8')),artifact=JSON.parse(await readFile(path.join(root,'dist/artifact-manifest.json'),'utf8'));
const releaseDir=path.join(root,'release'),distName=`doctor-ghezelbaash-max-power-dist-v${release.release.split('.')[0]}-${release.dateModified}.zip`,sourceName=`doctor-ghezelbaash-max-power-source-v${release.release}-production-clean-${release.dateModified}.zip`;
const dist=await readFile(path.join(releaseDir,distName)),source=await readFile(path.join(releaseDir,sourceName)),sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
const manifest={release:release.release,dateModified:release.dateModified,canonicalUrl:release.canonicalUrl,primaryEntity:release.primaryEntity.id,priceRange:invariants.priceRange,quality:{htmlBytes:artifact.invariants.htmlBytes,graphNodes:artifact.invariants.externalGraphNodeCount,rdfTriples:artifact.invariants.externalRdfTripleCount,ragPassages:artifact.invariants.ragPassageCount,renderChunks:artifact.invariants.renderChunkCount,captionTracks:artifact.video.captionTrackCount},artifacts:[{name:sourceName,bytes:source.length,sha256:sha256(source),role:'production-clean reproducible source'},{name:distName,bytes:dist.length,sha256:sha256(dist),role:'validated deploy-ready static distribution'}]};
const manifestBytes=Buffer.from(`${JSON.stringify(manifest,null,2)}\n`),entries=[{name:sourceName,data:source},{name:distName,data:dist},{name:'release-manifest.json',data:manifestBytes}];
const archive=createDeterministicZip(entries),output=path.join(releaseDir,`doctor-ghezelbaash-max-power-complete-v${release.release}-${release.dateModified}.zip`);
await writeFile(output,archive);
console.log(JSON.stringify({output,entries:entries.map(entry=>entry.name),archiveBytes:archive.length,sha256:sha256(archive)},null,2));
