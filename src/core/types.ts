export type FeedFormat = 'rss' | 'atom' | 'rdf' | 'json_feed' | 'sitemap' | 'unknown';

export interface FeedItem {
  id: string;
  title: string;
  description: string;
  content: string;
  author: string;
  published: string;
  updated: string;
  link: string;
  image: string;
  tags: string[];
  guid: string;
  hash: string;
  feedId: string;
  createdAt: string;
}

export interface Feed {
  id: string;
  title: string;
  description: string;
  link: string;
  image: string;
  language: string;
  format: FeedFormat;
  url: string;
  etag: string;
  lastModified: string;
  createdAt: string;
  updatedAt: string;
}

export interface FetchOptions {
  url: string;
  timeout?: number;
  userAgent?: string;
  proxy?: string;
  compress?: boolean;
  retries?: number;
  etag?: string;
  lastModified?: string;
}

export interface FetchResult {
  raw: string;
  format: FeedFormat;
  etag: string;
  lastModified: string;
  statusCode: number;
}

export interface NormalizedItem {
  title: string;
  description: string;
  content: string;
  author: string;
  published: string;
  updated: string;
  link: string;
  image: string;
  tags: string[];
}

export interface SearchFilters {
  query?: string;
  author?: string;
  tag?: string;
  category?: string;
  from?: string;
  to?: string;
  feedId?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  items: FeedItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface SchedulerTask {
  id: string;
  feedId: string;
  cron: string;
  enabled: boolean;
  lastRun: string;
  nextRun: string;
}

export interface WebhookConfig {
  id: string;
  feedId: string;
  url: string;
  events: string[];
  secret: string;
  enabled: boolean;
}
