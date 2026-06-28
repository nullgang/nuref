export function resolveRelativeUrl(base: string, relative: string): string {
  if (!relative) return '';
  if (relative.startsWith('http://') || relative.startsWith('https://') || relative.startsWith('//')) {
    return relative.startsWith('//') ? `https:${relative}` : relative;
  }

  try {
    const baseUrl = new URL(base);
    const resolved = new URL(relative, baseUrl);
    return resolved.href;
  } catch {
    return relative;
  }
}

export function resolveUrls(base: string, items: { link?: string; image?: string; content?: string }[]): void {
  for (const item of items) {
    if (item.link) item.link = resolveRelativeUrl(base, item.link);
    if (item.image) item.image = resolveRelativeUrl(base, item.image);
  }
}

export function extractBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

export function isAbsoluteUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//');
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    if (parsed.pathname.endsWith('/') && parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.href;
  } catch {
    return url;
  }
}
