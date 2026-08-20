import assert from 'node:assert/strict';
import {createDeterministicZip,deterministicZipContract as contract} from './lib/deterministic-zip.mjs';
import {releaseArtifactNames} from './lib/release-artifacts.mjs';

const entries=[
  {name:'z-last.txt',data:Buffer.from('z')},
  {name:'a/اول.txt',data:Buffer.from('alpha')},
  {name:'a/middle.txt',data:Buffer.from('middle')}
];
const first=createDeterministicZip(entries),second=createDeterministicZip([...entries].reverse());
assert.deepEqual(first,second,'ZIP bytes must be independent of caller entry order');

const signature=bytes=>Buffer.from(bytes);
const eocd=first.lastIndexOf(signature([0x50,0x4b,0x05,0x06]));
assert.ok(eocd>=0,'ZIP EOCD missing');
const entryCount=first.readUInt16LE(eocd+10),centralSize=first.readUInt32LE(eocd+12),centralOffset=first.readUInt32LE(eocd+16);
assert.equal(entryCount,entries.length);
assert.equal(centralOffset+centralSize,eocd,'Central-directory bounds drift');

const names=[];
let cursor=centralOffset;
for(let index=0;index<entryCount;index+=1){
  assert.equal(first.readUInt32LE(cursor),0x02014b50,'Central-directory signature drift');
  assert.equal(first.readUInt16LE(cursor+4),contract.versionMadeBy,'ZIP host/version metadata drift');
  assert.equal(first.readUInt16LE(cursor+6),contract.versionNeeded,'ZIP required version drift');
  assert.equal(first.readUInt16LE(cursor+8),contract.flags,'ZIP UTF-8 flag drift');
  assert.equal(first.readUInt16LE(cursor+10),contract.method,'ZIP compression method drift');
  assert.equal(first.readUInt16LE(cursor+12),contract.dosTime,'ZIP deterministic DOS time drift');
  assert.equal(first.readUInt16LE(cursor+14),contract.dosDate,'ZIP deterministic DOS date drift');
  assert.equal(first.readUInt32LE(cursor+38),contract.externalAttributes,'ZIP Unix file-mode metadata drift');
  const nameLength=first.readUInt16LE(cursor+28),extraLength=first.readUInt16LE(cursor+30),commentLength=first.readUInt16LE(cursor+32),localOffset=first.readUInt32LE(cursor+42);
  const name=first.subarray(cursor+46,cursor+46+nameLength).toString('utf8');
  names.push(name);
  assert.equal(first.readUInt32LE(localOffset),0x04034b50,'Local-header signature drift');
  assert.equal(first.readUInt16LE(localOffset+6),contract.flags,'Local-header UTF-8 flag drift');
  assert.equal(first.readUInt16LE(localOffset+8),contract.method,'Local-header compression method drift');
  assert.equal(first.readUInt16LE(localOffset+10),contract.dosTime,'Local-header DOS time drift');
  assert.equal(first.readUInt16LE(localOffset+12),contract.dosDate,'Local-header DOS date drift');
  cursor+=46+nameLength+extraLength+commentLength;
}
assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b)),'ZIP central directory must be name-sorted');
assert.equal(cursor,eocd,'Central-directory parser did not converge on EOCD');
assert.throws(()=>createDeterministicZip([{name:'same.txt',data:'a'},{name:'same.txt',data:'b'}]),/Duplicate ZIP entry/);
assert.throws(()=>createDeterministicZip([{name:'../escape.txt',data:'x'}]),/Invalid ZIP entry name/);

const artifactNames=releaseArtifactNames({release:'1.2.3',dateModified:'2026-08-21'});
assert.equal(artifactNames.dist,'doctor-ghezelbaash-max-power-dist-v1.2.3-2026-08-21.zip');
assert.equal(artifactNames.source,'doctor-ghezelbaash-max-power-source-v1.2.3-production-clean-2026-08-21.zip');
assert.equal(artifactNames.complete,'doctor-ghezelbaash-max-power-complete-v1.2.3-2026-08-21.zip');
console.log(JSON.stringify({deterministicZip:'PASS',entries:entryCount,dosDate:contract.dosDate,unixFileMode:contract.unixFileMode.toString(8),artifactNaming:'FULL_SEMVER'},null,2));
