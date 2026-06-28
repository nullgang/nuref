import type { NormalizedItem } from './types.js';
import { Transform } from 'stream';
import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';

export interface StreamParseOptions {
  highWaterMark?: number;
  maxItemSize?: number;
}

export class StreamingParser extends Transform {
  private buffer = '';
  private inItem = false;
  private itemBuffer = '';
  private itemCount = 0;
  private maxItemSize: number;

  constructor(options: StreamParseOptions = {}) {
    super({
      objectMode: true,
      highWaterMark: options.highWaterMark || 16,
    });
    this.maxItemSize = options.maxItemSize || 1024 * 1024;
  }

  _transform(chunk: Buffer, encoding: BufferEncoding, callback: Function): void {
    this.buffer += chunk.toString();
    this.processBuffer();
    callback();
  }

  _flush(callback: Function): void {
    this.processBuffer();
    callback();
  }

  private processBuffer(): void {
    while (true) {
      if (this.inItem) {
        const endIdx = this.buffer.indexOf('</item>');
        if (endIdx === -1) {
          if (this.itemBuffer.length > this.maxItemSize) {
            this.inItem = false;
            this.itemBuffer = '';
          }
          break;
        }

        this.itemBuffer += this.buffer.substring(0, endIdx + 7);
        this.buffer = this.buffer.substring(endIdx + 7);
        this.inItem = false;
        this.itemCount++;

        this.push(this.itemBuffer);
        this.itemBuffer = '';
      } else {
        const startIdx = this.buffer.indexOf('<item');
        if (startIdx === -1) {
          if (this.buffer.length > 1024) {
            this.buffer = this.buffer.substring(this.buffer.length - 1024);
          }
          break;
        }

        this.buffer = this.buffer.substring(startIdx);
        this.inItem = true;
        this.itemBuffer = '';
      }
    }
  }

  getItemCount(): number {
    return this.itemCount;
  }
}

export async function parseFileStream(filePath: string): Promise<{ items: string[]; count: number }> {
  return new Promise((resolve, reject) => {
    const parser = new StreamingParser();
    const items: string[] = [];

    parser.on('data', (chunk: string) => {
      items.push(chunk);
    });

    parser.on('end', () => {
      resolve({ items, count: parser.getItemCount() });
    });

    parser.on('error', reject);

    const stream = createReadStream(filePath);
    stream.pipe(parser);
  });
}

export async function parseCompressedFileStream(filePath: string): Promise<{ items: string[]; count: number }> {
  return new Promise((resolve, reject) => {
    const parser = new StreamingParser();
    const items: string[] = [];

    parser.on('data', (chunk: string) => {
      items.push(chunk);
    });

    parser.on('end', () => {
      resolve({ items, count: parser.getItemCount() });
    });

    parser.on('error', reject);

    const stream = createReadStream(filePath);
    const gunzip = createGunzip();
    stream.pipe(gunzip).pipe(parser);
  });
}
