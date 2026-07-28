const removableStyles = new Set([
  'font-style:normal',
  'direction:rtl;text-align:right',
  'direction:rtl;text-align:right;cursor:pointer',
  'direction:ltr;text-align:left',
  'direction:ltr;text-align:left;cursor:pointer',
]);

function normalizeStyle(value) {
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/;+$/, '');
}

function visit(node) {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'element' && node.properties?.style) {
    const normalized = normalizeStyle(node.properties.style);
    if (removableStyles.has(normalized)) delete node.properties.style;
  }

  if (node.type === 'raw' && typeof node.value === 'string') {
    node.value = node.value.replace(/\sstyle=(['"])(.*?)\1/gi, (match, _quote, value) => {
      return removableStyles.has(normalizeStyle(value)) ? '' : match;
    });
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) visit(child);
  }
}

export default function normalizeInlineStyles() {
  return (tree) => visit(tree);
}
