import type { NormalizedItem, Feed } from './types.js';

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&apos;': "'", '&nbsp;': ' ', '&#39;': "'", '&#x27;': "'",
};

function decodeEntities(s: string): string {
  if (!s || !s.includes('&')) return s;
  let r = s;
  for (const [e, c] of Object.entries(ENTITY_MAP)) {
    if (r.includes(e)) r = r.replaceAll(e, c);
  }
  return r.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`);
  const m = xml.match(re);
  return m ? decodeEntities(m[1].trim()) : '';
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']*)["']`);
  const m = xml.match(re);
  return m ? decodeEntities(m[1]) : '';
}

export interface FastParseResult {
  feed: Partial<Feed>;
  items: NormalizedItem[];
  format: 'rss' | 'atom' | 'json_feed' | 'sitemap' | 'unknown';
  parseTimeMs: number;
}

export function fastParseRss(xml: string, url: string): FastParseResult {
  const start = performance.now();

  const channelMatch = xml.match(/<channel>([\s\S]*?)<\/channel>/);
  const channel = channelMatch ? channelMatch[1] : xml;

  const feed: Partial<Feed> = {
    title: extractTag(channel, 'title'),
    description: extractTag(channel, 'description'),
    link: extractTag(channel, 'link'),
    language: extractTag(channel, 'language'),
    format: 'rss',
    url,
  };

  const imageTag = channel.match(/<image>([\s\S]*?)<\/image>/);
  if (imageTag) {
    feed.image = extractTag(imageTag[1], 'url');
  }

  const items: NormalizedItem[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title: extractTag(block, 'title'),
      description: extractTag(block, 'description'),
      content: extractTag(block, 'content:encoded') || extractTag(block, 'description'),
      author: extractTag(block, 'dc:creator') || extractTag(block, 'author'),
      published: extractTag(block, 'pubDate'),
      updated: '',
      link: extractTag(block, 'link'),
      image: extractAttr(block, 'enclosure', 'url') || extractAttr(block, 'media:content', 'url') || '',
      tags: extractCategories(block),
    });
  }

  return { feed, items, format: 'rss', parseTimeMs: performance.now() - start };
}

export function fastParseAtom(xml: string, url: string): FastParseResult {
  const start = performance.now();

  const feedMatch = xml.match(/<feed[\s\S]*?>([\s\S]*?)<\/feed>/);
  const feedXml = feedMatch ? feedMatch[1] : xml;

  const feed: Partial<Feed> = {
    title: extractTag(feedXml, 'title'),
    description: extractTag(feedXml, 'subtitle'),
    link: extractAtomLink(feedXml),
    format: 'atom',
    url,
  };

  const logoTag = feedXml.match(/<(?:media:)?logo[^>]*>([\s\S]*?)<\//);
  if (logoTag) feed.image = decodeEntities(logoTag[1].trim());

  const items: NormalizedItem[] = [];
  const entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title: extractTag(block, 'title'),
      description: extractTag(block, 'summary'),
      content: extractTag(block, 'content'),
      author: extractTag(block, 'name') || extractTag(block, 'author'),
      published: extractTag(block, 'published'),
      updated: extractTag(block, 'updated'),
      link: extractAtomLink(block),
      image: extractAttr(block, 'media:thumbnail', 'url') || '',
      tags: extractAtomCategories(block),
    });
  }

  return { feed, items, format: 'atom', parseTimeMs: performance.now() - start };
}

export function fastParseJsonFeed(json: string, url: string): FastParseResult {
  const start = performance.now();

  const doc = JSON.parse(json);
  const feed: Partial<Feed> = {
    title: doc.title || '',
    description: doc.description || '',
    link: doc.home_page_url || doc.feed_url || '',
    image: doc.favicon || '',
    format: 'json_feed',
    url,
  };

  const items: NormalizedItem[] = (doc.items || []).map((item: any) => ({
    title: item.title || '',
    description: item.summary || '',
    content: item.content_html || item.content_text || '',
    author: typeof item.author === 'object' ? item.author.name : (item.author || ''),
    published: item.date_published || '',
    updated: item.date_modified || '',
    link: item.url || '',
    image: item.banner_image || item.image || '',
    tags: item.tags || [],
  }));

  return { feed, items, format: 'json_feed', parseTimeMs: performance.now() - start };
}

function extractCategories(xml: string): string[] {
  const tags: string[] = [];
  const re = /<category[^>]*>([^<]+)<\/category>/g;
  let m;
  while ((m = re.exec(xml)) !== null) tags.push(decodeEntities(m[1].trim()));
  return tags;
}

function extractAtomCategories(xml: string): string[] {
  const tags: string[] = [];
  const re = /<category[^>]*term=["']([^"']*)["']/g;
  let m;
  while ((m = re.exec(xml)) !== null) tags.push(decodeEntities(m[1]));
  return tags;
}

function extractAtomLink(xml: string): string {
  const re = /<link[^>]*href=["']([^"']*)["'][^>]*(?:rel=["']alternate["'])?/;
  const m = xml.match(re);
  if (m) return m[1];
  const re2 = /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']*)["']/;
  const m2 = xml.match(re2);
  return m2 ? m2[1] : '';
}
