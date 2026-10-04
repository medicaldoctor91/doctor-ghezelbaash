import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { legacyPageBody, compareCanonicalContent } from "../compare-canonical-content.mjs";
import { parseFragment } from "parse5";

test("authored answer introductions do not repeat their adjacent paragraph", async () => {
  const source = await readFile(new URL("../../src/content-source/page.md", import.meta.url), "utf8");
  const text = (node) => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
  const normalized = (node) => text(node).replace(/\s+/gu, " ").trim();
  const attr = (node, name) => node.attrs?.find((entry) => entry.name === name)?.value;
  const repeats = [];
  const visit = (node) => {
    const children = node.childNodes || [];
    for (let index = 0; index < children.length; index++) {
      const current = children[index];
      if (current.tagName === "p" && attr(current, "class")?.split(/\s+/u).includes("answer-projection")) {
        let nextIndex = index + 1;
        while (children[nextIndex]?.nodeName === "#text" && !children[nextIndex].value.trim()) nextIndex++;
        const next = children[nextIndex];
        if (next?.tagName === "p") {
          const answer = normalized(current), following = normalized(next);
          if (Math.min(answer.length, following.length) >= 80 &&
              (answer.includes(following) || following.startsWith(answer))) repeats.push(attr(current, "id"));
        }
      }
      visit(current);
    }
  };
  visit(parseFragment(source));
  assert.deepEqual(repeats, [], "Repeated visible answer text must be resolved in the authored source");
});

test("the rejected expertise box remains only an anchor and the medical review stays in its existing figure disclosure", async () => {
  const source = await readFile(new URL("../../src/content-source/page.md", import.meta.url), "utf8");
  const attr = (node, name) => node.attrs?.find((entry) => entry.name === name)?.value;
  const descendants = (node) => [node, ...(node.childNodes || []).flatMap(descendants)];
  const text = (node) => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
  const nodes = descendants(parseFragment(source));
  const anchor = nodes.find((node) => attr(node, "id") === "physician-expertise-and-evidence");
  assert.equal(anchor?.tagName, "span");
  assert.equal(text(anchor), "");
  const review = nodes.find((node) => attr(node, "id") === "medical-review-note");
  assert.equal(review?.tagName, "p");
  assert.equal(review.parentNode.tagName, "details");
  assert(review.parentNode.childNodes.some((node) => node.tagName === "summary" &&
    text(node) === "دکتر سعید قزلباش در محیط بالینی"));
  assert(descendants(review).some((node) => node.tagName === "time" && attr(node, "datetime") === "2026-09-30"));
});

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
