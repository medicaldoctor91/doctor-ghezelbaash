import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { legacyPageBody, compareCanonicalContent } from "../compare-canonical-content.mjs";

test("migration comparison retains Unicode boundary offsets and leading body whitespace", () => {
  for (const newline of ["\n", "\r\n"]) {
    const body = Buffer.from(newline + '  <header>متن دقیق</header>' + newline);
    const prefix = Buffer.from('---' + newline + 'title: عنوان فارسی' + newline + '---' + newline);
    assert.deepEqual(legacyPageBody(Buffer.concat([prefix, body])), body);
    assert.deepEqual(legacyPageBody(body), body);
  }
});

test("normalization proof detects hidden body, graph and guide changes independently", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "canonical-equivalence-"));
  try {
    const before = path.join(root, "before"), after = path.join(root, "after");
    for (const directory of [before, after]) {
      await mkdir(path.join(directory, "src/content-source"), { recursive: true });
      await mkdir(path.join(directory, "src/data/semantic"), { recursive: true });
    }
    await mkdir(path.join(before, "dist"));
    const body = '\n<header>Exact body.</header>\n', graph = '{"@graph":[]}\n', guide = '# Editorial guide\n';
    await writeFile(path.join(before, "src/content-source/page.md"), '---\ntitle: old policy\n---\n' + body);
    await writeFile(path.join(after, "src/content-source/page.md"), body);
    await writeFile(path.join(before, "src/data/semantic/knowledge-graph.jsonld"), graph);
    await writeFile(path.join(after, "src/data/semantic/knowledge-graph.jsonld"), graph);
    await writeFile(path.join(before, "dist/llms.txt"), guide);
    await writeFile(path.join(after, "src/content-source/llms-guide.md"), guide);
    assert.equal((await compareCanonicalContent(before, after)).identical, true);
    for (const [file, value] of [["src/content-source/page.md", body], ["src/data/semantic/knowledge-graph.jsonld", graph], ["src/content-source/llms-guide.md", guide]]) {
      await writeFile(path.join(after, file), value + ' ');
      const report = await compareCanonicalContent(before, after);
      assert.equal(report.identical, false);
      assert.deepEqual(report.inputs.filter((item) => !item.identical).map((item) => item.path), [file]);
      await writeFile(path.join(after, file), value);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
