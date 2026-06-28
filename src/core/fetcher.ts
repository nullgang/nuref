import type { FetchOptions, FetchResult } from './types.js';
import type { FormatDetector } from './detector.js';
import { RateLimiter } from './rate-limiter.js';
import type { ProxyConfig } from './proxy.js';
import { getProxyEnv } from './proxy.js';

const DEFAULT_USER_AGENT = 'nuref/1.0 (+https://github.com/nullgang/nuref)';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface FetchEngineOptions {
  userAgent?: string;
  timeout?: number;
  retries?: number;
  rateLimit?: { maxTokens?: number; refillIntervalMs?: number };
  proxy?: ProxyConfig;
}

export class FetchEngine {
  private detector: FormatDetector;
  private rateLimiter: RateLimiter;
  private userAgent: string;
  private timeout: number;
  private retries: number;
  private requestCount = 0;
  private errorCount = 0;
  private proxy?: ProxyConfig;

  constructor(detector: FormatDetector, options: FetchEngineOptions = {}) {
    this.detector = detector;
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.retries = options.retries || DEFAULT_RETRIES;
    this.proxy = options.proxy;
    this.rateLimiter = new RateLimiter({
      maxTokens: options.rateLimit?.maxTokens || 5,
      refillIntervalMs: options.rateLimit?.refillIntervalMs || 1000,
    });
  }

  async fetch(options: FetchOptions): Promise<FetchResult> {
    const {
      url,
      timeout = this.timeout,
      userAgent = this.userAgent,
      compress = true,
      retries = this.retries,
      etag,
      lastModified,
    } = options;

    const host = new URL(url).hostname;
    await this.rateLimiter.acquire(host);

    let lastError: Error | null = null;
    const savedEnv: Record<string, string | undefined> = {};

    if (this.proxy) {
      const proxyEnv = getProxyEnv(this.proxy);
      for (const [key, value] of Object.entries(proxyEnv)) {
        savedEnv[key] = process.env[key];
        process.env[key] = value;
      }
    }

    try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        this.requestCount++;
        const headers: Record<string, string> = {
          'User-Agent': userAgent,
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*',
        };

        if (compress) {
          headers['Accept-Encoding'] = 'gzip, deflate, br';
        }

        if (etag) {
          headers['If-None-Match'] = etag;
        }

        if (lastModified) {
          headers['If-Modified-Since'] = lastModified;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          headers,
          signal: controller.signal,
          redirect: 'follow',
        });

        clearTimeout(timeoutId);

        if (response.status === 304) {
          throw new Error('NOT_MODIFIED');
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const raw = await response.text();
        const format = this.detector.detect(raw);
        const responseEtag = response.headers.get('etag') || '';
        const responseLastModified = response.headers.get('last-modified') || '';

        return {
          raw,
          format,
          etag: responseEtag,
          lastModified: responseLastModified,
          statusCode: response.status,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (lastError.message === 'NOT_MODIFIED') {
          throw lastError;
        }

        this.errorCount++;

        if (attempt < retries) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    throw lastError;
    } finally {
      if (this.proxy) {
        for (const [key, value] of Object.entries(savedEnv)) {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        }
      }
    }
  }

  getStats() {
    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? (this.requestCount - this.errorCount) / this.requestCount : 1,
    };
  }

  resetStats(): void {
    this.requestCount = 0;
    this.errorCount = 0;
  }

  async fetchConcurrent(urls: string[], concurrency = 5): Promise<(FetchResult | null)[]> {
    const results: (FetchResult | null)[] = new Array(urls.length).fill(null);
    const executing = new Set<Promise<void>>();

    for (let i = 0; i < urls.length; i++) {
      const idx = i;
      const task = this.fetch({ url: urls[idx] })
        .then(result => { results[idx] = result; })
        .catch(() => { results[idx] = null; });
      
      executing.add(task);
      task.finally(() => executing.delete(task));

      if (executing.size >= concurrency) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
    return results;
  }
}
