import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  access,
  copyFile,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  imageMetadataFor,
  matchImageProfile,
} from "./lib/media-metadata-contract.mjs";

const root = process.cwd();
const mediaRoot = path.join(root, "public/media");
const exiftool =
  process.env.EXIFTOOL_PATH || path.join(root, "node_modules/.bin/exiftool");
const imagePattern = /\.(?:avif|webp|jpe?g|png)$/i;
const textPattern =
  /\.(?:astro|css|html|js|json|jsonld|md|mjs|ts|tsv|txt|vcf|webmanifest|xml|yaml|yml)$/i;
const fingerprintPattern = /\.([0-9a-f]{12})\.[^.]+$/;
const skippedDirectories = new Set([
  "node_modules",
  ".python-deps",
  ".generated",
  "dist",
  "release",
  ".astro",
  ".git",
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const projectRelative = (file) =>
  path.relative(root, file).replaceAll("\\", "/");
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const scalar = (row, key) =>
  row[key] ??
  Object.entries(row).find(([candidate]) => candidate.endsWith(`:${key}`))?.[1];
const values = (value) =>
  Array.isArray(value) ? value : value === undefined ? [] : [value];

const release = JSON.parse(
  await readFile(path.join(root, "src/data/release.json"), "utf8"),
);

if (
  !/^ChIJ[\w-]+$/.test(release.clinic.placeId) ||
  !release.primaryEntity.googleKnowledgeGraphId?.startsWith("/g/") ||
  !release.clinic.googleLocalKgmid?.startsWith("/g/")
) {
  throw new Error("Release media identity contract is incomplete");
}

await access(exiftool).catch(() => {
  throw new Error(
    `ExifTool executable not found: ${exiftool}. Run npm install or set EXIFTOOL_PATH.`,
  );
});

const runExiftool = (args, options = {}) => spawnSync(exiftool, args, options);

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    output.push(...(entry.isDirectory() ? await walk(absolute) : [absolute]));
  }
  return output;
}

const compilerMayRewrite = (file) => {
  const relative = projectRelative(file);
  return (
    relative.startsWith("src/") ||
    (relative.startsWith("public/") && !relative.startsWith("public/media/")) ||
    relative === "scripts/validate-critical-path.mjs"
  );
};

const inspectMetadata = (target) =>
  runExiftool(
    ["-j", "-G1", "-s", "-ImageWidth", "-ImageHeight", "-XMP:all", target],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );

const metadataMatches = (row, expected) => {
  const allowed = new Set(["XMP-x:XMPToolkit", ...Object.keys(expected)]);
  for (const key of Object.keys(row)) {
    if (key.startsWith("XMP-") && !allowed.has(key)) return false;
  }
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actual = row[key];
    if (Array.isArray(expectedValue)) {
      const actualValues = values(actual);
      if (JSON.stringify(actualValues) !== JSON.stringify(expectedValue)) {
        return false;
      }
    } else if (String(actual) !== String(expectedValue)) {
      return false;
    }
  }
  return true;
};

const assignment = (key, value) => {
  const encoded = Array.isArray(value)
    ? value.join("|")
    : value === true
      ? "True"
      : String(value);
  return `-${key}=${encoded}`;
};

const images = (await walk(mediaRoot))
  .filter((file) => imagePattern.test(file))
  .sort();
if (images.length !== 49) {
  throw new Error(`Expected exactly 49 raster images, found ${images.length}`);
}

const stagingRoot = await mkdtemp(path.join(tmpdir(), "ghezel-media-enrich-"));
const generated = [];
let rewrittenTextFiles = 0;

