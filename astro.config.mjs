import { defineConfig } from 'astro/config';
import normalizeInlineStyles from './src/plugins/normalize-inline-styles.mjs';

export default defineConfig({
  site: 'https://www.ghezelbaash.ir',
  output: 'static',
  trailingSlash: 'always',
  compressHTML: true,
  markdown: {
    rehypePlugins: [normalizeInlineStyles],
  },
  build: {
    format: 'directory',
    inlineStylesheets: 'always',
  },
  vite: {
    build: {
      sourcemap: false,
    },
  },
});
