import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, extname, resolve } from 'node:path';
import { clinic } from '../src/data/clinic.ts';
import { comparisons } from '../src/data/comparisons.ts';
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
const publicDir = resolve(root, 'public');
const assetsDir = resolve(publicDir, 'assets');
rmSync(resolve(publicDir, 'graph.jsonld'), { force: true });
const ensure = (path) => mkdirSync(path, { recursive: true });
const writeText = (path, value) => { ensure(resolve(path, '..')); writeFileSync(path, value, 'utf8'); };
const writeJson = (path, value) => writeText(path, `${JSON.stringify(value, null, 2)}\n`);
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const publicUrlFor = (path) => `/${path.replace(publicDir, '').replace(/^\/+/, '').replaceAll('\\', '/')}`;
for (const directory of ['css','fonts','images','videos','data']) {
  rmSync(resolve(assetsDir, directory), { recursive: true, force: true });
  ensure(resolve(assetsDir, directory));
}
const copyHashed = (source, outputDirectory, logicalName, forcedExtension) => {
  if (!source || !existsSync(source) || statSync(source).size === 0) return undefined;
  const buffer = readFileSync(source);
  const extension = forcedExtension ?? extname(source).slice(1).toLowerCase();
  const outputPath = resolve(outputDirectory, `${logicalName}.${sha256(buffer).slice(0, 12)}.${extension}`);
  writeFileSync(outputPath, buffer);
  return publicUrlFor(outputPath);
};

const fontUrl = copyHashed(resolve(root, 'Media/persian.woff2'), resolve(assetsDir, 'fonts'), 'persian', 'woff2');
const cssBuffer = Buffer.from(
  [
    readFileSync(resolve(root, 'src/styles/main.css'), 'utf8'),
    readFileSync(resolve(root, 'src/styles/refinements.css'), 'utf8'),
  ].join('\n').replace('__PERSIAN_FONT_URL__', fontUrl ?? ''),
);
const cssPath = resolve(assetsDir, 'css', `main.${sha256(cssBuffer).slice(0, 12)}.css`);
writeFileSync(cssPath, cssBuffer);
const cssUrl = publicUrlFor(cssPath);

const imageStem = {
  'doctor-portrait': 'doctor-portrait', 'doctor-profile': 'doctor-portrait',
  'doctor-exam': 'doctor-exam', 'doctor-with-staff': 'doctor-with-staff',
  'clinic-waiting-room': 'clinic-waiting-room', 'clinic-interior': 'clinic-interior',
  'clinic-interior-2': 'clinic-interior-2', 'clinic-corridor': 'clinic-corridor',
  'clinic-environment-3': 'clinic-environment-3',
};
const imageAlt = {
  'doctor-portrait': 'پرتره دکتر سعید قزلباش',
  'doctor-profile': 'دکتر سعید قزلباش، پزشک زیبایی در کرمانشاه',
  'doctor-exam': 'ارزیابی بالینی مراجعه‌کننده توسط دکتر سعید قزلباش',
  'doctor-with-staff': 'دکتر سعید قزلباش در کنار تیم کلینیک',
  'clinic-waiting-room': 'فضای انتظار کلینیک زیبایی دکتر سعید قزلباش',
  'clinic-interior': 'فضای داخلی کلینیک زیبایی دکتر سعید قزلباش',
  'clinic-interior-2': 'نمای دیگری از فضای داخلی کلینیک',
  'clinic-corridor': 'راهروی دسترسی کلینیک در ساختمان ویستا',
  'clinic-environment-3': 'محیط کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه',
};
const imageAssets = {};
const fallbackDirectory = resolve(root, 'Media/existing-derivatives/images/responsive');
for (const image of images) {
  if (image.id === 'doctor-profile' && imageAssets['doctor-portrait']) {
    imageAssets[image.id] = { ...imageAssets['doctor-portrait'], alt: imageAlt[image.id] };
    continue;
  }
  const source = resolve(root, 'Media', image.sourceFile);
  const stem = imageStem[image.id];
  const nominalWidth = image.scaffoldWidth ?? 1200;
  const pickSingleton = (extension) => {
    const optimized = resolve(root, 'Media/optimized/images', `${image.id}.${extension}`);
    if (existsSync(optimized)) return optimized;
    if (existsSync(source) && extname(source).slice(1).toLowerCase() === extension) return source;
    return undefined;
  };
  const copyVariantSet = (extension) => {
    const pattern = new RegExp(`^${stem}-(\\d+)\\.${extension}$`, 'u');
    const derivativeSources = readdirSync(fallbackDirectory)
      .map((name) => ({ name, match: name.match(pattern) }))
      .filter((entry) => entry.match)
      .map((entry) => ({ source: resolve(fallbackDirectory, entry.name), width: Number(entry.match[1]) }))
      .sort((a, b) => a.width - b.width);
    const singleton = pickSingleton(extension) ?? (extension === 'jpg' && existsSync(source) ? source : undefined);
    const sources = derivativeSources.length > 0 ? derivativeSources : singleton ? [{ source: singleton, width: nominalWidth }] : [];
    return sources.map((variant) => ({
      src: copyHashed(variant.source, resolve(assetsDir, 'images'), `${image.id}-${variant.width}`, extension),
      width: variant.width,
    })).filter((variant) => variant.src);
  };
  const avifSrcset = copyVariantSet('avif');
  const webpSrcset = copyVariantSet('webp');
  const fallbackSrcset = copyVariantSet('jpg');
  const primary = (variants) => variants.find((variant) => variant.width === nominalWidth)?.src ?? variants.at(-1)?.src;
  const avif = primary(avifSrcset);
  const webp = primary(webpSrcset);
  const fallback = primary(fallbackSrcset);
  if (avif && webp && fallback) imageAssets[image.id] = {
    avif,
    webp,
    fallback,
    avifSrcset,
    webpSrcset,
    fallbackSrcset,
    width: nominalWidth,
    height: image.scaffoldHeight ?? 800,
    alt: imageAlt[image.id],
  };
}

