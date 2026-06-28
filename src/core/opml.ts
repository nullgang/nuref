import type { Feed, FeedItem } from './types.js';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export function exportOpml(feeds: Feed[]): string {
  const outlines = feeds.map(feed => {
    const xmlUrl = feed.url;
    const htmlUrl = feed.link;
    const title = escapeXml(feed.title);
    const description = escapeXml(feed.description);

    return `    <outline text="${title}" title="${title}" type="rss" xmlUrl="${escapeAttr(xmlUrl)}" htmlUrl="${escapeAttr(htmlUrl)}" description="${description}"/>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Nuref Feed Export</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
    <ownerName>nuref</ownerName>
  </head>
  <body>
${outlines}
  </body>
</opml>`;
}

export function parseOpml(opml: string): { title: string; feeds: { title: string; url: string; description: string }[] } {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  const doc = parser.parse(opml);
  const head = doc.opml?.head || {};
  const body = doc.opml?.body || {};
  const outlines = body.outline || [];

  const title = head.title || 'Imported Feeds';
  const feedOutlines = Array.isArray(outlines) ? outlines : [outlines];
  const feeds: { title: string; url: string; description: string }[] = [];

  for (const outline of feedOutlines) {
    if (outline['@_xmlUrl']) {
      feeds.push({
        title: outline['@_title'] || outline['@_text'] || '',
        url: outline['@_xmlUrl'],
        description: outline['@_description'] || '',
      });
    }

    if (outline.outline) {
      const nested = Array.isArray(outline.outline) ? outline.outline : [outline.outline];
      for (const child of nested) {
        if (child['@_xmlUrl']) {
          feeds.push({
            title: child['@_title'] || child['@_text'] || '',
            url: child['@_xmlUrl'],
            description: child['@_description'] || '',
          });
        }
      }
    }
  }

  return { title, feeds };
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
