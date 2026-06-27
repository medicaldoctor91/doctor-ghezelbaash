import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.ghezelbaash.ir',
  output: 'static',
  trailingSlash: 'always',
  integrations: [sitemap()]
});
