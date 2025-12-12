/** Individual sleep period record */
export interface SleepPeriod {
  start: number;
  end: number;
  duration: number;
}

/** Metrics for system sleep tracking */
export interface SystemSleepMetrics {
  /** Total accumulated sleep time in milliseconds since service started */
  totalSleepMs: number;
  /** Array of recorded sleep periods */
  sleepPeriods: SleepPeriod[];
  /** Whether the system is currently sleeping */
  isCurrentlySleeping: boolean;
  /** Timestamp when current sleep started, if sleeping */
  currentSleepStart: number | null;
}
