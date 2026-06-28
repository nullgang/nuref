interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private maxTokens: number;
  private refillRate: number;
  private refillInterval: number;

  constructor(options: { maxTokens?: number; refillRate?: number; refillIntervalMs?: number } = {}) {
    this.maxTokens = options.maxTokens || 10;
    this.refillRate = options.refillRate || 1;
    this.refillInterval = options.refillIntervalMs || 1000;
  }

  async acquire(host: string): Promise<void> {
    const entry = this.getOrCreate(host);
    this.refill(entry);

    if (entry.tokens < 1) {
      const waitTime = this.refillInterval - (Date.now() - entry.lastRefill);
      await new Promise(resolve => setTimeout(resolve, Math.max(waitTime, 100)));
      this.refill(entry);
    }

    entry.tokens -= 1;
  }

  tryAcquire(host: string): boolean {
    const entry = this.getOrCreate(host);
    this.refill(entry);

    if (entry.tokens < 1) return false;

    entry.tokens -= 1;
    return true;
  }

  private getOrCreate(host: string): RateLimitEntry {
    let entry = this.limits.get(host);
    if (!entry) {
      entry = { tokens: this.maxTokens, lastRefill: Date.now() };
      this.limits.set(host, entry);
    }
    return entry;
  }

  private refill(entry: RateLimitEntry): void {
    const now = Date.now();
    const elapsed = now - entry.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillInterval) * this.refillRate;

    if (tokensToAdd > 0) {
      entry.tokens = Math.min(this.maxTokens, entry.tokens + tokensToAdd);
      entry.lastRefill = now;
    }
  }

  getAvailable(host: string): number {
    const entry = this.limits.get(host);
    if (!entry) return this.maxTokens;
    this.refill(entry);
    return Math.floor(entry.tokens);
  }

  reset(host?: string): void {
    if (host) {
      this.limits.delete(host);
    } else {
      this.limits.clear();
    }
  }
}
