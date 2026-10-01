import assert from "node:assert/strict";
import test from "node:test";
import { createGuideSearch } from "../../src/lib/guide-search.mjs";

const record = (id, text, extra = {}) => ({ id, text, level: 2, parents: [], ...extra });
const ranks = (engine, index, value) => {
  const query = engine.queryInfo(value);
  return index.map((item) => ({ id: item.id, rank: engine.score(item, query) }))
    .filter((item) => item.rank < 99).sort((left, right) => left.rank - right.rank);
};

test("Persian normalization preserves words while folding marks, presentation forms and digits", () => {
  const { normalize } = createGuideSearch();
  assert.equal(normalize("كِیــفیت يِ پوست ۱۲۳ ١٢٣"), "کیفیت ی پوست 123 123");
  assert.equal(normalize("ﻛﻴﻔﻴﺖ"), "کیفیت");
  assert.equal(normalize("جوان‌سازی"), normalize("جوان سازی"));
  assert.equal(normalize("فیلر ۲"), normalize("فيلر 2"));
});
test("authored synonyms work in both directions and normalize Arabic letters", () => {
  const engine = createGuideSearch({ synonyms: { "ژل": "فيلر" } });
  const index = engine.build([record("gel", "ماندگاری ژل"), record("filler", "اصلاح فیلر")]);
  assert.deepEqual(new Set(ranks(engine, index, "ژل").map((item) => item.id)), new Set(["gel", "filler"]));
  assert.deepEqual(new Set(ranks(engine, index, "فیلر").map((item) => item.id)), new Set(["gel", "filler"]));
});
test("whole-word matches reject unrelated words and incomplete final tokens remain searchable", () => {
  const engine = createGuideSearch();
  const index = engine.build([
    record("gel", "ژل"), record("gelatin", "ژلاتین چیست"),
    record("filler", "اصلاح فیلر"), record("prefix-before-final", "فی شرایط"),
  ]);
  assert.deepEqual(ranks(engine, index, "ژل").map((item) => item.id), ["gel"]);
  assert.equal(ranks(engine, index, "اصلاح فیل")[0].id, "filler");
  assert.equal(engine.score(index[2], engine.queryInfo("فیل شرایط")), 99);
  assert.deepEqual(ranks(engine, engine.build([record("gelatin", "ژلاتین")]), "ژل"), []);
});
test("retrieval aliases do not suppress exact-title priority", () => {
  const engine = createGuideSearch();
  const index = engine.build([
    record("exact", "اصلاح فیلر", { retrievalAlias: "بررسی نتیجه نامطلوب" }),
    record("longer", "اصلاح فیلر تزریقی"),
    record("context", "بررسی نتیجه", { parents: ["اصلاح فیلر"] }),
  ]);
  assert.equal(ranks(engine, index, "اصلاح فیلر")[0].id, "exact");
});
test("entity aliases use word boundaries and preserve authored intent detection", () => {
  const calls = [];
  const engine = createGuideSearch({
    aliases: ["دکتر سعید قزلباش", "سعید"],
    detectIntent: (text, entity) => { calls.push([text, entity]); return entity && text.includes("فیلر") ? "filler" : null; },
  });
  assert.equal(engine.queryInfo("سعیدپور").entity, false);
  const query = engine.queryInfo("دکتر سعید قزلباش فیلر");
  assert.equal(query.entity, true);
  assert.equal(query.intent, "filler");
  assert.deepEqual(query.tokens, ["فیلر"]);
  assert.deepEqual(calls.at(-1), ["دکتر سعید قزلباش فیلر", true]);
  const index = engine.build([
    record("main", "دکتر سعید قزلباش", { level: 1 }), record("child", "فیلر"),
  ]);
  assert.deepEqual(ranks(engine, index, "دکتر سعید قزلباش").map((item) => item.id), ["main"]);
});
test("repeated query words do not multiply rank and rebuild resets corpus statistics", () => {
  const engine = createGuideSearch();
  let index = engine.build([record("filler", "فیلر"), record("gelatin", "ژلاتین")]);
  assert.deepEqual(engine.queryInfo("فیلر فیلر").tokens, ["فیلر"]);
  assert.equal(ranks(engine, index, "فیلر فیلر")[0].id, "filler");
  index = engine.build([record("new", "جوانسازی")]);
  assert.deepEqual(ranks(engine, index, "فیلر"), []);
});
