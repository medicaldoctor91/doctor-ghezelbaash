import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.ghezelbaash.ir',
  trailingSlash: 'always',
  integrations: [sitemap()],
});
