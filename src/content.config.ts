import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const jsonLdNode = z
  .object({
    '@type': z.union([z.string(), z.array(z.string())]),
    '@id': z.string().optional(),
  })
  .catchall(z.unknown());

type JsonLdNode = z.infer<typeof jsonLdNode>;

const getJsonLdTypes = (node: JsonLdNode): string[] => {
  const type = node['@type'];
  return Array.isArray(type) ? type : [type];
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasField = (node: JsonLdNode, field: string) => {
  const value = node[field];
  return value !== undefined && value !== null && value !== '';
};

const hasAnyField = (node: JsonLdNode, fields: string[]) => fields.some((field) => hasField(node, field));

const isNonEmptyArrayField = (node: JsonLdNode, field: string) => {
  const value = node[field];
  return Array.isArray(value) && value.length > 0;
};

const addMissingFieldIssue = (ctx: z.RefinementCtx, typeName: string, field: string) => {
  ctx.addIssue({
    code: 'custom',
    message: `${typeName} JSON-LD node must include ${field}.`,
    path: [field],
  });
};

const requireFields = (node: JsonLdNode, ctx: z.RefinementCtx, typeName: string, fields: string[]) => {
  fields.forEach((field) => {
    if (!hasField(node, field)) addMissingFieldIssue(ctx, typeName, field);
  });
};

const richResultPageNode = jsonLdNode.superRefine((node, ctx) => {
  const types = getJsonLdTypes(node);
  const hasType = (typeName: string) => types.includes(typeName);

  if (hasType('VideoObject')) {
    requireFields(node, ctx, 'VideoObject', ['name', 'description', 'thumbnailUrl', 'uploadDate', 'duration']);
    if (!hasAnyField(node, ['contentUrl', 'embedUrl'])) {
      ctx.addIssue({
        code: 'custom',
        message: 'VideoObject JSON-LD node must include contentUrl or embedUrl.',
        path: ['contentUrl'],
      });
    }
  }

  if (hasType('BreadcrumbList') && !isNonEmptyArrayField(node, 'itemListElement')) {
    addMissingFieldIssue(ctx, 'BreadcrumbList', 'itemListElement');
  }

  if (hasType('FAQPage') && !isNonEmptyArrayField(node, 'mainEntity')) {
    addMissingFieldIssue(ctx, 'FAQPage', 'mainEntity');
  }

  if (hasType('Question')) {
    requireFields(node, ctx, 'Question', ['name', 'acceptedAnswer']);
    if (isObject(node.acceptedAnswer) && !hasField(node.acceptedAnswer as JsonLdNode, 'text')) {
      ctx.addIssue({
        code: 'custom',
        message: 'Question acceptedAnswer must include text.',
        path: ['acceptedAnswer', 'text'],
      });
    }
  }

  if (hasType('WebPage') || hasType('MedicalWebPage') || hasType('ProfilePage') || hasType('CollectionPage')) {
    requireFields(node, ctx, 'WebPage-family', ['url', 'name', 'description', 'isPartOf']);
  }

  if (hasType('Person') || hasType('Physician') || hasType('IndividualPhysician')) {
    requireFields(node, ctx, 'Person/Physician', ['name', 'url']);
  }

  if (hasType('LocalBusiness') || hasType('MedicalClinic') || hasType('MedicalOrganization')) {
    requireFields(node, ctx, 'LocalBusiness/MedicalClinic', ['name', 'url', 'telephone', 'address']);
  }

  if (hasType('Service') || hasType('MedicalProcedure')) {
    requireFields(node, ctx, 'Service/MedicalProcedure', ['name', 'url']);
  }

  if (hasType('ImageObject')) {
    requireFields(node, ctx, 'ImageObject', ['url']);
  }

  if (hasType('ItemList') && !isNonEmptyArrayField(node, 'itemListElement')) {
    addMissingFieldIssue(ctx, 'ItemList', 'itemListElement');
  }

  if (hasType('Dataset')) {
    requireFields(node, ctx, 'Dataset', ['name']);
  }

  if (hasType('DataCatalog')) {
    requireFields(node, ctx, 'DataCatalog', ['name', 'url']);
  }
});

const graphDocument = z
  .object({
    '@context': z.union([z.literal('https://schema.org'), z.record(z.string(), z.unknown())]).optional(),
    '@graph': z.array(jsonLdNode).min(1),
    dateModified: z.string().optional(),
    version: z.string().optional(),
  })
  .catchall(z.unknown());

const videoSegmentSchema = z
  .object({
    name: z.string(),
    startOffset: z.number().nonnegative(),
    endOffset: z.number().positive(),
    description: z.string(),
    url: z.url(),
  })
  .superRefine((segment, ctx) => {
    if (segment.endOffset <= segment.startOffset) {
      ctx.addIssue({
        code: 'custom',
        message: 'Video segment endOffset must be greater than startOffset.',
        path: ['endOffset'],
      });
    }
  });

const videoManifestLikeDocument = z
  .object({
    videos: z
      .array(
        z
          .object({
            id: z.string(),
            pagePath: z.string(),
            title: z.string(),
            shortTitle: z.string(),
            description: z.string(),
            keywords: z.array(z.string()).default([]),
            durationSeconds: z.number().positive(),
            duration: z.string(),
            contentUrl: z.url(),
            thumbnailUrl: z.url(),
            pageUrl: z.url(),
            watchPagePath: z.string().optional(),
            watchPageUrl: z.url().optional(),
            transcript: z.string().optional(),
            segments: z.array(videoSegmentSchema).default([]),
          })
          .catchall(z.unknown())
          .superRefine((video, ctx) => {
            video.segments.forEach((segment, index) => {
              if (segment.endOffset > video.durationSeconds) {
                ctx.addIssue({
                  code: 'custom',
                  message: `Video segment endOffset (${segment.endOffset}) cannot exceed durationSeconds (${video.durationSeconds}).`,
                  path: ['segments', index, 'endOffset'],
                });
              }

              if (segment.startOffset >= video.durationSeconds) {
                ctx.addIssue({
                  code: 'custom',
                  message: `Video segment startOffset (${segment.startOffset}) must be lower than durationSeconds (${video.durationSeconds}).`,
                  path: ['segments', index, 'startOffset'],
                });
              }
            });
          })
      )
      .min(1),
  })
  .catchall(z.unknown())
  .superRefine((manifest, ctx) => {
    const ids = new Set<string>();
    const watchPaths = new Set<string>();

    manifest.videos.forEach((video, index) => {
      if (ids.has(video.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate video id: ${video.id}`,
          path: ['videos', index, 'id'],
        });
      }
      ids.add(video.id);

      if (video.watchPagePath) {
        if (watchPaths.has(video.watchPagePath)) {
          ctx.addIssue({
            code: 'custom',
            message: `Duplicate video watchPagePath: ${video.watchPagePath}`,
            path: ['videos', index, 'watchPagePath'],
          });
        }
        watchPaths.add(video.watchPagePath);
      }
    });
  });

const aeoDataDocument = z.record(z.string(), z.unknown()).superRefine((data, ctx) => {
  if (Array.isArray(data.videos)) {
    const parsedManifest = videoManifestLikeDocument.safeParse(data);
    if (!parsedManifest.success) {
      parsedManifest.error.issues.forEach((issue) =>
        ctx.addIssue({
          code: 'custom',
          message: issue.message,
          path: issue.path,
        })
      );
    }
  }

  if (Array.isArray(data.records) && typeof data.recordCount === 'number' && data.recordCount !== data.records.length) {
    ctx.addIssue({
      code: 'custom',
      message: `Search index recordCount (${data.recordCount}) must match records.length (${data.records.length}).`,
      path: ['recordCount'],
    });
  }
});

const pages = defineCollection({
  loader: glob({ base: './src/content/pages', pattern: '**/*.{md,mdx}' }),
  schema: z
    .object({
      path: z.string(),
      title: z.string(),
      canonical: z.url(),
      description: z.string(),
      ogImagePath: z.string(),
    })
    .superRefine((page, ctx) => {
      const canonicalPath = new URL(page.canonical).pathname;
      const normalizedCanonicalPath = canonicalPath.endsWith('/') ? canonicalPath : `${canonicalPath}/`;
      const normalizedPagePath = page.path.endsWith('/') ? page.path : `${page.path}/`;

      if (normalizedCanonicalPath !== normalizedPagePath) {
        ctx.addIssue({
          code: 'custom',
          message: `Page canonical pathname (${normalizedCanonicalPath}) must match page.path (${normalizedPagePath}).`,
          path: ['canonical'],
        });
      }
    }),
});

const graphSources = defineCollection({
  loader: glob({ base: './src/content/graph-sources', pattern: '**/*.json' }),
  schema: graphDocument,
});

const pageStructuredData = defineCollection({
  loader: glob({ base: './src/content/page-structured-data', pattern: '**/*.json' }),
  schema: graphDocument.extend({
    path: z.string(),
  }),
});

const pageSchemaDocument = z
  .object({
    '@context': z.union([z.literal('https://schema.org'), z.record(z.string(), z.unknown())]).optional(),
    '@graph': z.array(richResultPageNode).min(1),
    dateModified: z.string().optional(),
    version: z.string().optional(),
  })
  .catchall(z.unknown());

const pageSchema = defineCollection({
  loader: glob({ base: './src/content/page-schema', pattern: '**/*.json' }),
  schema: pageSchemaDocument.extend({
    path: z.string(),
    derivedFrom: z.string(),
    profile: z.literal('page-scoped-json-ld-embed'),
  }),
});

const pageGovernance = defineCollection({
  loader: glob({ base: './src/content/page-governance', pattern: '**/*.json' }),
  schema: z.object({
    pageId: z.string(),
    path: z.string(),
    title: z.string(),
    canonicalEntity: z.string(),
    category: z.string(),
    definition: z.string(),
    decisionFrame: z.string(),
    adjacentEntities: z.array(z.object({ label: z.string(), href: z.string() })),
    evidence: z.array(
      z.object({
        topic: z.string(),
        name: z.string(),
        href: z.string(),
        evidenceType: z.string(),
      })
    ),
    reviewedAt: z.string(),
    reviewedAtPersian: z.string(),
    reviewedBy: z.string(),
    reviewerCredential: z.string(),
    reviewScope: z.array(z.string()),
  }),
});

const aeoData = defineCollection({
  loader: glob({ base: './src/content/aeo-data', pattern: '**/*.json' }),
  schema: aeoDataDocument,
});

const llmsDocs = defineCollection({
  loader: glob({ base: './src/content/llms', pattern: '**/*.json' }),
  schema: z.object({
    body: z.string(),
    contentType: z.string().default('text/plain; charset=utf-8'),
  }),
});

const siteData = defineCollection({
  loader: glob({ base: './src/content/site', pattern: '**/*.json' }),
  schema: z.object({
    doctorName: z.string(),
    clinicName: z.string(),
    phone: z.string(),
    phoneDisplay: z.string(),
    instagram: z.url(),
    googleMap: z.url(),
    googlePlaceId: z.string(),
    address: z.string(),
    openingHours: z.string(),
  }),
});

const pageMedia = defineCollection({
  loader: glob({ base: './src/content/page-media', pattern: '**/*.json' }),
  schema: z.object({
    path: z.string(),
    title: z.string(),
    heroImageKey: z.string(),
    heroAlt: z.string(),
    supportImageKey: z.string(),
    supportAlt: z.string(),
    galleryImageKey: z.string(),
    galleryAlt: z.string(),
    imageCaption: z.string(),
    supportCaption: z.string(),
    galleryCaption: z.string(),
    ogImagePath: z.string(),
    videoLabel: z.string().optional(),
  }),
});

const contentAction = z.object({
  variant: z.enum(['primary', 'secondary', 'tertiary', 'link']).optional(),
  text: z.string(),
  href: z.string().optional(),
  hrefSource: z.enum(['phone', 'phoneDisplay', 'instagram', 'googleMap', 'openingHours', 'address']).optional(),
  target: z.string().optional(),
});

const contentLink = z.object({
  text: z.string().optional(),
  textSource: z.enum(['phone', 'phoneDisplay', 'instagram', 'googleMap', 'openingHours', 'address']).optional(),
  href: z.string().optional(),
  hrefSource: z.enum(['phone', 'phoneDisplay', 'instagram', 'googleMap', 'openingHours', 'address']).optional(),
  target: z.string().optional(),
});

const pageUi = defineCollection({
  loader: glob({ base: './src/content/page-ui', pattern: '**/*.json' }),
  schema: z.object({
    path: z.string(),
    contentEntry: z.string(),
    layout: z.enum(['home', 'standard', 'service']),
    showBreadcrumbs: z.boolean().default(true),
    showRating: z.boolean().default(false),
    showFaq: z.boolean().default(false),
    showTrust: z.boolean().default(false),
    showIntentHub: z.boolean().default(false),
    breadcrumbs: z.array(z.object({ name: z.string(), href: z.string().optional() })).optional(),
    hero: z.object({
      tagline: z.string(),
      title: z.string(),
      subtitle: z.string(),
      actions: z.array(contentAction),
    }),
    mediaBlock: z.object({ title: z.string(), subtitle: z.string() }).optional(),
    intentHub: z
      .object({
        title: z.string(),
        description: z.string(),
        links: z.array(z.object({ title: z.string(), href: z.string(), description: z.string() })),
      })
      .optional(),
    pageTrustTitle: z.string().optional(),
    contactBox: z.object({ title: z.string(), subtitle: z.string() }),
    cta: z.object({ title: z.string(), subtitle: z.string(), actions: z.array(contentAction) }).optional(),
  }),
});

const navigationData = defineCollection({
  loader: glob({ base: './src/content/navigation', pattern: '**/*.json' }),
  schema: z.object({
    headerData: z.object({
      links: z.array(
        z.object({
          text: z.string(),
          href: z.string().optional(),
          links: z.array(z.object({ text: z.string(), href: z.string() })).optional(),
        })
      ),
      actions: z.array(contentAction),
    }),
    footerData: z.object({
      links: z.array(z.object({ title: z.string(), links: z.array(contentLink) })),
      secondaryLinks: z.array(contentLink),
      socialLinks: z.array(
        z.object({
          ariaLabel: z.string(),
          icon: z.string(),
          href: z.string().optional(),
          hrefSource: z.enum(['instagram', 'googleMap']).optional(),
        })
      ),
      footNote: z.string(),
    }),
  }),
});

const searchData = defineCollection({
  loader: glob({ base: './src/content/search', pattern: '**/*.json' }),
  schema: z.object({
    metadata: z.object({
      title: z.string(),
      canonical: z.url(),
      description: z.string(),
      robots: z.string().optional(),
    }),
    breadcrumbs: z.array(z.object({ name: z.string(), href: z.string().optional() })),
    quickQueries: z.array(z.string()),
    copy: z.object({
      eyebrow: z.string(),
      title: z.string(),
      description: z.string(),
      inputLabel: z.string(),
      placeholder: z.string(),
      button: z.string(),
      quickQueriesLabel: z.string(),
      resultsTitle: z.string(),
      initialStatus: z.string(),
      sourceLabel: z.string(),
      noscript: z.string(),
      loadingStatus: z.string(),
      emptyStatus: z.string(),
      typeLabels: z.record(z.string(), z.string()),
    }),
  }),
});

const siteSettings = defineCollection({
  loader: glob({ base: './src/content/site-settings', pattern: '**/*.json' }),
  schema: z.object({
    name: z.string(),
    site: z.url(),
    base: z.string(),
    trailingSlash: z.boolean(),
    language: z.string(),
    textDirection: z.enum(['ltr', 'rtl']),
    googleSiteVerificationId: z.string(),
    metadata: z.object({
      title: z.object({ default: z.string(), template: z.string() }),
      description: z.string(),
      openGraph: z.object({
        siteName: z.string(),
        images: z.array(z.object({ url: z.string(), width: z.number(), height: z.number() })),
        type: z.string(),
      }),
      twitter: z.object({ cardType: z.string() }),
    }),
    ui: z.object({ theme: z.string() }),
    analytics: z.object({ vendors: z.record(z.string(), z.unknown()) }),
  }),
});

const siteManifest = defineCollection({
  loader: glob({ base: './src/content/site-manifest', pattern: '**/*.json' }),
  schema: z.record(z.string(), z.unknown()),
});

const videoUi = defineCollection({
  loader: glob({ base: './src/content/video-ui', pattern: '**/*.json' }),
  schema: z.object({
    siteUrl: z.url(),
    pageLabels: z.record(z.string(), z.string()),
    watchTitleSuffix: z.string(),
    segmentLabelPrefix: z.string(),
    relatedReasons: z.object({
      samePage: z.string(),
      keywordOverlap: z.string(),
      sharedCrossLink: z.string(),
      fallback: z.string(),
    }),
    videosIndex: z.object({
      metadata: z.object({
        title: z.string(),
        canonical: z.url(),
        description: z.string(),
        robots: z.string().optional(),
      }),
      breadcrumbs: z.array(z.object({ name: z.string(), href: z.string().optional() })),
    }),
  }),
});

const uiCopy = defineCollection({
  loader: glob({ base: './src/content/ui-copy', pattern: '**/*.json' }),
  schema: z.record(z.string(), z.unknown()),
});

export const collections = {
  pages,
  graphSources,
  pageStructuredData,
  pageSchema,
  pageGovernance,
  aeoData,
  llmsDocs,
  siteData,
  pageMedia,
  pageUi,
  navigationData,
  searchData,
  siteSettings,
  siteManifest,
  videoUi,
  uiCopy,
};