const integrity = JSON.parse(readFileSync(resolve(root, 'Media/media-integrity.json'), 'utf8'));
const integrityByFile = new Map(integrity.files.map((entry) => [entry.file, entry]));
const isVerified = (relativePath) => {
  const entry = integrityByFile.get(relativePath);
  const fullPath = resolve(root, 'Media', relativePath);
  return Boolean(entry?.valid && existsSync(fullPath) && entry.sha256 === sha256(readFileSync(fullPath)));
};
const videoAssets = {};
for (const video of videos) {
  const stem = basename(video.sourceFile, '.mp4');
  const mp4 = video.available && isVerified(video.sourceFile) ? copyHashed(resolve(root, 'Media', video.sourceFile), resolve(assetsDir, 'videos'), stem, 'mp4') : undefined;
  const webmRelative = `webm/${stem}.webm`;
  const webm = video.available && isVerified(webmRelative) ? copyHashed(resolve(root, 'Media', webmRelative), resolve(assetsDir, 'videos'), stem, 'webm') : undefined;
  const poster = copyHashed(resolve(root, 'Media/posters', `${stem}.webp`), resolve(assetsDir, 'videos'), `${stem}-poster`, 'webp');
  const captionPath = resolve(root, 'Media', video.captionFile);
  const captions = existsSync(captionPath) ? copyHashed(captionPath, resolve(assetsDir, 'videos'), `${stem}-fa`, 'vtt') : undefined;
  videoAssets[video.id] = { ...(mp4 ? { mp4 } : {}), ...(webm ? { webm } : {}), ...(poster ? { poster } : {}), ...(captions ? { captions } : {}) };
}

const icon192Source = resolve(root, 'Media/existing-derivatives/brand/doctor-ghezelbaash-logo-192.png');
const icon512Source = resolve(root, 'Media/existing-derivatives/brand/doctor-ghezelbaash-logo-512.png');
const icon192 = copyHashed(icon192Source, resolve(assetsDir, 'images'), 'icon-192', 'png');
const icon512 = copyHashed(icon512Source, resolve(assetsDir, 'images'), 'icon-512', 'png');
const assets = {
  version: 3,
  css: cssUrl,
  font: fontUrl ?? null,
  icons: { ...(icon192 ? { '192': icon192 } : {}), ...(icon512 ? { '512': icon512 } : {}) },
  images: imageAssets,
  videos: videoAssets,
};
writeJson(resolve(publicDir, 'asset-manifest.json'), assets);

