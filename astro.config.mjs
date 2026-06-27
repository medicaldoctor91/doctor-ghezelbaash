import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.ghezelbaash.ir',

  output: 'static',
  trailingSlash: 'always',

  build: {
    inlineStylesheets: 'always',
    assets: '_astro',
    compressHTML: true,
    format: 'directory',
  },

  vite: {
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('graph-ghezelbaash-final.json')) {
              return 'data-graph';
            }
            if (id.includes('services.json')) {
              return 'data-services';
            }
          },
        },
      },
    },
    json: {
      stringify: true,
    },
    esbuild: {
      legalComments: 'none',
    },
  },

  compressHTML: true,
});
