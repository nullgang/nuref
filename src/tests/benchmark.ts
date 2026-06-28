import { PerformanceMetrics, hashFast, dedupArray, chunkArray, ObjectPool, BatchBuffer } from '../core/performance.js';
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
      <description>Description for article ${i} with some extra content to make it realistic</description>
      <link>https://example.com/article-${i}</link>
      <pubDate>Mon, 01 Jan 2024 ${String(i % 24).padStart(2, '0')}:00:00 GMT</pubDate>
      <category>tech</category>
      <category>programming</category>
      <dc:creator>Author ${i}</dc:creator>
    </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Perf Test Feed</title>
    <description>Performance testing feed</description>
    <link>https://example.com</link>
    ${items}
  </channel>
</rss>`;
}

function generateItems(count: number): FeedItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    title: `Article ${i}`,
    description: `Description for article ${i}`,
    content: `Full content for article ${i}`,
    author: `Author ${i % 10}`,
    published: `2024-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
    updated: '',
    link: `https://example.com/article-${i}`,
    image: '',
    tags: ['tech', 'programming'],
    guid: `guid-${i}`,
    hash: hashFast(`article-${i}`),
    feedId: 'test-feed',
    createdAt: '2024-01-01T00:00:00Z',
  }));
}

async function benchmark() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║       NUREF ENGINE - PERFORMANCE BENCH        ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const parser = new Parser();
  const normalizer = new Normalizer();
  const metrics = new PerformanceMetrics();

  // Parser benchmark
  for (const count of [10, 100, 500]) {
    const rss = generateRss(count);
    const end = metrics.start(`parse-${count}-items`);
    parser.parse(rss, 'rss', 'https://example.com/feed');
    const ms = end();
    console.log(`📄 Parse ${count} items: ${ms.toFixed(1)}ms`);
  }

  // Normalizer benchmark
  const items500 = generateItems(500);
  {
    const end = metrics.start('normalize-500-items');
    normalizer.normalizeItems(items500);
    const ms = end();
    console.log(`🔧 Normalize 500 items: ${ms.toFixed(1)}ms`);
  }

  // LRU Cache benchmark
  {
    const cache = new LRUCache({ maxSize: 10000, defaultTtlMs: 60000 });
    const end = metrics.start('lru-set-10000');
    for (let i = 0; i < 10000; i++) {
      cache.set(`key-${i}`, `value-${i}`);
    }
    const ms = end();
    console.log(`💾 LRU set 10k items: ${ms.toFixed(1)}ms`);
  }

  {
    const cache = new LRUCache({ maxSize: 10000, defaultTtlMs: 60000 });
    for (let i = 0; i < 10000; i++) cache.set(`key-${i}`, `value-${i}`);
    const end = metrics.start('lru-get-10000');
    for (let i = 0; i < 10000; i++) cache.get(`key-${i}`);
    const ms = end();
    console.log(`💾 LRU get 10k items: ${ms.toFixed(1)}ms`);
  }

  // Hash benchmark
  {
    const end = metrics.start('hash-100000');
    for (let i = 0; i < 100000; i++) {
      hashFast(`test-string-${i}`);
    }
    const ms = end();
    console.log(`⚡ hashFast 100k: ${ms.toFixed(1)}ms`);
  }

  // Dedup benchmark
  {
    const arr = Array.from({ length: 10000 }, (_, i) => ({
      id: `item-${i % 5000}`,
      value: `value-${i}`,
    }));
    const end = metrics.start('dedup-10000');
    dedupArray(arr, x => x.id);
    const ms = end();
    console.log(`🔄 Dedup 10k items: ${ms.toFixed(1)}ms`);
  }

  // Object Pool benchmark
  {
    const pool = new ObjectPool<FeedItem>(
      () => ({ id: '', title: '', description: '', content: '', author: '', published: '', updated: '', link: '', image: '', tags: [], guid: '', hash: '', feedId: '', createdAt: '' }),
      (item) => { item.id = ''; },
      100, 1000
    );
    const end = metrics.start('pool-10000');
    for (let i = 0; i < 10000; i++) {
      const item = pool.acquire();
      item.id = `item-${i}`;
      pool.release(item);
    }
    const ms = end();
    console.log(`🏊 Object pool 10k ops: ${ms.toFixed(1)}ms`);
  }

  // Database benchmark
  {
    const db = new SqliteDatabase(':memory:');
    await db.init();

    const feed: Feed = {
      id: 'perf-feed', title: 'Perf Feed', description: '', link: '', image: '',
      language: '', format: 'rss', url: 'https://example.com/feed', etag: '',
      lastModified: '', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    await db.saveFeed(feed);

    const items1000 = generateItems(1000);
    items1000.forEach(item => item.feedId = 'perf-feed');
    const end1 = metrics.start('db-batch-insert-1000');
    await db.saveItems(items1000);
    const ms1 = end1();
    console.log(`🗄️  DB batch insert 1000: ${ms1.toFixed(1)}ms`);

    const end2 = metrics.start('db-select-1000');
    await db.getItemsByFeed('perf-feed', 1000);
    const ms2 = end2();
    console.log(`🗄️  DB select 1000: ${ms2.toFixed(1)}ms`);

    const end3 = metrics.start('db-search-fts');
    await db.search({ query: 'Article', limit: 50 });
    const ms3 = end3();
    console.log(`🗄️  DB FTS search: ${ms3.toFixed(1)}ms`);

    const end4 = metrics.start('db-count');
    for (let i = 0; i < 1000; i++) {
      await db.getItemCount();
    }
    const ms4 = end4();
    console.log(`🗄️  DB count x1000: ${ms4.toFixed(1)}ms`);

    await db.close();
  }

  // Full pipeline benchmark
  {
    const rss = generateRss(100);
    const end = metrics.start('full-pipeline-100');
    const feedData = parser.parse(rss, 'rss', 'https://example.com/feed');
    const normalized = normalizer.normalizeItems(feedData.items);
    const ms = end();
    console.log(`🚀 Full pipeline 100 items: ${ms.toFixed(1)}ms`);
  }

  console.log('\n════════════════════════════════════════════════');
  console.log('Summary:');
  const report = metrics.getReport();
  const totalMs = Object.values(report).reduce((sum, r) => sum + r.totalMs, 0);
  console.log(`Total benchmark time: ${totalMs.toFixed(1)}ms`);
  console.log('════════════════════════════════════════════════');
}

benchmark().catch(console.error);
