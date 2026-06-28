import type { NormalizedItem } from './types.js';

export type TransformFunction = (item: NormalizedItem) => NormalizedItem | Promise<NormalizedItem>;

export interface TransformStep {
  name: string;
  fn: TransformFunction;
  enabled: boolean;
}

export class TransformPipeline {
  private steps: TransformStep[] = [];

  addStep(name: string, fn: TransformFunction): void {
    this.steps.push({ name, fn, enabled: true });
  }

  removeStep(name: string): void {
    this.steps = this.steps.filter(s => s.name !== name);
  }

  enableStep(name: string): void {
    const step = this.steps.find(s => s.name === name);
    if (step) step.enabled = true;
  }

  disableStep(name: string): void {
    const step = this.steps.find(s => s.name === name);
    if (step) step.enabled = false;
  }

  async process(item: NormalizedItem): Promise<NormalizedItem> {
    let result = { ...item };

    for (const step of this.steps) {
      if (!step.enabled) continue;
      try {
        result = await step.fn(result);
      } catch (error) {
        console.error(`[Transform] Step "${step.name}" failed:`, error);
      }
    }

    return result;
  }

  async processAll(items: NormalizedItem[]): Promise<NormalizedItem[]> {
    const results: NormalizedItem[] = [];
    for (const item of items) {
      results.push(await this.process(item));
    }
    return results;
  }

  getSteps(): TransformStep[] {
    return [...this.steps];
  }
}

export function truncateText(maxLength: number): TransformFunction {
  return (item) => ({
    ...item,
    description: item.description.length > maxLength
      ? item.description.slice(0, maxLength) + '...'
      : item.description,
  });
}

export function prefixTitle(prefix: string): TransformFunction {
  return (item) => ({
    ...item,
    title: `${prefix}${item.title}`,
  });
}

export function filterByKeyword(keywords: string[]): TransformFunction {
  return (item) => {
    const text = `${item.title} ${item.description} ${item.tags.join(' ')}`.toLowerCase();
    const matches = keywords.some(kw => text.includes(kw.toLowerCase()));
    return matches ? item : { ...item, title: '', description: '' };
  };
}

export function addTag(tag: string): TransformFunction {
  return (item) => ({
    ...item,
    tags: [...new Set([...item.tags, tag])],
  });
}

export function replaceInTitle(search: string, replace: string): TransformFunction {
  return (item) => ({
    ...item,
    title: item.title.replaceAll(search, replace),
  });
}
