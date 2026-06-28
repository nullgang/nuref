export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenMax?: number;
  monitoringPeriod?: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private options: Required<CircuitBreakerOptions>;
  private circuits = new Map<string, CircuitState>();

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      resetTimeout: options.resetTimeout || 60000,
      halfOpenMax: options.halfOpenMax || 3,
      monitoringPeriod: options.monitoringPeriod || 10000,
    };
  }

  getState(circuitId: string = 'default'): CircuitState {
    const state = this.circuits.get(circuitId) || 'closed';
    if (state === 'open') {
      const lastFailure = this.lastFailureTime;
      if (Date.now() - lastFailure >= this.options.resetTimeout) {
        this.circuits.set(circuitId, 'half-open');
        this.halfOpenAttempts = 0;
        return 'half-open';
      }
    }
    return state;
  }

  async execute<T>(circuitId: string, fn: () => Promise<T>): Promise<T> {
    const state = this.getState(circuitId);
    if (state === 'open') {
      throw new Error(`Circuit "${circuitId}" is open`);
    }

    try {
      const result = await fn();
      this.onSuccess(circuitId);
      return result;
    } catch (error) {
      this.onFailure(circuitId);
      throw error;
    }
  }

  onSuccess(circuitId: string): void {
    const state = this.getState(circuitId);
    if (state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.options.halfOpenMax) {
        this.circuits.set(circuitId, 'closed');
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  onFailure(circuitId: string): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    const state = this.getState(circuitId);
    if (state === 'half-open') {
      this.circuits.set(circuitId, 'open');
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.circuits.set(circuitId, 'open');
    }
  }

  reset(circuitId: string = 'default'): void {
    this.circuits.delete(circuitId);
    this.failureCount = 0;
    this.successCount = 0;
  }

  resetAll(): void {
    this.circuits.clear();
    this.failureCount = 0;
    this.successCount = 0;
  }

  getAllStates(): Record<string, CircuitState> {
    const states: Record<string, CircuitState> = {};
    for (const [id, state] of this.circuits) {
      states[id] = this.getState(id);
    }
    return states;
  }
}
