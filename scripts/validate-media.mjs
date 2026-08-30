import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  imageMetadataFor,
  matchImageProfile,
  videoAuthoredTags,
} from "./lib/media-metadata-contract.mjs";

const project = process.cwd();
const publicRoot = path.join(project, "public");
const mediaRoot = path.join(publicRoot, "media");
const exiftool = path.join(project, "node_modules/.bin/exiftool");
const release = JSON.parse(
  await readFile(path.join(project, "src/data/release.json"), "utf8"),
);
const canonicalGraph = JSON.parse(
  await readFile(
    path.join(project, "src/data/semantic/knowledge-graph.jsonld"),
    "utf8",
  ),
);
const stableMedia = JSON.parse(
  await readFile(
    path.join(project, "src/data/stable-media-aliases.json"),
    "utf8",
  ),
);
const pageSource = await readFile(
  path.join(project, "src/content-source/page.md"),
  "utf8",
);
const graphNodes = canonicalGraph["@graph"] ?? [];
const canonicalById = new Map(
  graphNodes
    .filter((node) => typeof node?.["@id"] === "string")
    .map((node) => [node["@id"], node]),
);

const fail = (message) => {
  throw new Error(message);
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const values = (value) =>
  Array.isArray(value) ? value : value === undefined ? [] : [value];
const scalar = (row, key) =>
  row[key] ??
  Object.entries(row).find(([candidate]) => candidate.endsWith(`:${key}`))?.[1];
const types = (node) => values(node?.["@type"]);
const refId = (value) => (typeof value === "string" ? value : value?.["@id"]);
const canonicalUrl = (relative) =>
  new URL(relative.replaceAll(path.sep, "/"), release.canonicalUrl).href;
const rasterPattern = /\.(?:avif|webp|jpe?g|png)$/i;
const videoPattern = /\.(?:mp4|webm)$/i;
const vttPattern = /\.vtt$/i;
const fingerprintPattern = /\.([0-9a-f]{12})\.[^.]+$/;

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    output.push(...(entry.isDirectory() ? await walk(absolute) : [absolute]));
  }
  return output;
}

function assertExactXmp(row, expected, file) {
  const expectedKeys = new Set(["XMP-x:XMPToolkit", ...Object.keys(expected)]);
  const actualKeys = Object.keys(row).filter((key) => key.startsWith("XMP-"));
  for (const key of actualKeys) {
    if (!expectedKeys.has(key)) fail(`Unexpected XMP property ${key}: ${file}`);
  }
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actual = row[key];
    if (Array.isArray(expectedValue)) {
      if (JSON.stringify(values(actual)) !== JSON.stringify(expectedValue)) {
        fail(`XMP property ${key} drift: ${file}`);
      }
    } else if (String(actual) !== String(expectedValue)) {
      fail(`XMP property ${key} drift: ${file}`);
    }
  }
}

if (
  !/^ChIJ[\w-]+$/.test(release.clinic.placeId) ||
  !release.primaryEntity.googleKnowledgeGraphId?.startsWith("/g/") ||
  !release.clinic.googleLocalKgmid?.startsWith("/g/")
) {
  fail("Release media identity contract is incomplete");
}

const dimensionRows = (
  await readFile(path.join(project, "src/data/media-dimensions.tsv"), "utf8")
)
  .trim()
  .split("\n");
const expectedDimensions = new Map(
  dimensionRows.map((line) => {
    const [logical, width, height] = line.split("|");
    return [logical, { width: Number(width), height: Number(height) }];
  }),
);
if (expectedDimensions.size !== 49) {
  fail(`Raster dimension inventory drift: ${expectedDimensions.size}`);
}

const allMedia = (await walk(mediaRoot)).sort();
const rasters = allMedia.filter((file) => rasterPattern.test(file));
const videos = allMedia.filter((file) => videoPattern.test(file));
const vttFiles = allMedia.filter((file) => vttPattern.test(file));
if (rasters.length !== 49 || videos.length !== 8 || vttFiles.length !== 6) {
  fail(
    `Media inventory drift: ${rasters.length} rasters, ${videos.length} videos, ${vttFiles.length} tracks`,
  );
}
if (allMedia.length !== rasters.length + videos.length + vttFiles.length) {
  fail("Unrecognized media file detected");
}

