import type { Feed, FeedItem, NormalizedItem } from './types.js';
import { FetchEngine } from './fetcher.js';
import { FormatDetector } from './detector.js';
import { Parser } from './parser.js';
import { Normalizer } from './normalizer.js';
import { randomUUID } from 'crypto';

export interface AggregatedFeed {
  title: string;
  description: string;
  link: string;
  items: FeedItem[];
  sources: { feedId: string; title: string; count: number }[];
  generatedAt: string;
}

export interface AggregatorOptions {
  sort?: 'date' | 'title';
  limit?: number;
  deduplicate?: boolean;
}

export class FeedAggregator {
  private parser: Parser;
  private normalizer: Normalizer;

  constructor() {
    this.parser = new Parser();
    this.normalizer = new Normalizer();
  }

  async fetchAndAggregate(urls: string[], options: AggregatorOptions = {}): Promise<AggregatedFeed> {
    const detector = new FormatDetector();
    const fetcher = new FetchEngine(detector, { retries: 1, timeout: 15000 });
    const allItems: FeedItem[] = [];
    const sources: { feedId: string; title: string; count: number }[] = [];

    const results = await Promise.allSettled(
      urls.map(url => fetcher.fetch({ url }))
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== 'fulfilled') continue;

      try {
        const feedData = this.parser.parse(result.value.raw, result.value.format, urls[i]);
        const normalized = this.normalizer.normalizeItems(feedData.items);
        const feedId = `agg-${i}`;

        for (const item of normalized) {
          allItems.push({
            id: randomUUID(),
            ...item,
            guid: item.link || item.title,
            hash: this.computeHash(item),
            feedId,
            createdAt: new Date().toISOString(),
          });
        }

        sources.push({
          feedId,
          title: feedData.feed.title || urls[i],
          count: feedData.items.length,
        });
      } catch {}
    }

    if (options.deduplicate !== false) {
      return this.deduplicateItems(allItems, sources, options);
    }

    return this.buildResult(allItems, sources, options);
  }

  aggregateFeeds(feeds: { feed: Feed; items: FeedItem[] }[], options: AggregatorOptions = {}): AggregatedFeed {
    const allItems: FeedItem[] = [];
    const sources: { feedId: string; title: string; count: number }[] = [];

    for (const { feed, items } of feeds) {
      allItems.push(...items);
      sources.push({
        feedId: feed.id,
        title: feed.title,
        count: items.length,
      });
    }

    if (options.deduplicate !== false) {
      return this.deduplicateItems(allItems, sources, options);
    }

    return this.buildResult(allItems, sources, options);
  }

  private deduplicateItems(items: FeedItem[], sources: { feedId: string; title: string; count: number }[], options: AggregatorOptions): AggregatedFeed {
    const seen = new Map<string, FeedItem>();

    for (const item of items) {
      const key = item.link || item.guid || item.title;
      if (!seen.has(key)) {
        seen.set(key, item);
      }
    }

    return this.buildResult(Array.from(seen.values()), sources, options);
  }

  private buildResult(items: FeedItem[], sources: { feedId: string; title: string; count: number }[], options: AggregatorOptions): AggregatedFeed {
    let sorted = [...items];

    if (options.sort === 'date' || !options.sort) {
      sorted.sort((a, b) => {
        const dateA = new Date(a.published || 0).getTime();
        const dateB = new Date(b.published || 0).getTime();
        return dateB - dateA;
      });
    } else if (options.sort === 'title') {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    }

    if (options.limit) {
      sorted = sorted.slice(0, options.limit);
    }

    return {
      title: `Aggregated Feed (${sources.length} sources)`,
      description: `Merged feed from ${sources.length} sources`,
      link: '',
      items: sorted,
      sources,
      generatedAt: new Date().toISOString(),
    };
  }

  private computeHash(item: NormalizedItem): string {
    const content = `${item.title}|${item.link}|${item.published}`;
    let hash = 0;
    const prime = 31;
    for (let i = 0; i < content.length; i++) {
      hash = (hash * prime + content.charCodeAt(i)) & 0x7fffffff;
    }
    return hash.toString(16).padStart(8, '0');
  }
}
