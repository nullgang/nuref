import { Command } from 'commander';
import { SqliteDatabase } from '../database/sqlite.js';
import { FeedGenerator } from '../generator/generator.js';
import { Scheduler } from '../scheduler/scheduler.js';
import { Cache } from '../cache/cache.js';
import { FetchEngine } from '../core/fetcher.js';
import { FormatDetector } from '../core/detector.js';
import { Parser } from '../core/parser.js';
import { Normalizer } from '../core/normalizer.js';
import { Validator } from '../core/validator.js';
import { DuplicateDetector } from '../core/duplicate.js';
import { randomUUID } from 'crypto';

const program = new Command();

program
  .name('nuref')
  .description('Universal Feed Processing Engine')
  .version('1.0.0');

async function getDb(): Promise<SqliteDatabase> {
  const db = new SqliteDatabase();
  await db.init();
  return db;
}

program
  .command('add <url>')
  .description('Add a new feed')
  .option('-c, --cron <expression>', 'Cron expression for scheduling')
  .action(async (url, options) => {
    const db = await getDb();
    const detector = new FormatDetector();
    const fetcher = new FetchEngine(detector);
    const parser = new Parser();
    const normalizer = new Normalizer();

    try {
      const existing = await db.getFeedByUrl(url);
      if (existing) {
        console.log(`Feed already exists: ${existing.title} (${existing.id})`);
        await db.close();
        return;
      }

      console.log(`Fetching ${url}...`);
      const result = await fetcher.fetch({ url });
      const feedData = parser.parse(result.raw, result.format, url);

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

      await db.saveFeed(feed);

      const normalized = normalizer.normalizeItems(feedData.items);
      let added = 0;

      for (const item of normalized) {
        const hash = computeHash(item);
        const guid = item.link || item.title;
        await db.saveItem({
          id: randomUUID(),
          ...item,
          guid,
          hash,
          feedId,
          createdAt: now,
        });
        added++;
      }

      console.log(`Added: ${feed.title}`);
      console.log(`  ID: ${feedId}`);
      console.log(`  Format: ${result.format}`);
      console.log(`  Items: ${added}`);

      if (options.cron) {
        console.log(`  Schedule: ${options.cron}`);
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
    }

    await db.close();
  });

program
  .command('remove <id>')
  .description('Remove a feed')
  .action(async (id) => {
    const db = await getDb();

    const feed = await db.getFeed(id);
    if (!feed) {
      console.log(`Feed not found: ${id}`);
      await db.close();
      return;
    }

    await db.deleteFeed(id);
    console.log(`Removed: ${feed.title}`);
    await db.close();
  });

program
  .command('list')
  .description('List all feeds')
  .action(async () => {
    const db = await getDb();
    const feeds = await db.getAllFeeds();

    if (feeds.length === 0) {
      console.log('No feeds found.');
      await db.close();
      return;
    }

    for (const feed of feeds) {
      const count = await db.getItemCount(feed.id);
      console.log(`${feed.title}`);
      console.log(`  ID: ${feed.id}`);
      console.log(`  URL: ${feed.url}`);
      console.log(`  Format: ${feed.format}`);
      console.log(`  Items: ${count}`);
      console.log();
    }

    await db.close();
  });

program
  .command('sync [id]')
  .description('Sync a feed or all feeds')
  .action(async (id) => {
    const db = await getDb();
    const detector = new FormatDetector();
    const fetcher = new FetchEngine(detector);
    const parser = new Parser();
    const normalizer = new Normalizer();

    const feeds = id ? [await db.getFeed(id)] : await db.getAllFeeds();
    const validFeeds = feeds.filter(Boolean) as any[];

    for (const feed of validFeeds) {
      console.log(`Syncing: ${feed.title}...`);

      try {
        const result = await fetcher.fetch({
          url: feed.url,
          etag: feed.etag,
          lastModified: feed.lastModified,
        });

        const feedData = parser.parse(result.raw, result.format, feed.url);
        const normalized = normalizer.normalizeItems(feedData.items);

        await db.updateFeedMeta(feed.id, {
          title: feedData.feed.title,
          description: feedData.feed.description,
          link: feedData.feed.link,
          image: feedData.feed.image,
          language: feedData.feed.language,
        });

        const existingItems = await db.getItemsByFeed(feed.id, 1000);
        const dedup = new DuplicateDetector();
        dedup.loadExisting(existingItems);

        const newItems = dedup.filterNew(normalized, feed.id);
        let added = 0;

        for (const item of newItems) {
          const hash = dedup.computeHash(item);
          const guid = item.link || item.title;
          await db.saveItem({
            id: randomUUID(),
            ...item,
            guid,
            hash,
            feedId: feed.id,
            createdAt: new Date().toISOString(),
          });
          dedup.markAsSeen(item);
          added++;
        }

        await db.updateFeedEtag(feed.id, result.etag, result.lastModified);
        console.log(`  New items: ${added}`);
      } catch (error) {
        if (error instanceof Error && error.message === 'NOT_MODIFIED') {
          console.log('  Not modified');
        } else {
          console.error(`  Error: ${error instanceof Error ? error.message : error}`);
        }
      }
    }

    await db.close();
  });

program
  .command('search <query>')
  .description('Search items')
  .option('-l, --limit <number>', 'Max results', '20')
  .action(async (query, options) => {
    const db = await getDb();
    const limit = parseInt(options.limit);

    const result = await db.search({ query, limit });

    if (result.items.length === 0) {
      console.log('No results found.');
      await db.close();
      return;
    }

    console.log(`Found ${result.total} results (showing ${result.items.length}):\n`);

    for (const item of result.items) {
      console.log(`${item.title}`);
      console.log(`  ${item.link}`);
      console.log(`  ${item.published} | ${item.author}`);
      console.log();
    }

    await db.close();
  });

program
  .command('export <id> <format>')
  .description('Export feed as RSS, Atom, JSON Feed, or Sitemap')
  .action(async (id, format) => {
    const db = await getDb();
    const generator = new FeedGenerator();

    const feed = await db.getFeed(id);
    if (!feed) {
      console.error(`Feed not found: ${id}`);
      await db.close();
      return;
    }

    const items = await db.getItemsByFeed(id, 100);
    const validFormat = format as 'rss' | 'atom' | 'json_feed' | 'sitemap';

    try {
      const output = generator.generate(feed, items, validFormat);
      console.log(output);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
    }

    await db.close();
  });

program
  .command('stats')
  .description('Show statistics')
  .action(async () => {
    const db = await getDb();

    const feedCount = await db.getFeedCount();
    const itemCount = await db.getItemCount();

    console.log('Nuref Statistics');
    console.log(`  Feeds: ${feedCount}`);
    console.log(`  Items: ${itemCount}`);

    await db.close();
  });

function computeHash(item: { title: string; link: string; published: string }): string {
  const content = `${item.title}|${item.link}|${item.published}`;
  let hash = 0;
  const prime = 31;
  for (let i = 0; i < content.length; i++) {
    hash = (hash * prime + content.charCodeAt(i)) & 0x7fffffff;
  }
  return hash.toString(16).padStart(8, '0');
}

program.parse();
