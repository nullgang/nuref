# nuref

Universal Feed Processing Engine — fetch, parse, normalize, search, deduplicate, and generate any feed format.

## Features

- **Fetch Engine** — Download feeds with retry, timeout, user-agent, proxy, compression, conditional GET (ETag/Last-Modified)
- **Format Detection** — Auto-detect RSS 2.0, Atom, RDF, JSON Feed, XML Sitemap
- **Universal Parser** — All formats normalized to a single internal object
- **XML Engine** — Read, write, validate, beautify, minify, XPath, namespace, CDATA
- **Normalizer** — Unify field names across formats (pubDate/updated → published)
- **Database Layer** — SQLite (default), abstract interface for Postgres/MySQL/MongoDB
- **Search Engine** — Full-text search via FTS5 on title, description, content, author, tags
- **Scheduler** — Cron-based feed polling, detect new content only
- **Duplicate Detector** — Hash, GUID, link, title similarity deduplication
- **Feed Generator** — Export to RSS, Atom, JSON Feed, XML Sitemap
- **API Server** — REST API with Hono
- **CLI** — Command-line interface for all operations

## Quick Start

```bash
npm install
npm run build
```

### CLI

```bash
# Add a feed
npx nuref add https://example.com/feed.xml

# Add with scheduling
npx nuref add https://example.com/feed.xml -c "*/5 * * * *"

# List all feeds
npx nuref list

# Sync feed
npx nuref sync

# Search
npx nuref search bitcoin

# Export as RSS
npx nuref export <feed-id> rss

# Export as Atom
npx nuref export <feed-id> atom

# Stats
npx nuref stats
```

### API Server

```bash
# Start API server (default port 3000)
npx tsx src/api/server.ts
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/feeds` | List all feeds |
| GET | `/feeds/:id` | Get feed by ID |
| POST | `/feeds` | Add new feed `{ url, cron? }` |
| DELETE | `/feeds/:id` | Remove feed |
| GET | `/feeds/:id/sync` | Sync feed |
| GET | `/feeds/:id/items` | Get feed items |
| GET | `/items` | List all items |
| GET | `/search?q=...` | Search items |
| GET | `/feeds/:id/rss` | Export as RSS |
| GET | `/feeds/:id/atom` | Export as Atom |
| GET | `/feeds/:id/json` | Export as JSON Feed |
| GET | `/feeds/:id/sitemap` | Export as Sitemap |
| GET | `/scheduler` | List scheduled tasks |
| POST | `/scheduler` | Add scheduled task |
| GET | `/stats` | Statistics |
| GET | `/health` | Health check |

## Architecture

```
Internet → Fetch → Detect → Parse → Normalize → Validate → Dedup → Store → Search → Schedule → Export
```

All modules work together as one unified engine for feed processing.

## License

MIT
