import type { Feed, FeedItem } from '../core/types.js';

export class FeedGenerator {
  rss(feed: Feed, items: FeedItem[]): string {
    const itemsXml = items.map(item => `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <description><![CDATA[${item.description}]]></description>
      <link>${this.escapeXml(item.link)}</link>
      <guid isPermaLink="false">${this.escapeXml(item.guid || item.id)}</guid>
      <pubDate>${this.toRssDate(item.published)}</pubDate>
      ${item.author ? `<dc:creator><![CDATA[${item.author}]]></dc:creator>` : ''}
      ${item.tags.map(tag => `<category><![CDATA[${tag}]]></category>`).join('\n      ')}
      ${item.image ? `<enclosure url="${this.escapeXml(item.image)}" type="image/jpeg" length="0"/>` : ''}
    </item>`).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title><![CDATA[${feed.title}]]></title>
    <description><![CDATA[${feed.description}]]></description>
    <link>${this.escapeXml(feed.link)}</link>
    <language>${this.escapeXml(feed.language || 'en')}</language>
    <lastBuildDate>${this.toRssDate(feed.updatedAt)}</lastBuildDate>
    <generator>nuref</generator>
    ${itemsXml}
  </channel>
</rss>`;
  }

  atom(feed: Feed, items: FeedItem[]): string {
    const entriesXml = items.map(item => `
  <entry>
    <title><![CDATA[${item.title}]]></title>
    <link href="${this.escapeXml(item.link)}" rel="alternate"/>
    <id>${this.escapeXml(item.guid || item.id)}</id>
    <updated>${this.toAtomDate(item.updated || item.published)}</updated>
    <published>${this.toAtomDate(item.published)}</published>
    ${item.author ? `<author><name><![CDATA[${item.author}]]></name></author>` : ''}
    <summary><![CDATA[${item.description}]]></summary>
    <content type="html"><![CDATA[${item.content || item.description}]]></content>
    ${item.tags.map(tag => `<category term="${this.escapeXml(tag)}"/>`).join('\n    ')}
  </entry>`).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title><![CDATA[${feed.title}]]></title>
  <link href="${this.escapeXml(feed.link)}" rel="alternate"/>
  <link href="${this.escapeXml(feed.url)}" rel="self"/>
  <id>${this.escapeXml(feed.id)}</id>
  <updated>${this.toAtomDate(feed.updatedAt)}</updated>
  ${feed.description ? `<subtitle><![CDATA[${feed.description}]]></subtitle>` : ''}
  <generator>nuref</generator>
  ${entriesXml}
</feed>`;
  }

  jsonFeed(feed: Feed, items: FeedItem[]): string {
    const jsonItems = items.map(item => ({
      id: item.guid || item.id,
      title: item.title,
      summary: item.description,
      content_html: item.content || item.description,
      url: item.link,
      date_published: item.published,
      date_modified: item.updated || item.published,
      author: item.author ? { name: item.author } : undefined,
      tags: item.tags.length > 0 ? item.tags : undefined,
      image: item.image || undefined,
    }));

    const doc = {
      version: 'https://jsonfeed.org/version/1.1',
      title: feed.title,
      description: feed.description,
      home_page_url: feed.link,
      feed_url: feed.url,
      favicon: feed.image || undefined,
      items: jsonItems,
    };

    return JSON.stringify(doc, null, 2);
  }

  sitemap(feed: Feed, items: FeedItem[]): string {
    const urlsXml = items.map(item => `
  <url>
    <loc>${this.escapeXml(item.link)}</loc>
    ${item.published ? `<lastmod>${this.toSitemapDate(item.published)}</lastmod>` : ''}
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${this.escapeXml(feed.link)}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  ${urlsXml}
</urlset>`;
  }

  generate(feed: Feed, items: FeedItem[], format: 'rss' | 'atom' | 'json_feed' | 'sitemap'): string {
    switch (format) {
      case 'rss': return this.rss(feed, items);
      case 'atom': return this.atom(feed, items);
      case 'json_feed': return this.jsonFeed(feed, items);
      case 'sitemap': return this.sitemap(feed, items);
      default: throw new Error(`Unsupported output format: ${format}`);
    }
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private toRssDate(dateStr: string): string {
    if (!dateStr) return new Date().toUTCString();
    try {
      return new Date(dateStr).toUTCString();
    } catch {
      return dateStr;
    }
  }

  private toAtomDate(dateStr: string): string {
    if (!dateStr) return new Date().toISOString();
    try {
      return new Date(dateStr).toISOString();
    } catch {
      return dateStr;
    }
  }

  private toSitemapDate(dateStr: string): string {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    try {
      return new Date(dateStr).toISOString().split('T')[0];
    } catch {
      return dateStr;
    }
  }
}