const logicalRasters = new Set();
for (const file of allMedia) {
  const bytes = await readFile(file);
  const fingerprint = path.basename(file).match(fingerprintPattern)?.[1];
  if (!fingerprint || sha256(bytes).slice(0, 12) !== fingerprint) {
    fail(`Media fingerprint mismatch: ${file}`);
  }
  if (!rasterPattern.test(file)) continue;
  const logical = path
    .relative(project, file)
    .replace(/\.[0-9a-f]{12}(\.[^.]+)$/, "$1");
  if (logicalRasters.has(logical)) fail(`Duplicate logical raster: ${logical}`);
  logicalRasters.add(logical);
}
if (logicalRasters.size !== expectedDimensions.size) {
  fail(`Logical raster inventory drift: ${logicalRasters.size}`);
}

const rasterProbe = spawnSync(
  exiftool,
  ["-j", "-G1", "-s", "-ImageWidth", "-ImageHeight", "-XMP:all", ...rasters],
  { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 },
);
if (rasterProbe.status !== 0)
  fail(`ExifTool raster validation failed: ${rasterProbe.stderr}`);
const rasterRows = JSON.parse(rasterProbe.stdout);
if (rasterRows.length !== rasters.length)
  fail(`Raster metadata row count drift: ${rasterRows.length}`);

const profileCoverage = new Map();
for (const row of rasterRows) {
  const file = row.SourceFile;
  const logical = path
    .relative(project, file)
    .replace(/\.[0-9a-f]{12}(\.[^.]+)$/, "$1");
  const dimensions = expectedDimensions.get(logical);
  if (!dimensions) fail(`Raster missing from dimension inventory: ${logical}`);
  if (
    scalar(row, "ImageWidth") !== dimensions.width ||
    scalar(row, "ImageHeight") !== dimensions.height
  ) {
    fail(`Raster dimensions drift: ${logical}`);
  }
  const profile = matchImageProfile(path.basename(file));
  profileCoverage.set(
    profile.role,
    (profileCoverage.get(profile.role) ?? 0) + 1,
  );
  assertExactXmp(row, imageMetadataFor(release, profile), file);
}

const stableSubject = stableMedia.subject ?? {};
const personWikidataIri = `https://www.wikidata.org/entity/${release.primaryEntity.wikidata}`;
if (
  stableSubject.googleKnowledgeGraphId !==
    release.primaryEntity.googleKnowledgeGraphId ||
  stableSubject.wikidataPersonIri !== personWikidataIri ||
  stableSubject.canonicalPersonIri !== release.primaryEntity.id
) {
  fail("Stable media subject contract is incomplete");
}
const stableAliases = stableMedia.aliases ?? [];
const stableTargets = new Set(
  stableAliases.map(({ target }) => path.resolve(publicRoot, target)),
);
const rasterPaths = new Set(rasters.map((file) => path.resolve(file)));
if (
  stableAliases.length !== 6 ||
  new Set(stableAliases.map(({ path: alias }) => alias)).size !== 6 ||
  stableTargets.size !== 6
) {
  fail("Stable media alias inventory drift");
}
for (const target of stableTargets) {
  if (!rasterPaths.has(target))
    fail(`Stable media target is missing: ${target}`);
}

const ffprobeVersion = spawnSync("ffprobe", ["-version"]);
if (ffprobeVersion.status !== 0)
  fail("ffprobe is required for media validation");
const canonicalVideos = graphNodes.filter((node) =>
  types(node).includes("VideoObject"),
);
if (canonicalVideos.length !== 4) {
  fail(`Canonical VideoObject inventory drift: ${canonicalVideos.length}`);
}