try {
  for (const [index, file] of images.entries()) {
    const basename = path.basename(file);
    const sourceBytes = await readFile(file);
    const fingerprint = basename.match(fingerprintPattern)?.[1];
    if (!fingerprint || sha256(sourceBytes).slice(0, 12) !== fingerprint) {
      throw new Error(`Input fingerprint mismatch: ${file}`);
    }

    const profile = matchImageProfile(basename);
    const expectedMetadata = imageMetadataFor(release, profile);
    const sourceProbe = runExiftool(
      ["-j", "-s", "-ImageWidth", "-ImageHeight", file],
      { encoding: "utf8" },
    );
    if (sourceProbe.status !== 0) {
      throw new Error(
        `ExifTool source probe failed for ${file}: ${sourceProbe.stderr}`,
      );
    }
    const sourceDimensions = JSON.parse(sourceProbe.stdout)[0];
    const staged = path.join(
      stagingRoot,
      `${String(index).padStart(2, "0")}-${basename}`,
    );
    await copyFile(file, staged);

    let verification = inspectMetadata(staged);
    let row =
      verification.status === 0 ? JSON.parse(verification.stdout)[0] : {};
    if (!metadataMatches(row, expectedMetadata)) {
      const write = runExiftool(
        [
          "-overwrite_original",
          "-P",
          "-charset",
          "filename=UTF8",
          "-sep",
          "|",
          "-XMP:all=",
          ...Object.entries(expectedMetadata).map(([key, value]) =>
            assignment(key, value),
          ),
          staged,
        ],
        { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
      );
      if (
        write.status !== 0 ||
        !/^[ \t]*1 image files (?:updated|unchanged)/m.test(write.stdout)
      ) {
        throw new Error(
          `ExifTool write failed for ${file}:\nSTDOUT:\n${write.stdout}\nSTDERR:\n${write.stderr}`,
        );
      }
      verification = inspectMetadata(staged);
      row = verification.status === 0 ? JSON.parse(verification.stdout)[0] : {};
    }

    if (verification.status !== 0 || !metadataMatches(row, expectedMetadata)) {
      throw new Error(
        `Embedded metadata contract mismatch after write: ${file}`,
      );
    }
    if (
      scalar(row, "ImageWidth") !== sourceDimensions.ImageWidth ||
      scalar(row, "ImageHeight") !== sourceDimensions.ImageHeight
    ) {
      throw new Error(`Image dimensions changed: ${file}`);
    }

    const nextFingerprint = sha256(await readFile(staged)).slice(0, 12);
    const extension = path.extname(basename);
    const nextBasename = basename.replace(
      fingerprintPattern,
      `.${nextFingerprint}${extension}`,
    );
    generated.push({
      staged,
      nextPath: path.join(path.dirname(file), nextBasename),
      oldBasename: basename,
      newBasename: nextBasename,
    });
  }

  const canonicalPaths = new Set(generated.map(({ nextPath }) => nextPath));
  if (canonicalPaths.size !== images.length) {
    throw new Error("Metadata output paths are not unique");
  }
  for (const { staged, nextPath } of generated)
    await copyFile(staged, nextPath);

  const changedNames = generated.filter(
    ({ oldBasename, newBasename }) => oldBasename !== newBasename,
  );
  const rewriteText = (original) => {
    let next = original;
    for (const { oldBasename, newBasename } of changedNames) {
      next = next.replaceAll(oldBasename, newBasename);
    }
    for (const { newBasename } of generated) {
      const extension = path.extname(newBasename);
      const logicalBasename = newBasename.replace(
        fingerprintPattern,
        extension,
      );
      const stem = logicalBasename.slice(0, -extension.length);
      next = next.replace(
        new RegExp(
          `${escapeRegExp(stem)}\\.[0-9a-f]{12}${escapeRegExp(extension)}`,
          "g",
        ),
        newBasename,
      );
    }
    return next;
  };

  const protectedMutations = [];
  const writableMutations = [];
  const textFiles = (await walk(root)).filter(
    (file) =>
      textPattern.test(file) && !file.startsWith(`${mediaRoot}${path.sep}`),
  );
  for (const file of textFiles) {
    const original = await readFile(file, "utf8");
    const next = rewriteText(original);
    if (next === original) continue;
    if (compilerMayRewrite(file)) writableMutations.push({ file, next });
    else protectedMutations.push(projectRelative(file));
  }
  if (protectedMutations.length > 0) {
    throw new Error(
      `Media compiler refuses to rewrite protected source surfaces:\n${protectedMutations.join("\n")}`,
    );
  }
  for (const { file, next } of writableMutations) {
    await writeFile(file, next);
    rewrittenTextFiles += 1;
  }

  const oldImages = (await walk(mediaRoot)).filter(
    (file) => imagePattern.test(file) && !canonicalPaths.has(file),
  );
  for (const file of oldImages) await unlink(file);

  const finalImages = (await walk(mediaRoot))
    .filter((file) => imagePattern.test(file))
    .sort();
  if (finalImages.length !== images.length) {
    throw new Error(`Post-enrichment image count drift: ${finalImages.length}`);
  }
  for (const file of finalImages) {
    const bytes = await readFile(file);
    const fingerprint = path.basename(file).match(fingerprintPattern)?.[1];
    if (
      !canonicalPaths.has(file) ||
      !fingerprint ||
      sha256(bytes).slice(0, 12) !== fingerprint
    ) {
      throw new Error(`Post-enrichment image inventory mismatch: ${file}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        images: finalImages.length,
        renamed: changedNames.length,
        textFilesUpdated: rewrittenTextFiles,
        dimensionsPreserved: true,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
