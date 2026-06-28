import { defineCollection, z } from 'astro:content';

const servicePages = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    slug: z.string(),
    canonicalPath: z.string(),
    serviceKey: z.string(),
    intentFamilies: z.array(z.string()).default([]),
    schemaTargets: z.array(z.string()).default(['WebPage', 'BreadcrumbList', 'Service', 'FAQPage']),
    draft: z.boolean().default(false),
  }),
});

const personPages = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    canonicalPath: z.string(),
    personName: z.string(),
    schemaTargets: z.array(z.string()).default(['ProfilePage', 'Person', 'BreadcrumbList']),
    draft: z.boolean().default(false),
  }),
});

export const collections = {
  servicePages,
  personPages,
};
