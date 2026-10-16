import { TOPICS } from '../../config/taxonomy';
import { slugify } from '../slug';
import type { Deal } from './schema';

/**
 * Final category-tree memberships of a deal: the partner's `tagIds[]` memberships (set by the
 * adapter), plus nodes whose name equals one of the deal's own tags, plus every ancestor —
 * in tree order. Unknown slugs are dropped.
 */
export function resolveTopics(deal: Pick<Deal, 'topics' | 'tags'>): string[] {
  const found = new Set<string>();
  for (const slug of deal.topics) if (TOPICS.has(slug)) found.add(slug);
  for (const tag of deal.tags) {
    const slug = slugify(tag, 60);
    if (TOPICS.has(slug)) found.add(slug);
  }
  for (const slug of [...found]) for (const ancestor of TOPICS.get(slug)!.path) found.add(ancestor);
  return [...TOPICS.keys()].filter((slug) => found.has(slug));
}
