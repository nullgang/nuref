import type { Feed, FeedItem, FeedFormat, SearchFilters, SearchResult } from '../core/types.js';

export abstract class Database {
  abstract init(): Promise<void>;
  abstract close(): Promise<void>;

  abstract saveFeed(feed: Feed): Promise<void>;
  abstract getFeed(id: string): Promise<Feed | null>;
  abstract getFeedByUrl(url: string): Promise<Feed | null>;
  abstract getAllFeeds(): Promise<Feed[]>;
  abstract deleteFeed(id: string): Promise<void>;
  abstract updateFeedEtag(id: string, etag: string, lastModified: string): Promise<void>;
  abstract updateFeedMeta(id: string, meta: { title?: string; description?: string; link?: string; image?: string; language?: string }): Promise<void>;

  abstract saveItem(item: FeedItem): Promise<void>;
  abstract saveItems(items: FeedItem[]): Promise<void>;
  abstract getItem(id: string): Promise<FeedItem | null>;
  abstract getItemByGuid(feedId: string, guid: string): Promise<FeedItem | null>;
  abstract getItemsByFeed(feedId: string, limit?: number, offset?: number): Promise<FeedItem[]>;
  abstract getAllItems(limit?: number, offset?: number): Promise<FeedItem[]>;
  abstract deleteItem(id: string): Promise<void>;

  abstract search(filters: SearchFilters): Promise<SearchResult>;
  abstract getItemCount(feedId?: string): Promise<number>;
  abstract getFeedCount(): Promise<number>;
}
