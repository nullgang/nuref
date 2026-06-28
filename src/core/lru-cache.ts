export class LRUCache<T = any> {
  private data = new Map<string, [T, number]>();
  private maxSize: number;
  private defaultTtl: number;

  constructor(options: { maxSize?: number; defaultTtlMs?: number } = {}) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTtl = options.defaultTtlMs || 60000;
  }

  get(key: string): T | null {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (Date.now() > entry[1]) {
      this.data.delete(key);
      return null;
    }
    this.data.delete(key);
    this.data.set(key, entry);
    return entry[0];
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.data.delete(key);
    if (this.data.size >= this.maxSize) {
      const first = this.data.keys().next().value;
      if (first !== undefined) this.data.delete(first);
    }
    this.data.set(key, [value, Date.now() + (ttlMs || this.defaultTtl)]);
  }

  has(key: string): boolean {
    const entry = this.data.get(key);
    if (!entry) return false;
    if (Date.now() > entry[1]) {
      this.data.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.data) {
      if (now > entry[1]) {
        this.data.delete(key);
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.data.size;
  }

  getKeys(): string[] {
    return [...this.data.keys()];
  }

  getValues(): T[] {
    return [...this.data.values()].map(e => e[0]);
  }

  get stats() {
    return { size: this.data.size, maxSize: this.maxSize, hitRate: 0 };
  }
}
