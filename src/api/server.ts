#!/usr/bin/env node
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Database } from '../database/database.js';
import type { FeedGenerator } from '../generator/generator.js';
import type { Scheduler } from '../scheduler/scheduler.js';
import type { Cache } from '../cache/cache.js';
import type { SearchFilters } from '../core/types.js';
import { FetchEngine } from '../core/fetcher.js';
import { FormatDetector } from '../core/detector.js';
import { Parser } from '../core/parser.js';
import { Normalizer } from '../core/normalizer.js';
import { Validator } from '../core/validator.js';
import { DuplicateDetector } from '../core/duplicate.js';
import { randomUUID } from 'crypto';

export interface ApiServerOptions {
  port?: number;
  host?: string;
}

export class ApiServer {
  private app: Hono;
  private db: Database;
  private generator: FeedGenerator;
  private scheduler: Scheduler;
  private cache: Cache;
  private port: number;
  private host: string;
  private fetcher: FetchEngine;
  private parser: Parser;
  private normalizer: Normalizer;
  private validator: Validator;
  private detector: FormatDetector;

  constructor(db: Database, generator: FeedGenerator, scheduler: Scheduler, cache: Cache, options: ApiServerOptions = {}) {
    this.db = db;
    this.generator = generator;
    this.scheduler = scheduler;
    this.cache = cache;
    this.port = options.port || 3000;
    this.host = options.host || '0.0.0.0';

    this.detector = new FormatDetector();
    this.fetcher = new FetchEngine(this.detector);
    this.parser = new Parser();
    this.normalizer = new Normalizer();
    this.validator = new Validator();

    this.app = new Hono();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.get('/feeds', async (c) => {
      const feeds = await this.db.getAllFeeds();
      return c.json(feeds);
    });

    this.app.get('/feeds/:id', async (c) => {
      const feed = await this.db.getFeed(c.req.param('id'));
      if (!feed) return c.json({ error: 'Feed not found' }, 404);
      return c.json(feed);
    });

    this.app.post('/feeds', async (c) => {
      const body = await c.req.json();
      const { url, cron } = body;

      if (!url) return c.json({ error: 'URL is required' }, 400);

      const existing = await this.db.getFeedByUrl(url);
      if (existing) return c.json({ error: 'Feed already exists' }, 409);

      try {
        const result = await this.fetcher.fetch({ url });
        const feedData = this.parser.parse(result.raw, result.format, url);

        const feedId = randomUUID();
        const now = new Date().toISOString();

        const feed = {
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

        if (cron) {
          this.scheduler.addTask(feedId, cron);
        }

        return c.json(feed, 201);
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : 'Failed to fetch feed' }, 422);
      }
    });

    this.app.delete('/feeds/:id', async (c) => {
      const id = c.req.param('id');
      const feed = await this.db.getFeed(id);
      if (!feed) return c.json({ error: 'Feed not found' }, 404);

      this.scheduler.removeTask(id);
      await this.db.deleteFeed(id);
      return c.json({ success: true });
    });

    this.app.get('/feeds/:id/sync', async (c) => {
      const id = c.req.param('id');
      const feed = await this.db.getFeed(id);
      if (!feed) return c.json({ error: 'Feed not found' }, 404);

      try {
        const result = await this.fetcher.fetch({
          url: feed.url,
          etag: feed.etag,
          lastModified: feed.lastModified,
        });

        const feedData = this.parser.parse(result.raw, result.format, feed.url);
        const normalized = this.normalizer.normalizeItems(feedData.items);
        const validated = this.validator.validateItems(normalized);

        await this.db.updateFeedMeta(id, {
          title: feedData.feed.title,
          description: feedData.feed.description,
          link: feedData.feed.link,
          image: feedData.feed.image,
          language: feedData.feed.language,
        });

        const existingItems = await this.db.getItemsByFeed(id, 1000);
        const dedup = new DuplicateDetector();
        dedup.loadExisting(existingItems);

        const newItems = dedup.filterNew(validated.validItems, id);
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
            feedId: id,
            createdAt: new Date().toISOString(),
          };
        });

        if (itemsToSave.length > 0) {
          await this.db.saveItems(itemsToSave);
        }

