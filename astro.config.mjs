import { unified } from '@astrojs/markdown-remark';
import { defineConfig } from 'astro/config';
import {
  rehypeExternalLinks,
  rehypeHeadingAnchors,
  rehypeAccessibleTables,
} from './src/lib/markdown-plugins.mjs';

export default defineConfig({
  site: 'https://www.ghezelbaash.ir/',
  output: 'static',
  markdown: {
    processor: unified({
      gfm: true,
      smartypants: false,
      rehypePlugins: [rehypeExternalLinks, rehypeHeadingAnchors, rehypeAccessibleTables],
    }),
  },
});
