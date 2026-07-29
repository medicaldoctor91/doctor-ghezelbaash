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
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      sourcemap: false,
    },
  },
});
