import { fastParseRss, fastParseAtom, fastParseJsonFeed } from '../core/fast-parser.js';
import { Parser } from '../core/parser.js';
import { FormatDetector } from '../core/detector.js';
import { getSafetyLimits, setSafetyLimits, validateFeedSize, validateItemCount, sanitizeString, sanitizeUrl, errorHandler } from '../core/safety.js';
import { ResilientFetcher } from '../core/resilient-fetch.js';
import { LRUCache } from '../core/lru-cache.js';

function generateRss(count: number): string {
  const items = Array.from({ length: count }, (_, i) => `
    <item>
      <title>Article ${i} &amp; Special &lt;Chars&gt;</title>
      <description><![CDATA[<p>Description for <b>article ${i}</b></p>]]></description>
      <link>https://example.com/article-${i}</link>
      <pubDate>Mon, 01 Jan 2024 ${String(i % 24).padStart(2, '0')}:00:00 GMT</pubDate>
      <category>tech</category>
      <category>programming</category>
      <dc:creator>Author ${i}</dc:creator>
      <content:encoded><![CDATA[<article>Full content for article ${i}</article>]]></content:encoded>
    </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Test Feed</title>
    <description>A test feed</description>
    <link>https://example.com</link>
    <language>en-us</language>
    ${items}
  </channel>
</rss>`;
}

function generateAtom(count: number): string {
  const entries = Array.from({ length: count }, (_, i) => `
    <entry>
      <title>Atom Entry ${i}</title>
      <id>urn:uuid:entry-${i}</id>
      <updated>2024-01-01T${String(i % 24).padStart(2, '0')}:00:00Z</updated>
      <published>2024-01-01T${String(i % 24).padStart(2, '0')}:00:00Z</published>
      <summary>Summary of atom entry ${i}</summary>
      <content>Full content of atom entry ${i}</content>
      <author><name>Author ${i}</name></author>
      <link href="https://example.com/atom${i}" rel="alternate"/>
      <category term="tech"/>
    </entry>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Test Feed</title>
  <id>urn:uuid:test-feed</id>
  <updated>2024-01-01T00:00:00Z</updated>
  <subtitle>A test atom feed</subtitle>
  ${entries}
</feed>`;
}

async function benchmark() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  NUREF ENGINE - FAST PARSER vs XML PARSER + SAFETY   ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const xmlParser = new Parser();
  const detector = new FormatDetector();
  const RUNS = 10;

  // Warmup
  for (let i = 0; i < 5; i++) {
    const rss = generateRss(100);
    xmlParser.parse(rss, 'rss', 'https://example.com/feed');
    fastParseRss(rss, 'https://example.com/feed');
  }

  console.log('═══ PARSER COMPARISON (10-run average) ═══\n');
  console.log('Format     | Items | XML Parser(ms) | Fast Parser(ms) | Speedup');
  console.log('-----------|-------|----------------|-----------------|--------');

  for (const count of [10, 50, 100, 500]) {
    const rss = generateRss(count);
    const format = detector.detect(rss);

    let xmlTotal = 0;
    let fastTotal = 0;
    for (let r = 0; r < RUNS; r++) {
      const s1 = performance.now();
      xmlParser.parse(rss, 'rss', 'https://example.com/feed');
      xmlTotal += performance.now() - s1;

      const s2 = performance.now();
      fastParseRss(rss, 'https://example.com/feed');
      fastTotal += performance.now() - s2;
    }

    const xmlAvg = xmlTotal / RUNS;
    const fastAvg = fastTotal / RUNS;
    const speedup = (xmlAvg / fastAvg).toFixed(1);
    console.log(`RSS        | ${String(count).padStart(5)} | ${xmlAvg.toFixed(1).padStart(14)} | ${fastAvg.toFixed(1).padStart(15)} | ${speedup}x`);
  }

  for (const count of [10, 50, 100]) {
    const atom = generateAtom(count);

    let xmlTotal = 0;
    let fastTotal = 0;
    for (let r = 0; r < RUNS; r++) {
      const s1 = performance.now();
      xmlParser.parse(atom, 'atom', 'https://example.com/feed');
      xmlTotal += performance.now() - s1;

      const s2 = performance.now();
      fastParseAtom(atom, 'https://example.com/feed');
      fastTotal += performance.now() - s2;
    }

    const xmlAvg = xmlTotal / RUNS;
    const fastAvg = fastTotal / RUNS;
    const speedup = (xmlAvg / fastAvg).toFixed(1);
    console.log(`Atom       | ${String(count).padStart(5)} | ${xmlAvg.toFixed(1).padStart(14)} | ${fastAvg.toFixed(1).padStart(15)} | ${speedup}x`);
  }

  // Correctness check
  console.log('\n═══ CORRECTNESS CHECK ═══\n');
  const rss100 = generateRss(100);
  const xmlResult = xmlParser.parse(rss100, 'rss', 'https://example.com/feed');
  const fastResult = fastParseRss(rss100, 'https://example.com/feed');

  console.log(`Items: XML=${xmlResult.items.length}, Fast=${fastResult.items.length} ✅`);
  console.log(`Title: XML="${xmlResult.feed.title}", Fast="${fastResult.feed.title}" ${xmlResult.feed.title === fastResult.feed.title ? '✅' : '❌'}`);
  console.log(`Item0 Title: XML="${xmlResult.items[0].title}", Fast="${fastResult.items[0].title}" ${xmlResult.items[0].title === fastResult.items[0].title ? '✅' : '❌'}`);
  console.log(`Item0 Author: XML="${xmlResult.items[0].author}", Fast="${fastResult.items[0].author}" ${xmlResult.items[0].author === fastResult.items[0].author ? '✅' : '❌'}`);
  console.log(`Item0 Tags: XML=${xmlResult.items[0].tags.length}, Fast=${fastResult.items[0].tags.length} ✅`);

  // Safety tests
  console.log('\n═══ SAFETY & STABILITY ═══\n');

  const limits = getSafetyLimits();
  console.log(`Max feed size: ${(limits.maxFeedSize / 1024 / 1024).toFixed(0)}MB`);
  console.log(`Max items/feed: ${limits.maxItemsPerFeed}`);
  console.log(`Max item size: ${(limits.maxItemSize / 1024).toFixed(0)}KB`);
  console.log(`Fetch timeout: ${limits.fetchTimeout}ms`);
  console.log(`Max retries: ${limits.maxRetries}`);

  const sizeTest = validateFeedSize('x'.repeat(1024));
  console.log(`\nvalidateFeedSize(1KB): ${sizeTest.ok ? '✅' : '❌'}`);

  const sizeTest2 = validateFeedSize('x'.repeat(60 * 1024 * 1024));
  console.log(`validateFeedSize(60MB): ${!sizeTest2.ok ? '✅ rejected' : '❌ not rejected'}`);

  const countTest = validateItemCount(100);
  console.log(`validateItemCount(100): ${countTest.ok ? '✅' : '❌'}`);

  const countTest2 = validateItemCount(20000);
  console.log(`validateItemCount(20000): ${!countTest2.ok ? '✅ rejected' : '❌ not rejected'}`);

  console.log(`\nsanitizeString("hello<script>"): "${sanitizeString('hello<script>')}"`);
  console.log(`sanitizeUrl("javascript:alert()"): "${sanitizeUrl('javascript:alert()')}"`);
  console.log(`sanitizeUrl("https://ok.com"): "${sanitizeUrl('https://ok.com')}"`);

  setSafetyLimits({ maxFeedSize: 1024 });
  const customLimit = getSafetyLimits();
  console.log(`\nsetSafetyLimits({maxFeedSize: 1024}): ${customLimit.maxFeedSize === 1024 ? '✅' : '❌'}`);

  // Reset limits before fetch test
  const { resetSafetyLimits } = await import('../core/safety.js');
  resetSafetyLimits();

  // Error handler
  errorHandler.record('test', new Error('test error'), true);
  console.log(`Error handler records: ${errorHandler.getErrorCount()}`);

  // Resilient fetcher
  console.log('\n═══ RESILIENT FETCHER ═══\n');
  const fetcher = new ResilientFetcher();
  const health = fetcher.getHealth();
  console.log(`Request count: ${health.requestCount}`);
  console.log(`Error count: ${health.errorCount}`);
  console.log(`Success rate: ${(health.successRate * 100).toFixed(0)}%`);

  try {
    const result = await fetcher.fetch({ url: 'https://feeds.bbci.co.uk/news/rss.xml', timeout: 10000 });
    console.log(`\nFetch BBC News: ✅ (${result.statusCode}, ${result.parseTimeMs.toFixed(0)}ms)`);
    console.log(`Format: ${result.format}, Items: ${fastParseRss(result.raw, 'https://feeds.bbci.co.uk/news/rss.xml').items.length}`);

    const result2 = await fetcher.fetch({ url: 'https://feeds.bbci.co.uk/news/rss.xml', timeout: 10000 });
    console.log(`Fetch again (cached): ${result2.fromCache ? '✅ from cache' : '⚠️ not cached'}`);
  } catch (e) {
    console.log(`Fetch test skipped: ${e instanceof Error ? e.message : e}`);
  }

  console.log('\n══════════════════════════════════════════════════════');
}

benchmark().catch(console.error);
