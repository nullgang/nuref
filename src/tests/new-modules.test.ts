import { extractFromNamespaces, getRegisteredNamespaces } from '../core/namespace.js';
import { resolveRelativeUrl, extractBaseUrl, isAbsoluteUrl, normalizeUrl } from '../core/url-resolver.js';
import { parseDate, formatDate, isRecent, sortByDate } from '../core/date-parser.js';
import { LRUCache } from '../core/lru-cache.js';
import { CircuitBreaker } from '../core/circuit-breaker.js';
import { FeedIntegrity } from '../core/integrity.js';
import { categorizeItem, getAvailableCategories } from '../core/auto-categorize.js';
import { detectLanguage } from '../core/language-detect.js';
import { estimateReadTime, estimateItemReadTime } from '../core/read-time.js';
import { CrossFeedDedup } from '../core/cross-feed-dedup.js';
import { exportOpml, parseOpml } from '../core/opml.js';
import { renderMarkdown } from '../core/markdown.js';
import { renderHtml } from '../core/html-generator.js';
import { getAdapter } from '../core/webhook-formats.js';
import type { NormalizedItem, Feed, FeedItem } from '../core/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}`); failed++; }
}

const sampleItem: NormalizedItem = {
  title: 'Test Article About Programming',
  description: 'This article discusses software engineering best practices and coding standards.',
  content: 'Full content about programming and technology.',
  author: 'John Developer',
  published: '2024-06-15T10:00:00Z',
  updated: '',
  link: 'https://example.com/article1',
  image: 'https://example.com/image.jpg',
  tags: ['programming', 'technology'],
};

const sampleFeed: Feed = {
  id: 'test-feed',
  title: 'Test Feed',
  description: 'A test feed for unit testing',
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

const sampleFeedItem: FeedItem = {
  id: 'item1', title: 'Test Article', description: 'Description', content: 'Content', author: 'Author',
  published: '2024-01-01T00:00:00Z', updated: '', link: 'https://example.com/1', image: '',
  tags: ['test'], guid: 'guid1', hash: 'abc', feedId: 'test-feed', createdAt: '',
};

function testNamespace() {
  console.log('\n🏷️  Namespace Handler');
  const ns = getRegisteredNamespaces();
  assert(ns.length >= 6, `registered ${ns.length} namespaces`);

  const item = {
    'media:content': { '@_url': 'https://example.com/media.jpg' },
    'itunes:author': 'Podcast Host',
    'content:encoded': '<p>Full HTML content</p>',
    'dc:creator': 'Article Author',
    'media:keywords': 'tech,programming',
  };

  const extracted = extractFromNamespaces(item);
  assert(extracted.image === 'https://example.com/media.jpg', 'extract media:image');
  assert(extracted.author === 'Podcast Host', 'extract itunes:author (priority over dc)');
  assert(extracted.content === '<p>Full HTML content</p>', 'extract content:encoded');
}

function testUrlResolver() {
  console.log('\n🔗 URL Resolver');
  assert(resolveRelativeUrl('https://example.com/feed', '/page1') === 'https://example.com/page1', 'resolve absolute path');
  assert(resolveRelativeUrl('https://example.com/blog/feed', '../page1') === 'https://example.com/page1', 'resolve relative path');
  assert(resolveRelativeUrl('https://example.com/feed', 'https://other.com/page') === 'https://other.com/page', 'keep absolute URL');
  assert(resolveRelativeUrl('https://example.com/feed', '//cdn.example.com/img.jpg') === 'https://cdn.example.com/img.jpg', 'resolve protocol-relative');
  assert(extractBaseUrl('https://example.com/path/page') === 'https://example.com', 'extract base URL');
  assert(isAbsoluteUrl('https://example.com') === true, 'detect absolute URL');
  assert(isAbsoluteUrl('/path') === false, 'detect relative URL');
  assert(normalizeUrl('https://example.com/page/') === 'https://example.com/page', 'normalize trailing slash');
}

function testDateParser() {
  console.log('\n📅 Date Parser');
  assert(parseDate('2024-06-15T10:00:00Z') === '2024-06-15T10:00:00.000Z', 'parse ISO date');
  assert(parseDate('Mon, 01 Jan 2024 12:00:00 GMT') !== 'Mon, 01 Jan 2024 12:00:00 GMT', 'parse RFC 2822 date');
  assert(parseDate('') === '', 'handle empty date');
  assert(formatDate('2024-06-15T10:00:00Z', 'iso') === '2024-06-15T10:00:00.000Z', 'format ISO');
  assert(formatDate('2024-06-15T10:00:00Z', 'unix') === '1718445600', 'format Unix');
  assert(isRecent(new Date().toISOString(), 60000) === true, 'detect recent date');
  assert(isRecent('2020-01-01T00:00:00Z', 60000) === false, 'detect old date');

  const sorted = sortByDate([
    { published: '2024-01-01T00:00:00Z' },
    { published: '2024-06-15T00:00:00Z' },
    { published: '2024-03-01T00:00:00Z' },
  ]);
  assert(sorted[0].published === '2024-06-15T00:00:00Z', 'sort by date descending');
}

function testLRUCache() {
  console.log('\n📦 LRU Cache');
  const cache = new LRUCache<string>({ maxSize: 3, defaultTtlMs: 60000 });

  cache.set('a', '1');
  cache.set('b', '2');
  cache.set('c', '3');
  assert(cache.get('a') === '1', 'get existing key');
  assert(cache.size === 3, 'tracks size');

  cache.set('d', '4');
  assert(cache.size === 3, 'evicts oldest when full');
  assert(cache.get('b') === null, 'evicted key returns null');

  assert(cache.has('a') === true, 'has returns true');
  assert(cache.has('z') === false, 'has returns false');

  cache.delete('a');
  assert(cache.get('a') === null, 'delete removes key');

  cache.clear();
  assert(cache.size === 0, 'clear empties cache');

  const removed = cache.cleanup();
  assert(typeof removed === 'number', 'cleanup returns count');
}

function testCircuitBreaker() {
  console.log('\n⚡ Circuit Breaker');
  const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 100 });

  assert(breaker.getState('test') === 'closed', 'starts closed');

  breaker.onFailure('test');
  breaker.onFailure('test');
  breaker.onFailure('test');
  assert(breaker.getState('test') === 'open', 'opens after threshold');

  breaker.reset('test');
  assert(breaker.getState('test') === 'closed', 'reset works');

  breaker.onSuccess('test');
  assert(breaker.getState('test') === 'closed', 'success keeps closed');
}

