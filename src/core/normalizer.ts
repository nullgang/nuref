import type { NormalizedItem } from './types.js';

const ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'", '&apos;': "'",
};

const CLEAN_TEXT_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/g;
const WHITESPACE_RE = /\s+/g;
const HTML_TAG_RE = /<[^>]+>/g;
const HTML_ENTITY_RE = /&\w+;/g;
const AUTHOR_PAREN_RE = /\s*\(.*?\)\s*/g;
const AUTHOR_ANGLE_RE = /\s*<.*?>\s*/g;

export class Normalizer {
  normalizeItems(items: NormalizedItem[]): NormalizedItem[] {
    const result = new Array(items.length);
    for (let i = 0; i < items.length; i++) {
      result[i] = this.normalizeItem(items[i]);
    }
    return result;
  }

  normalizeItem(item: NormalizedItem): NormalizedItem {
    return {
      title: cleanText(item.title),
      description: cleanHtml(cleanText(item.description)),
      content: cleanHtml(item.content || item.description),
      author: normalizeAuthor(item.author),
      published: normalizeDate(item.published || item.updated),
      updated: normalizeDate(item.updated || item.published),
      link: normalizeUrl(item.link),
      image: normalizeUrl(item.image),
      tags: normalizeTags(item.tags),
    };
  }
}

function cleanText(text: string): string {
  if (!text) return '';
  return text.replace(WHITESPACE_RE, ' ').replace(CLEAN_TEXT_RE, '').trim();
}

function cleanHtml(html: string): string {
  if (!html) return '';
  let result = html;
  if (result.includes('<')) {
    if (result.length > 100) {
      result = result.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    }
    result = result.replace(HTML_TAG_RE, '');
  }
  if (result.includes('&')) {
    for (const [entity, char] of Object.entries(ENTITY_MAP)) {
      if (result.includes(entity)) result = result.replaceAll(entity, char);
    }
    if (HTML_ENTITY_RE.test(result)) result = result.replace(HTML_ENTITY_RE, '');
  }
  return result.trim();
}

function normalizeAuthor(author: string): string {
  if (!author) return '';
  return author.replace(AUTHOR_PAREN_RE, '').replace(AUTHOR_ANGLE_RE, '').trim();
}

function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? dateStr : parsed.toISOString();
}

function normalizeUrl(url: string): string {
  if (!url) return '';
  try { return new URL(url).href; } catch { return url; }
}

function normalizeTags(tags: string[]): string[] {
  if (!tags || tags.length === 0) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i].trim().toLowerCase();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }
  return result;
}
