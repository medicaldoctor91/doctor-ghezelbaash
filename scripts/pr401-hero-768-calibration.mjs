import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const avif = process.env.AVIF_NAME;
const webp = process.env.WEBP_NAME;
if (!avif || !webp) throw new Error("Missing generated Hero candidate names");
const web = (name) => ["", "media", "images", "physician", name].join("/");
const disk = (name) => path.join("public", "media", "images", "physician", name);
const a640 = "saeed-ghezelbash-portrait-delivery-640.f41e5aa1c0dd.avif";
const w640 = "saeed-ghezelbash-portrait-delivery-640.5c350c081420.webp";
const a960 = "saeed-ghezelbash-portrait-960.abde9c5ed375.avif";
const w960 = "saeed-ghezelbash-portrait-960.637a6fbe30a3.webp";
const a1600 = "saeed-ghezelbash-portrait-1600.75fc75537a3b.avif";

const replaceOnce = async (file, oldValue, newValue) => {
  const source = await readFile(file, "utf8");
  if (source.split(oldValue).length - 1 !== 1)
    throw new Error(`${file}: expected one calibration target`);
  await writeFile(file, source.replace(oldValue, newValue));
};

await replaceOnce(
  "src/content-source/page.md",
  `${web(a640)} 640w, ${web(a960)} 960w`,
  `${web(a640)} 640w, ${web(avif)} 768w, ${web(a960)} 960w`,
);
await replaceOnce(
  "src/content-source/page.md",
  `${web(w640)} 640w, ${web(w960)} 960w`,
  `${web(w640)} 640w, ${web(webp)} 768w, ${web(w960)} 960w`,
);
await replaceOnce(
  "src/lib/hero-image-contract.mjs",
  `export const HERO_IMAGE_960_HREF =\n  "${web(a960)}";\nexport const HERO_PRELOAD_SRCSET = \`\${HERO_PRELOAD_HREF} 640w, \${HERO_IMAGE_960_HREF} 960w, ${web(a1600)} 1600w\`;`,
  `export const HERO_IMAGE_768_HREF =\n  "${web(avif)}";\nexport const HERO_IMAGE_960_HREF =\n  "${web(a960)}";\nexport const HERO_PRELOAD_SRCSET = \`\${HERO_PRELOAD_HREF} 640w, \${HERO_IMAGE_768_HREF} 768w, \${HERO_IMAGE_960_HREF} 960w, ${web(a1600)} 1600w\`;`,
);
await replaceOnce(
  "scripts/validate-critical-path.mjs",
  "  HERO_IMAGE_960_HREF,",
  "  HERO_IMAGE_768_HREF,\n  HERO_IMAGE_960_HREF,",
);
await replaceOnce(
  "scripts/validate-critical-path.mjs",
  'HERO_PRELOAD_SRCSET.includes(HERO_PRELOAD_HREF) &&\n    HERO_PRELOAD_SRCSET.includes(`${HERO_IMAGE_960_HREF} 960w`)',
  'HERO_PRELOAD_SRCSET.includes(HERO_PRELOAD_HREF) &&\n    HERO_PRELOAD_SRCSET.includes(`${HERO_IMAGE_768_HREF} 768w`) &&\n    HERO_PRELOAD_SRCSET.includes(`${HERO_IMAGE_960_HREF} 960w`)',
);
await replaceOnce(
  "scripts/test-hero-delivery.mjs",
  '{ name: "mobile412", viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, candidate: "960" },',
  '{ name: "mobile412", viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, candidate: "768" },\n  { name: "mobile412x2", viewport: { width: 412, height: 823 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, candidate: "768" },',
);
await replaceOnce(
  "scripts/test-hero-delivery.mjs",
  "let browser;\nconst runs = [];",
  `const hero768Bytes = (await readFile(path.join(directory, "media", "images", "physician", "${avif}"))).length;\nconst hero960Bytes = (await readFile(path.join(directory, "media", "images", "physician", "${a960}"))).length;\nassert.ok(hero768Bytes < hero960Bytes, "768w Hero candidate must be lighter than 960w");\nassert.ok(hero768Bytes / hero960Bytes <= 0.65, "768w Hero candidate must materially reduce AVIF transfer bytes");\n\nlet browser;\nconst runs = [];`,
);
await replaceOnce(
  "src/data/media-dimensions.tsv",
  `public${web("saeed-ghezelbash-portrait-960.avif")}|960|640\n`,
  `public${web("saeed-ghezelbash-portrait-768.avif")}|768|512\npublic${web("saeed-ghezelbash-portrait-768.webp")}|768|512\npublic${web("saeed-ghezelbash-portrait-960.avif")}|960|640\n`,
);

const candidateBytes = (await stat(disk(avif))).size;
const baselineBytes = (await stat(disk(a960))).size;
if (!(candidateBytes < baselineBytes && candidateBytes / baselineBytes <= 0.65))
  throw new Error(`Hero transfer improvement insufficient: ${candidateBytes}/${baselineBytes}`);
console.log(JSON.stringify({ temporaryHeroCalibration: true, candidate: avif, candidateBytes, baselineBytes, reductionPercent: Number(((1 - candidateBytes / baselineBytes) * 100).toFixed(1)) }, null, 2));
