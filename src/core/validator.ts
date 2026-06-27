import type { NormalizedItem } from './types.js';

export class Validator {
  validateItem(item: NormalizedItem): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!item.title && !item.link) {
      errors.push('Item must have either a title or a link');
    }

    if (item.link && !this.isValidUrl(item.link)) {
      errors.push(`Invalid URL: ${item.link}`);
    }

    if (item.image && !this.isValidUrl(item.image)) {
      errors.push(`Invalid image URL: ${item.image}`);
    }

    if (item.published && !this.isValidDate(item.published)) {
      errors.push(`Invalid date: ${item.published}`);
    }

    if (item.title && item.title.length > 1000) {
      errors.push('Title exceeds maximum length of 1000 characters');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  validateItems(items: NormalizedItem[]): { validItems: NormalizedItem[]; invalidCount: number; errors: string[] } {
    const validItems: NormalizedItem[] = [];
    const allErrors: string[] = [];
    let invalidCount = 0;

    for (const item of items) {
      const result = this.validateItem(item);
      if (result.valid) {
        validItems.push(item);
      } else {
        invalidCount++;
        allErrors.push(...result.errors);
      }
    }

    return { validItems, invalidCount, errors: allErrors };
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isValidDate(dateStr: string): boolean {
    try {
      const date = new Date(dateStr);
      return !isNaN(date.getTime());
    } catch {
      return false;
    }
  }
}
