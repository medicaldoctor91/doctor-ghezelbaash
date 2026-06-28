import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const publicDir = path.join(root, 'public');
fs.mkdirSync(publicDir, { recursive: true });

const filesToExposeAtWebRoot = [
  'CNAME',
  'logo.png',
  'doctor.jpg',
  'aesthetic-medicine-dataset.html'
];

for (const file of filesToExposeAtWebRoot) {
  const source = path.join(root, file);
  const target = path.join(publicDir, file);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, target);
    console.log(`copied ${file}`);
  } else {
    console.warn(`missing optional public asset: ${file}`);
  }
}
