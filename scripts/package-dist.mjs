import path from "node:path";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createDeterministicZip, walkFiles } from "./lib/deterministic-zip.mjs";
import { releaseArtifactName } from "./lib/release-artifacts.mjs";

const root = process.cwd();
const release = JSON.parse(
  await readFile(path.join(root, "src/data/release.json"), "utf8"),
);
const releaseDir = path.join(root, "release");
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const entries = await walkFiles(path.join(root, "dist"));
if (!entries.length) throw new Error("DIST inventory is empty");
const archive = createDeterministicZip(entries),
  output = path.join(releaseDir, releaseArtifactName(release));
await mkdir(releaseDir, { recursive: true });
await writeFile(output, archive);
console.log(
  JSON.stringify(
    {
      output,
      files: entries.length,
      uncompressedBytes: entries.reduce(
        (sum, file) => sum + file.data.length,
        0,
      ),
      archiveBytes: archive.length,
      sha256: sha256(archive),
    },
    null,
    2,
  ),
);
