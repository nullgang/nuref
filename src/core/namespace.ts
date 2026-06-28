import type { NormalizedItem } from './types.js';

export interface NamespaceHandler {
  prefix: string;
  uri: string;
  extract(item: any): Partial<NormalizedItem>;
}

const namespaceHandlers: Map<string, NamespaceHandler> = new Map();

function registerHandler(handler: NamespaceHandler): void {
  namespaceHandlers.set(handler.uri, handler);
}

registerHandler({
  prefix: 'media',
  uri: 'http://search.yahoo.com/mrss/',
  extract(item: any): Partial<NormalizedItem> {
    const media = item['media:content'] || item['media:thumbnail'] || {};
    const group = item['media:group'];
    const groupContent = group?.['media:content'];
    const description = item['media:description'];
    const credit = item['media:credit'];
    const keywords = item['media:keywords'];

    return {
      image: media['@_url'] || groupContent?.['@_url'] || item['media:thumbnail']?.['@_url'] || '',
      description: typeof description === 'string' ? description : description?.['#text'] || '',
      author: typeof credit === 'string' ? credit : credit?.['#text'] || '',
      tags: keywords ? (typeof keywords === 'string' ? keywords.split(',') : [keywords['#text'] || '']).map(t => t.trim()) : [],
    };
  },
});

registerHandler({
  prefix: 'itunes',
  uri: 'http://www.itunes.com/dtds/podcast-1.0.dtd',
  extract(item: any): Partial<NormalizedItem> {
    const image = item['itunes:image'];
    const author = item['itunes:author'];
    const summary = item['itunes:summary'];
    const duration = item['itunes:duration'];
    const subtitle = item['itunes:subtitle'];
    const category = item['itunes:category'];
    const explicit = item['itunes:explicit'];

    return {
      image: image?.['@_href'] || '',
      author: typeof author === 'string' ? author : author?.['#text'] || '',
      description: (typeof summary === 'string' ? summary : summary?.['#text'] || '') ||
                   (typeof subtitle === 'string' ? subtitle : subtitle?.['#text'] || ''),
      content: duration ? `[Duration: ${duration}] ${summary || ''}` : '',
      tags: category ? [typeof category === 'string' ? category : category['@_term'] || ''] : [],
    };
  },
});

registerHandler({
  prefix: 'content',
  uri: 'http://purl.org/rss/1.0/modules/content/',
  extract(item: any): Partial<NormalizedItem> {
    const encoded = item['content:encoded'];
    return {
      content: typeof encoded === 'string' ? encoded : encoded?.['#text'] || '',
    };
  },
});

registerHandler({
  prefix: 'dc',
  uri: 'http://purl.org/dc/elements/1.1/',
  extract(item: any): Partial<NormalizedItem> {
    return {
      author: typeof item['dc:creator'] === 'string' ? item['dc:creator'] : item['dc:creator']?.['#text'] || '',
    };
  },
});

registerHandler({
  prefix: 'slash',
  uri: 'http://purl.org/rss/1.0/modules/slash/',
  extract(item: any): Partial<NormalizedItem> {
    const comments = item['slash:comments'];
    return {
      tags: comments ? [`comments:${comments}`] : [],
    };
  },
});

registerHandler({
  prefix: 'wfw',
  uri: 'http://wellformedweb.org/CommentAPI/',
  extract(item: any): Partial<NormalizedItem> {
    const commentRss = item['wfw:commentRss'];
    return {
      tags: commentRss ? ['has-comments'] : [],
    };
  },
});

export function extractFromNamespaces(item: any): Partial<NormalizedItem> {
  const result: Partial<NormalizedItem> = {};

  for (const [, handler] of namespaceHandlers) {
    try {
      const extracted = handler.extract(item);
      if (extracted.image && !result.image) result.image = extracted.image;
      if (extracted.author && !result.author) result.author = extracted.author;
      if (extracted.content && !result.content) result.content = extracted.content;
      if (extracted.description && !result.description) result.description = extracted.description;
      if (extracted.tags && extracted.tags.length > 0) {
        result.tags = [...(result.tags || []), ...extracted.tags];
      }
    } catch {}
  }

  return result;
}

export function getRegisteredNamespaces(): string[] {
  return Array.from(namespaceHandlers.keys());
}
