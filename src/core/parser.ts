import { XMLParser } from 'fast-xml-parser';
import type { FeedFormat, Feed, FeedItem, NormalizedItem } from './types.js';

const xmlParserOptions: any = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
  isArray: () => false,
  textNodeName: '#text',
  processEntities: {
    enabled: true,
    maxTotalExpansions: 100000,
    maxExpandedLength: 1000000,
  },
  htmlEntities: true,
  stopNodes: ['*.pre', '*.script'],
};

function generateId(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function hashContent(str: string): string {
  let hash = 0;
  const prime = 31;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * prime + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash.toString(16).padStart(8, '0');
}

export class Parser {
  parse(raw: string, format: FeedFormat, feedUrl: string): { feed: Partial<Feed>; items: NormalizedItem[] } {
    switch (format) {
      case 'rss':
        return this.parseRss(raw, feedUrl);
      case 'atom':
        return this.parseAtom(raw, feedUrl);
      case 'rdf':
        return this.parseRdf(raw, feedUrl);
      case 'json_feed':
        return this.parseJsonFeed(raw, feedUrl);
      case 'sitemap':
        return this.parseSitemap(raw, feedUrl);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private parseRss(raw: string, feedUrl: string): { feed: Partial<Feed>; items: NormalizedItem[] } {
    const parser = new XMLParser(xmlParserOptions);
    const doc = parser.parse(raw);
    const channel = doc.rss?.channel || doc.channel;

    if (!channel) throw new Error('Invalid RSS: no channel found');

    const items = this.toArray(channel.item).map((item: any) => this.normalizeRssItem(item));

    return {
      feed: {
        title: this.getText(channel.title),
        description: this.getText(channel.description),
        link: this.getText(channel.link),
        language: this.getText(channel.language),
        image: this.getText(channel.image?.url),
        format: 'rss',
        url: feedUrl,
      },
      items,
    };
  }

  private parseAtom(raw: string, feedUrl: string): { feed: Partial<Feed>; items: NormalizedItem[] } {
    const parser = new XMLParser(xmlParserOptions);
    const doc = parser.parse(raw);
    const feed = doc.feed;

    if (!feed) throw new Error('Invalid Atom: no feed found');

    const entries = this.toArray(feed.entry).map((entry: any) => this.normalizeAtomEntry(entry));

    const logo = feed.logo || feed.icon || '';
    const link = this.getAtomLink(feed.link);

    return {
      feed: {
        title: this.getText(feed.title),
        description: this.getText(feed.subtitle),
        link: link || this.getText(feed.id),
        language: '',
        image: this.getText(logo),
        format: 'atom',
        url: feedUrl,
      },
      items: entries,
    };
  }

  private parseRdf(raw: string, feedUrl: string): { feed: Partial<Feed>; items: NormalizedItem[] } {
    const parser = new XMLParser(xmlParserOptions);
    const doc = parser.parse(raw);
    const rdf = doc['rdf:RDF'] || doc;

    const channel = rdf.channel || rdf['rdf:channel'];
    const items = this.toArray(rdf.item || rdf['rdf:item']).map((item: any) => this.normalizeRssItem(item));

    return {
      feed: {
        title: this.getText(channel?.title),
        description: this.getText(channel?.description),
        link: this.getText(channel?.link),
        language: '',
        image: '',
        format: 'rdf',
        url: feedUrl,
      },
      items,
    };
  }

  private parseJsonFeed(raw: string, feedUrl: string): { feed: Partial<Feed>; items: NormalizedItem[] } {
    const doc = JSON.parse(raw);

    const items = this.toArray(doc.items).map((item: any) => ({
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

    return {
      feed: {
        title: doc.title || '',
        description: doc.description || '',
        link: doc.home_page_url || doc.feed_url || '',
        language: '',
        image: doc.favicon || '',
        format: 'json_feed',
        url: feedUrl,
      },
      items,
    };
  }

  private parseSitemap(raw: string, feedUrl: string): { feed: Partial<Feed>; items: NormalizedItem[] } {
    const parser = new XMLParser(xmlParserOptions);
    const doc = parser.parse(raw);
    const urlset = doc.urlset;

    if (!urlset) throw new Error('Invalid Sitemap: no urlset found');

    const items = this.toArray(urlset.url).map((url: any) => ({
      title: this.getText(url.loc),
      description: '',
      content: '',
      author: '',
      published: this.getText(url.lastmod) || '',
      updated: this.getText(url.lastmod) || '',
      link: this.getText(url.loc),
      image: '',
      tags: [],
    }));

    return {
      feed: {
        title: feedUrl,
        description: 'XML Sitemap',
        link: feedUrl,
        language: '',
        image: '',
        format: 'sitemap',
        url: feedUrl,
      },
      items,
    };
  }

  private normalizeRssItem(item: any): NormalizedItem {
    return {
      title: this.getText(item.title),
      description: this.getText(item.description),
      content: this.getText(item['content:encoded'] || item.description),
      author: this.getText(item['dc:creator'] || item.author),
      published: this.getText(item.pubDate),
      updated: '',
      link: this.getText(item.link),
      image: this.extractRssImage(item),
      tags: this.extractRssTags(item),
    };
  }

  private normalizeAtomEntry(entry: any): NormalizedItem {
    const link = this.getAtomLink(entry.link);

    return {
      title: this.getText(entry.title),
      description: this.getText(entry.summary),
      content: this.getText(entry.content),
      author: this.getText(entry.author?.name),
      published: this.getText(entry.published),
      updated: this.getText(entry.updated),
      link: link || '',
      image: this.getText(entry['media:thumbnail']?.['@_url']),
      tags: this.toArray(entry.category).map((c: any) => c['@_term'] || this.getText(c)),
    };
  }

  private extractRssImage(item: any): string {
    if (item['media:content']?.['@_url']) return item['media:content']['@_url'];
    if (item.enclosure?.['@_url']) return item.enclosure['@_url'];
    if (item['media:thumbnail']?.['@_url']) return item['media:thumbnail']['@_url'];
    return '';
  }

  private extractRssTags(item: any): string[] {
    const tags: string[] = [];
    if (item.category) {
      const cats = this.toArray(item.category);
      for (const cat of cats) {
        if (typeof cat === 'string') tags.push(cat);
        else if (cat['#text']) tags.push(cat['#text']);
      }
    }
    return tags;
  }

  private getAtomLink(link: any): string {
    if (!link) return '';
    if (typeof link === 'string') return link;
    if (Array.isArray(link)) {
      const alt = link.find((l: any) => l['@_rel'] === 'alternate' || !l['@_rel']);
      return alt?.['@_href'] || '';
    }
    return link['@_href'] || '';
  }

  private getText(value: any): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object' && value['#text']) return String(value['#text']).trim();
    return '';
  }

  private toArray(value: any): any[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [value];
  }
}
