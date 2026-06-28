import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export class XmlEngine {
  private parser: XMLParser;
  private builder: XMLBuilder;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      allowBooleanAttributes: true,
      parseTagValue: true,
      trimValues: true,
      textNodeName: '#text',
      processEntities: true,
      htmlEntities: true,
    });

    this.builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      format: true,
      indentBy: '  ',
      suppressEmptyNode: false,
    });
  }

  read(xml: string): any {
    return this.parser.parse(xml);
  }

  write(obj: any, options?: { format?: boolean; indent?: string }): string {
    return this.builder.build(obj);
  }

  validate(xml: string): { valid: boolean; error?: string } {
    try {
      this.parser.parse(xml);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  beautify(xml: string): string {
    const parsed = this.parser.parse(xml);
    return this.builder.build(parsed);
  }

  minify(xml: string): string {
    const parsed = this.parser.parse(xml);
    return new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      format: false,
      suppressEmptyNode: true,
    }).build(parsed);
  }

  xpath(xml: string, expression: string): any[] {
    const doc = this.parser.parse(xml);
    return this.evaluateXPath(doc, expression);
  }

  private evaluateXPath(obj: any, path: string): any[] {
    const parts = path.split('/').filter(Boolean);
    let current: any = obj;
    const results: any[] = [];

    for (const part of parts) {
      if (current === null || current === undefined) break;

      if (part === '..') {
        continue;
      }

      if (part === '*') {
        if (typeof current === 'object' && !Array.isArray(current)) {
          current = Object.values(current);
        }
        continue;
      }

      if (Array.isArray(current)) {
        const nextResults: any[] = [];
        for (const item of current) {
          if (item && typeof item === 'object' && part in item) {
            nextResults.push(item[part]);
          }
        }
        current = nextResults.length === 1 ? nextResults[0] : nextResults;
        continue;
      }

      if (typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        current = undefined;
        break;
      }
    }

    if (Array.isArray(current)) {
      return current;
    }

    return current !== undefined ? [current] : [];
  }

  addNamespace(xml: string, prefix: string, uri: string): string {
    const rootMatch = xml.match(/<(\w+)[^>]*>/);
    if (!rootMatch) return xml;

    const rootTag = rootMatch[0];
    if (rootTag.includes(`xmlns:${prefix}`)) return xml;

    const newRoot = rootTag.replace('>', ` xmlns:${prefix}="${uri}">`);
    return xml.replace(rootTag, newRoot);
  }

  wrapCdata(text: string): string {
    if (text.includes(']]>')) {
      text = text.replace(/\]\]>/g, ']]]]><![CDATA[>');
    }
    return `<![CDATA[${text}]]>`;
  }

  unwrapCdata(text: string): string {
    return text
      .replace(/<!\[CDATA\[/g, '')
      .replace(/\]\]>/g, '')
      .replace(/\]\]>\s*<!\[CDATA\[/g, '');
  }
}
