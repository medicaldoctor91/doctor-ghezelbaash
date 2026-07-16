import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import { remarkDemoteHeadings } from './src/utils/remarkDemoteHeadings.mjs';

export default defineConfig({
  output: 'static',
  site: 'https://www.ghezelbaash.ir',
  trailingSlash: 'always',
  markdown: {
    processor: unified({ remarkPlugins: [remarkDemoteHeadings] }),
  },
  build: {
    format: 'directory',
  },
});
