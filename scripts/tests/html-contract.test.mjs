import test from "node:test";
import assert from "node:assert/strict";
import { assertDocumentContract, inspectHtml } from "../lib/html-contract.mjs";

const document = (content) => '<!doctype html><html lang="fa-IR" dir="rtl"><body>' +
  '<main id="main-content"><article class="medical-guide">' + content +
  '</article></main></body></html>';

test("whole documents preserve accessible relationships across article boundaries", () => {
  const html = document('<h1 id="title">عنوان</h1><section aria-labelledby="title" ' +
    'aria-describedby="footer-note"><p>محتوا</p></section><button aria-controls="panel">نمایش</button>')
    .replace('</body>', '<footer id="footer-note">تماس</footer><div id="panel"></div></body>');
  assertDocumentContract(html);
});

test("scope extraction cannot leave dangling accessible names or control references", () => {
  for (const key of ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns",
    "aria-activedescendant", "aria-details", "aria-errormessage"])
    assert.throws(() => assertDocumentContract(document('<p id="present">متن</p>' +
      '<div id="control" ' + key + '="present absent"></div>')),
    /Broken document ARIA references: control .* absent/);
});

test("fragment inspection allows accessible references supplied by its containing document", () => {
  const fragment = '<section aria-labelledby="external-title" lang="ar-IQ" dir="rtl">' +
    '<p>محتوى</p></section>';
  assertDocumentContract(fragment, { wrapMain: true });
  assert.deepEqual(inspectHtml(fragment, { wrapMain: true }).referenceErrors, []);
});

test("inert template nodes neither satisfy document references nor require live targets", () => {
  assertDocumentContract(document('<template><p aria-describedby="inserted-later">متن</p></template>'));
  assert.throws(() => assertDocumentContract(document('<button aria-controls="inert-panel">نمایش</button>' +
    '<template><div id="inert-panel"></div></template>')), /ARIA references.*inert-panel/);
});

test("authored language boundaries accept BCP 47, unknown language and direction isolation", () => {
  for (const lang of ["fa-IR", "ar-IQ", "ckb-IQ", "en", "und", "", "x-clinic", "i-klingon"])
    assertDocumentContract(document('<span lang="' + lang + '" dir="auto">نام</span>'));
  assertDocumentContract(document('<span lang="en-US" dir="LTR">Name</span>'));
});

test("invalid authored language and direction are rejected in full documents and fragments", () => {
  for (const attributes of ['lang="fa_IR"', 'lang="fa IR"', 'dir="right"', 'dir=""']) {
    const content = '<p ' + attributes + '>متن</p>';
    assert.throws(() => assertDocumentContract(document(content)), /Invalid document language\/direction/);
    assert.throws(() => assertDocumentContract(content, { wrapMain: true }), /Invalid document language\/direction/);
  }
});
