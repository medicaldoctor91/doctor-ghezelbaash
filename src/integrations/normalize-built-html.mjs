import { readFile, writeFile } from 'node:fs/promises';

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

function normalizeHtml(html) {
  return html.replace(/\sstyle=(['"])(.*?)\1/gi, (match, _quote, value) => {
    return removableStyles.has(normalizeStyle(value)) ? '' : match;
  });
}

export default function normalizeBuiltHtml() {
  return {
    name: 'normalize-built-html',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        let changed = 0;
        for (const pathname of ['index.html', '404.html']) {
          const url = new URL(pathname, dir);
          try {
            const input = await readFile(url, 'utf8');
            const output = normalizeHtml(input);
            if (/\sstyle=(['"])/i.test(output)) {
              throw new Error(`an unapproved inline style remains in ${pathname}`);
            }
            if (output !== input) {
              await writeFile(url, output, 'utf8');
              changed += 1;
            }
          } catch (error) {
            if (error?.code === 'ENOENT') continue;
            throw error;
          }
        }
        logger.info(`Normalized inline presentation attributes in ${changed} generated page(s).`);
      },
    },
  };
}
