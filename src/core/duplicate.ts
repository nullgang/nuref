import type { NormalizedItem, FeedItem } from '../core/types.js';
import { randomUUID } from 'crypto';

function hashContent(str: string): string {
  let hash = 0;
  const prime = 31;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * prime + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash.toString(16).padStart(8, '0');
}

function generateId(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export class DuplicateDetector {
  private existingHashes = new Set<string>();
  private existingGuids = new Set<string>();
  private existingLinks = new Set<string>();

  loadExisting(items: FeedItem[]): void {
    this.existingHashes.clear();
    this.existingGuids.clear();
    this.existingLinks.clear();

    for (const item of items) {
      this.existingHashes.add(item.hash);
      if (item.guid) this.existingGuids.add(item.guid);
      if (item.link) this.existingLinks.add(item.link);
    }
  }

  filterNew(items: NormalizedItem[], feedId: string): NormalizedItem[] {
    return items.filter(item => !this.isDuplicate(item, feedId));
  }

  private isDuplicate(item: NormalizedItem, feedId: string): boolean {
    const guid = item.link || item.title;
    const hash = this.computeHash(item);

    if (this.existingGuids.has(guid)) return true;
    if (this.existingHashes.has(hash)) return true;
    if (item.link && this.existingLinks.has(item.link)) return true;

    return false;
  }

  computeHash(item: NormalizedItem): string {
    const content = `${item.title}|${item.link}|${item.published}`;
    return hashContent(content);
  }

  markAsSeen(item: NormalizedItem): void {
    const hash = this.computeHash(item);
    const guid = item.link || item.title;

    this.existingHashes.add(hash);
    this.existingGuids.add(guid);
    if (item.link) this.existingLinks.add(item.link);
  }
}
