import { exec } from "child_process";
import { promisify } from "util";
import type { TerminalType } from "../../shared/types/domain.js";

const execAsync = promisify(exec);

/**
 * Check if a process has any child processes running.
 * Used for shell terminals to determine busy/idle state.
 */
export async function hasChildProcesses(pid: number): Promise<boolean> {
  try {
    if (!Number.isInteger(pid) || pid <= 0) {
      return false;
    }

    if (process.platform === "win32") {
      // Windows: Use wmic to count child processes
      const { stdout } = await execAsync(
        `wmic process where (ParentProcessId=${pid}) get ProcessId 2>nul || echo.`,
        { timeout: 5000 }
      );
      // Header + at least one ID means children exist
      return (
        stdout
          .trim()
          .split("\n")
          .filter((line) => line.trim()).length > 1
      );
    } else {
      // macOS/Linux: Use pgrep to check for children
      try {
        await execAsync(`pgrep -P ${pid}`, { timeout: 5000 });
        return true; // pgrep returns 0 exit code if processes found
      } catch {
        return false; // pgrep returns 1 if no processes found
      }
    }
  } catch {
    return false;
  }
}

const AGENT_CLI_NAMES: Record<string, TerminalType> = {
  claude: "claude",
  gemini: "gemini",
  codex: "codex",
};

export interface DetectionResult {
  detected: boolean;
  agentType?: TerminalType;
  processName?: string;
  /** Whether the terminal has active child processes (busy/idle status) */
  isBusy?: boolean;
}

export type DetectionCallback = (result: DetectionResult) => void;

export class ProcessDetector {
  private terminalId: string;
  private ptyPid: number;
  private callback: DetectionCallback;
  private intervalHandle: NodeJS.Timeout | null = null;
  private lastDetected: TerminalType | null = null;
  private lastBusyState: boolean | null = null;
  private pollInterval: number;
  private isWindows: boolean;
  private isDetecting: boolean = false;

  constructor(
    terminalId: string,
    ptyPid: number,
    callback: DetectionCallback,
    pollInterval: number = 3000
  ) {
    this.terminalId = terminalId;
    this.ptyPid = ptyPid;
    this.callback = callback;
    this.pollInterval = pollInterval;
    this.isWindows = process.platform === "win32";
  }

  start(): void {
    if (this.intervalHandle) {
      console.warn(`ProcessDetector for terminal ${this.terminalId} already started`);
      return;
    }

    console.log(`Starting ProcessDetector for terminal ${this.terminalId}, PID ${this.ptyPid}`);

    this.detect();

    this.intervalHandle = setInterval(() => {
      this.detect();
    }, this.pollInterval);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      console.log(`Stopped ProcessDetector for terminal ${this.terminalId}`);
    }
  }

  private async detect(): Promise<void> {
    if (this.isDetecting) {
      return;
    }

    this.isDetecting = true;
    try {
      const result = await this.detectAgent();

      // Check if agent detection changed
      const agentChanged =
        (result.detected && result.agentType !== this.lastDetected) ||
        (!result.detected && this.lastDetected !== null);

      // Check if busy state changed
      const busyChanged = result.isBusy !== undefined && result.isBusy !== this.lastBusyState;

      // Update tracked states
      if (result.detected) {
        this.lastDetected = result.agentType!;
      } else if (this.lastDetected !== null) {
        this.lastDetected = null;
      }

      if (result.isBusy !== undefined) {
        this.lastBusyState = result.isBusy;
      }

      // Fire callback if either agent or busy state changed
      if (agentChanged || busyChanged) {
        this.callback(result);
      }
    } catch (_error) {
      console.error(`ProcessDetector error for terminal ${this.terminalId}:`, _error);
    } finally {
      this.isDetecting = false;
    }
  }

  private async detectAgent(): Promise<DetectionResult> {
    if (this.isWindows) {
      return this.detectAgentWindows();
    } else {
      return this.detectAgentUnix();
    }
  }

  private async detectAgentUnix(): Promise<DetectionResult> {
    try {
      if (!Number.isInteger(this.ptyPid) || this.ptyPid <= 0) {
        console.warn(`Invalid PTY PID for terminal ${this.terminalId}: ${this.ptyPid}`);
        return { detected: false, isBusy: false };
      }

      // Use parent-child relationship instead of process group to detect foreground commands
      // Interactive shells spawn foreground commands as direct children
      const { stdout } = await execAsync(`ps -o comm= --ppid ${this.ptyPid} 2>/dev/null || true`, {
        timeout: 5000,
      });

      const processes = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // Determine busy status: any child processes means commands are running
      const isBusy = processes.length > 0;

      // Check for agent CLIs in child processes
      for (const proc of processes) {
        const basename = proc.split("/").pop() || proc;
        const agentType = AGENT_CLI_NAMES[basename.toLowerCase()];

        if (agentType) {
          return {
            detected: true,
            agentType,
            processName: basename,
            isBusy,
          };
        }
      }

      return { detected: false, isBusy };
    } catch (_error) {
      return { detected: false, isBusy: false };
    }
  }

  private async detectAgentWindows(): Promise<DetectionResult> {
    try {
      if (!Number.isInteger(this.ptyPid) || this.ptyPid <= 0) {
        console.warn(`Invalid PTY PID for terminal ${this.terminalId}: ${this.ptyPid}`);
        return { detected: false, isBusy: false };
      }

      const { stdout } = await execAsync(
        `wmic process where "ParentProcessId=${this.ptyPid}" get ProcessId,Name 2>nul || echo.`,
        { timeout: 5000 }
      );

      const lines = stdout.split("\n").slice(1);
      const childPids: number[] = [];

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const name = parts[0];
          const pid = parseInt(parts[1], 10);

          if (!isNaN(pid)) {
            childPids.push(pid);

            const basename = name.replace(/\.exe$/i, "");
            const agentType = AGENT_CLI_NAMES[basename.toLowerCase()];

            if (agentType) {
              // Has child processes = busy
              return {
                detected: true,
                agentType,
                processName: basename,
                isBusy: childPids.length > 0,
              };
            }
          }
        }
      }

      for (const childPid of childPids.slice(0, 10)) {
        try {
          const { stdout: childStdout } = await execAsync(
            `wmic process where "ParentProcessId=${childPid}" get Name 2>nul || echo.`,
            { timeout: 5000 }
          );

          const childLines = childStdout.split("\n").slice(1);
          for (const line of childLines) {
            const name = line.trim();
            if (name) {
              const basename = name.replace(/\.exe$/i, "");
              const agentType = AGENT_CLI_NAMES[basename.toLowerCase()];

              if (agentType) {
                return {
                  detected: true,
                  agentType,
                  processName: basename,
                  isBusy: childPids.length > 0,
                };
              }
            }
          }
        } catch {
          // ignore
        }
      }

      // Determine busy status: any child processes means commands are running
      const isBusy = childPids.length > 0;
      return { detected: false, isBusy };
    } catch (_error) {
      return { detected: false, isBusy: false };
    }
  }

  getLastDetected(): TerminalType | null {
    return this.lastDetected;
  }
}
