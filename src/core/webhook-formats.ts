import type { FeedItem } from './types.js';

export interface WebhookAdapter {
  formatItem(item: FeedItem, feedTitle: string): any;
  formatItems(items: FeedItem[], feedTitle: string): any;
}

export class TelegramAdapter implements WebhookAdapter {
  formatItem(item: FeedItem, feedTitle: string): any {
    const text = [
      `*${escapeMarkdown(item.title)}*`,
      item.author ? `_by ${escapeMarkdown(item.author)}_` : '',
      item.description ? `\n${truncate(item.description, 200)}` : '',
      `\n[Read more](${item.link})`,
      item.tags.length > 0 ? `\n🏷 ${item.tags.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    return { text, parse_mode: 'Markdown', disable_web_page_preview: false };
  }

  formatItems(items: FeedItem[], feedTitle: string): any {
    const lines = [`*${escapeMarkdown(feedTitle)}*\n`];

    for (const item of items.slice(0, 10)) {
      lines.push(`• [${escapeMarkdown(item.title)}](${item.link})`);
    }

    return { text: lines.join('\n'), parse_mode: 'Markdown' };
  }
}

export class DiscordAdapter implements WebhookAdapter {
  formatItem(item: FeedItem, feedTitle: string): any {
    return {
      embeds: [{
        title: item.title,
        url: item.link,
        description: truncate(item.description, 2000),
        author: item.author ? { name: item.author } : undefined,
        color: 0x5865F2,
        fields: item.tags.length > 0 ? [{ name: 'Tags', value: item.tags.join(', '), inline: true }] : [],
        footer: { text: feedTitle },
        timestamp: item.published || undefined,
      }],
    };
  }

  formatItems(items: FeedItem[], feedTitle: string): any {
    const embeds = items.slice(0, 10).map(item => ({
      title: item.title,
      url: item.link,
      description: truncate(item.description, 200),
      color: 0x5865F2,
    }));

    return {
      content: `**${feedTitle}** — ${items.length} new items`,
      embeds,
    };
  }
}

export class SlackAdapter implements WebhookAdapter {
  formatItem(item: FeedItem, feedTitle: string): any {
    return {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: item.title },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              item.author ? `*Author:* ${item.author}` : '',
              item.published ? `*Date:* ${item.published}` : '',
              item.description ? `\n${truncate(item.description, 300)}` : '',
            ].filter(Boolean).join('\n'),
          },
          accessory: item.image ? {
            type: 'image',
            image_url: item.image,
            alt_text: item.title,
          } : undefined,
        },
        {
          type: 'actions',
          elements: [{
            type: 'button',
            text: { type: 'plain_text', text: 'Read more' },
            url: item.link,
          }],
        },
      ],
    };
  }

  formatItems(items: FeedItem[], feedTitle: string): any {
    const blocks: any[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: feedTitle },
      },
    ];

    for (const item of items.slice(0, 10)) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<${item.link}|${item.title}>`,
        },
      });
    }

    return { blocks };
  }
}

export function getAdapter(platform: 'telegram' | 'discord' | 'slack'): WebhookAdapter {
  switch (platform) {
    case 'telegram': return new TelegramAdapter();
    case 'discord': return new DiscordAdapter();
    case 'slack': return new SlackAdapter();
    default: throw new Error(`Unknown platform: ${platform}`);
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
