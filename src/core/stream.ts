import type { FeedItem, Feed } from './types.js';

export interface StreamEvent {
  type: 'item_added' | 'feed_synced' | 'feed_error' | 'heartbeat';
  feedId: string;
  timestamp: string;
  data: any;
}

export type StreamCallback = (event: StreamEvent) => void;

export class StreamManager {
  private subscribers = new Map<string, Set<StreamCallback>>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  subscribe(feedId: string, callback: StreamCallback): () => void {
    if (!this.subscribers.has(feedId)) {
      this.subscribers.set(feedId, new Set());
    }
    this.subscribers.get(feedId)!.add(callback);

    return () => {
      const subs = this.subscribers.get(feedId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(feedId);
        }
      }
    };
  }

  subscribeAll(callback: StreamCallback): () => void {
    const unsubscribes: (() => void)[] = [];

    const wrapper = (event: StreamEvent) => callback(event);

    for (const feedId of this.subscribers.keys()) {
      unsubscribes.push(this.subscribe(feedId, wrapper));
    }

    this.subscribers.set('*', new Set([wrapper]));

    return () => {
      for (const unsub of unsubscribes) unsub();
      this.subscribers.get('*')?.delete(wrapper);
    };
  }

  emit(event: StreamEvent): void {
    const feedSubs = this.subscribers.get(event.feedId);
    if (feedSubs) {
      for (const callback of feedSubs) {
        try {
          callback(event);
        } catch {}
      }
    }

    const globalSubs = this.subscribers.get('*');
    if (globalSubs) {
      for (const callback of globalSubs) {
        try {
          callback(event);
        } catch {}
      }
    }
  }

  emitItemAdded(feedId: string, item: FeedItem): void {
    this.emit({
      type: 'item_added',
      feedId,
      timestamp: new Date().toISOString(),
      data: { item },
    });
  }

  emitFeedSynced(feedId: string, itemCount: number, newCount: number): void {
    this.emit({
      type: 'feed_synced',
      feedId,
      timestamp: new Date().toISOString(),
      data: { itemCount, newCount },
    });
  }

  emitFeedError(feedId: string, error: string): void {
    this.emit({
      type: 'feed_error',
      feedId,
      timestamp: new Date().toISOString(),
      data: { error },
    });
  }

  startHeartbeat(intervalMs: number = 30000): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      const event: StreamEvent = {
        type: 'heartbeat',
        feedId: '*',
        timestamp: new Date().toISOString(),
        data: { alive: true },
      };

      for (const [, subs] of this.subscribers) {
        for (const callback of subs) {
          try {
            callback(event);
          } catch {}
        }
      }
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  getSubscriberCount(feedId?: string): number {
    if (feedId) {
      return this.subscribers.get(feedId)?.size || 0;
    }
    let count = 0;
    for (const subs of this.subscribers.values()) {
      count += subs.size;
    }
    return count;
  }

  clear(): void {
    this.subscribers.clear();
    this.stopHeartbeat();
  }
}

export function formatSSE(event: StreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function createSSEStream(res: any): (event: StreamEvent) => void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(formatSSE({
    type: 'heartbeat',
    feedId: 'system',
    timestamp: new Date().toISOString(),
    data: { message: 'Connected to nuref stream' },
  }));

  return (event: StreamEvent) => {
    try {
      res.write(formatSSE(event));
    } catch {}
  };
}
