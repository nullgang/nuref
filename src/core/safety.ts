export interface SafetyLimits {
  maxFeedSize: number;
  maxItemsPerFeed: number;
  maxItemSize: number;
  maxEntityExpansions: number;
  maxTagLength: number;
  maxDescriptionLength: number;
  maxContentLength: number;
  fetchTimeout: number;
  maxRetries: number;
  maxConcurrentFetches: number;
  maxDatabaseSize: number;
}

const DEFAULT_LIMITS: SafetyLimits = {
  maxFeedSize: 50 * 1024 * 1024,
  maxItemsPerFeed: 10000,
  maxItemSize: 1024 * 1024,
  maxEntityExpansions: 100000,
  maxTagLength: 256,
  maxDescriptionLength: 100000,
  maxContentLength: 500000,
  fetchTimeout: 30000,
  maxRetries: 3,
  maxConcurrentFetches: 10,
  maxDatabaseSize: 1024 * 1024 * 1024,
};

let currentLimits = { ...DEFAULT_LIMITS };

export function getSafetyLimits(): SafetyLimits {
  return { ...currentLimits };
}

export function setSafetyLimits(limits: Partial<SafetyLimits>): void {
  currentLimits = { ...currentLimits, ...limits };
}

export function resetSafetyLimits(): void {
  currentLimits = { ...DEFAULT_LIMITS };
}

export function validateFeedSize(raw: string): { ok: boolean; error?: string } {
  if (raw.length > currentLimits.maxFeedSize) {
    return { ok: false, error: `Feed size ${raw.length} exceeds limit ${currentLimits.maxFeedSize}` };
  }
  return { ok: true };
}

export function validateItemCount(count: number): { ok: boolean; error?: string } {
  if (count > currentLimits.maxItemsPerFeed) {
    return { ok: false, error: `Item count ${count} exceeds limit ${currentLimits.maxItemsPerFeed}` };
  }
  return { ok: true };
}

export function validateItemSize(item: { title: string; description: string; content: string }): { ok: boolean; error?: string } {
  const total = item.title.length + item.description.length + item.content.length;
  if (total > currentLimits.maxItemSize) {
    return { ok: false, error: `Item size ${total} exceeds limit ${currentLimits.maxItemSize}` };
  }
  return { ok: true };
}

export function sanitizeString(str: string, maxLength?: number): string {
  if (!str) return '';
  const limit = maxLength || currentLimits.maxTagLength;
  let result = str
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (result.length > limit) {
    result = result.slice(0, limit);
  }
  return result;
}

export function sanitizeUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

export function sanitizeTags(tags: string[]): string[] {
  return tags
    .map(t => sanitizeString(t, currentLimits.maxTagLength))
    .filter(t => t.length > 0 && t.length <= currentLimits.maxTagLength)
    .slice(0, 100);
}

export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

export class ErrorHandler {
  private errors: { time: string; module: string; message: string; recoverable: boolean }[] = [];
  private maxErrors = 1000;

  record(module: string, error: Error, recoverable = true): void {
    this.errors.push({
      time: new Date().toISOString(),
      module,
      message: error.message,
      recoverable,
    });
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors / 2);
    }
  }

  getErrors(limit = 50): typeof this.errors {
    return this.errors.slice(-limit);
  }

  getErrorCount(): number {
    return this.errors.length;
  }

  clear(): void {
    this.errors = [];
  }
}

export const errorHandler = new ErrorHandler();
