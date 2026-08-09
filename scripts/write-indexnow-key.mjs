import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] || 'dist');
const key = '2d0a99837e327f6744f9184ec6d2877f';

await mkdir(dist, { recursive: true });
await writeFile(path.join(dist, `${key}.txt`), `${key}\n`, 'utf8');
console.log(JSON.stringify({ indexNowKeyFile: `${key}.txt`, generated: true }));
