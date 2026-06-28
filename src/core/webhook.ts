import type { FeedItem } from './types.js';
import { createHmac, randomBytes } from 'crypto';

export interface Webhook {
  id: string;
  feedId: string;
  url: string;
  secret: string;
  events: ('new_item' | 'feed_updated' | 'sync_complete')[];
  enabled: boolean;
  retryCount: number;
  lastTriggered: string;
  lastStatus: number;
  createdAt: string;
}

export interface WebhookPayload {
  event: string;
  feedId: string;
  timestamp: string;
  data: any;
}

export class WebhookManager {
  private webhooks = new Map<string, Webhook>();
  private onTrigger?: (webhook: Webhook, payload: WebhookPayload) => Promise<void>;

  constructor(onTrigger?: (webhook: Webhook, payload: WebhookPayload) => Promise<void>) {
    this.onTrigger = onTrigger;
  }

  add(feedId: string, url: string, events: Webhook['events'] = ['new_item']): Webhook {
    const id = randomBytes(16).toString('hex');
    const secret = randomBytes(32).toString('hex');

    const webhook: Webhook = {
      id,
      feedId,
      url,
      secret,
      events,
      enabled: true,
      retryCount: 3,
      lastTriggered: '',
      lastStatus: 0,
      createdAt: new Date().toISOString(),
    };

    this.webhooks.set(id, webhook);
    return webhook;
  }

  remove(id: string): boolean {
    return this.webhooks.delete(id);
  }

  getByFeed(feedId: string): Webhook[] {
    return Array.from(this.webhooks.values()).filter(w => w.feedId === feedId);
  }

  getAll(): Webhook[] {
    return Array.from(this.webhooks.values());
  }

  updateStatus(id: string, status: number): void {
    const webhook = this.webhooks.get(id);
    if (webhook) {
      webhook.lastStatus = status;
      webhook.lastTriggered = new Date().toISOString();
    }
  }

  sign(secret: string, payload: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  verify(secret: string, payload: string, signature: string): boolean {
    const expected = this.sign(secret, payload);
    return expected === signature;
  }

  async trigger(event: string, feedId: string, data: any): Promise<void> {
    const webhooks = this.getByFeed(feedId).filter(
      w => w.enabled && w.events.includes(event as any)
    );

    for (const webhook of webhooks) {
      const payload: WebhookPayload = {
        event,
        feedId,
        timestamp: new Date().toISOString(),
        data,
      };

      try {
        if (this.onTrigger) {
          await this.onTrigger(webhook, payload);
        } else {
          await this.defaultTrigger(webhook, payload);
        }
        this.updateStatus(webhook.id, 200);
      } catch (error) {
        this.updateStatus(webhook.id, 500);
        console.error(`[Webhook] Failed to trigger ${webhook.id}:`, error);
      }
    }
  }

  private async defaultTrigger(webhook: Webhook, payload: WebhookPayload): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = this.sign(webhook.secret, body);

    await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Nuref-Signature': `sha256=${signature}`,
        'X-Nuref-Event': payload.event,
        'User-Agent': 'nuref-webhook/1.0',
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
  }
}
