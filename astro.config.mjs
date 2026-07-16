import { defineConfig } from 'astro/config';
import { remarkDemoteHeadings } from './src/utils/remarkDemoteHeadings.mjs';

export default defineConfig({
  output: 'static',
  site: 'https://www.ghezelbaash.ir',
  trailingSlash: 'always',
  markdown: {
    remarkPlugins: [remarkDemoteHeadings],
  },
  build: {
    format: 'directory',
  },
});
