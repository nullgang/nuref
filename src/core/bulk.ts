import type { Database } from '../database/database.js';
import type { Feed, FeedItem, FeedFormat } from './types.js';
import { FetchEngine } from './fetcher.js';
import { FormatDetector } from './detector.js';
import { Parser } from './parser.js';
import { Normalizer } from './normalizer.js';
import { Validator } from './validator.js';
import { DuplicateDetector } from './duplicate.js';
import { randomUUID } from 'crypto';

export interface BulkAddResult {
  url: string;
  success: boolean;
  feedId?: string;
  title?: string;
  itemCount?: number;
  error?: string;
}

export interface BulkSyncResult {
  feedId: string;
  title: string;
  added: number;
  error?: string;
}

export class BulkOperations {
  private db: Database;
  private fetcher: FetchEngine;
  private parser: Parser;
  private normalizer: Normalizer;
  private validator: Validator;

  constructor(db: Database) {
    this.db = db;
    this.fetcher = new FetchEngine(new FormatDetector());
    this.parser = new Parser();
    this.normalizer = new Normalizer();
    this.validator = new Validator();
  }

  async addFeeds(urls: string[], concurrency = 3): Promise<BulkAddResult[]> {
    const results: BulkAddResult[] = [];
    const chunks = this.chunk(urls, concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(chunk.map(url => this.addSingleFeed(url)));
      results.push(...chunkResults);
    }

    return results;
  }

  async syncAll(concurrency = 5): Promise<BulkSyncResult[]> {
    const feeds = await this.db.getAllFeeds();
    const results: BulkSyncResult[] = [];
    const chunks = this.chunk(feeds, concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(chunk.map(feed => this.syncSingleFeed(feed)));
      results.push(...chunkResults);
    }

    return results;
  }

  async deleteFeeds(ids: string[]): Promise<{ deleted: number; errors: string[] }> {
    let deleted = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        await this.db.deleteFeed(id);
        deleted++;
      } catch (error) {
        errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { deleted, errors };
  }

  async exportAll(format: 'rss' | 'atom' | 'json_feed' | 'sitemap'): Promise<Record<string, string>> {
    const { FeedGenerator } = await import('../generator/generator.js');
    const generator = new FeedGenerator();
    const feeds = await this.db.getAllFeeds();
    const exports: Record<string, string> = {};

    for (const feed of feeds) {
      const items = await this.db.getItemsByFeed(feed.id, 100);
      exports[feed.id] = generator.generate(feed, items, format);
    }

    return exports;
  }

  private async addSingleFeed(url: string): Promise<BulkAddResult> {
    try {
      const existing = await this.db.getFeedByUrl(url);
      if (existing) {
        return { url, success: false, error: 'Already exists' };
      }

      const result = await this.fetcher.fetch({ url });
      const feedData = this.parser.parse(result.raw, result.format, url);

      const feedId = randomUUID();
      const now = new Date().toISOString();

      const feed: Feed = {
        id: feedId,
        title: feedData.feed.title || url,
        description: feedData.feed.description || '',
        link: feedData.feed.link || url,
        image: feedData.feed.image || '',
        language: feedData.feed.language || '',
        format: result.format,
        url,
        etag: result.etag,
        lastModified: result.lastModified,
        createdAt: now,
        updatedAt: now,
      };

      await this.db.saveFeed(feed);

      const normalized = this.normalizer.normalizeItems(feedData.items);
      const validated = this.validator.validateItems(normalized);

      const itemsToSave = validated.validItems.map(item => {
        const hash = this.computeHash(item);
        const guid = item.link || item.title;
        return {
          id: randomUUID(),
          ...item,
          guid,
          hash,
          feedId,
          createdAt: now,
        };
      });

      if (itemsToSave.length > 0) {
        await this.db.saveItems(itemsToSave);
      }

      return { url, success: true, feedId, title: feed.title, itemCount: validated.validItems.length };
    } catch (error) {
      return { url, success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async syncSingleFeed(feed: Feed): Promise<BulkSyncResult> {
    try {
      const result = await this.fetcher.fetch({
        url: feed.url,
        etag: feed.etag,
        lastModified: feed.lastModified,
      });

      const feedData = this.parser.parse(result.raw, result.format, feed.url);
      const normalized = this.normalizer.normalizeItems(feedData.items);
      const validated = this.validator.validateItems(normalized);

      const existingItems = await this.db.getItemsByFeed(feed.id, 1000);
      const dedup = new DuplicateDetector();
      dedup.loadExisting(existingItems);

      const newItems = dedup.filterNew(validated.validItems, feed.id);
      let added = 0;

      const itemsToSave = newItems.map(item => {
        const hash = dedup.computeHash(item);
        const guid = item.link || item.title;
        dedup.markAsSeen(item);
        added++;
        return {
          id: randomUUID(),
          ...item,
          guid,
          hash,
          feedId: feed.id,
          createdAt: new Date().toISOString(),
        };
      });

      if (itemsToSave.length > 0) {
        await this.db.saveItems(itemsToSave);
      }

      await this.db.updateFeedEtag(feed.id, result.etag, result.lastModified);
      await this.db.updateFeedMeta(feed.id, {
        title: feedData.feed.title,
        description: feedData.feed.description,
        link: feedData.feed.link,
        image: feedData.feed.image,
        language: feedData.feed.language,
      });

      return { feedId: feed.id, title: feed.title, added };
    } catch (error) {
      return { feedId: feed.id, title: feed.title, added: 0, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private computeHash(item: { title: string; link: string; published: string }): string {
    const content = `${item.title}|${item.link}|${item.published}`;
    let hash = 0;
    const prime = 31;
    for (let i = 0; i < content.length; i++) {
      hash = (hash * prime + content.charCodeAt(i)) & 0x7fffffff;
    }
    return hash.toString(16).padStart(8, '0');
  }
}
