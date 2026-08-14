import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { INDEXNOW_KEY } from './lib/indexnow.mjs';

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] || 'dist');
const key = INDEXNOW_KEY;

await mkdir(dist, { recursive: true });
await writeFile(path.join(dist, `${key}.txt`), `${key}\n`, 'utf8');
console.log(JSON.stringify({ indexNowKeyFile: `${key}.txt`, generated: true }));