const visibleContent = Object.fromEntries(requiredVisibleFiles.map((file) => [file, readFileSync(resolve(root, 'src/content/visible', file), 'utf8')]));
if (Object.values(visibleContent).some((value) => value.includes('TODO_VISIBLE_CONTENT'))) throw new Error('Visible-content placeholders remain.');
const sectionInputs = sections.map((section) => {
  if (section.id === 'references') {
    return {
      id: section.id,
      title: section.title,
      text: references.map((reference) => `${reference.name}\n${reference.url}`).join('\n\n'),
    };
  }
  if (section.contentSource === 'topic-registry') {
    const group = topicGroups.find((item) => item.id === section.id);
    return { id: section.id, title: section.title, text: group?.terms.map((term) => `## ${term.name}\n\n${term.description}`).join('\n\n') ?? '' };
  }
  return { id: section.id, title: section.title, text: 'contentFile' in section ? visibleContent[section.contentFile] ?? '' : '' };
});
const faqInputs = faqItems.map((item) => ({ id: item.id, title: item.question, text: `${item.question}\n\n${item.answer}`, type: 'faq' }));
const comparisonInputs = comparisons.map((item) => ({ id: item.id, title: item.caption, text: [item.caption,item.columns.join(' | '),...item.rows.map((row) => row.join(' | '))].join('\n\n'), type: 'comparison' }));
const chunks = buildChunks([...sectionInputs,...faqInputs,...comparisonInputs]);
const graph = buildCanonicalGraph(assets);
writeJson(resolve(publicDir, 'knowledge-graph.jsonld'), graph);
writeText(resolve(publicDir, 'llms.txt'), buildLlmsTxt());
writeText(resolve(publicDir, 'llms-full.txt'), buildLlmsFullTxt(chunks));
writeText(resolve(publicDir, 'sitemap.xml'), buildSitemap(assets));
writeJson(resolve(assetsDir, 'data/entities.json'), { doctor, clinic });
writeJson(resolve(assetsDir, 'data/topic-index.json'), topicGroups);
writeJson(resolve(assetsDir, 'data/sections.json'), sections.map((section) => ({
  id: section.id,
  heading: section.title,
  url: `https://www.ghezelbaash.ir/#${section.id}`,
  contentSource: 'contentSource' in section ? section.contentSource : 'markdown',
  contentFile: 'contentFile' in section ? section.contentFile : null,
})));
writeJson(resolve(assetsDir, 'data/chunks.json'), chunks);
writeJson(resolve(assetsDir, 'data/faq.json'), faqItems);
writeJson(resolve(assetsDir, 'data/references.json'), references);
writeJson(resolve(assetsDir, 'data/comparisons.json'), comparisons);
writeJson(resolve(assetsDir, 'data/image-index.json'), images.map((image) => ({ ...image, assets: imageAssets[image.id] ?? null })));
writeJson(resolve(assetsDir, 'data/video-index.json'), videos.map((video) => ({ ...video, assets: videoAssets[video.id] ?? null })));
writeJson(resolve(assetsDir, 'data/dataset-index.json'), datasets);
writeJson(resolve(publicDir, 'release.json'), {
  ...release,
  deploymentProvider: 'cloudflare-pages',
  sourceRevision: process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'local',
  contentFrozen: release.contentFrozen,
  htmlSha256: null,
  graphSha256: sha256(readFileSync(resolve(publicDir, 'knowledge-graph.jsonld'))),
  llmsSha256: sha256(readFileSync(resolve(publicDir, 'llms-full.txt'))),
  mediaPolicy: {
    publishableVideos: videos.filter((video) => video.available).length,
    deferredVideos: videos.filter((video) => !video.available).map((video) => video.id),
    captionsOptionalUntilAccessibilityFinalization: true,
  },
});
writeText(resolve(publicDir, 'doctor.vcf'), `BEGIN:VCARD\r\nVERSION:4.0\r\nFN:${doctor.name}\r\nN:${doctor.familyName};${doctor.givenName};;;\r\nTITLE:${doctor.jobTitle}\r\nTEL;TYPE=work,voice:${clinic.telephone}\r\nEMAIL:${doctor.email}\r\nURL:https://www.ghezelbaash.ir/\r\nEND:VCARD\r\n`);
writeText(resolve(publicDir, 'clinic.vcf'), `BEGIN:VCARD\r\nVERSION:4.0\r\nFN:${clinic.name}\r\nORG:${clinic.name}\r\nTEL;TYPE=work,voice:${clinic.telephone}\r\nEMAIL:${clinic.email}\r\nADR;TYPE=work:;;${clinic.address.streetAddress};${clinic.address.addressLocality};${clinic.address.addressRegion};${clinic.address.postalCode};IR\r\nGEO:geo:${clinic.geo.latitude},${clinic.geo.longitude}\r\nURL:${clinic.mapsUrl}\r\nEND:VCARD\r\n`);
writeJson(resolve(publicDir, 'manifest.webmanifest'), { name: 'دکتر سعید قزلباش', short_name: 'دکتر قزلباش', lang: 'fa-IR', dir: 'rtl', start_url: '/', scope: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#ffffff', icons: [...(icon192 ? [{ src: icon192, sizes: '192x192', type: 'image/png' }] : []),...(icon512 ? [{ src: icon512, sizes: '512x512', type: 'image/png' }] : [])] });
const ogFallback = resolve(root, 'Media/existing-derivatives/og/home.webp');
if (existsSync(ogFallback)) copyFileSync(ogFallback, resolve(publicDir, 'og-image.webp'));
if (existsSync(icon192Source)) writeText(resolve(publicDir, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><image width="192" height="192" href="data:image/png;base64,${readFileSync(icon192Source).toString('base64')}"/></svg>\n`);
const unexpected = readdirSync(publicDir).filter((name) => name.endsWith('.map'));
if (unexpected.length > 0) throw new Error(`Unexpected source maps: ${unexpected.join(', ')}`);
process.stdout.write(`Generated production artifacts: ${chunks.length} chunks, ${graph['@graph'].length} graph nodes, ${Object.keys(imageAssets).length} images, ${videos.filter((video) => video.available).length} verified videos.\n`);
