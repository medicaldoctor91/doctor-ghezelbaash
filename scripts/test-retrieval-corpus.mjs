import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import jsonld from "jsonld";
import { parseFragment } from "parse5";
import {
  evidenceAssessmentId,
  loadProjectionContext,
} from "./lib/projection-context.mjs";
import {
  buildRetrievalBlocks,
  compileRetrievalCorpus,
  renderRetrievalBlock,
} from "./lib/projections/retrieval-corpus.mjs";

const canonicalUrl = "https://www.ghezelbaash.ir/";
const options = { canonicalUrl, language: "fa" };
const normalize = (value) => value.replace(/\s+/gu, " ").trim();
const textContent = (node) =>
  node.nodeName === "#text"
    ? node.value
    : (node.childNodes ?? []).map(textContent).join("");
const textFromMarkdown = (value) =>
  normalize(
    value
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/<br\s*\/?\s*>/g, " ")
      .replaceAll("\\|", "|")
      .replaceAll("*", ""),
  );
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function temporaryCompilation(run, { html } = {}) {
  const context = await loadProjectionContext();
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "retrieval-contract-"),
  );
  const originalContent = context.generatedContent;
  context.projections = temporary;
  if (html) {
    context.generatedContent = temporary;
    await writeFile(
      path.join(temporary, "home.md"),
      `---\ntitle: "Retrieval contract fixture"\nlang: "fa"\n---\n${html}`,
    );
  }
  try {
    const result = await compileRetrievalCorpus(context, { answerRecords: [] });
    const [markdown, full, provenanceText] = await Promise.all([
      readFile(path.join(temporary, "index.md"), "utf8"),
      readFile(path.join(temporary, "llms-full.txt"), "utf8"),
      readFile(path.join(temporary, "provenance.jsonld"), "utf8"),
    ]);
    await run({
      context,
      result,
      originalContent,
      temporary,
      markdown,
      full,
      provenanceText,
      provenance: JSON.parse(provenanceText),
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

test("one structural renderer preserves table headings, definitions, address, deep headings, and canonical destinations", () => {
  const blocks = buildRetrievalBlocks(
    `<h2 id="fixture">Fixture</h2>
    <table><caption>Table title</caption><thead><tr><th>Option</th><th>Boundary</th></tr></thead><tbody><tr><th>A</th><td><a href="#detail">Details</a> &amp; B</td></tr></tbody></table>
    <dl><dt>Term one</dt><dt>Term two</dt><dd>Definition one</dd><dd>Definition two</dd></dl>
    <address><a href="tel:+988338264955">Telephone</a> <a href="../#contact">Contact</a></address>
    <h5 id="detail">Deep heading</h5><p><a href="/documents/a(b)">Document</a></p>`,
    options,
  );
  const text = blocks.map(renderRetrievalBlock).join("\n\n");
  assert.match(
    text,
    /Table title\n\n\| Option \| Boundary \|\n\| --- \| --- \|/,
  );
  assert.match(
    text,
    /\| A \| \[Details\]\(https:\/\/www\.ghezelbaash\.ir\/#detail\) & B \|/,
  );
  assert.match(
    text,
    /\*\*Term one\*\*\n\*\*Term two\*\*\nDefinition one\nDefinition two/,
  );
  assert.match(text, /\[Telephone\]\(tel:\+988338264955\)/);
  assert.match(text, /https:\/\/www\.ghezelbaash\.ir\/#contact/);
  assert.match(text, /##### Deep heading/);
  assert.match(text, /https:\/\/www\.ghezelbaash\.ir\/documents\/a%28b%29/);
  assert.doesNotMatch(text, /\]\(#/);
  assert.throws(
    () => buildRetrievalBlocks("<dl><dt>Unpaired</dt></dl>", options),
    /unpaired/,
  );
  assert.throws(
    () =>
      buildRetrievalBlocks(
        '<table><tr><th colspan="2">Merged</th></tr><tr><td>A</td><td>B</td></tr></table>',
        options,
      ),
    /spans/,
  );
  assert.throws(
    () =>
      buildRetrievalBlocks(
        '<p><a href="javascript:alert(1)">Unsafe</a></p>',
        options,
      ),
    /unsupported scheme/,
  );
});

test("actual canonical HTML structures survive both exports and independently verified passage hashes", async () => {
  await temporaryCompilation(
    async ({ context, result, originalContent, markdown, full, temporary }) => {
      const html = await readFile(
        path.join(originalContent, "home.md"),
        "utf8",
      );
      const root = parseFragment(html.slice(html.indexOf("\n---", 3) + 4));
      const targets = [];
      const ids = new Set();
      const counts = {};
      const walk = (node) => {
        const id = node.attrs?.find((item) => item.name === "id")?.value;
        if (id) ids.add(id);
        if (
          [
            "table",
            "caption",
            "th",
            "td",
            "dt",
            "dd",
            "address",
            "h5",
            "h6",
          ].includes(node.tagName)
        ) {
          counts[node.tagName] = (counts[node.tagName] ?? 0) + 1;
          if (node.tagName !== "table")
            targets.push({
              tag: node.tagName,
              text: normalize(textContent(node)),
            });
        }
        for (const child of node.childNodes ?? []) walk(child);
      };
      walk(root);
      assert.equal(counts.table, 6);
      assert.equal(counts.caption, 6);
      assert.equal(counts.th + counts.td, 109);
      assert.equal(counts.dt, 10);
      assert.equal(counts.dd, 10);
      assert.equal(counts.address, 1);
      for (const [name, text] of [
        ["index.md", markdown],
        ["llms-full.txt", full],
      ]) {
        const visible = textFromMarkdown(text);
        for (const target of targets)
          assert.ok(
            visible.includes(target.text),
            `${name} lost ${target.tag}: ${target.text.slice(0, 90)}`,
          );
        assert.doesNotMatch(text, /\]\(#/);
        const localLinks = [
          ...text.matchAll(/\]\((https:\/\/www\.ghezelbaash\.ir\/#([^)]*))\)/g),
        ];
        assert.ok(localLinks.length >= 284);
        for (const [, , id] of localLinks)
          assert.ok(
            ids.has(decodeURIComponent(id)),
            `Link target missing: ${id}`,
          );
      }
      const passages = [
        ...full.matchAll(/\[PASSAGE\]\n([\s\S]*?)\[\/PASSAGE\]/g),
      ];
      assert.equal(passages.length, result.passages);
      for (const [, record] of passages) {
        const text = record
          .slice(record.indexOf("\nTEXT:\n") + 7)
          .replace(/\n$/, "");
        const hash = record.match(/^SOURCE_HASH_SHA256: (\w+)$/m)?.[1];
        assert.equal(sha256(text), hash);
        assert.ok(text.length <= context.invariants.maxRagPassageChars);
      }
      // Recompiling the same source has to preserve both content and identity hashes.
      await compileRetrievalCorpus(context, { answerRecords: [] });
      assert.equal(
        await readFile(path.join(temporary, "index.md"), "utf8"),
        markdown,
      );
      assert.equal(
        await readFile(path.join(temporary, "llms-full.txt"), "utf8"),
        full,
      );
    },
  );
});

test("source identities remain distinct from first-party assessments in the RDF union and across base URLs", async () => {
  await temporaryCompilation(
    async ({ context, provenance, provenanceText }) => {
      const byId = new Map(
        provenance["@graph"].map((node) => [node["@id"], node]),
      );
      assert.equal(byId.size, provenance["@graph"].length);
      for (const evidence of context.evidenceRegistry.evidence) {
        const source = byId.get(evidence.id);
        const assessment = byId.get(
          evidenceAssessmentId(context.release, evidence.id),
        );
        assert.ok(source && assessment);
        assert.notEqual(source["@id"], assessment["@id"]);
        assert.equal(source.url, evidence.url);
        assert.equal(source.dateModified, undefined);
        assert.equal(source.identifier, undefined);
        assert.equal(source.additionalProperty, undefined);
        assert.equal(assessment.about["@id"], source["@id"]);
        assert.equal(assessment.isBasedOn["@id"], source["@id"]);
        assert.equal(
          assessment.creator["@id"],
          context.release.primaryEntity.id,
        );
        assert.equal(assessment.identifier.value, evidence.tier);
        const observed = assessment.additionalProperty.find(
          (item) => item.propertyID === "Evidence observation date",
        )?.value;
        assert.deepEqual(
          observed,
          evidence.verifiedAt
            ? {
                "@value": evidence.verifiedAt,
                "@type": "http://www.w3.org/2001/XMLSchema#date",
              }
            : undefined,
        );
        const canonical = context.byId.get(evidence.id);
        if (canonical) {
          assert.deepEqual(source.name, canonical.name);
          assert.deepEqual(source.about, canonical.about);
          for (const type of [canonical["@type"]].flat())
            assert.ok(source["@type"].includes(type));
        }
        if (evidence.role === "medical-reference")
          assert.equal(source.about, undefined);
      }
      assert.doesNotMatch(provenanceText, /EvidenceTier|hadPrimarySource/);
      const canonicalize = (base) =>
        jsonld.canonize(provenance, {
          algorithm: "URDNA2015",
          format: "application/n-quads",
          base,
        });
      assert.equal(
        await canonicalize(canonicalUrl),
        await canonicalize("https://example.org/mirror/provenance.jsonld"),
      );
    },
    { html: '<h2 id="fixture">Fixture</h2><p>One source-bound passage.</p>' },
  );
});
