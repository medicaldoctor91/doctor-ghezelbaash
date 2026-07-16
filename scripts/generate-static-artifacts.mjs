import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, extname, resolve } from 'node:path';
import { clinic } from '../src/data/clinic.ts';
import { datasets } from '../src/data/datasets.ts';
import { doctor } from '../src/data/doctor.ts';
import { faqItems } from '../src/data/faq.ts';
import { images } from '../src/data/images.ts';
import { references } from '../src/data/references.ts';
import { release } from '../src/data/release.ts';
import { requiredVisibleFiles, sections } from '../src/data/sections.ts';
import { topicGroups } from '../src/data/topics.ts';
import { videos } from '../src/data/videos.ts';
import { buildChunks } from '../src/utils/chunks.ts';
import { buildCanonicalGraph } from '../src/utils/graph.ts';
import { buildLlmsFullTxt, buildLlmsTxt } from '../src/utils/llms.ts';
import { buildSitemap } from '../src/utils/sitemap.ts';

const root = process.cwd();
const allowPlaceholders = process.argv.includes('--allow-placeholders');
const publicDir = resolve(root, 'public');
const assetsDir = resolve(publicDir, 'assets');
const generatedDirectories = ['css', 'fonts', 'images', 'videos', 'data'];

const ensure = (path) => mkdirSync(path, { recursive: true });
const writeText = (path, value) => {
  ensure(resolve(path, '..'));
  writeFileSync(path, value, 'utf8');
};
const writeJson = (path, value) => writeText(path, `${JSON.stringify(value, null, 2)}\n`);
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const publicUrlFor = (path) => `/${path.replace(publicDir, '').replace(/^\/+/, '').replaceAll('\\', '/')}`;

for (const directory of generatedDirectories) {
  rmSync(resolve(assetsDir, directory), { recursive: true, force: true });
  ensure(resolve(assetsDir, directory));
}

const copyHashed = (source, outputDirectory, logicalName, forcedExtension) => {
  if (!existsSync(source)) return undefined;
  const buffer = readFileSync(source);
  const extension = forcedExtension ?? extname(source).slice(1).toLowerCase();
  const outputName = `${logicalName}.${sha256(buffer).slice(0, 12)}.${extension}`;
  const outputPath = resolve(outputDirectory, outputName);
  writeFileSync(outputPath, buffer);
  return publicUrlFor(outputPath);
};

const fontSource = resolve(root, 'Media/persian.woff2');
const fontUrl = copyHashed(fontSource, resolve(assetsDir, 'fonts'), 'persian', 'woff2');
const cssSource = resolve(root, 'src/styles/main.css');
const cssBuffer = Buffer.from(
  readFileSync(cssSource, 'utf8').replace('__PERSIAN_FONT_URL__', fontUrl ?? ''),
);
const cssName = `main.${sha256(cssBuffer).slice(0, 12)}.css`;
const cssPath = resolve(assetsDir, 'css', cssName);
writeFileSync(cssPath, cssBuffer);
const cssUrl = publicUrlFor(cssPath);

const scaffoldImageStem = {
  'doctor-portrait': 'doctor-portrait-1200',
  'doctor-exam': 'doctor-exam-1200',
  'doctor-with-staff': 'doctor-with-staff-1200',
  'clinic-waiting-room': 'clinic-waiting-room-768',
  'clinic-interior': 'clinic-interior-768',
  'clinic-interior-2': 'clinic-interior-2-768',
  'clinic-corridor': 'clinic-corridor-768',
  'clinic-environment-3': 'clinic-environment-3-768',
};

