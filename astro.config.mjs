import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.ghezelbaash.ir',
  output: 'static',
  trailingSlash: 'always',
  compressHTML: true,
  integrations: [sitemap()],
  build: {
    assets: '_astro',
    format: 'directory',
    inlineStylesheets: 'always'
  },
  vite: {
    build: {
      target: 'es2022',
      cssCodeSplit: true,
      minify: 'esbuild'
    },
    json: {
      stringify: true
    },
    esbuild: {
      legalComments: 'none'
    }
  }
});