function testFeedIntegrity() {
  console.log('\n🔒 Feed Integrity');
  const integrity = new FeedIntegrity();

  const fp = integrity.createFingerprint('feed1', '<rss>content</rss>', ['item1', 'item2']);
  assert(fp.feedId === 'feed1', 'creates fingerprint');
  assert(fp.tamperDetected === false, 'no tamper initially');

  const verify1 = integrity.verify('feed1', '<rss>content</rss>', ['item1', 'item2']);
  assert(verify1.tampered === false, 'no tamper with same content');

  const verify2 = integrity.verify('feed1', '<rss>changed</rss>', ['item1', 'item2', 'item3']);
  assert(verify2.tampered === true, 'detects content tamper');
  assert(verify2.details.some(d => d.includes('Content hash')), 'reports content hash mismatch');
  assert(verify2.details.some(d => d.includes('New item')), 'reports new item');

  assert(integrity.getFingerprint('feed1') !== null, 'gets fingerprint');
  assert(integrity.getAll().length === 1, 'lists all fingerprints');

  integrity.remove('feed1');
  assert(integrity.getFingerprint('feed1') === null, 'removes fingerprint');
}

function testAutoCategorize() {
  console.log('\n🤖 Auto Categorize');
  const techItem: NormalizedItem = { ...sampleItem, title: 'JavaScript Programming Guide', tags: ['javascript', 'coding'] };
  const cats = categorizeItem(techItem);
  assert(cats.includes('technology'), 'categorizes tech article');
  assert(cats.length <= 3, 'returns max 3 categories');

  const scienceItem: NormalizedItem = { ...sampleItem, title: 'Quantum Physics Research Study', tags: ['physics', 'research'] };
  const sciCats = categorizeItem(scienceItem);
  assert(sciCats.includes('science'), 'categorizes science article');

  assert(getAvailableCategories().length >= 10, 'has many categories');
}

function testLanguageDetect() {
  console.log('\n🌐 Language Detect');
  const en = detectLanguage('The quick brown fox jumps over the lazy dog. This is a test of the English language detection system.');
  assert(en.language === 'en', 'detects English');

  const es = detectLanguage('El rápido zorro marrón salta sobre el perro perezoso. Esto es una prueba del sistema de detección de idioma español.');
  assert(es.language === 'es', 'detects Spanish');

  const empty = detectLanguage('');
  assert(empty.language === 'unknown', 'unknown for empty text');
}

