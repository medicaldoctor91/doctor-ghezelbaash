import { parse, parseFragment, serialize } from "parse5";

const attr = (node, name) => node.attrs?.find((entry) => entry.name === name)?.value;
const hasClass = (node, name) => (attr(node, "class") || "").split(/\s+/).includes(name);
const setAttr = (node, name, value) => {
  node.attrs ||= [];
  const current = node.attrs.find((entry) => entry.name === name);
  if (current) current.value = value;
  else node.attrs.push({ name, value });
};
const removeAttr = (node, name) => {
  if (node.attrs) node.attrs = node.attrs.filter((entry) => entry.name !== name);
};
const visit = (node, fn) => {
  fn(node);
  for (const child of [...(node.childNodes || [])]) visit(child, fn);
  if (node.content) visit(node.content, fn);
};
const removeNode = (node) => {
  const parent = node?.parentNode;
  if (!parent?.childNodes) return false;
  parent.childNodes = parent.childNodes.filter((entry) => entry !== node);
  node.parentNode = undefined;
  return true;
};
const unwrapNode = (node) => {
  const parent = node?.parentNode;
  if (!parent?.childNodes) return false;
  const index = parent.childNodes.indexOf(node);
  if (index < 0) return false;
  const children = [...(node.childNodes || [])];
  for (const child of children) child.parentNode = parent;
  parent.childNodes.splice(index, 1, ...children);
  node.childNodes = [];
  node.parentNode = undefined;
  return true;
};
const firstElement = (root, predicate) => {
  let found;
  visit(root, (node) => { if (!found && predicate(node)) found = node; });
  return found;
};
const allElements = (root, predicate) => {
  const found = [];
  visit(root, (node) => { if (predicate(node)) found.push(node); });
  return found;
};
const fragmentNodes = (html) => parseFragment(html).childNodes;
const insertBefore = (parent, reference, nodes) => {
  const index = parent.childNodes.indexOf(reference);
  if (index < 0) throw new Error("Reference node is not attached");
  for (const node of nodes) node.parentNode = parent;
  parent.childNodes.splice(index, 0, ...nodes);
};

const GOVERNANCE_HTML = `<details class="editorial-governance" id="privacy-and-terms"><summary>حریم خصوصی و شرایط استفاده</summary><p>امتیاز کلینیک یک مشاهدهٔ زمان‌دار از Google Maps است که هر شش ساعت بررسی می‌شود. متن نظرها و اطلاعات شخصی کاربران دریافت یا ذخیره نمی‌شود و منبع داده با پیوند مستقیم مشخص است. استفاده از این داده تابع <a href="https://www.google.com/help/terms_maps/" rel="external noopener">شرایط Google Maps</a> و <a href="https://policies.google.com/privacy" rel="external noopener">خط‌مشی حریم خصوصی Google</a> است.</p></details>`;

export function restoreVisiblePresentation(html, { mapsUrl } = {}) {
  const document = parse(String(html));
  const removable = [];
  visit(document, (node) => {
    if (attr(node, "id") === "physician-expertise-and-evidence" || attr(node, "data-topic-directory") !== undefined)
      removable.push(node);
  });
  for (const node of removable) removeNode(node);

  const htmlNode = firstElement(document, (node) => node.tagName === "html");
  const focused = attr(htmlNode, "data-route-view") === "focused";
  if (focused) {
    const routeContext = firstElement(document, (node) => node.tagName === "header" && attr(node, "id") === "route-context");
    if (routeContext) removeNode(routeContext);
    for (const wrapper of allElements(document, (node) => hasClass(node, "guide-reader"))) unwrapNode(wrapper);
    const article = firstElement(document, (node) => node.tagName === "article" && hasClass(node, "medical-guide"));
    if (article) {
      const heading = firstElement(article, (node) => /^h[1-6]$/.test(node.tagName || "") && attr(node, "id"));
      if (heading) setAttr(article, "aria-labelledby", attr(heading, "id"));
      else removeAttr(article, "aria-labelledby");
    }
  }

  const footer = firstElement(document, (node) => node.tagName === "footer" && hasClass(node, "site-footer"));
  if (footer) {
    removeAttr(footer, "lang");
    removeAttr(footer, "dir");
    const address = firstElement(footer, (node) => node.tagName === "address");
    if (address && mapsUrl && !firstElement(address, (node) => node.tagName === "a" && /Google Maps/i.test((node.childNodes || []).map((child) => child.value || "").join("")))) {
      const nodes = fragmentNodes(` — <a href="${String(mapsUrl).replaceAll("&", "&amp;").replaceAll('"', "&quot;")}" rel="external">Google Maps</a>`);
      for (const node of nodes) node.parentNode = address;
      address.childNodes.push(...nodes);
    }
    const dataset = firstElement(footer, (node) => hasClass(node, "footer-dataset-disclosure"));
    if (dataset) { removeAttr(dataset, "lang"); removeAttr(dataset, "dir"); }
    const machine = firstElement(footer, (node) => hasClass(node, "footer-machine-resources"));
    const governance = firstElement(footer, (node) => attr(node, "id") === "privacy-and-terms");
    if (machine && !governance) insertBefore(footer, machine, fragmentNodes(GOVERNANCE_HTML));
  }
  return serialize(document);
}

export function restoreVisibleCss(css) {
  return String(css).replace(/\.multilingual-collapsible-section\s*>\s*summary\s*>\s*h2\s*\{\s*margin-top\s*:\s*0\s*;?\s*\}/g, "");
}
