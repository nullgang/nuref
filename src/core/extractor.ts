export interface ExtractedContent {
  title: string;
  text: string;
  description: string;
  author: string;
  published: string;
  image: string;
  links: string[];
  tags: string[];
}

export class ContentExtractor {
  extract(html: string): ExtractedContent {
    const text = this.extractText(html);
    const description = this.extractDescription(html);
    const title = this.extractTitle(html);
    const author = this.extractMeta(html, 'author') || this.extractMeta(html, 'article:author');
    const published = this.extractMeta(html, 'article:published_time') || this.extractMeta(html, 'date') || this.extractMeta(html, 'pubdate');
    const image = this.extractImage(html);
    const links = this.extractLinks(html);
    const tags = this.extractTags(html);

    return { title, text, description, author, published, image, links, tags };
  }

  extractText(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&\w+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  extractDescription(html: string): string {
    return (
      this.extractMeta(html, 'description') ||
      this.extractMeta(html, 'og:description') ||
      this.extractMeta(html, 'twitter:description') ||
      this.extractMeta(html, 'og:title') ||
      ''
    );
  }

  extractTitle(html: string): string {
    return (
      this.extractMeta(html, 'og:title') ||
      this.extractMeta(html, 'twitter:title') ||
      this.extractBetween(html, '<title[^>]*>', '</title>') ||
      this.extractMeta(html, 'title') ||
      ''
    );
  }

  extractAuthor(html: string): string {
    return (
      this.extractMeta(html, 'author') ||
      this.extractMeta(html, 'article:author') ||
      this.extractMeta(html, 'twitter:creator') ||
      this.extractBetween(html, '<span[^>]*class="[^"]*author[^"]*"[^>]*>', '</span>') ||
      ''
    );
  }

  extractImage(html: string): string {
    return (
      this.extractMeta(html, 'og:image') ||
      this.extractMeta(html, 'twitter:image') ||
      this.extractMeta(html, 'twitter:image:src') ||
      this.extractMeta(html, 'image') ||
      ''
    );
  }

  extractLinks(html: string): string[] {
    const links: string[] = [];
    const regex = /href="([^"]+)"/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const url = match[1];
      if (url.startsWith('http') && !links.includes(url)) {
        links.push(url);
      }
    }
    return links.slice(0, 50);
  }

  extractTags(html: string): string[] {
    const tags: string[] = [];
    const ogTags = this.extractMeta(html, 'article:tag');
    if (ogTags) tags.push(...ogTags.split(',').map(t => t.trim()));

    const keywordMeta = this.extractMeta(html, 'keywords');
    if (keywordMeta) tags.push(...keywordMeta.split(',').map(t => t.trim()));

    const hashtagRegex = /#(\w+)/g;
    let match;
    while ((match = hashtagRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase();
      if (!tags.includes(tag)) tags.push(tag);
    }

    return [...new Set(tags)].slice(0, 20);
  }

  private extractMeta(html: string, name: string): string {
    const patterns = [
      new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'),
      new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${name}["']`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return match[1].trim();
    }

    return '';
  }

  private extractBetween(html: string, startPattern: string, endPattern: string): string {
    const regex = new RegExp(`${startPattern}([\\s\\S]*?)${endPattern}`, 'i');
    const match = html.match(regex);
    if (!match) return '';
    return match[1].replace(/<[^>]+>/g, '').trim();
  }
}
