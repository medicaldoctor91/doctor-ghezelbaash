import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { parse } from "parse5";

export const digest = (text) => createHash("sha256").update(text).digest("hex");
const asciiLower = (value) => value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

// Keep original HTML tokens: serializing a parsed DOM could repair broken HTML
// before Nu sees it. Only independently validated CSS value ranges are masked.
export function extractHtmlCss(html, label) {
  const units = [], ranges = [], links = [];
  const document = parse(html, { sourceCodeLocationInfo: true, scriptingEnabled: false,
    onParseError: (error) => { throw new Error(`${label}: HTML parse error ${error.code}`); } });
  const visit = (node) => {
    const attrs = Object.fromEntries((node.attrs || []).map((a) => [a.name, a.value]));
    if (node.tagName === "style") {
      const loc = node.sourceCodeLocation;
      assert(loc?.startTag && loc?.endTag, `${label}: unclosed style element`);
      assert(!attrs.type || asciiLower(attrs.type) === "text/css", `${label}: unsupported style type`);
      const start = loc.startTag.endOffset, end = loc.endTag.startOffset;
      units.push({ label: `${label}:style-${units.length + 1}`, css: html.slice(start, end) });
      ranges.push({ start, end, replacement: html.slice(start, end).replace(/[^\r\n]/g, " ") });
    }
    if (Object.hasOwn(attrs, "style")) {
      const loc = node.sourceCodeLocation?.attrs?.style;
      assert(loc, `${label}: missing style attribute location`);
      const raw = html.slice(loc.startOffset, loc.endOffset);
      const match = /^style\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))$/i.exec(raw);
      assert(match, `${label}: unsupported or incomplete style attribute`);
      const value = match[1] ?? match[2] ?? match[3];
      const quoted = match[3] === undefined;
      const end = loc.endOffset - (quoted ? 1 : 0), start = end - value.length;
      units.push({ label: `${label}:style-attribute-${units.length + 1}`, css: attrs.style, context: "declarationList" });
      // Semicolons form empty declarations and preserve an unquoted value token.
      ranges.push({ start, end, replacement: value.replace(/[^\r\n]/g, quoted ? " " : ";") });
    }
    const rel = asciiLower(attrs.rel || "").split(/[\t\n\f\r ]+/);
    if (node.tagName === "link" && (rel.includes("stylesheet") ||
      (rel.includes("preload") && asciiLower(attrs.as || "") === "style"))) {
      assert(attrs.href, `${label}: stylesheet reference has no href`);
      links.push(attrs.href);
    }
    for (const child of node.childNodes || []) visit(child);
    if (node.content) visit(node.content);
  };
  visit(document);
  ranges.sort((a, b) => a.start - b.start);
  let cursor = 0, projection = "";
  for (const { start, end, replacement } of ranges) {
    assert(start >= cursor && end >= start && end <= html.length, `${label}: overlapping CSS ranges`);
    assert.equal(replacement.length, end - start);
    projection += html.slice(cursor, start) + replacement;
    cursor = end;
  }
  projection += html.slice(cursor);
  assert.equal(projection.length, html.length);
  return { units, links: [...new Set(links)], ranges, projection };
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    assert(!entry.isSymbolicLink(), `Symlink is outside CSS validation inventory: ${entry.name}`);
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(file));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}

export async function collectCssInputs(root, distDirectory = "dist") {
  const sourceDirectory = await realpath(path.resolve(root, "src/styles"));
  const sourceFiles = (await filesUnder(sourceDirectory)).filter((p) => p.endsWith(".css"));
  assert(sourceFiles.length, "Source CSS inventory is empty");
  // Read shared assets once so every document is validated against the same bytes.
  const captured = new Map();
  const readSnapshot = async (file) => {
    if (!captured.has(file)) {
      const bytes = await readFile(file);
      captured.set(file, { file, sha256: digest(bytes), text: bytes.toString("utf8") });
    }
    return captured.get(file);
  };
  const source = await Promise.all(sourceFiles.map(async (file) => ({ label: path.relative(root, file), css: (await readSnapshot(file)).text })));
  const directory = await realpath(path.resolve(root, distDirectory));
  const distFiles = await filesUnder(directory), documents = [], referenced = new Set();
  for (const file of distFiles.filter((p) => p.endsWith(".html"))) {
    const snapshot = await readSnapshot(file), html = snapshot.text, label = path.relative(directory, file);
    const extracted = extractHtmlCss(html, label), units = [...extracted.units];
    for (const href of extracted.links) {
      const url = new URL(href, "https://www.ghezelbaash.ir/");
      assert.equal(url.origin, "https://www.ghezelbaash.ir", `${label}: external CSS needs explicit inventory coverage`);
      assert(!url.search && !url.hash, `${label}: CSS reference must identify exact local bytes`);
      const asset = await realpath(path.join(directory, decodeURIComponent(url.pathname)));
      assert(asset.startsWith(`${directory}${path.sep}`) && asset.endsWith(".css"), `${label}: CSS reference escapes inventory`);
      referenced.add(asset);
      units.push({ label: path.relative(directory, asset), css: (await readSnapshot(asset)).text });
    }
    assert(units.length, `${label}: no CSS covered`);
    documents.push({ file, label, html, sha256: snapshot.sha256, units, projection: extracted.projection });
  }
  assert(documents.some((d) => d.label === "index.html") && documents.some((d) => d.label === "404.html"), "Both canonical HTML and 404 must be covered");
  for (const file of distFiles.filter((p) => p.endsWith(".css")))
    assert(referenced.has(file), `Unreferenced CSS is outside document coverage: ${file}`);
  return {
    source,
    documents,
    snapshots: [...captured.values()].map(({ file, sha256 }) => ({ file, sha256 })),
    inventory: {
      sourceDirectory,
      distDirectory: directory,
      sourceFiles,
      distFiles: distFiles.filter((file) => file.endsWith(".html") || file.endsWith(".css")),
    },
  };
}

export async function assertCssInputsUnchanged({ snapshots, inventory }) {
  for (const { file, sha256 } of snapshots)
    assert.equal(digest(await readFile(file)), sha256, `CSS validation input changed during validation: ${file}`);
  const sourceFiles = (await filesUnder(inventory.sourceDirectory)).filter((file) => file.endsWith(".css"));
  const distFiles = (await filesUnder(inventory.distDirectory)).filter((file) => file.endsWith(".html") || file.endsWith(".css"));
  assert.deepEqual(sourceFiles, inventory.sourceFiles, "Source CSS inventory changed during validation");
  assert.deepEqual(distFiles, inventory.distFiles, "Dist HTML/CSS inventory changed during validation");
}
