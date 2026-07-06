import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.ghezelbaash.ir',
  output: 'static',
  integrations: [sitemap()],
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
});
