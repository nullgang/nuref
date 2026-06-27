import type { FeedFormat } from './types.js';

export class FormatDetector {
  detect(raw: string): FeedFormat {
    const trimmed = raw.trim();

    if (trimmed.startsWith('{')) {
      return this.detectJson(trimmed);
    }

    return this.detectXml(trimmed);
  }

  private detectJson(raw: string): FeedFormat {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.version && parsed.items) return 'json_feed';
      if (parsed.feed_url || parsed.items) return 'json_feed';
    } catch {}
    return 'unknown';
  }

  private detectXml(raw: string): FeedFormat {
    if (raw.includes('<rss') && raw.includes('<channel>')) return 'rss';
    if (raw.includes('<feed') && raw.includes('xmlns="http://www.w3.org/2005/Atom"')) return 'atom';
    if (raw.includes('<rdf:RDF') || (raw.includes('<rdf:') && raw.includes('xmlns:rss'))) return 'rdf';
    if (raw.includes('<urlset') && raw.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/')) return 'sitemap';
    if (raw.includes('<channel>') && !raw.includes('xmlns=')) return 'rss';

    return 'unknown';
  }
}
