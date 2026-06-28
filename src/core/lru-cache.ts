export class LRUCache<T = any> {
  private store = new Map<string, { value: T; expiresAt: number }>();
  private maxSize: number;
  private defaultTtl: number;

  constructor(options: { maxSize?: number; defaultTtlMs?: number } = {}) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTtl = options.defaultTtlMs || 60000;
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    }

    if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs || this.defaultTtl),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.store.size;
  }

  keys(): string[] {
    return Array.from(this.store.keys());
  }

  values(): T[] {
    return Array.from(this.store.values()).map(e => e.value);
  }

  get stats() {
    return {
      size: this.store.size,
      maxSize: this.maxSize,
      hitRate: 0,
    };
  }
}
