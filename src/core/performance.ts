import type { FeedItem, Feed } from './types.js';

export class PerformanceMetrics {
  private metrics = new Map<string, { count: number; totalMs: number; minMs: number; maxMs: number }>();

  start(label: string): () => number {
    const start = performance.now();
    return () => {
      const elapsed = performance.now() - start;
      this.record(label, elapsed);
      return elapsed;
    };
  }

  record(label: string, ms: number): void {
    const entry = this.metrics.get(label) || { count: 0, totalMs: 0, minMs: Infinity, maxMs: 0 };
    entry.count++;
    entry.totalMs += ms;
    entry.minMs = Math.min(entry.minMs, ms);
    entry.maxMs = Math.max(entry.maxMs, ms);
    this.metrics.set(label, entry);
  }

  getReport(): Record<string, { count: number; avgMs: number; minMs: number; maxMs: number; totalMs: number }> {
    const report: Record<string, any> = {};
    for (const [label, entry] of this.metrics) {
      report[label] = {
        count: entry.count,
        avgMs: Math.round((entry.totalMs / entry.count) * 100) / 100,
        minMs: Math.round(entry.minMs * 100) / 100,
        maxMs: Math.round(entry.maxMs * 100) / 100,
        totalMs: Math.round(entry.totalMs * 100) / 100,
      };
    }
    return report;
  }

  reset(): void {
    this.metrics.clear();
  }
}

export const metrics = new PerformanceMetrics();

export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;

  constructor(factory: () => T, reset: (obj: T) => void, initialSize = 10, maxSize = 100) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire(): T {
    return this.pool.length > 0 ? this.pool.pop()! : this.factory();
  }

  release(obj: T): void {
    this.reset(obj);
    if (this.pool.length < this.maxSize) {
      this.pool.push(obj);
    }
  }

  get size(): number {
    return this.pool.length;
  }
}

export function createItemPool(): ObjectPool<FeedItem> {
  return new ObjectPool<FeedItem>(
    () => ({
      id: '', title: '', description: '', content: '', author: '',
      published: '', updated: '', link: '', image: '', tags: [],
      guid: '', hash: '', feedId: '', createdAt: '',
    }),
    (item) => {
      item.id = ''; item.title = ''; item.description = ''; item.content = '';
      item.author = ''; item.published = ''; item.updated = ''; item.link = '';
      item.image = ''; item.tags = []; item.guid = ''; item.hash = '';
      item.feedId = ''; item.createdAt = '';
    },
    50, 500
  );
}

export class BatchBuffer<T> {
  private buffer: T[] = [];
  private flushFn: (items: T[]) => Promise<void>;
  private maxSize: number;

  constructor(flushFn: (items: T[]) => Promise<void>, maxSize = 100) {
    this.flushFn = flushFn;
    this.maxSize = maxSize;
  }

  async add(item: T): Promise<void> {
    this.buffer.push(item);
    if (this.buffer.length >= this.maxSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const items = this.buffer.splice(0);
    await this.flushFn(items);
  }

  get size(): number {
    return this.buffer.length;
  }
}

export function hashFast(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function dedupArray<T>(arr: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of arr) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
