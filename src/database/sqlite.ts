import Database from 'better-sqlite3';
import { Database as BaseDatabase } from './database.js';
import type { Feed, FeedItem, SearchFilters, SearchResult } from '../core/types.js';
import { randomUUID } from 'crypto';

export class SqliteDatabase extends BaseDatabase {
  private db!: Database.Database;
  private dbPath: string;

  constructor(dbPath: string = 'nuref.db') {
    super();
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feeds (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        link TEXT NOT NULL DEFAULT '',
        image TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT '',
        format TEXT NOT NULL DEFAULT 'unknown',
        url TEXT NOT NULL UNIQUE,
        etag TEXT NOT NULL DEFAULT '',
        last_modified TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '',
        published TEXT NOT NULL DEFAULT '',
        updated TEXT NOT NULL DEFAULT '',
        link TEXT NOT NULL DEFAULT '',
        image TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        guid TEXT NOT NULL DEFAULT '',
        hash TEXT NOT NULL DEFAULT '',
        feed_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS items_feed_id ON items(feed_id);
      CREATE INDEX IF NOT EXISTS items_hash ON items(hash);
      CREATE INDEX IF NOT EXISTS items_published ON items(published);
      CREATE INDEX IF NOT EXISTS items_guid ON items(guid);

      CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
        title, description, content, author, tags,
        content='items',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
        INSERT INTO items_fts(rowid, title, description, content, author, tags)
        VALUES (new.rowid, new.title, new.description, new.content, new.author, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
        INSERT INTO items_fts(items_fts, rowid, title, description, content, author, tags)
        VALUES ('delete', old.rowid, old.title, old.description, old.content, old.author, old.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
        INSERT INTO items_fts(items_fts, rowid, title, description, content, author, tags)
        VALUES ('delete', old.rowid, old.title, old.description, old.content, old.author, old.tags);
        INSERT INTO items_fts(rowid, title, description, content, author, tags)
        VALUES (new.rowid, new.title, new.description, new.content, new.author, new.tags);
      END;
    `);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async saveFeed(feed: Feed): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO feeds (id, title, description, link, image, language, format, url, etag, last_modified, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    stmt.run(feed.id, feed.title, feed.description, feed.link, feed.image, feed.language, feed.format, feed.url, feed.etag, feed.lastModified, feed.createdAt);
  }

  async getFeed(id: string): Promise<Feed | null> {
    const row = this.db.prepare('SELECT * FROM feeds WHERE id = ?').get(id) as any;
    return row ? this.rowToFeed(row) : null;
  }

  async getFeedByUrl(url: string): Promise<Feed | null> {
    const row = this.db.prepare('SELECT * FROM feeds WHERE url = ?').get(url) as any;
    return row ? this.rowToFeed(row) : null;
  }

  async getAllFeeds(): Promise<Feed[]> {
    const rows = this.db.prepare('SELECT * FROM feeds ORDER BY updated_at DESC').all() as any[];
    return rows.map(row => this.rowToFeed(row));
  }

  async deleteFeed(id: string): Promise<void> {
    this.db.prepare('DELETE FROM feeds WHERE id = ?').run(id);
  }

  async updateFeedEtag(id: string, etag: string, lastModified: string): Promise<void> {
    this.db.prepare('UPDATE feeds SET etag = ?, last_modified = ?, updated_at = datetime(\'now\') WHERE id = ?').run(etag, lastModified, id);
  }

  async saveItem(item: FeedItem): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO items (id, title, description, content, author, published, updated, link, image, tags, guid, hash, feed_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(item.id, item.title, item.description, item.content, item.author, item.published, item.updated, item.link, item.image, JSON.stringify(item.tags), item.guid, item.hash, item.feedId, item.createdAt);
  }

  async getItem(id: string): Promise<FeedItem | null> {
    const row = this.db.prepare('SELECT * FROM items WHERE id = ?').get(id) as any;
    return row ? this.rowToItem(row) : null;
  }

  async getItemByGuid(feedId: string, guid: string): Promise<FeedItem | null> {
    const row = this.db.prepare('SELECT * FROM items WHERE feed_id = ? AND guid = ?').get(feedId, guid) as any;
    return row ? this.rowToItem(row) : null;
  }

  async getItemsByFeed(feedId: string, limit = 50, offset = 0): Promise<FeedItem[]> {
    const rows = this.db.prepare('SELECT * FROM items WHERE feed_id = ? ORDER BY published DESC LIMIT ? OFFSET ?').all(feedId, limit, offset) as any[];
    return rows.map(row => this.rowToItem(row));
  }

  async getAllItems(limit = 50, offset = 0): Promise<FeedItem[]> {
    const rows = this.db.prepare('SELECT * FROM items ORDER BY published DESC LIMIT ? OFFSET ?').all(limit, offset) as any[];
    return rows.map(row => this.rowToItem(row));
  }

  async deleteItem(id: string): Promise<void> {
    this.db.prepare('DELETE FROM items WHERE id = ?').run(id);
  }

  async search(filters: SearchFilters): Promise<SearchResult> {
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    let whereClauses: string[] = [];
    let params: any[] = [];

    if (filters.query) {
      const ftsResult = this.db.prepare(`
        SELECT rowid FROM items_fts WHERE items_fts MATCH ?
      `).all(filters.query) as any[];
      const rowIds = ftsResult.map((r: any) => r.rowid);
      if (rowIds.length === 0) {
        return { items: [], total: 0, limit, offset };
      }
      whereClauses.push(`rowid IN (${rowIds.map(() => '?').join(',')})`);
      params.push(...rowIds);
    }

    if (filters.feedId) {
      whereClauses.push('feed_id = ?');
      params.push(filters.feedId);
    }

    if (filters.author) {
      whereClauses.push('author LIKE ?');
      params.push(`%${filters.author}%`);
    }

    if (filters.from) {
      whereClauses.push('published >= ?');
      params.push(filters.from);
    }

    if (filters.to) {
      whereClauses.push('published <= ?');
      params.push(filters.to);
    }

    if (filters.tag) {
      whereClauses.push('tags LIKE ?');
      params.push(`%${filters.tag}%`);
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = this.db.prepare(`SELECT COUNT(*) as total FROM items ${where}`).get(...params) as any;
    const total = countRow.total;

    const rows = this.db.prepare(`SELECT * FROM items ${where} ORDER BY published DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as any[];

    return {
      items: rows.map(row => this.rowToItem(row)),
      total,
      limit,
      offset,
    };
  }

  async getItemCount(feedId?: string): Promise<number> {
    if (feedId) {
      const row = this.db.prepare('SELECT COUNT(*) as count FROM items WHERE feed_id = ?').get(feedId) as any;
      return row.count;
    }
    const row = this.db.prepare('SELECT COUNT(*) as count FROM items').get() as any;
    return row.count;
  }

  async getFeedCount(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM feeds').get() as any;
    return row.count;
  }

  private rowToFeed(row: any): Feed {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      link: row.link,
      image: row.image,
      language: row.language,
      format: row.format,
      url: row.url,
      etag: row.etag,
      lastModified: row.last_modified,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToItem(row: any): FeedItem {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      content: row.content,
      author: row.author,
      published: row.published,
      updated: row.updated,
      link: row.link,
      image: row.image,
      tags: JSON.parse(row.tags),
      guid: row.guid,
      hash: row.hash,
      feedId: row.feed_id,
      createdAt: row.created_at,
    };
  }
}