        await this.db.updateFeedEtag(id, result.etag, result.lastModified);
        return c.json({ added, total: validated.validItems.length, new: newItems.length });
      } catch (error) {
        if (error instanceof Error && error.message === 'NOT_MODIFIED') {
          return c.json({ added: 0, total: 0, new: 0, message: 'Not modified' });
        }
        return c.json({ error: error instanceof Error ? error.message : 'Sync failed' }, 500);
      }
    });

    this.app.get('/feeds/:id/items', async (c) => {
      const id = c.req.param('id');
      const limit = parseInt(c.req.query('limit') || '50');
      const offset = parseInt(c.req.query('offset') || '0');

      const items = await this.db.getItemsByFeed(id, limit, offset);
      return c.json(items);
    });

    this.app.get('/items', async (c) => {
      const limit = parseInt(c.req.query('limit') || '50');
      const offset = parseInt(c.req.query('offset') || '0');
      const items = await this.db.getAllItems(limit, offset);
      return c.json(items);
    });

    this.app.get('/search', async (c) => {
      const filters: SearchFilters = {
        query: c.req.query('q'),
        author: c.req.query('author'),
        tag: c.req.query('tag'),
        feedId: c.req.query('feed_id'),
        from: c.req.query('from'),
        to: c.req.query('to'),
        limit: parseInt(c.req.query('limit') || '50'),
        offset: parseInt(c.req.query('offset') || '0'),
      };

      const result = await this.db.search(filters);
      return c.json(result);
    });

    this.app.get('/feeds/:id/rss', async (c) => {
      const id = c.req.param('id');
      const feed = await this.db.getFeed(id);
      if (!feed) return c.json({ error: 'Feed not found' }, 404);

      const items = await this.db.getItemsByFeed(id, 50);
      const rss = this.generator.rss(feed, items);
      return c.body(rss, 200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
    });

    this.app.get('/feeds/:id/atom', async (c) => {
      const id = c.req.param('id');
      const feed = await this.db.getFeed(id);
      if (!feed) return c.json({ error: 'Feed not found' }, 404);

      const items = await this.db.getItemsByFeed(id, 50);
      const atom = this.generator.atom(feed, items);
      return c.body(atom, 200, { 'Content-Type': 'application/atom+xml; charset=utf-8' });
    });

    this.app.get('/feeds/:id/json', async (c) => {
      const id = c.req.param('id');
      const feed = await this.db.getFeed(id);
      if (!feed) return c.json({ error: 'Feed not found' }, 404);

      const items = await this.db.getItemsByFeed(id, 50);
      const json = this.generator.jsonFeed(feed, items);
      return c.body(json, 200, { 'Content-Type': 'application/json; charset=utf-8' });
    });

    this.app.get('/feeds/:id/sitemap', async (c) => {
      const id = c.req.param('id');
      const feed = await this.db.getFeed(id);
      if (!feed) return c.json({ error: 'Feed not found' }, 404);

      const items = await this.db.getItemsByFeed(id, 50);
      const sitemap = this.generator.sitemap(feed, items);
      return c.body(sitemap, 200, { 'Content-Type': 'application/xml; charset=utf-8' });
    });

    this.app.get('/scheduler', async (c) => {
      const tasks = this.scheduler.getAllTasks();
      return c.json(tasks);
    });

    this.app.post('/scheduler', async (c) => {
      const { feedId, cron } = await c.req.json();
      if (!feedId || !cron) return c.json({ error: 'feedId and cron are required' }, 400);

      const feed = await this.db.getFeed(feedId);
      if (!feed) return c.json({ error: 'Feed not found' }, 404);

      const task = this.scheduler.addTask(feedId, cron);
      return c.json(task, 201);
    });

    this.app.delete('/scheduler/:feedId', async (c) => {
      this.scheduler.removeTask(c.req.param('feedId'));
      return c.json({ success: true });
    });

    this.app.get('/stats', async (c) => {
      const feedCount = await this.db.getFeedCount();
      const itemCount = await this.db.getItemCount();
      return c.json({ feedCount, itemCount, cacheSize: this.cache.size });
    });

    this.app.get('/health', (c) => {
      return c.json({ status: 'ok', version: '1.0.0' });
    });

    this.app.get('/streams/:feedId', async (c) => {
      const feedId = c.req.param('feedId');
      const feed = await this.db.getFeed(feedId);
      if (!feed) return c.json({ error: 'Feed not found' }, 404);

      return new Response(
        new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            const send = (event: string, data: any) => {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            send('connected', { feedId, message: 'Stream connected' });

            const heartbeat = setInterval(() => {
              send('heartbeat', { alive: true, timestamp: new Date().toISOString() });
            }, 30000);

            c.req.raw.signal?.addEventListener('abort', () => {
              clearInterval(heartbeat);
              controller.close();
            });
          },
        }),
        {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        }
      );
    });

    this.app.get('/aggregated', async (c) => {
      const { FeedAggregator } = await import('../core/aggregator.js');
      const urls = c.req.query('urls')?.split(',') || [];
      if (urls.length === 0) return c.json({ error: 'urls query param required' }, 400);

      const aggregator = new FeedAggregator();
      const result = await aggregator.fetchAndAggregate(urls, {
        sort: 'date',
        limit: parseInt(c.req.query('limit') || '100'),
      });

      return c.json(result);
    });

    this.app.get('/diff/:id1/:id2', async (c) => {
      const { FeedComparator } = await import('../core/diff.js');
      const id1 = c.req.param('id1');
      const id2 = c.req.param('id2');

      const items1 = await this.db.getItemsByFeed(id1, 1000);
      const items2 = await this.db.getItemsByFeed(id2, 1000);

      const comparator = new FeedComparator();
      const diff = comparator.compare(items1, items2);

      return c.json(diff);
    });
  }

  start(): void {
    serve({
      fetch: this.app.fetch,
      port: this.port,
      hostname: this.host,
    }, (info) => {
      console.log(`[API] Server running at http://${this.host}:${info.port}`);
    });
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

if (process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'))) {
  const { SqliteDatabase } = await import('../database/sqlite.js');
  const { FeedGenerator } = await import('../generator/generator.js');
  const { Scheduler } = await import('../scheduler/scheduler.js');
  const { Cache } = await import('../cache/cache.js');

  const db = new SqliteDatabase();
  await db.init();

  const generator = new FeedGenerator();
  const scheduler = new Scheduler(async (feedId) => {
    console.log(`[Scheduler] Syncing feed ${feedId}`);
  });
  const cache = new Cache();

  const server = new ApiServer(db, generator, scheduler, cache, {
    port: parseInt(process.env.PORT || '3000'),
  });

  server.start();
}
