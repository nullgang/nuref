import type { FeedItem } from './types.js';

export interface FeedDiff {
  added: FeedItem[];
  removed: FeedItem[];
  unchanged: FeedItem[];
  modified: FeedDiffModified[];
  summary: {
    totalBefore: number;
    totalAfter: number;
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
    unchangedCount: number;
  };
}

export interface FeedDiffModified {
  before: FeedItem;
  after: FeedItem;
  changes: string[];
}

export class FeedComparator {
  compare(before: FeedItem[], after: FeedItem[]): FeedDiff {
    const beforeMap = new Map<string, FeedItem>();
    const afterMap = new Map<string, FeedItem>();

    for (const item of before) {
      beforeMap.set(this.getKey(item), item);
    }

    for (const item of after) {
      afterMap.set(this.getKey(item), item);
    }

    const added: FeedItem[] = [];
    const removed: FeedItem[] = [];
    const unchanged: FeedItem[] = [];
    const modified: FeedDiffModified[] = [];

    for (const [key, afterItem] of afterMap) {
      const beforeItem = beforeMap.get(key);
      if (!beforeItem) {
        added.push(afterItem);
        continue;
      }

      const changes = this.detectChanges(beforeItem, afterItem);
      if (changes.length === 0) {
        unchanged.push(afterItem);
      } else {
        modified.push({ before: beforeItem, after: afterItem, changes });
      }
    }

    for (const [key, beforeItem] of beforeMap) {
      if (!afterMap.has(key)) {
        removed.push(beforeItem);
      }
    }

    return {
      added,
      removed,
      unchanged,
      modified,
      summary: {
        totalBefore: before.length,
        totalAfter: after.length,
        addedCount: added.length,
        removedCount: removed.length,
        modifiedCount: modified.length,
        unchangedCount: unchanged.length,
      },
    };
  }

  compareByContent(before: FeedItem[], after: FeedItem[]): FeedDiff {
    const beforeMap = new Map<string, FeedItem>();
    const afterMap = new Map<string, FeedItem>();

    for (const item of before) {
      beforeMap.set(item.title.toLowerCase().trim(), item);
    }

    for (const item of after) {
      afterMap.set(item.title.toLowerCase().trim(), item);
    }

    const added: FeedItem[] = [];
    const removed: FeedItem[] = [];
    const unchanged: FeedItem[] = [];
    const modified: FeedDiffModified[] = [];

    for (const [title, afterItem] of afterMap) {
      const beforeItem = beforeMap.get(title);
      if (!beforeItem) {
        added.push(afterItem);
        continue;
      }

      const changes = this.detectChanges(beforeItem, afterItem);
      if (changes.length === 0) {
        unchanged.push(afterItem);
      } else {
        modified.push({ before: beforeItem, after: afterItem, changes });
      }
    }

    for (const [title, beforeItem] of beforeMap) {
      if (!afterMap.has(title)) {
        removed.push(beforeItem);
      }
    }

    return {
      added,
      removed,
      unchanged,
      modified,
      summary: {
        totalBefore: before.length,
        totalAfter: after.length,
        addedCount: added.length,
        removedCount: removed.length,
        modifiedCount: modified.length,
        unchangedCount: unchanged.length,
      },
    };
  }

  private getKey(item: FeedItem): string {
    return item.guid || item.link || item.title;
  }

  private detectChanges(before: FeedItem, after: FeedItem): string[] {
    const changes: string[] = [];

    if (before.title !== after.title) changes.push('title');
    if (before.description !== after.description) changes.push('description');
    if (before.content !== after.content) changes.push('content');
    if (before.author !== after.author) changes.push('author');
    if (before.published !== after.published) changes.push('published');
    if (before.link !== after.link) changes.push('link');
    if (before.image !== after.image) changes.push('image');
    if (JSON.stringify(before.tags) !== JSON.stringify(after.tags)) changes.push('tags');

    return changes;
  }
}
