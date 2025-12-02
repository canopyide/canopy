/**
 * Simple activity monitor that tracks PTY data flow.
 * Sets "busy" state when data is received, "idle" when silent.
 */
export class ActivityMonitor {
  private state: "busy" | "idle" = "idle";
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_MS = 1000;

  constructor(
    private terminalId: string,
    private onStateChange: (id: string, state: "busy" | "idle") => void
  ) {}

  /**
   * Called on every data event from PTY.
   * Immediately sets state to busy if idle, resets silence timer.
   */
  onData(): void {
    // Transition to busy if currently idle
    if (this.state === "idle") {
      this.state = "busy";
      this.onStateChange(this.terminalId, "busy");
    }

    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer for idle transition
    this.debounceTimer = setTimeout(() => {
      this.state = "idle";
      this.onStateChange(this.terminalId, "idle");
    }, this.DEBOUNCE_MS);
  }

  /**
   * Clean up timer when terminal is destroyed.
   */
  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  getState(): "busy" | "idle" {
    return this.state;
  }
}
