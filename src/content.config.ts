import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { CATEGORIES } from './config/categories';

const categorySlugs = CATEGORIES.map((category) => category.slug) as [string, ...string[]];

/** Original shopping guides (src/content/guides/*.md). */
const guides = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string().min(10).max(110),
    description: z.string().min(80).max(170),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    relatedCategories: z.array(z.enum(categorySlugs)).default([]),
    /** Category-tree nodes (src/config/taxonomy.ts) whose pages link the guide; its live deals come from them. */
    relatedTopics: z.array(z.string()).default([]),
    /** City slug for city guides (e.g. "istanbul"): live deals and links stay in that city. */
    relatedCity: z.string().optional(),
    keyPoints: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

/** Legal and information pages (src/content/pages/*.md). */
const pages = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().min(80).max(170),
    updatedAt: z.coerce.date(),
    showControllerBox: z.boolean().default(false),
    legalReview: z.boolean().default(false),
  }),
});

/**
 * Editorial deals added by hand (src/content/deals/*.md). Only publish deals you have
 * verified on the merchant page; `lastCheckedAt` is shown to visitors.
 * Files starting with "_" are ignored (see _ornek.md for the template).
 */
const deals = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/deals' }),
  schema: z.object({
    title: z.string().min(5).max(200),
    merchant: z.string(),
    category: z.enum(categorySlugs),
    sourceUrl: z.url({ protocol: /^https$/ }),
    affiliateUrl: z.url({ protocol: /^https$/ }).optional(),
    imageUrl: z.url({ protocol: /^https$/ }).optional(),
    city: z.string().optional(),
    district: z.string().optional(),
    price: z.number().nonnegative().optional(),
    originalPrice: z.number().positive().optional(),
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().optional(),
    lastCheckedAt: z.coerce.date(),
    summary: z.string().optional(),
    conditions: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    status: z.enum(['published', 'draft']).default('draft'),
    /** Programme name when affiliateUrl is a tracked link (shown in the disclosure). */
    affiliateProgram: z.string().optional(),
  }),
});

/**
 * Editorial overlays for provider deals (src/content/deal-notes/<provider>--<externalId>.md):
 * add an original summary, feature a deal on the homepage, or hide it.
 */
const dealNotes = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/deal-notes' }),
  schema: z.object({
    dealId: z.string().regex(/^[a-z0-9-]+:.+$/),
    summary: z.string().min(40).optional(),
    featured: z.boolean().default(false),
    hidden: z.boolean().default(false),
  }),
});

export const collections = { guides, pages, deals, dealNotes };
