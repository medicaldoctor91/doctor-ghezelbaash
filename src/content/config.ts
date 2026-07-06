import { defineCollection, z } from 'astro:content';

const services = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    summary: z.string(),
    intentTerms: z.array(z.string()),
  }),
});

export const collections = { services };
