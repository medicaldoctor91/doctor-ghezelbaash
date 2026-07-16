const visit = (node) => {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'heading' && typeof node.depth === 'number') {
    node.depth = Math.min(6, node.depth + 2);
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) visit(child);
  }
};

export const remarkDemoteHeadings = () => (tree) => {
  visit(tree);
};
