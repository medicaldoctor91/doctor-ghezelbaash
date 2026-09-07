import { createHash } from "node:crypto";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { assembleCanonicalContent } from "./assemble-content.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const collectFiles = async (root, directory, predicate) => {
  const absolute = path.join(root, directory);
  const out = [];
  const walk = async (current) => {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile() && predicate(target)) out.push(target);
    }
  };
  await walk(absolute);
  return out;
};

const hashNamedBuffers = (entries) => {
  const hash = createHash("sha256");
  for (const [name, contents] of entries) {
    hash.update(Buffer.from(name));
    hash.update(Buffer.from([0]));
    hash.update(contents);
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
};

export async function computeRenderCalibrationFingerprint({ root = process.cwd() } = {}) {
  const graph = JSON.parse(
    await readFile(path.join(root, "src/data/semantic/knowledge-graph.jsonld"), "utf8"),
  );
  const assembled = await assembleCanonicalContent({ root, graph });

  // Calibration belongs only to the canonical homepage. Hash every shared
  // component/layout currently capable of contributing to that page, plus the
  // homepage route itself, but deliberately exclude unrelated routes such as 404.
  // A future component import changes an already-hashed parent file; once added
  // under src/components it is automatically included on subsequent fingerprints.
  const astroPaths = [
    ...(await collectFiles(root, "src/components", (file) => file.endsWith(".astro"))),
    ...(await collectFiles(root, "src/layouts", (file) => file.endsWith(".astro"))),
    path.join(root, "src/pages/index.astro"),
  ].sort();
  const cssPaths = (await collectFiles(root, "src/styles", (file) => file.endsWith(".css"))).sort();
  const fontPaths = (await collectFiles(root, "public/fonts", () => true)).sort();

  const relative = (file) => path.relative(root, file).split(path.sep).join("/");
  const domEntries = [["@assembled/canonical-content", Buffer.from(assembled.content)]];
  for (const file of astroPaths) domEntries.push([relative(file), await readFile(file)]);
  const cssEntries = [];
  for (const file of cssPaths) cssEntries.push([relative(file), await readFile(file)]);
  const fontEntries = [];
  for (const file of fontPaths) fontEntries.push([relative(file), await readFile(file)]);

  const domSha256 = hashNamedBuffers(domEntries);
  const cssSha256 = hashNamedBuffers(cssEntries);
  const fontsSha256 = hashNamedBuffers(fontEntries);
  const combinedSha256 = sha256(
    Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        domSha256,
        cssSha256,
        fontsSha256,
      }),
    ),
  );

  return {
    schemaVersion: 1,
    domSha256,
    cssSha256,
    fontsSha256,
    combinedSha256,
    domInputs: domEntries.map(([name]) => name),
    cssInputs: cssEntries.map(([name]) => name),
    fontInputs: fontEntries.map(([name]) => name),
  };
}
