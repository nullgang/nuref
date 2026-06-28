import type { FeedFormat } from './types.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { HealthMonitor } from './health.js';
import { LRUCache } from './lru-cache.js';
import { getSafetyLimits, validateFeedSize, withTimeout, errorHandler } from './safety.js';

const DEFAULT_UA = 'nuref/2.0 (+https://github.com/nullgang/nuref)';

export interface ResilientFetchOptions {
  url: string;
  timeout?: number;
  userAgent?: string;
  etag?: string;
  lastModified?: string;
  retries?: number;
}

export interface ResilientFetchResult {
  raw: string;
  format: FeedFormat;
  etag: string;
  lastModified: string;
  statusCode: number;
  fromCache: boolean;
  parseTimeMs: number;
}

export class ResilientFetcher {
  private circuitBreaker: CircuitBreaker;
  private healthMonitor: HealthMonitor;
  private responseCache: LRUCache<ResilientFetchResult>;
  private requestCount = 0;
  private errorCount = 0;

  constructor() {
    this.circuitBreaker = new CircuitBreaker({ failureThreshold: 5, resetTimeout: 30000 });
    this.healthMonitor = new HealthMonitor();
    this.responseCache = new LRUCache({ maxSize: 100, defaultTtlMs: 60000 });
  }

  async fetch(options: ResilientFetchOptions): Promise<ResilientFetchResult> {
    const {
      url,
      timeout = getSafetyLimits().fetchTimeout,
      userAgent = DEFAULT_UA,
      etag,
      lastModified,
      retries = getSafetyLimits().maxRetries,
    } = options;

    const cached = this.responseCache.get(url);
    if (cached && !etag && !lastModified) {
      return { ...cached, fromCache: true };
    }

    const host = new URL(url).hostname;
    const start = performance.now();

    try {
      return await this.circuitBreaker.execute(host, async () => {
        return await this.doFetch(url, timeout, userAgent, etag, lastModified, retries, host, start);
      });
    } catch (error) {
      this.errorCount++;
      const err = error instanceof Error ? error : new Error(String(error));
      this.healthMonitor.recordFailure(host, err.message);
      errorHandler.record('fetcher', err);
      throw error;
    }
  }

  private async doFetch(
    url: string, timeout: number, userAgent: string,
    etag?: string, lastModified?: string, retries?: number,
    host?: string, start?: number
  ): Promise<ResilientFetchResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= (retries || 3); attempt++) {
      try {
        this.requestCount++;

        const headers: Record<string, string> = {
          'User-Agent': userAgent,
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*',
          'Accept-Encoding': 'gzip, deflate, br',
        };

        if (etag) headers['If-None-Match'] = etag;
        if (lastModified) headers['If-Modified-Since'] = lastModified;

        const response = await withTimeout(
          fetch(url, { headers, redirect: 'follow' }),
          timeout
        );

        if (response.status === 304) {
          throw new Error('NOT_MODIFIED');
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const raw = await response.text();
        const sizeCheck = validateFeedSize(raw);
        if (!sizeCheck.ok) {
          throw new Error(sizeCheck.error);
        }

        const format = this.detectFormat(raw);
        const responseEtag = response.headers.get('etag') || '';
        const responseLastModified = response.headers.get('last-modified') || '';
        const parseTimeMs = performance.now() - (start || 0);

        const result: ResilientFetchResult = {
          raw, format,
          etag: responseEtag, lastModified: responseLastModified,
          statusCode: response.status, fromCache: false, parseTimeMs,
        };

        this.responseCache.set(url, result);
        this.healthMonitor.recordSuccess(host || new URL(url).hostname, parseTimeMs);

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError.message === 'NOT_MODIFIED') throw lastError;
        if (attempt < (retries || 3)) {
          await new Promise(r => setTimeout(r, Math.min(1000 * (attempt + 1), 5000)));
        }
      }
    }

    throw lastError;
  }

  private detectFormat(raw: string): FeedFormat {
    const trimmed = raw.trimStart();
    if (trimmed.startsWith('{')) {
      try { const d = JSON.parse(trimmed); if (d.items) return 'json_feed'; } catch {}
      return 'unknown';
    }
    if (trimmed.includes('<rss') && trimmed.includes('<channel>')) return 'rss';
    if (trimmed.includes('<feed') && trimmed.includes('xmlns="http://www.w3.org/2005/Atom"')) return 'atom';
    if (trimmed.includes('<rdf:RDF') || trimmed.includes('xmlns:rss')) return 'rdf';
    if (trimmed.includes('<urlset')) return 'sitemap';
    if (trimmed.includes('<channel>')) return 'rss';
    return 'unknown';
  }

  getHealth() {
    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? (this.requestCount - this.errorCount) / this.requestCount : 1,
      circuits: this.circuitBreaker.getAllStates(),
      healthRecords: this.healthMonitor.getAll(),
    };
  }

  resetCircuit(id: string) {
    this.circuitBreaker.reset(id);
  }

  clearCache() {
    this.responseCache.clear();
  }
}
