# nuref

Universal Feed Processing Engine — fetch, parse, normalize, search, deduplicate, and generate any feed format.

## Features

### Core Engine
- **Fetch Engine** — Download feeds with retry, timeout, user-agent, proxy, compression, conditional GET (ETag/Last-Modified), rate limiting
- **Format Detection** — Auto-detect RSS 2.0, Atom, RDF, JSON Feed, XML Sitemap
- **Universal Parser** — All formats normalized to a single internal object
- **XML Engine** — Read, write, validate, beautify, minify, XPath, namespace, CDATA
- **Normalizer** — Unify field names across formats (pubDate/updated → published)
- **Validator** — Item validation with URL, date, and length checks
- **Duplicate Detector** — Hash, GUID, link, title similarity deduplication

### Data Layer
- **Database** — SQLite with FTS5 full-text search, abstract interface for Postgres/MySQL/MongoDB
- **Cache** — TTL-based in-memory cache
- **Search Engine** — Full-text search on title, description, content, author, tags

### Processing Pipeline
- **Content Extractor** — Extract clean text, metadata, and links from HTML
- **Transform Pipeline** — Custom item transforms (truncate, filter, tag, replace)
- **Health Monitor** — Track fetch success/failure rates, response times, uptime

### Scheduling & Webhooks
- **Scheduler** — Cron-based feed polling with new-content detection
- **Webhook Manager** — Trigger webhooks on new content with HMAC signature verification
- **Rate Limiter** — Per-host rate limiting to respect server limits

### Organization
- **Category Manager** — Organize feeds into categories with hierarchy
- **Feed Tags** — Tag feeds for flexible organization
- **Enclosure Handler** — Download and track media attachments

### Output
- **Feed Generator** — Export to RSS, Atom, JSON Feed, XML Sitemap
- **Bulk Operations** — Batch add, sync, delete, and export feeds
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

# Sync all feeds
npx nuref sync

# Sync specific feed
npx nuref sync <feed-id>

# Search items
npx nuref search bitcoin

# Export as RSS
npx nuref export <feed-id> rss

# Export as Atom
npx nuref export <feed-id> atom

# Statistics
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
Internet → Fetch (rate limit) → Detect → Parse → Normalize → Validate → Dedup → Store → Search → Schedule → Export
                ↓                                                                    ↑
          Health Monitor                                                      Transform Pipeline
                ↓                                                                    ↑
          Webhook Trigger                                                    Content Extractor
```

All modules work together as one unified engine for feed processing.

## Engine Modules

```
nuref/
├── core/
│   ├── fetcher.ts          # HTTP fetch with retry, rate limit
│   ├── detector.ts         # Format auto-detection
│   ├── parser.ts           # Universal XML/JSON parser
│   ├── normalizer.ts       # Field normalization
│   ├── validator.ts        # Item validation
│   ├── duplicate.ts        # Deduplication
│   ├── extractor.ts        # HTML content extraction
│   ├── transforms.ts       # Transform pipeline
│   ├── health.ts           # Health monitoring
│   ├── rate-limiter.ts     # Per-host rate limiting
│   ├── webhook.ts          # Webhook management
│   ├── bulk.ts             # Bulk operations
│   ├── enclosure.ts        # Media handling
│   ├── category.ts         # Categories & tags
│   └── types.ts            # Type definitions
├── xml/
│   └── engine.ts           # XML read/write/validate/beautify/minify
├── database/
│   └── sqlite.ts           # SQLite + FTS5
├── cache/
│   └── cache.ts            # TTL cache
├── scheduler/
│   └── scheduler.ts        # Cron scheduling
├── generator/
│   └── generator.ts        # RSS/Atom/JSON/Sitemap output
├── api/
│   └── server.ts           # REST API
└── cli/
    └── index.ts            # CLI interface
```

## License

MIT
