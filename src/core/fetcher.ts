import type { FetchOptions, FetchResult } from './types.js';
import type { FormatDetector } from './detector.js';

const DEFAULT_USER_AGENT = 'nuref/1.0 (+https://github.com/nullgang/nuref)';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class FetchEngine {
  private detector: FormatDetector;

  constructor(detector: FormatDetector) {
    this.detector = detector;
  }

  async fetch(options: FetchOptions): Promise<FetchResult> {
    const {
      url,
      timeout = DEFAULT_TIMEOUT,
      userAgent = DEFAULT_USER_AGENT,
      compress = true,
      retries = DEFAULT_RETRIES,
      etag,
      lastModified,
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
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

        if (attempt < retries) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    throw lastError;
  }
}