const videoRows = [];
for (const file of videos) {
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height:format_tags",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" },
  );
  if (probe.status !== 0) fail(`ffprobe failed: ${file}`);
  const parsed = JSON.parse(probe.stdout);
  const streams = parsed.streams ?? [];
  const videoStream = streams.find(({ codec_type: type }) => type === "video");
  const audioStream = streams.find(({ codec_type: type }) => type === "audio");
  if (streams.length !== 2 || !videoStream || !audioStream) {
    fail(`Unexpected stream inventory: ${file}`);
  }

  const extension = path.extname(file).slice(1).toLowerCase();
  const codecs = extension === "mp4" ? ["h264", "aac"] : ["av1", "opus"];
  if (
    videoStream.codec_name !== codecs[0] ||
    audioStream.codec_name !== codecs[1]
  ) {
    fail(`Unexpected ${extension.toUpperCase()} codecs: ${file}`);
  }
  if (!videoStream.width || !videoStream.height)
    fail(`Video dimensions missing: ${file}`);

  const tags = Object.fromEntries(
    Object.entries(parsed.format?.tags ?? {}).map(([key, value]) => [
      key.toLowerCase(),
      String(value),
    ]),
  );
  const structural =
    extension === "mp4"
      ? {
          major_brand: "isom",
          minor_version: "512",
          compatible_brands: "isomiso2avc1mp41",
        }
      : { encoder: "Lavf" };
  const allowedTags = new Set([
    ...videoAuthoredTags,
    ...Object.keys(structural),
  ]);
  for (const key of Object.keys(tags)) {
    if (!allowedTags.has(key))
      fail(`Unexpected video metadata property ${key}: ${file}`);
  }
  if (Object.keys(tags).length !== allowedTags.size) {
    fail(`Video metadata property inventory drift: ${file}`);
  }
  for (const [key, value] of Object.entries(structural)) {
    if (tags[key] !== value)
      fail(`Video container property ${key} drift: ${file}`);
  }

  const fileUrl = canonicalUrl(path.relative(publicRoot, file));
  const graphOwners = graphNodes.filter((node) => node.contentUrl === fileUrl);
  const directVideo = graphOwners.find((node) =>
    types(node).includes("VideoObject"),
  );
  const ownerId =
    directVideo?.["@id"] ??
    refId(graphOwners.find((node) => refId(node.isPartOf))?.isPartOf);
  const canonical = canonicalById.get(ownerId);
  if (!canonical || !types(canonical).includes("VideoObject")) {
    fail(`Video is not owned by a canonical VideoObject: ${file}`);
  }
  const expectedTags = {
    title: canonical.name,
    description: canonical.description,
    language: canonical.inLanguage,
    artist: "Saeed Ghezelbash",
    copyright: "© Saeed Ghezelbash. CC BY 4.0.",
    license: release.dataset.license,
    date: canonical.uploadDate,
    identifier: canonical.identifier,
  };
  if (
    JSON.stringify(Object.keys(expectedTags)) !==
    JSON.stringify(videoAuthoredTags)
  ) {
    fail("Video metadata contract order drift");
  }
  for (const [key, value] of Object.entries(expectedTags)) {
    if (tags[key] !== value) fail(`Video metadata ${key} drift: ${file}`);
  }

  const logical = path
    .relative(mediaRoot, file)
    .replace(/\.[0-9a-f]{12}\.(?:mp4|webm)$/i, "");
  videoRows.push({
    file,
    logical,
    extension,
    width: videoStream.width,
    height: videoStream.height,
    canonicalId: canonical["@id"],
    tags,
  });
}

const videoGroups = new Map();
for (const row of videoRows) {
  const group = videoGroups.get(row.logical) ?? [];
  group.push(row);
  videoGroups.set(row.logical, group);
}
if (videoGroups.size !== canonicalVideos.length) {
  fail(`Logical video inventory drift: ${videoGroups.size}`);
}
for (const [logical, group] of videoGroups) {
  if (
    group.length !== 2 ||
    new Set(group.map(({ extension }) => extension)).size !== 2
  ) {
    fail(`MP4/WebM pair is incomplete: ${logical}`);
  }
  const [first, second] = group;
  if (
    first.canonicalId !== second.canonicalId ||
    first.width !== second.width ||
    first.height !== second.height
  ) {
    fail(`MP4/WebM pair contract drift: ${logical}`);
  }
  for (const key of videoAuthoredTags) {
    if (first.tags[key] !== second.tags[key])
      fail(`MP4/WebM metadata ${key} drift: ${logical}`);
  }
}
const coveredVideoIds = new Set(
  videoRows.map(({ canonicalId }) => canonicalId),
);
for (const video of canonicalVideos) {
  if (!coveredVideoIds.has(video["@id"]))
    fail(`VideoObject lacks a published media pair: ${video["@id"]}`);
}

