import type { Feed, FeedItem } from './types.js';

export function renderMarkdown(feed: Feed, items: FeedItem[], options: { maxItems?: number; includeContent?: boolean } = {}): string {
  const maxItems = options.maxItems || items.length;
  const includeContent = options.includeContent !== false;

  const lines: string[] = [];

  lines.push(`# ${feed.title}`);
  lines.push('');

  if (feed.description) {
    lines.push(`> ${feed.description}`);
    lines.push('');
  }

  lines.push(`**Source:** [${feed.link}](${feed.link})`);
  lines.push(`**Format:** ${feed.format.toUpperCase()}`);
  lines.push(`**Items:** ${items.length}`);
  lines.push('');

  lines.push('---');
  lines.push('');

  for (const item of items.slice(0, maxItems)) {
    lines.push(`## ${item.title}`);
    lines.push('');

    if (item.author || item.published) {
      const meta: string[] = [];
      if (item.author) meta.push(`*${item.author}*`);
      if (item.published) meta.push(formatDate(item.published));
      lines.push(meta.join(' | '));
      lines.push('');
    }

    if (item.link) {
      lines.push(`[Read more →](${item.link})`);
      lines.push('');
    }

    if (item.description) {
      lines.push(item.description);
      lines.push('');
    }

    if (includeContent && item.content && item.content !== item.description) {
      lines.push('<details>');
      lines.push('<summary>Full content</summary>');
      lines.push('');
      lines.push(item.content);
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }

    if (item.tags.length > 0) {
      lines.push(`Tags: ${item.tags.map(t => `\`${t}\``).join(' ')}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function renderItemMarkdown(item: FeedItem): string {
  const lines: string[] = [];

  lines.push(`## ${item.title}`);
  lines.push('');

  if (item.author || item.published) {
    const meta: string[] = [];
    if (item.author) meta.push(`*${item.author}*`);
    if (item.published) meta.push(formatDate(item.published));
    lines.push(meta.join(' | '));
    lines.push('');
  }

  if (item.link) {
    lines.push(`[Read more →](${item.link})`);
    lines.push('');
  }

  if (item.description) {
    lines.push(item.description);
    lines.push('');
  }

  if (item.content && item.content !== item.description) {
    lines.push(item.content);
    lines.push('');
  }

  if (item.tags.length > 0) {
    lines.push(`Tags: ${item.tags.map(t => `\`${t}\``).join(' ')}`);
  }

  return lines.join('\n');
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}
