import { inspectHtml } from "./html-contract.mjs";

const attr = (node, name) => node.attrs?.find((entry) => entry.name === name)?.value;
const heading = (node) => /^h[1-6]$/.test(node?.tagName || "");
const level = (node) => Number(node.tagName.slice(1));
const scopeTags = new Set(["section", "header", "article", "details"]);
const start = (node) => node.sourceCodeLocation?.startOffset ?? -1;
const classes = (node) => String(attr(node, "class") || "").split(/\s+/);
const escape = (value) => String(value).replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const direction = (lang) => /^en(?:-|$)/i.test(lang || "") ? "ltr" : "rtl";
const linkFor = (record) => ({ path: record.path, title: record.title, lang: record.lang,
  ...(record.description ? { description: record.description } : {}) });
const closestScope = (node) => {
  for (let parent = node.parentNode; parent; parent = parent.parentNode)
    if (scopeTags.has(parent.tagName)) return parent;
  return undefined;
};

/**
 * Navigation expresses only authored DOM containment, heading hierarchy and
 * explicit aria-labelledby relationships. It does not infer medical similarity.
 * Every entry keeps its route and entity; no alternate destination is invented.
 */
export function attachTopicNavigation(records, homeHtml, canonicalUrl) {
  const canonical = new URL(canonicalUrl);
  if (canonical.hash || canonical.search || canonical.pathname !== "/")
    throw new Error("Topic navigation requires the comprehensive homepage URL");
  const inspected = inspectHtml(homeHtml);
  const byPath = new Map();
  const byTargetId = new Map();
  const byHtmlId = new Map(inspected.elements.filter((node) => attr(node, "id"))
    .map((node) => [attr(node, "id"), node]));
  const targets = new Map();
  const recordForNode = (node) => byTargetId.get(attr(node, "id"));
  for (const record of records) {
    if (!/^\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(record.path) ||
        byPath.has(record.path) || !record.title || !record.lang)
      throw new Error("Invalid or duplicate topic navigation record: " + record.path);
    const id = record.htmlId || record.path.slice(1);
    const target = byHtmlId.get(id);
    if (!target?.sourceCodeLocation)
      throw new Error("Topic navigation lacks its authored target: " + record.path);
    byPath.set(record.path, record);
    byTargetId.set(id, record);
    targets.set(record.path, target);
  }
  const scopeHeadings = new Map();
  const headingParents = new Map();
  for (const node of inspected.headings.filter((node) => node.sourceCodeLocation)) {
    const scope = closestScope(node);
    if (!scopeHeadings.has(scope)) scopeHeadings.set(scope, []);
    scopeHeadings.get(scope).push(node);
  }
  for (const nodes of scopeHeadings.values()) {
    nodes.sort((left, right) => start(left) - start(right));
    const stack = [];
    for (const node of nodes) {
      while (stack.length && level(stack.at(-1)) >= level(node)) stack.pop();
      const parent = [...stack].reverse().find((candidate) => recordForNode(candidate));
      if (parent) headingParents.set(node, recordForNode(parent).path);
      stack.push(node);
    }
  }
  // A language section can be labelled by an H2 inside its surrounding summary.
  // Resolve that explicit connection instead of borrowing the preceding language.
  const scopeAnchor = (scope, excludePath) => {
    for (let current = scope; current; current = closestScope(current)) {
      const own = recordForNode(current);
      if (own && own.path !== excludePath) return own.path;
      for (const id of String(attr(current, "aria-labelledby") || "").split(/\s+/)) {
        const label = byTargetId.get(id);
        if (label && label.path !== excludePath) return label.path;
      }
    }
    return undefined;
  };
  const parentPaths = new Map();
  const equivalentPaths = new Map();
  for (const record of records) {
    const target = targets.get(record.path), scope = closestScope(target);
    let parent;
    if (heading(target)) {
      parent = headingParents.get(target) || scopeAnchor(scope, record.path);
      const container = recordForNode(scope);
      if (container && String(attr(scope, "aria-labelledby") || "").split(/\s+/).includes(record.htmlId || record.path.slice(1)) &&
          parent === container.path && container.title === record.title)
        equivalentPaths.set(record.path, container.path);
    } else {
      // A player belongs to its authored containing figure when both have routes.
      for (let ancestor = target.parentNode; ancestor && ancestor !== scope; ancestor = ancestor.parentNode) {
        const container = recordForNode(ancestor);
        if (container) { parent = container.path; break; }
      }
      const headings = scopeHeadings.get(scope) || [];
      if (!parent && classes(target).includes("semantic-alias-anchor")) {
        const following = headings.find((node) => start(node) > start(target) && recordForNode(node));
        if (following) parent = recordForNode(following).path;
      }
      if (!parent) {
        const firstOwnHeading = scopeTags.has(target.tagName)
          ? (scopeHeadings.get(target) || [])[0] : undefined;
        const preceding = headings.filter((node) => start(node) < start(target) &&
          (!firstOwnHeading || level(node) < level(firstOwnHeading))).at(-1);
        if (preceding && recordForNode(preceding)) parent = recordForNode(preceding).path;
      }
      parent ||= scopeAnchor(scope, record.path);
    }
    if (parent === record.path || (parent && !byPath.has(parent)))
      throw new Error("Topic navigation has an invalid parent: " + record.path);
    parentPaths.set(record.path, parent);
  }
  const children = new Map(records.map((record) => [record.path, []]));
  for (const [path, parent] of parentPaths) if (parent) children.get(parent).push(byPath.get(path));
  for (const list of children.values())
    list.sort((left, right) => start(targets.get(left.path)) - start(targets.get(right.path)) || left.path.localeCompare(right.path));
  return records.map((record) => {
    const seen = new Set([record.path]), ancestors = [];
    let parent = parentPaths.get(record.path);
    while (parent) {
      if (seen.has(parent)) throw new Error("Topic navigation cycle at " + record.path);
      seen.add(parent);
      ancestors.unshift(linkFor(byPath.get(parent)));
      parent = parentPaths.get(parent);
    }
    const directParent = parentPaths.get(record.path);
    return { ...record, navigation: {
      ...(directParent ? { parent: linkFor(byPath.get(directParent)) } : {}),
      children: children.get(record.path).map(linkFor),
      ancestors,
      sourceOrder: start(targets.get(record.path)),
      ...(equivalentPaths.has(record.path) ? { equivalentTo: equivalentPaths.get(record.path) } : {}),
    } };
  });
}

