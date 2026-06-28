import { randomUUID } from 'crypto';

export interface FeedCategory {
  id: string;
  name: string;
  description: string;
  color: string;
  parentId: string | null;
  createdAt: string;
}

export interface FeedTag {
  id: string;
  name: string;
  feedId: string;
  createdAt: string;
}

export class CategoryManager {
  private categories = new Map<string, FeedCategory>();
  private feedTags = new Map<string, FeedTag[]>();
  private feedCategories = new Map<string, string[]>();

  createCategory(name: string, description = '', color = '#000000', parentId: string | null = null): FeedCategory {
    const category: FeedCategory = {
      id: randomUUID(),
      name,
      description,
      color,
      parentId,
      createdAt: new Date().toISOString(),
    };
    this.categories.set(category.id, category);
    return category;
  }

  updateCategory(id: string, updates: Partial<Pick<FeedCategory, 'name' | 'description' | 'color' | 'parentId'>>): void {
    const category = this.categories.get(id);
    if (category) {
      Object.assign(category, updates);
    }
  }

  deleteCategory(id: string): void {
    this.categories.delete(id);
    for (const [feedId, catIds] of this.feedCategories) {
      this.feedCategories.set(feedId, catIds.filter(c => c !== id));
    }
  }

  getCategory(id: string): FeedCategory | null {
    return this.categories.get(id) || null;
  }

  getAllCategories(): FeedCategory[] {
    return Array.from(this.categories.values());
  }

  getChildren(parentId: string): FeedCategory[] {
    return Array.from(this.categories.values()).filter(c => c.parentId === parentId);
  }

  assignFeed(feedId: string, categoryId: string): void {
    const existing = this.feedCategories.get(feedId) || [];
    if (!existing.includes(categoryId)) {
      existing.push(categoryId);
      this.feedCategories.set(feedId, existing);
    }
  }

  unassignFeed(feedId: string, categoryId: string): void {
    const existing = this.feedCategories.get(feedId) || [];
    this.feedCategories.set(feedId, existing.filter(c => c !== categoryId));
  }

  getFeedCategories(feedId: string): FeedCategory[] {
    const catIds = this.feedCategories.get(feedId) || [];
    return catIds.map(id => this.categories.get(id)).filter(Boolean) as FeedCategory[];
  }

  getFeedsByCategory(categoryId: string): string[] {
    const feedIds: string[] = [];
    for (const [feedId, catIds] of this.feedCategories) {
      if (catIds.includes(categoryId)) feedIds.push(feedId);
    }
    return feedIds;
  }

  addTag(feedId: string, tagName: string): FeedTag {
    const tag: FeedTag = {
      id: randomUUID(),
      name: tagName.toLowerCase().trim(),
      feedId,
      createdAt: new Date().toISOString(),
    };

    const existing = this.feedTags.get(feedId) || [];
    if (!existing.find(t => t.name === tag.name)) {
      existing.push(tag);
      this.feedTags.set(feedId, existing);
    }

    return tag;
  }

  removeTag(feedId: string, tagName: string): void {
    const existing = this.feedTags.get(feedId) || [];
    this.feedTags.set(feedId, existing.filter(t => t.name !== tagName.toLowerCase().trim()));
  }

  getFeedTags(feedId: string): FeedTag[] {
    return this.feedTags.get(feedId) || [];
  }

  getFeedsByTag(tagName: string): string[] {
    const target = tagName.toLowerCase().trim();
    const feedIds: string[] = [];
    for (const [feedId, tags] of this.feedTags) {
      if (tags.some(t => t.name === target)) feedIds.push(feedId);
    }
    return feedIds;
  }

  getAllTags(): string[] {
    const tags = new Set<string>();
    for (const feedTags of this.feedTags.values()) {
      for (const tag of feedTags) {
        tags.add(tag.name);
      }
    }
    return Array.from(tags).sort();
  }
}
