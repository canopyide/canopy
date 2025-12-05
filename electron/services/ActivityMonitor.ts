export class ActivityMonitor {
  private state: "busy" | "idle" = "idle";
  private debounceTimer: NodeJS.Timeout | null = null;
  // 1.5 seconds silence required to consider the agent "waiting"
  private readonly DEBOUNCE_MS = 1500;

  constructor(
    private terminalId: string,
    private onStateChange: (id: string, state: "busy" | "idle") => void
  ) {}

  /**
   * Called when user sends input to the terminal.
   * Proactively transitions to BUSY on Enter key.
   */
  onInput(data: string): void {
    // Ignore Shift+Enter sequence (\x1b\r) sent by XtermAdapter for soft line breaks.
    if (data === "\x1b\r") {
      return;
    }

    // Use includes() to handle pasted text or grouped keystrokes.
    // We look for \r (Return) or \n (Newline).
    const hasEnter = data.includes("\r") || data.includes("\n");

    // If we see an Enter key, we assume the user submitted a command.
    if (hasEnter) {
      this.becomeBusy();
    }
  }

  /**
   * Called on every data event from PTY (output received).
   * Only extends the BUSY state; never triggers it.
   */
  onData(): void {
    // If we are already busy, any output resets the "silence" timer.
    // If we are idle, we ignore output (background noise).
    if (this.state === "busy") {
      this.resetDebounceTimer();
    }
  }

  private becomeBusy(): void {
    // Always reset the timer when activity happens
    this.resetDebounceTimer();

    // Only fire state change if we weren't already busy
    if (this.state !== "busy") {
      this.state = "busy";
      this.onStateChange(this.terminalId, "busy");
    }
  }

  private resetDebounceTimer(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.state = "idle";
      this.onStateChange(this.terminalId, "idle");
      this.debounceTimer = null;
    }, this.DEBOUNCE_MS);
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }

  getState(): "busy" | "idle" {
    return this.state;
  }
}
