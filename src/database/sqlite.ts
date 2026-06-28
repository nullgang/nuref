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
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000');
    this.db.pragma('mmap_size = 268435456');
    this.db.pragma('temp_store = MEMORY');

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
      CREATE INDEX IF NOT EXISTS items_feed_published ON items(feed_id, published);

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

    this.prepareStatements();
  }

  private stmts!: {
    saveFeed: Database.Statement;
    getFeed: Database.Statement;
    getFeedByUrl: Database.Statement;
    getAllFeeds: Database.Statement;
    deleteFeed: Database.Statement;
    updateFeedEtag: Database.Statement;
    saveItem: Database.Statement;
    getItem: Database.Statement;
    getItemByGuid: Database.Statement;
    getItemsByFeed: Database.Statement;
    getAllItems: Database.Statement;
    deleteItem: Database.Statement;
    getItemCount: Database.Statement;
    getItemCountByFeed: Database.Statement;
    getFeedCount: Database.Statement;
    searchFts: Database.Statement;
    searchByAuthor: Database.Statement;
    batchSaveItems: Database.Statement;
  };

  private prepareStatements(): void {
    this.stmts = {
      saveFeed: this.db.prepare(`INSERT OR REPLACE INTO feeds (id, title, description, link, image, language, format, url, etag, last_modified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`),
      getFeed: this.db.prepare('SELECT * FROM feeds WHERE id = ?'),
      getFeedByUrl: this.db.prepare('SELECT * FROM feeds WHERE url = ?'),
      getAllFeeds: this.db.prepare('SELECT * FROM feeds ORDER BY updated_at DESC'),
      deleteFeed: this.db.prepare('DELETE FROM feeds WHERE id = ?'),
      updateFeedEtag: this.db.prepare(`UPDATE feeds SET etag = ?, last_modified = ?, updated_at = datetime('now') WHERE id = ?`),
      saveItem: this.db.prepare(`INSERT OR REPLACE INTO items (id, title, description, content, author, published, updated, link, image, tags, guid, hash, feed_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
      getItem: this.db.prepare('SELECT * FROM items WHERE id = ?'),
      getItemByGuid: this.db.prepare('SELECT * FROM items WHERE feed_id = ? AND guid = ?'),
      getItemsByFeed: this.db.prepare('SELECT * FROM items WHERE feed_id = ? ORDER BY published DESC LIMIT ? OFFSET ?'),
      getAllItems: this.db.prepare('SELECT * FROM items ORDER BY published DESC LIMIT ? OFFSET ?'),
      deleteItem: this.db.prepare('DELETE FROM items WHERE id = ?'),
      getItemCount: this.db.prepare('SELECT COUNT(*) as count FROM items'),
      getItemCountByFeed: this.db.prepare('SELECT COUNT(*) as count FROM items WHERE feed_id = ?'),
      getFeedCount: this.db.prepare('SELECT COUNT(*) as count FROM feeds'),
      searchFts: this.db.prepare('SELECT rowid FROM items_fts WHERE items_fts MATCH ?'),
      searchByAuthor: this.db.prepare('SELECT * FROM items WHERE author LIKE ? ORDER BY published DESC LIMIT ? OFFSET ?'),
      batchSaveItems: this.db.prepare(`INSERT OR REPLACE INTO items (id, title, description, content, author, published, updated, link, image, tags, guid, hash, feed_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    };
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async saveFeed(feed: Feed): Promise<void> {
    this.stmts.saveFeed.run(feed.id, feed.title, feed.description, feed.link, feed.image, feed.language, feed.format, feed.url, feed.etag, feed.lastModified, feed.createdAt);
  }

  async getFeed(id: string): Promise<Feed | null> {
    const row = this.stmts.getFeed.get(id) as any;
    return row ? this.rowToFeed(row) : null;
  }

  async getFeedByUrl(url: string): Promise<Feed | null> {
    const row = this.stmts.getFeedByUrl.get(url) as any;
    return row ? this.rowToFeed(row) : null;
  }

  async getAllFeeds(): Promise<Feed[]> {
    const rows = this.stmts.getAllFeeds.all() as any[];
    return rows.map(row => this.rowToFeed(row));
  }

  async deleteFeed(id: string): Promise<void> {
    this.stmts.deleteFeed.run(id);
  }

  async updateFeedEtag(id: string, etag: string, lastModified: string): Promise<void> {
    this.stmts.updateFeedEtag.run(etag, lastModified, id);
  }

  async updateFeedMeta(id: string, meta: { title?: string; description?: string; link?: string; image?: string; language?: string }): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (meta.title !== undefined) { fields.push('title = ?'); values.push(meta.title); }
    if (meta.description !== undefined) { fields.push('description = ?'); values.push(meta.description); }
    if (meta.link !== undefined) { fields.push('link = ?'); values.push(meta.link); }
    if (meta.image !== undefined) { fields.push('image = ?'); values.push(meta.image); }
    if (meta.language !== undefined) { fields.push('language = ?'); values.push(meta.language); }

    if (fields.length === 0) return;

    fields.push('updated_at = datetime(\'now\')');
    values.push(id);

    this.db.prepare(`UPDATE feeds SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  async saveItem(item: FeedItem): Promise<void> {
    this.stmts.saveItem.run(item.id, item.title, item.description, item.content, item.author, item.published, item.updated, item.link, item.image, JSON.stringify(item.tags), item.guid, item.hash, item.feedId, item.createdAt);
  }

  async saveItems(items: FeedItem[]): Promise<void> {
    const insert = this.db.transaction((items: FeedItem[]) => {
      for (const item of items) {
        this.stmts.batchSaveItems.run(item.id, item.title, item.description, item.content, item.author, item.published, item.updated, item.link, item.image, JSON.stringify(item.tags), item.guid, item.hash, item.feedId, item.createdAt);
      }
    });
    insert(items);
  }

  async getItem(id: string): Promise<FeedItem | null> {
    const row = this.stmts.getItem.get(id) as any;
    return row ? this.rowToItem(row) : null;
  }

  async getItemByGuid(feedId: string, guid: string): Promise<FeedItem | null> {
    const row = this.stmts.getItemByGuid.get(feedId, guid) as any;
    return row ? this.rowToItem(row) : null;
  }

  async getItemsByFeed(feedId: string, limit = 50, offset = 0): Promise<FeedItem[]> {
    const rows = this.stmts.getItemsByFeed.all(feedId, limit, offset) as any[];
    return rows.map(row => this.rowToItem(row));
  }

  async getAllItems(limit = 50, offset = 0): Promise<FeedItem[]> {
    const rows = this.stmts.getAllItems.all(limit, offset) as any[];
    return rows.map(row => this.rowToItem(row));
  }

  async deleteItem(id: string): Promise<void> {
    this.stmts.deleteItem.run(id);
  }

  async search(filters: SearchFilters): Promise<SearchResult> {
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    let whereClauses: string[] = [];
    let params: any[] = [];

    if (filters.query) {
      const ftsResult = this.stmts.searchFts.all(filters.query) as any[];
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
      const row = this.stmts.getItemCountByFeed.get(feedId) as any;
      return row.count;
    }
    const row = this.stmts.getItemCount.get() as any;
    return row.count;
  }

  async getFeedCount(): Promise<number> {
    const row = this.stmts.getFeedCount.get() as any;
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
