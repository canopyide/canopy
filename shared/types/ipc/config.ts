/** Adaptive backoff metrics */
export interface AdaptiveBackoffMetrics {
  lastOperationDuration: number;
  consecutiveFailures: number;
  circuitBreakerTripped: boolean;
  currentInterval: number;
}

/** Terminal configuration for scrollback, etc. */
export interface TerminalConfig {
  scrollbackLines: number; // -1 for unlimited, otherwise 100-100000
  performanceMode: boolean;
  fontSize?: number;
  fontFamily?: string;
}