export function navigationRoots(records) {
  if (records.some((record) => !record.navigation))
    throw new Error("Topic roots require attached navigation");
  return records.filter((record) => !record.navigation.parent)
    .sort((left, right) => left.navigation.sourceOrder - right.navigation.sourceOrder).map(linkFor);
}

const copies = {
  fa: ["پیمایش موضوع‌های راهنما", "موضوع مادر", "موضوع‌های این بخش"],
  en: ["Guide topic navigation", "Parent topic", "Topics in this section"],
  ar: ["التنقل بين مواضيع الدليل", "الموضوع الرئيسي", "مواضيع هذا القسم"],
  ckb: ["گەڕان لە بابەتەکانی ڕێبەر", "بابەتی سەرەکی", "بابەتەکانی ئەم بەشە"],
};
const renderLink = (link) => {
  if (!/^\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(link.path) || !link.title || !link.lang)
    throw new Error("Invalid native topic link");
  return '<a href="' + escape(link.path) + '" lang="' + escape(link.lang) +
    '" dir="' + direction(link.lang) + '">' + escape(link.title) + "</a>";
};

/** Compact visible navigation; links remain available before JavaScript runs. */
export function renderTopicNavigation(record) {
  const navigation = record.navigation;
  if (!navigation) throw new Error("Topic HTML requires attached navigation");
  if (!navigation.parent && !navigation.children.length) return "";
  const copy = copies[record.lang?.split("-")[0]] || copies.fa;
  const parent = navigation.parent
    ? '<p>' + copy[1] + ": " + renderLink(navigation.parent) + "</p>" : "";
  const children = navigation.children.length
    ? "<details><summary>" + copy[2] + '</summary><ul>' +
      navigation.children.map((link) => "<li>" + renderLink(link) +
        (link.description ? '<p lang="' + escape(link.lang) + '" dir="' + direction(link.lang) + '">' +
          escape(link.description) + '</p>' : "") + "</li>").join("") + "</ul></details>"
    : "";
  return '<nav data-topic-navigation aria-label="' + escape(copy[0]) + '">' + parent + children + "</nav>";
}

/** Collapse only explicitly equivalent container/heading entries in breadcrumbs. */
export function deriveTopicBreadcrumbItems(record, records, { canonicalUrl, homeTitle }) {
  if (!record.navigation || !homeTitle) throw new Error("Topic breadcrumbs require navigation and a homepage title");
  const byPath = new Map(records.map((entry) => [entry.path, entry]));
  const lineage = [...record.navigation.ancestors, linkFor(record)];
  const reduced = [];
  for (let index = 0; index < lineage.length; index++) {
    const entry = lineage[index];
    const equivalent = byPath.get(entry.path)?.navigation?.equivalentTo;
    if (equivalent && reduced.at(-1)?.path === equivalent) {
      if (index < lineage.length - 1) continue;
      reduced.pop(); // The current route remains the final breadcrumb item.
    }
    reduced.push(entry);
  }
  return [{ "@type": "ListItem", position: 1, name: homeTitle, item: canonicalUrl },
    ...reduced.map((entry, index) => ({ "@type": "ListItem", position: index + 2,
      name: entry.title, item: new URL(entry.path, canonicalUrl).href }))];
}
