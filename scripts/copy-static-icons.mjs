import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const copies = [
  ['Media/existing-derivatives/favicon-32x32.png', 'public/favicon-32x32.png'],
  ['Media/existing-derivatives/brand/doctor-ghezelbaash-logo-192.png', 'public/apple-touch-icon.png'],
];
for (const [source, destination] of copies) {
  const from = resolve(root, source);
  if (!existsSync(from)) throw new Error(`Missing icon source: ${source}`);
  copyFileSync(from, resolve(root, destination));
}
