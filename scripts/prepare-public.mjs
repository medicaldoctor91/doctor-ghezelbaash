import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const publicDir = path.join(root, 'public');
fs.mkdirSync(publicDir, { recursive: true });

const filesToExposeAtWebRoot = [
  'CNAME',
  'robots.txt',
  'logo.png',
  'doctor.jpg',
  'graph-ghezelbaash-final.jsonld',
  'brand-kb.ghezelbaash.ai-public.json',
  'ai-discovery-index.json',
  'dataset-manifest.jsonld',
  'publishing-crosswalk.jsonld',
  'aesthetic_medicine_knowledge_kermanshah_fa.json',
  'dr-ghezelbaash-kermanshah-aesthetic-benchmark-2026-real-competitor-dominance.json',
  'services.json',
  'sameas.json',
  'nap.csv',
  'llms.txt',
  'aesthetic-medicine-dataset.html',
  'google-maps-review-evidence.html'
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
