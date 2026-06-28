import { FormatDetector } from '../core/detector.js';
import { Parser } from '../core/parser.js';
import { Normalizer } from '../core/normalizer.js';
import { Validator } from '../core/validator.js';
import { DuplicateDetector } from '../core/duplicate.js';
import { XmlEngine } from '../xml/engine.js';
import { Cache } from '../cache/cache.js';
import { FeedGenerator } from '../generator/generator.js';
import { RateLimiter } from '../core/rate-limiter.js';
import { ContentExtractor } from '../core/extractor.js';
import { HealthMonitor } from '../core/health.js';
import { TransformPipeline, truncateText, addTag, prefixTitle } from '../core/transforms.js';
import { CategoryManager } from '../core/category.js';
import { EnclosureHandler } from '../core/enclosure.js';
import { WebhookManager } from '../core/webhook.js';
import { SqliteDatabase } from '../database/sqlite.js';
import { FetchEngine } from '../core/fetcher.js';
import type { NormalizedItem, Feed } from '../core/types.js';
import { randomUUID } from 'crypto';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    failed++;
  }
}

const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <description>A test RSS feed</description>
    <link>https://example.com</link>
    <language>en-us</language>
    <item>
      <title>First Article</title>
      <description>This is the first article description</description>
      <link>https://example.com/article1</link>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
      <category>tech</category>
      <category>programming</category>
      <dc:creator>John Doe</dc:creator>
    </item>
    <item>
      <title>Second Article</title>
      <description>This is the second article</description>
      <link>https://example.com/article2</link>
      <pubDate>Tue, 02 Jan 2024 12:00:00 GMT</pubDate>
      <category>news</category>
    </item>
  </channel>
</rss>`;

const atomFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Test Feed</title>
  <id>urn:uuid:test-feed</id>
  <updated>2024-01-01T00:00:00Z</updated>
  <entry>
    <title>Atom Entry 1</title>
    <id>urn:uuid:entry-1</id>
    <updated>2024-01-01T00:00:00Z</updated>
    <published>2024-01-01T00:00:00Z</published>
    <summary>Summary of atom entry 1</summary>
    <content>Full content of atom entry 1</content>
    <author><name>Jane Smith</name></author>
    <link href="https://example.com/atom1" rel="alternate"/>
    <category term="science"/>
  </entry>
</feed>`;

const jsonFeed = `{
  "version": "https://jsonfeed.org/version/1.1",
  "title": "JSON Test Feed",
  "description": "A JSON feed test",
  "home_page_url": "https://example.com",
  "items": [
    {
      "id": "1",
      "title": "JSON Item 1",
      "summary": "Summary of JSON item",
      "content_html": "<p>Content of JSON item</p>",
      "url": "https://example.com/json1",
      "date_published": "2024-01-01T00:00:00Z",
      "author": { "name": "JSON Author" },
      "tags": ["json", "test"]
    }
  ]
}`;

const sitemapFeed = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/page1</loc>
    <lastmod>2024-01-01</lastmod>
  </url>
  <url>
    <loc>https://example.com/page2</loc>
    <lastmod>2024-01-02</lastmod>
  </url>
