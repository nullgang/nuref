import { randomUUID } from 'crypto';

export interface Enclosure {
  id: string;
  url: string;
  type: string;
  length: number;
  title: string;
  feedId: string;
  itemId: string;
  downloadedAt: string;
  localPath: string;
}

export class EnclosureHandler {
  private enclosures = new Map<string, Enclosure>();
  private downloadDir: string;

  constructor(downloadDir: string = './enclosures') {
    this.downloadDir = downloadDir;
  }

  parseFromItem(item: { image?: string; link?: string; tags?: string[] }): Enclosure[] {
    const enclosures: Enclosure[] = [];

    if (item.image) {
      enclosures.push({
        id: randomUUID(),
        url: item.image,
        type: this.guessMediaType(item.image),
        length: 0,
        title: '',
        feedId: '',
        itemId: '',
        downloadedAt: '',
        localPath: '',
      });
    }

    return enclosures;
  }

  async download(url: string, destPath?: string): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: { 'User-Agent': 'nuref/1.0' },
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const path = destPath || `${this.downloadDir}/${randomUUID()}.${this.getExtension(url)}`;
      const buffer = Buffer.from(await response.arrayBuffer());

      const { mkdirSync, writeFileSync } = await import('fs');
      const { dirname } = await import('path');

      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, buffer);

      return { success: true, path };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  save(enclosure: Enclosure): void {
    this.enclosures.set(enclosure.id, enclosure);
  }

  get(id: string): Enclosure | null {
    return this.enclosures.get(id) || null;
  }

  getByItem(itemId: string): Enclosure[] {
    return Array.from(this.enclosures.values()).filter(e => e.itemId === itemId);
  }

  getByFeed(feedId: string): Enclosure[] {
    return Array.from(this.enclosures.values()).filter(e => e.feedId === feedId);
  }

  getAll(): Enclosure[] {
    return Array.from(this.enclosures.values());
  }

  delete(id: string): boolean {
    return this.enclosures.delete(id);
  }

  private guessMediaType(url: string): string {
    const ext = this.getExtension(url).toLowerCase();
    const types: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'mp3': 'audio/mpeg',
      'mp4': 'video/mp4',
      'ogg': 'audio/ogg',
      'pdf': 'application/pdf',
      'zip': 'application/zip',
    };
    return types[ext] || 'application/octet-stream';
  }

  private getExtension(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const parts = pathname.split('.');
      return parts.length > 1 ? parts[parts.length - 1] : 'bin';
    } catch {
      return 'bin';
    }
  }
}