const imageAssets = {};
for (const image of images) {
  const optimizedDirectory = resolve(root, 'Media/optimized/images');
  const source = resolve(root, 'Media', image.sourceFile);
  const stem = scaffoldImageStem[image.id];
  const fallbackDirectory = resolve(root, 'Media/existing-derivatives/images/responsive');
  const candidates = {
    avif: existsSync(resolve(optimizedDirectory, `${image.id}.avif`))
      ? resolve(optimizedDirectory, `${image.id}.avif`)
      : stem
        ? resolve(fallbackDirectory, `${stem}.avif`)
        : undefined,
    webp: existsSync(resolve(optimizedDirectory, `${image.id}.webp`))
      ? resolve(optimizedDirectory, `${image.id}.webp`)
      : stem
        ? resolve(fallbackDirectory, `${stem}.webp`)
        : undefined,
    fallback: existsSync(resolve(optimizedDirectory, `${image.id}.jpg`))
      ? resolve(optimizedDirectory, `${image.id}.jpg`)
      : existsSync(source)
        ? source
        : stem
          ? resolve(fallbackDirectory, `${stem}.jpg`)
          : undefined,
  };
  const avif = candidates.avif
    ? copyHashed(candidates.avif, resolve(assetsDir, 'images'), image.id, 'avif')
    : undefined;
  const webp = candidates.webp
    ? copyHashed(candidates.webp, resolve(assetsDir, 'images'), image.id, 'webp')
    : undefined;
  const fallback = candidates.fallback
    ? copyHashed(
        candidates.fallback,
        resolve(assetsDir, 'images'),
        image.id,
        extname(candidates.fallback).slice(1).toLowerCase(),
      )
    : undefined;
  if ((avif || webp || fallback) && image.scaffoldWidth && image.scaffoldHeight) {
    imageAssets[image.id] = {
      ...(avif ? { avif } : {}),
      ...(webp ? { webp } : {}),
      ...(fallback ? { fallback } : {}),
      width: image.scaffoldWidth,
      height: image.scaffoldHeight,
      alt: image.id === 'doctor-portrait' ? 'دکتر سعید قزلباش' : 'TODO_VISIBLE_CONTENT',
    };
  }
}

const icon192Source = resolve(
  root,
  'Media/existing-derivatives/brand/doctor-ghezelbaash-logo-192.png',
);
const icon512Source = resolve(
  root,
  'Media/existing-derivatives/brand/doctor-ghezelbaash-logo-512.png',
);
const icon192 = copyHashed(icon192Source, resolve(assetsDir, 'images'), 'icon-192', 'png');
const icon512 = copyHashed(icon512Source, resolve(assetsDir, 'images'), 'icon-512', 'png');

const videoAssets = {};
for (const video of videos) {
  const stem = basename(video.sourceFile, '.mp4');
  const mp4 = copyHashed(
    resolve(root, 'Media', video.sourceFile),
    resolve(assetsDir, 'videos'),
    stem,
    'mp4',
  );
  const webm = copyHashed(
    resolve(root, 'Media/webm', `${stem}.webm`),
    resolve(assetsDir, 'videos'),
    stem,
    'webm',
  );
  const poster = copyHashed(
    resolve(root, 'Media/posters', `${stem}.webp`),
    resolve(assetsDir, 'videos'),
    `${stem}-poster`,
    'webp',
  );
  const captions = copyHashed(
    resolve(root, 'Media', video.captionFile),
    resolve(assetsDir, 'videos'),
    `${stem}-fa`,
    'vtt',
  );
  videoAssets[video.id] = {
    ...(mp4 ? { mp4 } : {}),
    ...(webm ? { webm } : {}),
    ...(poster ? { poster } : {}),
    ...(captions ? { captions } : {}),
  };
}

const assets = {
  version: 1,
  css: cssUrl ?? null,
  font: fontUrl ?? null,
  images: imageAssets,
  videos: videoAssets,
};

writeJson(resolve(publicDir, 'asset-manifest.json'), assets);

const visibleContent = Object.fromEntries(
  requiredVisibleFiles.map((file) => {
    const path = resolve(root, 'src/content/visible', file);
    return [file, existsSync(path) ? readFileSync(path, 'utf8') : ''];
  }),
);

if (
  !allowPlaceholders &&
  Object.values(visibleContent).some((value) => value.includes('TODO_VISIBLE_CONTENT'))
) {
  throw new Error('Visible-content placeholders remain; production artifact generation aborted.');
}

const chunks = buildChunks(
  sections.map((section) => ({
    id: section.id,
    title: section.title,
    text: visibleContent[section.contentFile] ?? '',
  })),
);
const graph = buildCanonicalGraph(assets);

