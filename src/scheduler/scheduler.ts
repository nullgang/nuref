import cron from 'node-cron';
import type { SchedulerTask } from '../core/types.js';

export type SyncCallback = (feedId: string) => Promise<void>;

export class Scheduler {
  private tasks = new Map<string, cron.ScheduledTask>();
  private taskConfigs = new Map<string, SchedulerTask>();
  private syncCallback: SyncCallback;

  constructor(syncCallback: SyncCallback) {
    this.syncCallback = syncCallback;
  }

  addTask(feedId: string, cronExpression: string): SchedulerTask {
    if (this.tasks.has(feedId)) {
      this.removeTask(feedId);
    }

    const task: SchedulerTask = {
      id: feedId,
      feedId,
      cron: cronExpression,
      enabled: true,
      lastRun: '',
      nextRun: '',
    };

    const scheduled = cron.schedule(cronExpression, async () => {
      task.lastRun = new Date().toISOString();
      try {
        await this.syncCallback(feedId);
      } catch (error) {
        console.error(`[Scheduler] Error syncing feed ${feedId}:`, error);
      }
    }, {
      timezone: 'UTC',
    });

    this.tasks.set(feedId, scheduled);
    this.taskConfigs.set(feedId, task);

    return task;
  }

  removeTask(feedId: string): void {
    const task = this.tasks.get(feedId);
    if (task) {
      task.stop();
      this.tasks.delete(feedId);
      this.taskConfigs.delete(feedId);
    }
  }

  enableTask(feedId: string): void {
    const task = this.tasks.get(feedId);
    const config = this.taskConfigs.get(feedId);
    if (task && config) {
      task.start();
      config.enabled = true;
    }
  }

  disableTask(feedId: string): void {
    const task = this.tasks.get(feedId);
    const config = this.taskConfigs.get(feedId);
    if (task && config) {
      task.stop();
      config.enabled = false;
    }
  }

  getTask(feedId: string): SchedulerTask | undefined {
    return this.taskConfigs.get(feedId);
  }

  getAllTasks(): SchedulerTask[] {
    return Array.from(this.taskConfigs.values());
  }

  stopAll(): void {
    for (const [feedId] of this.tasks) {
      this.removeTask(feedId);
    }
  }
}
