import { parseFragment, serialize } from 'parse5';

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

const isElement = (node, tagName) =>
  node?.nodeName === tagName && node?.tagName === tagName;

const createSection = (parentNode) => ({
  nodeName: 'section',
  tagName: 'section',
  attrs: [{ name: 'class', value: 'page-section' }],
  namespaceURI: HTML_NAMESPACE,
  childNodes: [],
  parentNode,
});

/**
 * Groups each top-level h2 and its following siblings into a native section.
 * The multilingual details blocks remain independent. Rendered text is not
 * added, removed, reordered, or rewritten.
 */
export const sectionizePageContent = (html) => {
  const fragment = parseFragment(html);
  const sectionizedChildren = [];
  let currentSection;

  for (const node of fragment.childNodes) {
    if (isElement(node, 'h2')) {
      currentSection = createSection(fragment);
      sectionizedChildren.push(currentSection);
    } else if (isElement(node, 'details')) {
      currentSection = undefined;
    }

    if (currentSection) {
      node.parentNode = currentSection;
      currentSection.childNodes.push(node);
    } else {
      node.parentNode = fragment;
      sectionizedChildren.push(node);
    }
  }

  fragment.childNodes = sectionizedChildren;
  return serialize(fragment);
};