function testReadTime() {
  console.log('\n⏱️  Read Time');
  const shortText = 'This is a short text.';
  const result1 = estimateReadTime(shortText);
  assert(result1.minutes >= 1, 'short text takes at least 1 min');
  assert(result1.words === 5, 'counts words');
  assert(result1.formatted.includes('min'), 'formats correctly');

  const longText = 'word '.repeat(500);
  const result2 = estimateReadTime(longText);
  assert(result2.minutes === 3, '500 words at 238wpm = ~3 min');

  const itemResult = estimateItemReadTime(sampleItem);
  assert(itemResult.minutes >= 1, 'item read time at least 1 min');
}

function testCrossFeedDedup() {
  console.log('\n🔀 Cross-Feed Dedup');
  const dedup = new CrossFeedDedup();

  const item1: FeedItem = { ...sampleFeedItem, id: '1', link: 'https://example.com/article', title: 'Same Article' };
  const item2: FeedItem = { ...sampleFeedItem, id: '2', link: 'https://example.com/article', title: 'Same Article (copy)' };
  const item3: FeedItem = { ...sampleFeedItem, id: '3', link: 'https://other.com/unique', title: 'Unique Article' };

  dedup.indexItems([item1, item2, item3]);

  const dups = dedup.findDuplicates(item1);
  assert(dups.length > 0, 'finds duplicates');
  assert(dups.some(d => d.matchType === 'exact_url'), 'detects URL match');

  const allDups = dedup.findAllDuplicates();
  assert(allDups.length > 0, 'finds all duplicates');

  const stats = dedup.getStats();
  assert(stats.indexedUrls > 0, 'tracks indexed URLs');
}

function testOpml() {
  console.log('\n📑 OPML');
  const opml = exportOpml([sampleFeed]);
  assert(opml.includes('<?xml'), 'exports OPML with XML header');
  assert(opml.includes('Test Feed'), 'exports feed title');
  assert(opml.includes('https://example.com/feed.xml'), 'exports feed URL');

  const parsed = parseOpml(opml);
  assert(parsed.title === 'Nuref Feed Export', 'parses OPML title');
  assert(parsed.feeds.length === 1, 'parses one feed');
  assert(parsed.feeds[0].url === 'https://example.com/feed.xml', 'parses feed URL');
}

function testMarkdown() {
  console.log('\n📝 Markdown Renderer');
  const md = renderMarkdown(sampleFeed, [sampleFeedItem]);
  assert(md.includes('# Test Feed'), 'renders feed title');
  assert(md.includes('Test Article'), 'renders item title');
  assert(md.includes('Read more'), 'renders read more link');
  assert(md.includes('test'), 'renders tags');
}

function testHtmlGenerator() {
  console.log('\n🌐 HTML Generator');
  const html = renderHtml(sampleFeed, [sampleFeedItem]);
  assert(html.includes('<!DOCTYPE html>'), 'renders valid HTML');
  assert(html.includes('Test Feed'), 'renders feed title');
  assert(html.includes('Test Article'), 'renders item title');
  assert(html.includes('https://example.com/1'), 'renders item link');
}

function testWebhookFormats() {
  console.log('\n📨 Webhook Formats');
  const telegram = getAdapter('telegram');
  const tgMsg = telegram.formatItem(sampleFeedItem, 'Test Feed');
  assert(typeof tgMsg.text === 'string', 'telegram: formats message');
  assert(tgMsg.parse_mode === 'Markdown', 'telegram: sets parse mode');

  const discord = getAdapter('discord');
  const dcMsg = discord.formatItem(sampleFeedItem, 'Test Feed');
  assert(dcMsg.embeds.length === 1, 'discord: creates embed');
  assert(dcMsg.embeds[0].title === 'Test Article', 'discord: embed has title');

  const slack = getAdapter('slack');
  const slMsg = slack.formatItem(sampleFeedItem, 'Test Feed');
  assert(slMsg.blocks.length >= 2, 'slack: creates blocks');
}

function runAllTests() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║    NUREF ENGINE - NEW MODULES TEST SUITE     ║');
  console.log('╚══════════════════════════════════════════════╝');

  testNamespace();
  testUrlResolver();
  testDateParser();
  testLRUCache();
  testCircuitBreaker();
  testFeedIntegrity();
  testAutoCategorize();
  testLanguageDetect();
  testReadTime();
  testCrossFeedDedup();
  testOpml();
  testMarkdown();
  testHtmlGenerator();
  testWebhookFormats();

  console.log('\n════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests();
