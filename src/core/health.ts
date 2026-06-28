export interface HealthRecord {
  feedId: string;
  fetchCount: number;
  successCount: number;
  failCount: number;
  avgResponseTime: number;
  lastFetchAt: string;
  lastError: string;
  lastSuccessAt: string;
  uptime: number;
  responseTimes: number[];
}

export class HealthMonitor {
  private records = new Map<string, HealthRecord>();

  recordSuccess(feedId: string, responseTimeMs: number): void {
    const record = this.getOrCreate(feedId);
    record.fetchCount++;
    record.successCount++;
    record.avgResponseTime = (record.avgResponseTime * (record.successCount - 1) + responseTimeMs) / record.successCount;
    record.lastFetchAt = new Date().toISOString();
    record.lastSuccessAt = new Date().toISOString();
    record.lastError = '';
    record.responseTimes.push(responseTimeMs);
    if (record.responseTimes.length > 100) record.responseTimes.shift();
    record.uptime = record.fetchCount > 0 ? record.successCount / record.fetchCount : 1;
  }

  recordFailure(feedId: string, error: string): void {
    const record = this.getOrCreate(feedId);
    record.fetchCount++;
    record.failCount++;
    record.lastFetchAt = new Date().toISOString();
    record.lastError = error;
    record.uptime = record.fetchCount > 0 ? record.successCount / record.fetchCount : 0;
  }

  getRecord(feedId: string): HealthRecord | null {
    return this.records.get(feedId) || null;
  }

  getAll(): HealthRecord[] {
    return Array.from(this.records.values());
  }

  getUptime(feedId: string): number {
    const record = this.records.get(feedId);
    return record ? record.uptime : 0;
  }

  getAvgResponseTime(feedId: string): number {
    const record = this.records.get(feedId);
    return record ? record.avgResponseTime : 0;
  }

  isHealthy(feedId: string): boolean {
    const record = this.records.get(feedId);
    if (!record || record.fetchCount === 0) return true;
    return record.uptime >= 0.9;
  }

  reset(feedId?: string): void {
    if (feedId) {
      this.records.delete(feedId);
    } else {
      this.records.clear();
    }
  }

  private getOrCreate(feedId: string): HealthRecord {
    let record = this.records.get(feedId);
    if (!record) {
      record = {
        feedId,
        fetchCount: 0,
        successCount: 0,
        failCount: 0,
        avgResponseTime: 0,
        lastFetchAt: '',
        lastError: '',
        lastSuccessAt: '',
        uptime: 1,
        responseTimes: [],
      };
      this.records.set(feedId, record);
    }
    return record;
  }
}
