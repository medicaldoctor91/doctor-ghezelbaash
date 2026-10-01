import path from "node:path";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";

const dist = path.resolve("dist");
const files = [];
const visit = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(absolute);
    else if (entry.isFile()) {
      const bytes = await readFile(absolute);
      files.push({ path: path.relative(dist, absolute).split(path.sep).join("/"),
        bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    } else throw new Error("Distribution contains a non-regular entry: " + absolute);
  }
};
await visit(dist);
files.sort((a, b) => a.path.localeCompare(b.path, "en"));
const build = JSON.parse(await readFile(path.join(dist, "build-info.json"), "utf8"));
await writeFile(".generated/dist-manifest.json", JSON.stringify({ build, files }, null, 2) + "\n");
console.log(JSON.stringify({ distManifest: "PASS", files: files.length, build }));
