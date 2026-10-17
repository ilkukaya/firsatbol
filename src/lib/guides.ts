import { getCollection, type CollectionEntry } from 'astro:content';
import { TOPICS } from '../config/taxonomy';

/**
 * Guides that belong on a listing page: a guide matches a topic page when it names the topic or
 * one of its ancestors, and a city page when it is that city's guide (or a topic guide without a
 * city). City guides are listed first.
 */
export async function guidesFor(scope: { topic?: string | null; city?: string | null }): Promise<CollectionEntry<'guides'>[]> {
  const guides = await getCollection('guides', (entry) => !entry.data.draft);
  const topicLine = scope.topic ? [scope.topic, ...(TOPICS.get(scope.topic)?.path ?? [])] : [];
  return guides
    .filter((guide) => {
      const { relatedTopics, relatedCity } = guide.data;
      if (relatedCity && relatedCity !== scope.city) return false;
      if (topicLine.length) return relatedTopics.some((slug) => topicLine.includes(slug));
      return Boolean(scope.city) && relatedCity === scope.city;
    })
    .sort((a, b) => Number(Boolean(b.data.relatedCity)) - Number(Boolean(a.data.relatedCity)));
}
