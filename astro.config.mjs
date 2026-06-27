import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.ghezelbaash.ir',

  output: 'static',
  trailingSlash: 'always',

  integrations: [
    sitemap({
      changefreq: 'weekly',
      priority: 0.8,
      lastmod: new Date(),
    }),
  ],

  build: {
    inlineStylesheets: 'auto',
    assets: '_astro',
    compressHTML: true,
  },

  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
  },
});