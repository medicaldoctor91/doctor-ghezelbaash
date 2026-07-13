import GithubSlugger from 'github-slugger';
import { stableAnchorFor } from '../domain/anchor-utils.ts';
import { site } from '../domain/entities.ts';
import { serviceAliasesForHeading } from '../domain/url-architecture.mjs';

function walk(node, callback) {
  callback(node);
  if (Array.isArray(node?.children)) {
    for (const child of node.children) walk(child, callback);
  }
}

function textContent(node) {
  if (node?.type === 'text') return node.value ?? '';
  if (node?.type === 'element' && node.tagName === 'a' && (node.properties?.className ?? []).includes('heading-anchor')) return '';
  return (node?.children ?? []).map(textContent).join('');
}

function isElement(node, tagName) {
  return node?.type === 'element' && node.tagName === tagName;
}

export function rehypeExternalLinks() {
  return (tree) => {
    walk(tree, (node) => {
      if (!isElement(node, 'a')) return;
      const href = String(node.properties?.href ?? '');
      if (!/^https?:\/\//iu.test(href)) return;
      node.properties ??= {};
      node.properties.target = '_blank';
      node.properties.rel = [
        ...(href.replace(/\/+$/u, '') === site.instagram.replace(/\/+$/u, '') ? ['me'] : []),
        'noopener',
        'noreferrer',
        'external',
      ];
      node.properties.referrerPolicy = 'strict-origin-when-cross-origin';
    });
  };
}

export function rehypeHeadingAnchors() {
  return (tree) => {
    const slugger = new GithubSlugger();
    walk(tree, (node) => {
      if (node?.type !== 'element' || !/^h[1-4]$/u.test(node.tagName)) return;
      const title = textContent(node).replace(/\s*¶$/u, '').trim();
      node.properties ??= {};
      const id = stableAnchorFor(title, String(node.properties.id ?? slugger.slug(title)));
      node.properties.id = id;
      node.properties.tabIndex = -1;

      const serviceAliases = serviceAliasesForHeading(id);
      if (serviceAliases.length) {
        node.children ??= [];
        node.children.unshift(...serviceAliases.map((entry) => ({
          type: 'element',
          tagName: 'span',
          properties: {
            id: entry.anchor,
            className: ['service-anchor-alias'],
            ariaHidden: 'true',
            dataServiceId: entry.id,
          },
          children: [],
        })));
      }

      if (node.tagName === 'h1') return;
      node.children ??= [];
      node.children.push({
        type: 'element',
        tagName: 'a',
        properties: {
          href: `#${id}`,
          className: ['heading-anchor'],
          ariaLabel: 'پیوند مستقیم به این بخش',
        },
        children: [{ type: 'text', value: '¶' }],
      });
    });
  };
}

export function rehypeAccessibleTables() {
  return (tree) => {
    function processChildren(children, inheritedHeading = '') {
      if (!Array.isArray(children)) return;
      let currentHeading = inheritedHeading;
      for (const node of children) {
        if (node?.type === 'element' && /^h[1-4]$/u.test(node.tagName)) {
          currentHeading = textContent(node).replace(/\s*¶$/u, '').trim() || currentHeading;
        }
        if (isElement(node, 'table')) {
          node.properties ??= {};
          node.properties.ariaLabel = currentHeading ? `جدول مرتبط با: ${currentHeading}` : 'جدول اطلاعات پزشکی';
          walk(node, (candidate) => {
            if (!isElement(candidate, 'th')) return;
            candidate.properties ??= {};
            candidate.properties.scope ??= 'col';
          });
          const tbody = (node.children ?? []).find((candidate) => isElement(candidate, 'tbody'));
          for (const row of tbody?.children ?? []) {
            if (!isElement(row, 'tr')) continue;
            const firstCell = (row.children ?? []).find((candidate) => isElement(candidate, 'td') || isElement(candidate, 'th'));
            if (firstCell) {
              firstCell.tagName = 'th';
              firstCell.properties ??= {};
              firstCell.properties.scope = 'row';
            }
          }
        }
        processChildren(node?.children, currentHeading);
      }
    }
    processChildren(tree?.children);
  };
}