</urlset>`;

async function testFormatDetector() {
  console.log('\n🔍 Format Detector');
  const detector = new FormatDetector();
  assert(detector.detect(rssFeed) === 'rss', 'detect RSS');
  assert(detector.detect(atomFeed) === 'atom', 'detect Atom');
  assert(detector.detect(jsonFeed) === 'json_feed', 'detect JSON Feed');
  assert(detector.detect(sitemapFeed) === 'sitemap', 'detect Sitemap');
  assert(detector.detect('not xml') === 'unknown', 'detect unknown');
}

async function testParser() {
  console.log('\n📄 Parser');
  const parser = new Parser();

  const rssResult = parser.parse(rssFeed, 'rss', 'https://example.com/feed');
  assert(rssResult.feed.title === 'Test Feed', 'RSS: parse title');
  assert(rssResult.items.length === 2, 'RSS: parse 2 items');
  assert(rssResult.items[0].title === 'First Article', 'RSS: parse item title');
  assert(rssResult.items[0].tags.includes('tech'), 'RSS: parse tags');

  const atomResult = parser.parse(atomFeed, 'atom', 'https://example.com/atom');
  assert(atomResult.feed.title === 'Atom Test Feed', 'Atom: parse title');
  assert(atomResult.items.length === 1, 'Atom: parse 1 item');
  assert(atomResult.items[0].author === 'Jane Smith', 'Atom: parse author');

  const jsonResult = parser.parse(jsonFeed, 'json_feed', 'https://example.com/json');
  assert(jsonResult.feed.title === 'JSON Test Feed', 'JSON Feed: parse title');
  assert(jsonResult.items.length === 1, 'JSON Feed: parse 1 item');
  assert(jsonResult.items[0].tags.includes('json'), 'JSON Feed: parse tags');

  const sitemapResult = parser.parse(sitemapFeed, 'sitemap', 'https://example.com/sitemap');
  assert(sitemapResult.items.length === 2, 'Sitemap: parse 2 urls');
  assert(sitemapResult.items[0].link === 'https://example.com/page1', 'Sitemap: parse url');
}

async function testNormalizer() {
  console.log('\n🔧 Normalizer');
  const normalizer = new Normalizer();

  const items: NormalizedItem[] = [
    {
      title: '  Test Title  ',
      description: '<p>HTML <b>content</b></p>',
      content: 'Full content',
      author: '  John Doe (John)  ',
      published: 'Mon, 01 Jan 2024 12:00:00 GMT',
      updated: '',
      link: 'https://example.com/article1',
      image: 'https://example.com/image.jpg',
      tags: ['tech', 'Tech', 'NEWS'],
    },
  ];

  const normalized = normalizer.normalizeItems(items);
  assert(normalized[0].title === 'Test Title', 'normalize: trim title');
  assert(normalized[0].description === 'HTML content', 'normalize: strip HTML');
  assert(normalized[0].author === 'John Doe', 'normalize: clean author');
  assert(normalized[0].published === '2024-01-01T12:00:00.000Z', 'normalize: parse date');
  assert(normalized[0].tags.length === 2, 'normalize: dedup tags (tech/Tech -> 1, NEWS -> 1)');
}

async function testValidator() {
  console.log('\n✅ Validator');
  const validator = new Validator();

  const validItem: NormalizedItem = {
    title: 'Valid Item',
    description: 'Description',
    content: '',
    author: '',
    published: '2024-01-01T00:00:00Z',
    updated: '',
    link: 'https://example.com',
    image: '',
    tags: [],
  };

  const result1 = validator.validateItem(validItem);
  assert(result1.valid === true, 'validate: valid item passes');

  const invalidItem: NormalizedItem = {
    title: '',
    description: '',
    content: '',
    author: '',
    published: '',
    updated: '',
    link: 'not-a-url',
    image: '',
    tags: [],
  };

  const result2 = validator.validateItem(invalidItem);
  assert(result2.valid === false, 'validate: invalid item fails');
  assert(result2.errors.length > 0, 'validate: returns error messages');

  const batch = validator.validateItems([validItem, invalidItem]);
  assert(batch.validItems.length === 1, 'validate: batch filters invalid');
  assert(batch.invalidCount === 1, 'validate: batch counts invalid');
}

async function testDuplicateDetector() {
  console.log('\n🔄 Duplicate Detector');
  const dedup = new DuplicateDetector();

  const existingItems = [
    { id: '1', hash: 'abc123', guid: 'https://example.com/1', link: 'https://example.com/1', title: 'Existing', description: '', content: '', author: '', published: '', updated: '', image: '', tags: [], feedId: 'f1', createdAt: '' },
  ];

  dedup.loadExisting(existingItems);

  const newItems: NormalizedItem[] = [
    { title: 'Existing', description: '', content: '', author: '', published: '', updated: '', link: 'https://example.com/1', image: '', tags: [] },
    { title: 'New Article', description: '', content: '', author: '', published: '2024-01-01', updated: '', link: 'https://example.com/new', image: '', tags: [] },
  ];

  const filtered = dedup.filterNew(newItems, 'f1');
  assert(filtered.length === 1, 'dedup: filters duplicates');
  assert(filtered[0].title === 'New Article', 'dedup: keeps new items');
}

async function testXmlEngine() {
  console.log('\n📐 XML Engine');
  const xml = new XmlEngine();

  const parsed = xml.read(rssFeed);
  assert(parsed !== null, 'xml: read parses XML');

  const written = xml.write(parsed);
  assert(typeof written === 'string', 'xml: write produces string');
  assert(written.includes('Test Feed'), 'xml: write contains data');

  const validation = xml.validate(rssFeed);
  assert(validation.valid === true, 'xml: validate valid XML');

  const invalidValidation = xml.validate('<broken><xml');
  assert(invalidValidation.valid === false, 'xml: validate invalid XML');

  const beautified = xml.beautify(written);
  assert(typeof beautified === 'string', 'xml: beautify works');

  const minified = xml.minify(beautified);
  assert(minified.length <= beautified.length, 'xml: minify reduces size');

  const cdata = xml.wrapCdata('test & data');
  assert(cdata === '<![CDATA[test & data]]>', 'xml: wrapCdata works');

  const unwrapped = xml.unwrapCdata(cdata);
  assert(unwrapped === 'test & data', 'xml: unwrapCdata works');
}

async function testCache() {
  console.log('\n💾 Cache');
  const cache = new Cache(5000);

  cache.set('key1', 'value1');
  assert(cache.get('key1') === 'value1', 'cache: set and get');

  assert(cache.has('key1') === true, 'cache: has returns true');
  assert(cache.has('key2') === false, 'cache: has returns false');

  cache.delete('key1');
  assert(cache.get('key1') === null, 'cache: delete removes key');

  cache.set('a', 1);
  cache.set('b', 2);
  assert(cache.size === 2, 'cache: size tracks entries');

  cache.clear();
  assert(cache.size === 0, 'cache: clear removes all');
}

async function testFeedGenerator() {
  console.log('\n📤 Feed Generator');
  const generator = new FeedGenerator();

  const feed: Feed = {
    id: 'test-feed',
    title: 'Test Feed',
    description: 'A test feed',
    link: 'https://example.com',
    image: '',
    language: 'en',
    format: 'rss',
    url: 'https://example.com/feed.xml',
    etag: '',
    lastModified: '',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const items = [
    {
      id: 'item1', title: 'Article 1', description: 'Desc 1', content: 'Content 1', author: 'Author 1',
      published: '2024-01-01T00:00:00Z', updated: '', link: 'https://example.com/1', image: '',
      tags: ['tech'], guid: 'guid1', hash: 'abc', feedId: 'test-feed', createdAt: '',
    },
  ];

  const rss = generator.rss(feed, items);
  assert(rss.includes('<?xml'), 'generator: RSS has XML header');
  assert(rss.includes('Test Feed'), 'generator: RSS has title');
  assert(rss.includes('Article 1'), 'generator: RSS has item');

  const atom = generator.atom(feed, items);
  assert(atom.includes('xmlns="http://www.w3.org/2005/Atom"'), 'generator: Atom has namespace');
  assert(atom.includes('Test Feed'), 'generator: Atom has title');

  const json = generator.jsonFeed(feed, items);
  const parsed = JSON.parse(json);
  assert(parsed.version === 'https://jsonfeed.org/version/1.1', 'generator: JSON Feed has version');
  assert(parsed.items.length === 1, 'generator: JSON Feed has items');

  const sitemap = generator.sitemap(feed, items);
  assert(sitemap.includes('<urlset'), 'generator: Sitemap has urlset');
  assert(sitemap.includes('https://example.com/1'), 'generator: Sitemap has url');
}

async function testRateLimiter() {
  console.log('\n⏱️  Rate Limiter');
  const limiter = new RateLimiter({ maxTokens: 3, refillIntervalMs: 100 });

  assert(limiter.tryAcquire('host1') === true, 'rate limiter: acquire when tokens available');
  assert(limiter.tryAcquire('host1') === true, 'rate limiter: second acquire');
  assert(limiter.tryAcquire('host1') === true, 'rate limiter: third acquire');
  assert(limiter.tryAcquire('host1') === false, 'rate limiter: deny when empty');
  assert(limiter.getAvailable('host2') === 3, 'rate limiter: new host gets full tokens');

  limiter.reset('host1');
  assert(limiter.tryAcquire('host1') === true, 'rate limiter: reset works');
}

async function testContentExtractor() {
  console.log('\n🔎 Content Extractor');
  const extractor = new ContentExtractor();

  const html = `
    <html>
    <head>
      <title>Page Title</title>
      <meta name="description" content="Page description">
      <meta name="author" content="Test Author">
      <meta property="og:image" content="https://example.com/og.jpg">
    </head>
    <body>
      <h1>Main Heading</h1>
      <p>This is some content text.</p>
      <a href="https://example.com/link1">Link 1</a>
      <a href="https://example.com/link2">Link 2</a>
      <p>More text here.</p>
    </body>
    </html>
  `;

  const result = extractor.extract(html);
  assert(result.title === 'Page Title', 'extractor: extract title');
  assert(result.description === 'Page description', 'extractor: extract description');
  assert(result.author === 'Test Author', 'extractor: extract author');
  assert(result.image === 'https://example.com/og.jpg', 'extractor: extract og:image');
  assert(result.links.length === 2, 'extractor: extract links');
  assert(result.text.includes('Main Heading'), 'extractor: extract text content');
}

async function testHealthMonitor() {
  console.log('\n💓 Health Monitor');
  const monitor = new HealthMonitor();

  monitor.recordSuccess('feed1', 200);
  monitor.recordSuccess('feed1', 300);
  monitor.recordFailure('feed1', 'timeout');

  const record = monitor.getRecord('feed1');
  assert(record !== null, 'health: get record exists');
  assert(record!.fetchCount === 3, 'health: tracks fetch count');
  assert(record!.successCount === 2, 'health: tracks success count');
  assert(record!.failCount === 1, 'health: tracks fail count');
  assert(record!.uptime > 0.6 && record!.uptime < 0.7, 'health: calculates uptime');
  assert(record!.avgResponseTime === 250, 'health: calculates avg response time');
  assert(record!.lastError === 'timeout', 'health: tracks last error');

  assert(monitor.isHealthy('feed1') === false, 'health: unhealthy feed detected');
  assert(monitor.isHealthy('feed2') === true, 'health: new feed considered healthy');
}

async function testTransformPipeline() {
  console.log('\n🔄 Transform Pipeline');
  const pipeline = new TransformPipeline();

  pipeline.addStep('truncate', truncateText(20));
  pipeline.addStep('tag', addTag('processed'));
  pipeline.addStep('prefix', prefixTitle('[TEST] '));

  const item: NormalizedItem = {
    title: 'Original Title',
    description: 'This is a very long description that should be truncated',
    content: '',
    author: '',
    published: '',
    updated: '',
    link: '',
    image: '',
    tags: [],
  };

  const result = await pipeline.process(item);
  assert(result.title === '[TEST] Original Title', 'transform: prefix title');
  assert(result.description.length <= 23, 'transform: truncate description');
  assert(result.tags.includes('processed'), 'transform: add tag');

  pipeline.disableStep('prefix');
  const result2 = await pipeline.process(item);
  assert(result2.title === 'Original Title', 'transform: disable step works');

  assert(pipeline.getSteps().length === 3, 'transform: lists all steps');
}

async function testCategoryManager() {
  console.log('\n🏷️  Category Manager');
  const manager = new CategoryManager();

  const cat1 = manager.createCategory('Tech', 'Technology feeds', '#ff0000');
  const cat2 = manager.createCategory('News', 'News feeds', '#0000ff');
  const subcat = manager.createCategory('AI', 'AI feeds', '#00ff00', cat1.id);

  assert(manager.getAllCategories().length === 3, 'category: creates categories');
  assert(manager.getCategory(cat1.id)?.name === 'Tech', 'category: gets category by id');
  assert(manager.getChildren(cat1.id).length === 1, 'category: gets children');
  assert(manager.getChildren(cat1.id)[0].name === 'AI', 'category: child is AI');

  manager.assignFeed('feed1', cat1.id);
  manager.assignFeed('feed1', cat2.id);
  assert(manager.getFeedCategories('feed1').length === 2, 'category: assigns feed to categories');
  assert(manager.getFeedsByCategory(cat1.id).includes('feed1'), 'category: gets feeds by category');

  manager.addTag('feed1', 'programming');
  manager.addTag('feed1', 'rust');
  manager.addTag('feed1', 'Programming');
  assert(manager.getFeedTags('feed1').length === 2, 'category: adds unique tags');
  assert(manager.getFeedsByTag('rust').includes('feed1'), 'category: gets feeds by tag');
  assert(manager.getAllTags().length === 2, 'category: lists all tags');

  manager.unassignFeed('feed1', cat2.id);
  assert(manager.getFeedCategories('feed1').length === 1, 'category: unassigns feed');
}

async function testWebhookManager() {
  console.log('\n🔔 Webhook Manager');
  const manager = new WebhookManager();

  const webhook = manager.add('feed1', 'https://example.com/webhook', ['new_item', 'feed_updated']);
  assert(webhook.id.length === 32, 'webhook: generates id');
  assert(webhook.secret.length === 64, 'webhook: generates secret');
  assert(webhook.enabled === true, 'webhook: enabled by default');

  assert(manager.getByFeed('feed1').length === 1, 'webhook: gets by feed');
  assert(manager.getAll().length === 1, 'webhook: gets all');

  const payload = '{"test":"data"}';
  const sig = manager.sign(webhook.secret, payload);
  assert(manager.verify(webhook.secret, payload, sig) === true, 'webhook: sign and verify');
  assert(manager.verify('wrong-secret', payload, sig) === false, 'webhook: verify rejects wrong secret');

  manager.updateStatus(webhook.id, 200);
  const updated = manager.getAll()[0];
  assert(updated.lastStatus === 200, 'webhook: updates status');

  manager.remove(webhook.id);
  assert(manager.getAll().length === 0, 'webhook: removes webhook');
}

async function testEnclosureHandler() {
  console.log('\n📎 Enclosure Handler');
  const handler = new EnclosureHandler();

  const enclosures = handler.parseFromItem({ image: 'https://example.com/photo.jpg' });
  assert(enclosures.length === 1, 'enclosure: parses image');
  assert(enclosures[0].type === 'image/jpeg', 'enclosure: detects media type');

  const enclosures2 = handler.parseFromItem({ image: 'https://example.com/podcast.mp3' });
  assert(enclosures2[0].type === 'audio/mpeg', 'enclosure: detects audio type');

  const enclosures3 = handler.parseFromItem({});
  assert(enclosures3.length === 0, 'enclosure: no image returns empty');
}

async function testDatabase() {
  console.log('\n🗄️  Database (SQLite)');
  const db = new SqliteDatabase(':memory:');
  await db.init();

  const feed: Feed = {
    id: 'feed-test',
    title: 'Test DB Feed',
    description: 'Description',
    link: 'https://example.com',
    image: '',
    language: 'en',
    format: 'rss',
    url: 'https://example.com/feed.xml',
    etag: 'etag123',
    lastModified: 'Mon, 01 Jan 2024',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  await db.saveFeed(feed);
  const retrieved = await db.getFeed('feed-test');
  assert(retrieved?.title === 'Test DB Feed', 'db: save and get feed');
  assert(retrieved?.etag === 'etag123', 'db: preserves etag');

  const byUrl = await db.getFeedByUrl('https://example.com/feed.xml');
  assert(byUrl?.id === 'feed-test', 'db: get feed by url');

  const allFeeds = await db.getAllFeeds();
  assert(allFeeds.length === 1, 'db: get all feeds');

  await db.updateFeedMeta('feed-test', { title: 'Updated Title', description: 'New desc' });
  const updated = await db.getFeed('feed-test');
  assert(updated?.title === 'Updated Title', 'db: update feed meta');
  assert(updated?.description === 'New desc', 'db: update feed meta description');

  await db.updateFeedEtag('feed-test', 'new-etag', 'Tue, 02 Jan 2024');
  const withEtag = await db.getFeed('feed-test');
  assert(withEtag?.etag === 'new-etag', 'db: update feed etag');

  const item = {
    id: 'item-test',
    title: 'Test Item',
    description: 'Item description',
    content: 'Full content',
    author: 'Author',
    published: '2024-01-01T00:00:00Z',
    updated: '',
    link: 'https://example.com/item1',
    image: '',
    tags: ['test', 'db'],
    guid: 'guid1',
    hash: 'abc123',
    feedId: 'feed-test',
    createdAt: '2024-01-01T00:00:00Z',
  };

  await db.saveItem(item);
  const retrievedItem = await db.getItem('item-test');
  assert(retrievedItem?.title === 'Test Item', 'db: save and get item');
  assert(retrievedItem?.tags?.includes('test') === true, 'db: preserves tags');

  const feedItems = await db.getItemsByFeed('feed-test');
  assert(feedItems.length === 1, 'db: get items by feed');

  const byGuid = await db.getItemByGuid('feed-test', 'guid1');
  assert(byGuid?.title === 'Test Item', 'db: get item by guid');

  const searchResult = await db.search({ query: 'Test' });
  assert(searchResult.items.length >= 1, 'db: full-text search works');
  assert(searchResult.total >= 1, 'db: search returns total count');

  const searchAuthor = await db.search({ author: 'Author' });
  assert(searchAuthor.items.length === 1, 'db: search by author');

  const count = await db.getItemCount('feed-test');
  assert(count === 1, 'db: item count');

  const feedCount = await db.getFeedCount();
  assert(feedCount === 1, 'db: feed count');

  await db.deleteItem('item-test');
  const deletedItem = await db.getItem('item-test');
  assert(deletedItem === null, 'db: delete item');

  await db.deleteFeed('feed-test');
  const deletedFeed = await db.getFeed('feed-test');
  assert(deletedFeed === null, 'db: delete feed cascades');

  await db.close();
}

async function testFetchEngine() {
  console.log('\n🌐 Fetch Engine');
  const detector = new FormatDetector();
  const fetcher = new FetchEngine(detector, { retries: 1, timeout: 10000 });

  try {
    const result = await fetcher.fetch({ url: 'https://feeds.bbci.co.uk/news/rss.xml', timeout: 10000 });
    assert(result.raw.length > 0, 'fetch: returns raw content');
    assert(result.format === 'rss', 'fetch: detects RSS format');
    assert(result.statusCode === 200, 'fetch: returns 200');

    const stats = fetcher.getStats();
    assert(stats.requestCount >= 1, 'fetch: tracks request count');
    assert(stats.successRate > 0, 'fetch: tracks success rate');
  } catch (e) {
    console.log('  ⚠️  fetch: network test skipped (no internet)');
  }
}

async function runAllTests() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║         NUREF ENGINE - FULL TEST SUITE       ║');
  console.log('╚══════════════════════════════════════════════╝');

  await testFormatDetector();
  await testParser();
  await testNormalizer();
  await testValidator();
  await testDuplicateDetector();
  await testXmlEngine();
  await testCache();
  await testFeedGenerator();
  await testRateLimiter();
  await testContentExtractor();
  await testHealthMonitor();
  await testTransformPipeline();
  await testCategoryManager();
  await testWebhookManager();
  await testEnclosureHandler();
  await testDatabase();
  await testFetchEngine();

  console.log('\n════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(console.error);
