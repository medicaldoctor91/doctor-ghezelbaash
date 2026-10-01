import { parseFragment } from "parse5";
import { deriveRouteDiscovery } from "./route-discovery.mjs";
import { navigationRoots } from "./topic-navigation.mjs";

const attr = (node, name) => node.attrs?.find((entry) => entry.name === name)?.value;
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

/** Keep the home reader complete while exposing every branch through native links. */
export function addHomeTopicNavigation(content, graph, metadata, canonicalUrl) {
  const source = String(content);
  const document = parseFragment(source, { sourceCodeLocationInfo: true });
  let toc;
  const visit = (node) => {
    if (attr(node, "data-topic-directory") !== undefined) throw new Error("Home topic directory already exists");
    if (node.tagName === "nav" && attr(node, "id") === "aesthetic-medicine-table-of-contents") toc = node;
    for (const child of node.childNodes || []) visit(child);
  };
  visit(document);
  if (!toc?.sourceCodeLocation?.endTag) throw new Error("Home topic directory requires its authored table of contents");
  const copy = metadata.guideNavigation;
  if (!copy?.homeSummary || !copy.homeAriaLabel) throw new Error("Home topic directory requires authored labels");
  const skeleton = '<!doctype html><html><body><main id="main-content"><article class="medical-guide">' +
    source + '</article></main></body></html>';
  const roots = navigationRoots(deriveRouteDiscovery(skeleton, graph, metadata, canonicalUrl));
  const directory = '<details data-topic-directory><summary>' + escape(copy.homeSummary) +
    '</summary><nav aria-label="' + escape(copy.homeAriaLabel) + '"><ul>' +
    roots.map((link) => '<li><a href="' + escape(link.path) + '" lang="' + escape(link.lang) +
      '" dir="' + (link.lang.startsWith("en") ? "ltr" : "rtl") + '">' + escape(link.title) + '</a></li>').join("") +
    '</ul></nav></details>';
  const offset = toc.sourceCodeLocation.endTag.startOffset;
  return source.slice(0, offset) + directory + source.slice(offset);
}
