import { defineConfig } from 'astro/config';
import normalizeBuiltHtml from './src/integrations/normalize-built-html.mjs';

export default defineConfig({
  site: 'https://www.ghezelbaash.ir',
  output: 'static',
  trailingSlash: 'always',
  compressHTML: true,
  integrations: [normalizeBuiltHtml()],
  build: {
    format: 'directory',
    // Fingerprinted CSS is constrained by validate_source.py and cached immutably.
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      sourcemap: false,
    },
  },
});
