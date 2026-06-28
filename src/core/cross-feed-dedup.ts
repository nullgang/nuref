import type { NormalizedItem, FeedItem } from './types.js';
import { createHash } from 'crypto';

export interface CrossFeedDuplicate {
  item1: FeedItem;
  item2: FeedItem;
  similarity: number;
  matchType: 'exact_url' | 'exact_title' | 'content_hash' | 'fuzzy_title';
}

export class CrossFeedDedup {
  private contentIndex = new Map<string, FeedItem[]>();
  private titleIndex = new Map<string, FeedItem[]>();
  private urlIndex = new Map<string, FeedItem[]>();

  indexItem(item: FeedItem): void {
    const urlKey = this.normalizeUrl(item.link);
    if (urlKey) {
      const existing = this.urlIndex.get(urlKey) || [];
      existing.push(item);
      this.urlIndex.set(urlKey, existing);
    }

    const titleKey = this.normalizeTitle(item.title);
    if (titleKey) {
      const existing = this.titleIndex.get(titleKey) || [];
      existing.push(item);
      this.titleIndex.set(titleKey, existing);
    }

    const contentKey = this.contentHash(item.content || item.description);
    if (contentKey) {
      const existing = this.contentIndex.get(contentKey) || [];
      existing.push(item);
      this.contentIndex.set(contentKey, existing);
    }
  }

  indexItems(items: FeedItem[]): void {
    for (const item of items) {
      this.indexItem(item);
    }
  }

  findDuplicates(item: FeedItem): CrossFeedDuplicate[] {
    const duplicates: CrossFeedDuplicate[] = [];

    const urlKey = this.normalizeUrl(item.link);
    if (urlKey) {
      const existing = this.urlIndex.get(urlKey);
      if (existing) {
        for (const match of existing) {
          if (match.id !== item.id && !duplicates.find(d => d.item1.id === match.id)) {
            duplicates.push({
              item1: match,
              item2: item,
              similarity: 1.0,
              matchType: 'exact_url',
            });
          }
        }
      }
    }

    const titleKey = this.normalizeTitle(item.title);
    if (titleKey) {
      const existing = this.titleIndex.get(titleKey);
      if (existing) {
        for (const match of existing) {
          if (match.id !== item.id && !duplicates.find(d => d.item1.id === match.id)) {
            duplicates.push({
              item1: match,
              item2: item,
              similarity: 0.95,
              matchType: 'exact_title',
            });
          }
        }
      }
    }

    const contentKey = this.contentHash(item.content || item.description);
    if (contentKey) {
      const existing = this.contentIndex.get(contentKey);
      if (existing) {
        for (const match of existing) {
          if (match.id !== item.id && !duplicates.find(d => d.item1.id === match.id)) {
            duplicates.push({
              item1: match,
              item2: item,
              similarity: 0.85,
              matchType: 'content_hash',
            });
          }
        }
      }
    }

    if (duplicates.length === 0) {
      const fuzzyMatches = this.fuzzyTitleSearch(item.title);
      for (const match of fuzzyMatches) {
        if (match.id !== item.id) {
          const similarity = this.titleSimilarity(item.title, match.title);
          if (similarity > 0.7) {
            duplicates.push({
              item1: match,
              item2: item,
              similarity,
              matchType: 'fuzzy_title',
            });
          }
        }
      }
    }

    return duplicates;
  }

  findAllDuplicates(): CrossFeedDuplicate[] {
    const allDuplicates: CrossFeedDuplicate[] = [];
    const seen = new Set<string>();

    for (const [contentKey, items] of this.contentIndex) {
      if (items.length > 1) {
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const pairId = [items[i].id, items[j].id].sort().join(':');
            if (!seen.has(pairId)) {
              seen.add(pairId);
              allDuplicates.push({
                item1: items[i],
                item2: items[j],
                similarity: 0.85,
                matchType: 'content_hash',
              });
            }
          }
        }
      }
    }

    for (const [titleKey, items] of this.titleIndex) {
      if (items.length > 1) {
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const pairId = [items[i].id, items[j].id].sort().join(':');
            if (!seen.has(pairId)) {
              seen.add(pairId);
              allDuplicates.push({
                item1: items[i],
                item2: items[j],
                similarity: 0.95,
                matchType: 'exact_title',
              });
            }
          }
        }
      }
    }

    for (const [, items] of this.urlIndex) {
      if (items.length > 1) {
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const pairId = [items[i].id, items[j].id].sort().join(':');
            if (!seen.has(pairId)) {
              seen.add(pairId);
              allDuplicates.push({
                item1: items[i],
                item2: items[j],
                similarity: 1.0,
                matchType: 'exact_url',
              });
            }
          }
        }
      }
    }

    return allDuplicates;
  }

  getStats() {
    return {
      indexedUrls: this.urlIndex.size,
      indexedTitles: this.titleIndex.size,
      indexedContent: this.contentIndex.size,
    };
  }

  clear(): void {
    this.contentIndex.clear();
    this.titleIndex.clear();
    this.urlIndex.clear();
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}${parsed.pathname}`.toLowerCase().replace(/\/+$/, '');
    } catch {
      return '';
    }
  }

  private normalizeTitle(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  private contentHash(content: string): string {
    if (!content || content.length < 20) return '';
    const cleaned = content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 500);
    return createHash('sha256').update(cleaned).digest('hex').slice(0, 16);
  }

  private fuzzyTitleSearch(title: string): FeedItem[] {
    const normalized = this.normalizeTitle(title);
    const words = normalized.split(' ').filter(w => w.length > 3);
    const matches: FeedItem[] = [];

    for (const [key, items] of this.titleIndex) {
      for (const word of words) {
        if (key.includes(word)) {
          matches.push(...items);
          break;
        }
      }
    }

    return matches;
  }

  private titleSimilarity(a: string, b: string): number {
    const wordsA = new Set(this.normalizeTitle(a).split(' '));
    const wordsB = new Set(this.normalizeTitle(b).split(' '));
    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }
}
