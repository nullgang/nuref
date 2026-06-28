import { PerformanceMetrics, hashFast, dedupArray, ObjectPool } from '../core/performance.js';
import { Parser } from '../core/parser.js';
import { Normalizer } from '../core/normalizer.js';
import { LRUCache } from '../core/lru-cache.js';
import { SqliteDatabase } from '../database/sqlite.js';
import { randomUUID } from 'crypto';
import type { FeedItem, Feed } from '../core/types.js';

function generateRss(count: number): string {
  const items = Array.from({ length: count }, (_, i) => `
    <item>
      <title>Article ${i}</title>
      <description>Description for article ${i} with some extra content</description>
      <link>https://example.com/article-${i}</link>
      <pubDate>Mon, 01 Jan 2024 ${String(i % 24).padStart(2, '0')}:00:00 GMT</pubDate>
      <category>tech</category>
      <dc:creator>Author ${i}</dc:creator>
    </item>`).join('');
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title><description>Test feed</description><link>https://example.com</link>${items}</channel></rss>`;
}

function generateItems(count: number): FeedItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: randomUUID(), title: `Article ${i}`, description: `Desc ${i}`, content: `Content ${i}`,
    author: `Author ${i % 10}`, published: `2024-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
    updated: '', link: `https://example.com/article-${i}`, image: '', tags: ['tech'],
    guid: `guid-${i}`, hash: `h${i}`, feedId: 'perf-feed', createdAt: '',
  }));
}

async function benchmark() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     NUREF ENGINE - PER-OPERATION BENCHMARK       ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const parser = new Parser();
  const normalizer = new Normalizer();
  const RUNS = 5;
  const results: Record<string, number[]> = {};

  function record(name: string, ms: number) {
    if (!results[name]) results[name] = [];
    results[name].push(ms);
  }

  // Warmup
  for (let i = 0; i < 3; i++) {
    parser.parse(generateRss(100), 'rss', 'https://example.com/feed');
    normalizer.normalizeItems(generateItems(100));
  }

  // Parse benchmarks
  for (const count of [10, 50, 100]) {
    for (let r = 0; r < RUNS; r++) {
      const rss = generateRss(count);
      const start = performance.now();
      parser.parse(rss, 'rss', 'https://example.com/feed');
      record(`parse-${count}`, performance.now() - start);
    }
  }

  // Normalize benchmarks
  for (const count of [10, 50, 100]) {
    for (let r = 0; r < RUNS; r++) {
      const items = generateItems(count);
      const start = performance.now();
      normalizer.normalizeItems(items);
      record(`normalize-${count}`, performance.now() - start);
    }
  }

  // LRU benchmarks
  for (const count of [100, 1000]) {
    for (let r = 0; r < RUNS; r++) {
      const cache = new LRUCache({ maxSize: 10000, defaultTtlMs: 60000 });
      const start = performance.now();
      for (let i = 0; i < count; i++) cache.set(`k${i}`, `v${i}`);
      record(`lru-set-${count}`, performance.now() - start);
    }
    for (let r = 0; r < RUNS; r++) {
      const cache = new LRUCache({ maxSize: 10000, defaultTtlMs: 60000 });
      for (let i = 0; i < 1000; i++) cache.set(`k${i}`, `v${i}`);
      const start = performance.now();
      for (let i = 0; i < count; i++) cache.get(`k${i % 1000}`);
      record(`lru-get-${count}`, performance.now() - start);
    }
  }

  // Hash benchmarks
  for (let r = 0; r < RUNS; r++) {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) hashFast(`test-string-${i}`);
    record('hash-1000', performance.now() - start);
  }

  // Dedup benchmarks
  for (let r = 0; r < RUNS; r++) {
    const arr = Array.from({ length: 1000 }, (_, i) => ({ id: `item-${i % 500}`, value: `v${i}` }));
    const start = performance.now();
    dedupArray(arr, x => x.id);
    record('dedup-1000', performance.now() - start);
  }

  // DB benchmarks
  for (let r = 0; r < RUNS; r++) {
    const db = new SqliteDatabase(':memory:');
    await db.init();
    const feed: Feed = { id: 'f1', title: 'F', description: '', link: '', image: '', language: '', format: 'rss', url: 'https://x.com/f', etag: '', lastModified: '', createdAt: '', updatedAt: '' };
    await db.saveFeed(feed);
    const items = generateItems(100).map(i => ({ ...i, feedId: 'f1' }));

    const start1 = performance.now();
    await db.saveItems(items);
    record('db-insert-100', performance.now() - start1);

    const start2 = performance.now();
    await db.getItemsByFeed('f1', 100);
    record('db-select-100', performance.now() - start2);

    const start3 = performance.now();
    await db.search({ query: 'Article', limit: 10 });
    record('db-search-fts', performance.now() - start3);

    await db.close();
  }

  // Full pipeline benchmarks
  for (const count of [10, 50, 100]) {
    for (let r = 0; r < RUNS; r++) {
      const rss = generateRss(count);
      const start = performance.now();
      const feedData = parser.parse(rss, 'rss', 'https://example.com/feed');
      normalizer.normalizeItems(feedData.items);
      record(`pipeline-${count}`, performance.now() - start);
    }
  }

  // Print results
  console.log('Operation                      | Total(ms) | Per-Item(ms) | Under 3ms?');
  console.log('-------------------------------|-----------|--------------|----------');

  function print(name: string, count: number) {
    const times = results[name] || [];
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const perItem = avg / count;
    const check = perItem < 3 ? '✅' : '❌';
    console.log(`${name.padEnd(30)} | ${avg.toFixed(1).padStart(9)} | ${perItem.toFixed(3).padStart(12)} | ${check}`);
  }

  print('parse-10', 10);
  print('parse-50', 50);
  print('parse-100', 100);
  print('normalize-10', 10);
  print('normalize-50', 50);
  print('normalize-100', 100);
  print('lru-set-100', 100);
  print('lru-set-1000', 1000);
  print('lru-get-100', 100);
  print('lru-get-1000', 1000);
  print('hash-1000', 1000);
  print('dedup-1000', 1000);
  print('db-insert-100', 100);
  print('db-select-100', 100);
  print('db-search-fts', 1);
  print('pipeline-10', 10);
  print('pipeline-50', 50);
  print('pipeline-100', 100);

  console.log('\n' + '═'.repeat(60));
}

benchmark().catch(console.error);
