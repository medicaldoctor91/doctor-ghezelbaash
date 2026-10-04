import { parse } from "parse5";

const attr = (node, name) =>
  node.attrs?.find((item) => item.name === name)?.value;
const classes = (node) =>
  new Set((attr(node, "class") || "").split(/\s+/).filter(Boolean));
function walk(node, visit, includeTemplateContent = true) {
  visit(node);
  for (const child of node.childNodes || []) walk(child, visit, includeTemplateContent);
  if (includeTemplateContent && node.content) walk(node.content, visit, includeTemplateContent);
}

const ariaIdReferences = [
  "aria-labelledby", "aria-describedby", "aria-controls", "aria-owns",
  "aria-activedescendant", "aria-details", "aria-errormessage",
];
// HTML accepts BCP 47 private-use and grandfathered tags that Intl.Locale does
// not accept. An empty lang is also meaningful: it declares unknown language.
const grandfatheredLanguages = new Set((
  "art-lojban cel-gaulish en-GB-oed i-ami i-bnn i-default i-enochian i-hak " +
  "i-klingon i-lux i-mingo i-navajo i-pwn i-tao i-tay i-tsu no-bok no-nyn " +
  "sgn-BE-FR sgn-BE-NL sgn-CH-DE zh-guoyu zh-hakka zh-min zh-min-nan zh-xiang"
).toLowerCase().split(" "));
function validLanguage(value) {
  if (value === "" || grandfatheredLanguages.has(value.toLowerCase()) ||
      /^x(?:-[a-z0-9]{1,8})+$/i.test(value)) return true;
  try { new Intl.Locale(value); return true; }
  catch { return false; }
}
export function inspectHtml(source, { wrapMain = false } = {}) {
  const html = wrapMain
    ? `<!doctype html><html><body><main id="main-content">${source}</main></body></html>`
    : source;
  const document = parse(html, { sourceCodeLocationInfo: true });
  const nodes = [];
  walk(document, (node) => nodes.push(node));
  const elements = nodes.filter((node) => node.tagName);
  const ids = elements.map((node) => attr(node, "id")).filter(Boolean);
  const languageErrors = [];
  for (const node of elements) {
    const name = attr(node, "id") || node.tagName;
    for (const key of ["lang", "xml:lang"]) {
      const value = attr(node, key);
      if (value !== undefined && !validLanguage(value))
        languageErrors.push(`${name} has invalid ${key}=${JSON.stringify(value)}`);
    }
    const direction = attr(node, "dir");
    if (direction !== undefined && !/^(?:ltr|rtl|auto)$/i.test(direction))
      languageErrors.push(`${name} has invalid dir=${JSON.stringify(direction)}`);
  }
  const referenceErrors = [];
  if (!wrapMain) {
    // Template contents are inert until inserted. Only the actual document can
    // supply accessible names and relationships for its rendered controls.
    const liveElements = [];
    walk(document, (node) => { if (node.tagName) liveElements.push(node); }, false);
    const liveIds = new Set(liveElements.map((node) => attr(node, "id")).filter(Boolean));
    for (const node of liveElements) {
      for (const key of ariaIdReferences) {
        const missing = (attr(node, key) || "").split(/\s+/).filter((id) => id && !liveIds.has(id));
        if (missing.length)
          referenceErrors.push(`${attr(node, "id") || node.tagName} ${key} targets absent IDs: ${missing.join(",")}`);
      }
    }
  }
  const fragments = elements
    .filter((node) => node.tagName === "a")
    .map((node) => attr(node, "href"))
    .filter((value) => value?.startsWith("#"))
    .map((value) => value.slice(1));
  const sections = elements.filter((node) => node.tagName === "section");
  const unclosedSections = sections.filter(
    (node) => !node.sourceCodeLocation?.endTag,
  );
  const contentSections = sections.filter((node) =>
    classes(node).has("content-section"),
  );
  const mains = elements.filter((node) => node.tagName === "main");
  const guideArticles = elements.filter(
    (node) => node.tagName === "article" && classes(node).has("medical-guide"),
  );
  const contentContainer = guideArticles[0] || mains[0];
  const misplacedContentSections = contentSections.filter(
    (node) => node.parentNode !== contentContainer,
  );
  const guideStructureErrors = [];
  if (!wrapMain) {
    if (mains.length !== 1)
      guideStructureErrors.push(
        `expected one main landmark, found ${mains.length}`,
      );
    if (guideArticles.length !== 1)
      guideStructureErrors.push(
        `expected one medical-guide article, found ${guideArticles.length}`,
      );
    if (guideArticles.length === 1 && guideArticles[0].parentNode !== mains[0])
      guideStructureErrors.push(
        "medical-guide article is not a direct main child",
      );
  }
  const headings = elements.filter((node) => /^h[1-6]$/.test(node.tagName));
  const videos = elements.filter((node) => node.tagName === "video");
  const videoErrors = [];
  const focusedView = elements.some((node) => node.tagName === "html" && attr(node, "data-route-view") === "focused");
  for (const video of videos) {
    const children = (video.childNodes || []).filter(
      (node) =>
        node.tagName ||
        (node.nodeName === "#text" && String(node.value || "").trim()),
    );
    let fallbackSeen = false;
    for (const child of children) {
      if (child.nodeName === "#text") {
        fallbackSeen = true;
        continue;
      }
      if (
        (child.tagName === "source" || child.tagName === "track") &&
        fallbackSeen
      )
        videoErrors.push(
          `${attr(video, "id") || "(video)"} has ${child.tagName} after fallback text`,
        );
    }
    const poster = attr(video, "poster");
    // Direct topic entries expose their existing poster; the full home retains
    // deferred loading. A focused poster must still match its authored resource.
    if (poster && (!focusedView || poster !== attr(video, "data-poster")))
      videoErrors.push(
        `${attr(video, "id") || "(video)"} eagerly declares poster`,
      );
    if (!attr(video, "data-poster"))
      videoErrors.push(
        `${attr(video, "id") || "(video)"} lacks deferred data-poster`,
      );
    if (attr(video, "preload") !== "none")
      videoErrors.push(
        `${attr(video, "id") || "(video)"} preload must be none`,
      );
  }
  return {
    document,
    elements,
    ids,
    languageErrors,
    referenceErrors,
    fragments,
    sections,
    contentSections,
    mains,
    guideArticles,
    contentContainer,
    guideStructureErrors,
    unclosedSections,
    misplacedContentSections,
    headings,
    videos,
    videoErrors,
  };
}

