import type { NormalizedItem } from './types.js';

export class Normalizer {
  normalizeItems(items: NormalizedItem[]): NormalizedItem[] {
    return items.map(item => this.normalizeItem(item));
  }

  normalizeItem(item: NormalizedItem): NormalizedItem {
    return {
      title: this.cleanText(item.title),
      description: this.cleanHtml(this.cleanText(item.description)),
      content: this.cleanHtml(item.content || item.description),
      author: this.normalizeAuthor(item.author),
      published: this.normalizeDate(item.published || item.updated),
      updated: this.normalizeDate(item.updated || item.published),
      link: this.normalizeUrl(item.link),
      image: this.normalizeUrl(item.image),
      tags: this.normalizeTags(item.tags),
    };
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .trim();
  }

  private cleanHtml(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&\w+;/g, '')
      .trim();
  }

  private normalizeAuthor(author: string): string {
    return author
      .replace(/\s*\(.*?\)\s*/g, '')
      .replace(/\s*<.*?>\s*/g, '')
      .trim();
  }

  private normalizeDate(dateStr: string): string {
    if (!dateStr) return '';

    try {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    } catch {}

    return dateStr;
  }

  private normalizeUrl(url: string): string {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      return parsed.href;
    } catch {
      return url;
    }
  }

  private normalizeTags(tags: string[]): string[] {
    const seen = new Set<string>();
    return tags
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0)
      .filter(tag => {
        if (seen.has(tag)) return false;
        seen.add(tag);
        return true;
      });
  }
}
