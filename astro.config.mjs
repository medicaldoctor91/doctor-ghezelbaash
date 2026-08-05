import { defineConfig } from 'astro/config';
import assertBuiltHtml from './src/integrations/assert-built-html.mjs';
import buildProvenance from './src/integrations/build-provenance.mjs';

export default defineConfig({
  site: 'https://www.ghezelbaash.ir',
  output: 'static',
  trailingSlash: 'always',
  compressHTML: true,
  integrations: [assertBuiltHtml(), buildProvenance()],
  build: {
    format: 'directory',
    // Keep component CSS external under the strict static-site CSP.
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      sourcemap: false,
    },
  },
});