let decodedImages = 0;
for (const file of rasters) {
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_type,codec_name,width,height",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" },
  );
  if (probe.status !== 0) fail(`Image decode failed: ${file}`);
  const stream = JSON.parse(probe.stdout).streams?.[0];
  if (
    !stream ||
    stream.codec_type !== "video" ||
    !stream.width ||
    !stream.height
  ) {
    fail(`Invalid image stream: ${file}`);
  }
  decodedImages += 1;
}

let cueCount = 0;
for (const file of vttFiles) {
  const text = await readFile(file, "utf8");
  if (text.includes("\r") || !text.startsWith("WEBVTT\n\n")) {
    fail(`WebVTT header or line endings drift: ${file}`);
  }
  const blocks = text
    .slice("WEBVTT\n\n".length)
    .trimEnd()
    .split(/\n{2,}/);
  if (blocks.length === 0) fail(`WebVTT has no cues: ${file}`);
  blocks.forEach((block, index) => {
    const lines = block.split("\n");
    if (lines.length < 3 || lines[0] !== String(index + 1)) {
      fail(`WebVTT cue sequence drift: ${file}`);
    }
    if (
      !/^\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}$/.test(lines[1])
    ) {
      fail(`WebVTT cue timing drift: ${file}`);
    }
    if (lines.slice(2).some((line) => line.trim() === "")) {
      fail(`WebVTT empty cue text: ${file}`);
    }
    cueCount += 1;
  });
  const publicPath = `/${path.relative(publicRoot, file).replaceAll(path.sep, "/")}`;
  if (!pageSource.includes(publicPath))
    fail(`WebVTT is not referenced by the page: ${file}`);
}

const appleTouchIcon = path.join(publicRoot, "apple-touch-icon.png");
const iconProbe = spawnSync(
  exiftool,
  [
    "-j",
    "-G1",
    "-s",
    "-ImageWidth",
    "-ImageHeight",
    "-XMP:all",
    appleTouchIcon,
  ],
  { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
);
if (iconProbe.status !== 0)
  fail(`Apple touch icon validation failed: ${iconProbe.stderr}`);
const iconRow = JSON.parse(iconProbe.stdout)[0];
if (
  scalar(iconRow, "ImageWidth") !== 180 ||
  scalar(iconRow, "ImageHeight") !== 180
) {
  fail("Apple touch icon dimensions drift");
}
assertExactXmp(
  iconRow,
  {
    "XMP-dc:Creator": "Saeed Ghezelbash",
    "XMP-dc:Description": "Official Apple touch icon of Dr. Saeed Ghezelbash.",
    "XMP-dc:Rights":
      "© Saeed Ghezelbash. Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).",
    "XMP-dc:Title": "Dr. Saeed Ghezelbash — Apple touch icon",
    "XMP-xmpRights:Marked": true,
    "XMP-xmpRights:UsageTerms":
      "CC BY 4.0; attribution required: Saeed Ghezelbash.",
    "XMP-xmpRights:WebStatement": `${release.canonicalUrl}#media-license`,
  },
  appleTouchIcon,
);

const favicon = await readFile(path.join(publicRoot, "favicon.svg"), "utf8");
const elementNames = [...favicon.matchAll(/<([A-Za-z][\w:-]*)\b/g)].map(
  (match) => match[1],
);
if (
  JSON.stringify(elementNames) !== JSON.stringify(["svg", "title", "path"]) ||
  !/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 512 512">/.test(
    favicon,
  ) ||
  !/<title>[^<]+<\/title>/.test(favicon) ||
  !/<path fill="#[0-9A-Fa-f]{6}" d="[^"]+"\/>/.test(favicon)
) {
  fail("Root favicon structure drift");
}

console.log(
  JSON.stringify(
    {
      valid: true,
      mediaFiles: allMedia.length,
      rasterImages: rasters.length,
      decodedImages,
      standardXmpCoverage: `${rasterRows.length}/${rasters.length}`,
      imageProfileCoverage: Object.fromEntries([...profileCoverage].sort()),
      stableMediaTargets: `${stableTargets.size}/${stableAliases.length}`,
      videoMetadataCoverage: `${videoRows.length}/${videos.length}`,
      canonicalVideoPairCoverage: `${videoGroups.size}/${canonicalVideos.length}`,
      webVttTrackCoverage: `${vttFiles.length}/6`,
      webVttCueCount: cueCount,
      customMediaNamespaces: 0,
      rootIconCoverage: "2/2",
      dimensionsLocked: true,
    },
    null,
    2,
  ),
);