writeJson(resolve(publicDir, 'graph.jsonld'), graph);
writeText(resolve(publicDir, 'llms.txt'), buildLlmsTxt());
writeText(resolve(publicDir, 'llms-full.txt'), buildLlmsFullTxt(chunks));
writeText(resolve(publicDir, 'sitemap.xml'), buildSitemap(assets));

writeJson(resolve(assetsDir, 'data/entities.json'), { doctor, clinic });
writeJson(resolve(assetsDir, 'data/topic-index.json'), topicGroups);
writeJson(
  resolve(assetsDir, 'data/sections.json'),
  sections.map((section) => ({
    id: section.id,
    heading: section.title,
    url: `https://www.ghezelbaash.ir/#${section.id}`,
    contentFile: section.contentFile,
  })),
);
writeJson(resolve(assetsDir, 'data/chunks.json'), chunks);
writeJson(resolve(assetsDir, 'data/faq.json'), faqItems);
writeJson(resolve(assetsDir, 'data/references.json'), references);
writeJson(
  resolve(assetsDir, 'data/image-index.json'),
  images.map((image) => ({ ...image, assets: imageAssets[image.id] ?? null })),
);
writeJson(
  resolve(assetsDir, 'data/video-index.json'),
  videos.map((video) => ({ ...video, assets: videoAssets[video.id] ?? null })),
);
writeJson(resolve(assetsDir, 'data/dataset-index.json'), datasets);

writeJson(resolve(publicDir, 'release.json'), {
  ...release,
  contentFrozen: !allowPlaceholders,
  htmlSha256: null,
  graphSha256: sha256(readFileSync(resolve(publicDir, 'graph.jsonld'))),
  llmsSha256: sha256(readFileSync(resolve(publicDir, 'llms-full.txt'))),
});

writeText(
  resolve(publicDir, 'doctor.vcf'),
  `BEGIN:VCARD\r\nVERSION:4.0\r\nFN:${doctor.name}\r\nN:${doctor.familyName};${doctor.givenName};;;\r\nTITLE:${doctor.jobTitle}\r\nTEL;TYPE=work,voice:${clinic.telephone}\r\nEMAIL:${doctor.email}\r\nURL:https://www.ghezelbaash.ir/\r\nEND:VCARD\r\n`,
);
writeText(
  resolve(publicDir, 'clinic.vcf'),
  `BEGIN:VCARD\r\nVERSION:4.0\r\nFN:${clinic.name}\r\nORG:${clinic.name}\r\nTEL;TYPE=work,voice:${clinic.telephone}\r\nEMAIL:${clinic.email}\r\nADR;TYPE=work:;;${clinic.address.streetAddress};${clinic.address.addressLocality};${clinic.address.addressRegion};${clinic.address.postalCode};IR\r\nGEO:geo:${clinic.geo.latitude},${clinic.geo.longitude}\r\nURL:${clinic.mapsUrl}\r\nEND:VCARD\r\n`,
);

writeJson(resolve(publicDir, 'manifest.webmanifest'), {
  name: 'دکتر سعید قزلباش',
  short_name: 'دکتر قزلباش',
  lang: 'fa-IR',
  dir: 'rtl',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#ffffff',
  icons: [
    ...(icon192 ? [{ src: icon192, sizes: '192x192', type: 'image/png' }] : []),
    ...(icon512 ? [{ src: icon512, sizes: '512x512', type: 'image/png' }] : []),
  ],
});

const ogFallback = resolve(root, 'Media/existing-derivatives/og/home.webp');
if (existsSync(ogFallback)) copyFileSync(ogFallback, resolve(publicDir, 'og-image.webp'));

if (existsSync(icon192Source)) {
  const png = readFileSync(icon192Source).toString('base64');
  writeText(
    resolve(publicDir, 'favicon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><image width="192" height="192" href="data:image/png;base64,${png}"/></svg>\n`,
  );
}

const unexpected = readdirSync(publicDir).filter((name) => name.endsWith('.map'));
if (unexpected.length > 0) throw new Error(`Unexpected source maps in public/: ${unexpected.join(', ')}`);

process.stdout.write(
  `Generated static artifacts (${allowPlaceholders ? 'scaffold' : 'production'}): ${chunks.length} chunks, ${graph['@graph'].length} graph nodes.\n`,
);
