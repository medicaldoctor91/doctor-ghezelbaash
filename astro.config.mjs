import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.ghezelbaash.ir',

  output: 'static',
  trailingSlash: 'always',
  compressHTML: true,

  build: {
    assets: '_astro',
    format: 'directory',
    inlineStylesheets: 'always',
  },

  vite: {
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      minify: 'esbuild',
    },
    json: {
      stringify: true,
    },
    esbuild: {
      legalComments: 'none',
    },
  },
});