export function assertDocumentContract(
  source,
  { wrapMain = false, expectedContentSections } = {},
) {
  const result = inspectHtml(source, { wrapMain });
  const duplicateIds = [
    ...new Set(
      result.ids.filter((id, index) => result.ids.indexOf(id) !== index),
    ),
  ];
  if (duplicateIds.length)
    throw new Error(`Duplicate actual HTML IDs: ${duplicateIds.join(",")}`);
  const idSet = new Set(result.ids),
    missing = [
      ...new Set(result.fragments.filter((fragment) => !idSet.has(fragment))),
    ];
  if (missing.length)
    throw new Error(`Broken actual HTML fragments: ${missing.join(",")}`);
  if (result.referenceErrors.length)
    throw new Error(`Broken document ARIA references: ${result.referenceErrors.join("; ")}`);
  if (result.languageErrors.length)
    throw new Error(`Invalid document language/direction: ${result.languageErrors.join("; ")}`);
  if (result.unclosedSections.length)
    throw new Error(
      `Sections without explicit end tags: ${result.unclosedSections.map((node) => attr(node, "id") || "(section)").join(",")}`,
    );
  if (result.guideStructureErrors.length)
    throw new Error(
      `Canonical article structure failed: ${result.guideStructureErrors.join("; ")}`,
    );
  if (result.misplacedContentSections.length)
    throw new Error(
      `Content sections are not direct canonical content-container children: ${result.misplacedContentSections.map((node) => attr(node, "id") || "(section)").join(",")}`,
    );
  if (
    expectedContentSections !== undefined &&
    result.contentSections.length !== expectedContentSections
  )
    throw new Error(
      `Content section count drift: ${result.contentSections.length}/${expectedContentSections}`,
    );
  if (result.videoErrors.length)
    throw new Error(
      `Video markup contract failed: ${result.videoErrors.join("; ")}`,
    );
  return result;
}
