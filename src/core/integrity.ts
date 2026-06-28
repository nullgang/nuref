import { createHash } from 'crypto';

export interface FeedFingerprint {
  feedId: string;
  contentHash: string;
  itemHashes: Map<string, string>;
  structuralHash: string;
  createdAt: string;
  lastVerified: string;
  tamperDetected: boolean;
}

export interface TamperResult {
  tampered: boolean;
  details: string[];
  timestamp: string;
}

export class FeedIntegrity {
  private fingerprints = new Map<string, FeedFingerprint>();

  createFingerprint(feedId: string, rawFeed: string, itemGuids: string[]): FeedFingerprint {
    const contentHash = this.hash(rawFeed);
    const structuralHash = this.hashStructural(itemGuids);
    const itemHashes = new Map<string, string>();

    for (const guid of itemGuids) {
      itemHashes.set(guid, this.hash(guid));
    }

    const fingerprint: FeedFingerprint = {
      feedId,
      contentHash,
      itemHashes,
      structuralHash,
      createdAt: new Date().toISOString(),
      lastVerified: new Date().toISOString(),
      tamperDetected: false,
    };

    this.fingerprints.set(feedId, fingerprint);
    return fingerprint;
  }

  verify(feedId: string, rawFeed: string, itemGuids: string[]): TamperResult {
    const existing = this.fingerprints.get(feedId);
    if (!existing) {
      return {
        tampered: false,
        details: ['No previous fingerprint found'],
        timestamp: new Date().toISOString(),
      };
    }

    const details: string[] = [];
    let tampered = false;

    const currentContentHash = this.hash(rawFeed);
    if (currentContentHash !== existing.contentHash) {
      details.push('Content hash mismatch');
      tampered = true;
    }

    const currentStructuralHash = this.hashStructural(itemGuids);
    if (currentStructuralHash !== existing.structuralHash) {
      details.push('Structural hash mismatch (items changed)');
      tampered = true;
    }

    for (const guid of itemGuids) {
      if (!existing.itemHashes.has(guid)) {
        details.push(`New item detected: ${guid}`);
      }
    }

    for (const guid of existing.itemHashes.keys()) {
      if (!itemGuids.includes(guid)) {
        details.push(`Item removed: ${guid}`);
        tampered = true;
      }
    }

    existing.lastVerified = new Date().toISOString();
    existing.tamperDetected = tampered;

    return {
      tampered,
      details,
      timestamp: new Date().toISOString(),
    };
  }

  getFingerprint(feedId: string): FeedFingerprint | null {
    return this.fingerprints.get(feedId) || null;
  }

  getAll(): FeedFingerprint[] {
    return Array.from(this.fingerprints.values());
  }

  remove(feedId: string): void {
    this.fingerprints.delete(feedId);
  }

  private hash(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  private hashStructural(itemGuids: string[]): string {
    const sorted = [...itemGuids].sort();
    return this.hash(sorted.join('|'));
  }
}
