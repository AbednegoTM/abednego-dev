import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { TOPIC_SLUGS } from './lib/topics';

const base = z.object({
  title: z.string(),
  description: z.string(),
  date: z.coerce.date(),
  updated: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
});

const writing = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/writing' }),
  schema: base.extend({ topic: z.enum(TOPIC_SLUGS) }),
});

const notes = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/notes' }),
  schema: base,
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: ({ image }) =>
    base.extend({
      cover: image().optional(),
      coverAlt: z.string().optional(),
      stack: z.array(z.string()).default([]),
      links: z
        .object({ live: z.url().optional(), source: z.url().optional() })
        .default({}),
      featured: z.boolean().default(false),
    }),
});

const lab = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/lab' }),
  schema: base,
});

const bookmarks = defineCollection({
  loader: file('./src/content/bookmarks.yaml'),
  schema: z.object({
    title: z.string(),
    url: z.url(),
    kind: z.enum(['article', 'book', 'tool', 'music', 'video']),
    by: z.string().optional(),
    note: z.string().optional(),
    added: z.coerce.date(),
  }),
});

export const collections = { writing, notes, projects, lab, bookmarks };
