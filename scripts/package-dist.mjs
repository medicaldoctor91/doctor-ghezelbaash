import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';

const root = process.cwd();
const releaseMeta = JSON.parse(await readFile(path.join(root, 'src/data/release.json'), 'utf8'));
const source = path.join(root, 'dist');
const outputDir = path.join(root, 'release');
const output = path.join(outputDir, `doctor-ghezelbaash-max-power-dist-v${releaseMeta.release.split('.')[0]}-${releaseMeta.dateModified}.zip`);

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
async function walk(dir, prefix = '') {
  const files = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(abs, rel));
    else if (entry.isFile()) files.push({ abs, rel });
  }
  return files;
}
function u16(value) { const b = Buffer.alloc(2); b.writeUInt16LE(value); return b; }
function u32(value) { const b = Buffer.alloc(4); b.writeUInt32LE(value >>> 0); return b; }

const files = await walk(source);
const locals = [];
const centrals = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(file.rel.replaceAll('\\', '/'));
  const raw = await readFile(file.abs);
  const compressed = deflateRawSync(raw, { level: 9 });
  const crc = crc32(raw);
  const local = Buffer.concat([
    u32(0x04034b50), u16(20), u16(0x0800), u16(8), u16(0), u16(0),
    u32(crc), u32(compressed.length), u32(raw.length), u16(name.length), u16(0), name, compressed,
  ]);
  locals.push(local);
  const central = Buffer.concat([
    u32(0x02014b50), u16(0x0314), u16(20), u16(0x0800), u16(8), u16(0), u16(0),
    u32(crc), u32(compressed.length), u32(raw.length), u16(name.length), u16(0), u16(0),
    u16(0), u16(0), u32(0), u32(offset), name,
  ]);
  centrals.push(central);
  offset += local.length;
}
const centralDirectory = Buffer.concat(centrals);
const end = Buffer.concat([
  u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
  u32(centralDirectory.length), u32(offset), u16(0),
]);
const archive = Buffer.concat([...locals, centralDirectory, end]);
await mkdir(outputDir, { recursive: true });
await writeFile(output, archive);
console.log(`${output}\nsha256=${createHash('sha256').update(archive).digest('hex')}`);
