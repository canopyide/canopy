/**
 * ProcessDetector Service
 *
 * Detects running agent CLIs (claude, gemini, codex) within terminal processes
 * by periodically polling the process tree. Supports macOS, Linux, and Windows.
 *
 * Usage:
 *   const detector = new ProcessDetector(terminalId, ptyPid, callback);
 *   detector.start();
 *   // ... later
 *   detector.stop();
 */

import { exec } from "child_process";
import { promisify } from "util";
import type { TerminalType } from "../../shared/types/domain.js";

const execAsync = promisify(exec);

/** Agent CLI names to detect (process basename) */
const AGENT_CLI_NAMES: Record<string, TerminalType> = {
  claude: "claude",
  gemini: "gemini",
  codex: "codex",
};

/** Detection result */
export interface DetectionResult {
  /** Whether an agent was detected */
  detected: boolean;
  /** Agent type if detected */
  agentType?: TerminalType;
  /** Process name that was matched */
  processName?: string;
}

/** Detection callback */
export type DetectionCallback = (result: DetectionResult) => void;

/**
 * ProcessDetector class
 *
 * Polls a terminal's process tree periodically to detect agent CLIs.
 * Emits callbacks when agents are detected or exit.
 */
export class ProcessDetector {
  private terminalId: string;
  private ptyPid: number;
  private callback: DetectionCallback;
  private intervalHandle: NodeJS.Timeout | null = null;
  private lastDetected: TerminalType | null = null;
  private pollInterval: number;
  private isWindows: boolean;
  private isDetecting: boolean = false;

  /**
   * Create a ProcessDetector
   *
   * @param terminalId - Terminal ID
   * @param ptyPid - PTY process ID
   * @param callback - Callback for detection changes
   * @param pollInterval - Polling interval in milliseconds (default: 3000)
   */
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

  /**
   * Start polling for agent processes
   */
  start(): void {
    if (this.intervalHandle) {
      console.warn(`ProcessDetector for terminal ${this.terminalId} already started`);
      return;
    }

    console.log(`Starting ProcessDetector for terminal ${this.terminalId}, PID ${this.ptyPid}`);

    // Run initial detection
    this.detect();

    // Start periodic polling
    this.intervalHandle = setInterval(() => {
      this.detect();
    }, this.pollInterval);
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      console.log(`Stopped ProcessDetector for terminal ${this.terminalId}`);
    }
  }

  /**
   * Run detection once
   */
  private async detect(): Promise<void> {
    // Skip if detection already in progress (prevents overlapping calls)
    if (this.isDetecting) {
      return;
    }

    this.isDetecting = true;
    try {
      const result = await this.detectAgent();

      // Check if detection state changed
      if (result.detected && result.agentType !== this.lastDetected) {
        // Agent detected or changed
        this.lastDetected = result.agentType!;
        this.callback(result);
      } else if (!result.detected && this.lastDetected !== null) {
        // Agent exited
        this.lastDetected = null;
        this.callback({ detected: false });
      }
    } catch (error) {
      console.error(`ProcessDetector error for terminal ${this.terminalId}:`, error);
    } finally {
      this.isDetecting = false;
    }
  }

  /**
   * Detect agent in process tree
   */
  private async detectAgent(): Promise<DetectionResult> {
    if (this.isWindows) {
      return this.detectAgentWindows();
    } else {
      return this.detectAgentUnix();
    }
  }

  /**
   * Detect agent on Unix (macOS/Linux)
   *
   * Uses `ps` to get child processes
   */
  private async detectAgentUnix(): Promise<DetectionResult> {
    try {
      // Validate PID is a positive integer to prevent injection
      if (!Number.isInteger(this.ptyPid) || this.ptyPid <= 0) {
        console.warn(`Invalid PTY PID for terminal ${this.terminalId}: ${this.ptyPid}`);
        return { detected: false };
      }

      // Get all child processes of the PTY
      // -o comm= : output only command name (basename)
      // -g <pgid> : get all processes in the process group
      const { stdout } = await execAsync(`ps -o comm= -g ${this.ptyPid} 2>/dev/null || true`, {
        timeout: 5000, // 5 second timeout to prevent hangs
      });

      const processes = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // Check for agent CLI names
      for (const proc of processes) {
        const basename = proc.split("/").pop() || proc;
        const agentType = AGENT_CLI_NAMES[basename.toLowerCase()];

        if (agentType) {
          return {
            detected: true,
            agentType,
            processName: basename,
          };
        }
      }

      return { detected: false };
    } catch (error) {
      // Silent failure - this is expected during normal operation
      return { detected: false };
    }
  }

  /**
   * Detect agent on Windows
   *
   * Uses `tasklist` and `wmic` to get child processes
   */
  private async detectAgentWindows(): Promise<DetectionResult> {
    try {
      // Validate PID is a positive integer to prevent injection
      if (!Number.isInteger(this.ptyPid) || this.ptyPid <= 0) {
        console.warn(`Invalid PTY PID for terminal ${this.terminalId}: ${this.ptyPid}`);
        return { detected: false };
      }

      // Get child processes using WMIC
      // This is more complex on Windows - we need to recursively find descendants
      const { stdout } = await execAsync(
        `wmic process where "ParentProcessId=${this.ptyPid}" get ProcessId,Name 2>nul || echo.`,
        { timeout: 5000 } // 5 second timeout
      );

      const lines = stdout.split("\n").slice(1); // Skip header
      const childPids: number[] = [];

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const name = parts[0];
          const pid = parseInt(parts[1], 10);

          if (!isNaN(pid)) {
            childPids.push(pid);

            // Check if this is an agent CLI
            const basename = name.replace(/\.exe$/i, "");
            const agentType = AGENT_CLI_NAMES[basename.toLowerCase()];

            if (agentType) {
              return {
                detected: true,
                agentType,
                processName: basename,
              };
            }
          }
        }
      }

      // Recursively check children (one level deep to avoid performance issues)
      for (const childPid of childPids.slice(0, 10)) {
        // Limit to 10 children
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
                };
              }
            }
          }
        } catch {
          // Ignore errors for individual child lookups
        }
      }

      return { detected: false };
    } catch (error) {
      // Silent failure - this is expected during normal operation
      return { detected: false };
    }
  }

  /**
   * Get current detection state (synchronous, returns last known state)
   */
  getLastDetected(): TerminalType | null {
    return this.lastDetected;
  }
}
