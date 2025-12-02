/** Detects active agent CLIs (claude, gemini, codex) in terminals */

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

export interface DetectionResult {
  detected: boolean;
  agentType?: TerminalType;
  processName?: string;
}

export type DetectionCallback = (result: DetectionResult) => void;

/** Polls terminal process tree to detect agent CLIs */
export class ProcessDetector {
  private terminalId: string;
  private ptyPid: number;
  private callback: DetectionCallback;
  private intervalHandle: NodeJS.Timeout | null = null;
  private lastDetected: TerminalType | null = null;
  private pollInterval: number;
  private isWindows: boolean;
  private isDetecting: boolean = false;

  /** Initialize detector */
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

  /** Start polling */
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

  /** Stop polling */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      console.log(`Stopped ProcessDetector for terminal ${this.terminalId}`);
    }
  }

  /** Run detection cycle */
  private async detect(): Promise<void> {
    if (this.isDetecting) {
      return;
    }

    this.isDetecting = true;
    try {
      const result = await this.detectAgent();

      if (result.detected && result.agentType !== this.lastDetected) {
        this.lastDetected = result.agentType!;
        this.callback(result);
      } else if (!result.detected && this.lastDetected !== null) {
        this.lastDetected = null;
        this.callback({ detected: false });
      }
    } catch (error) {
      console.error(`ProcessDetector error for terminal ${this.terminalId}:`, error);
    } finally {
      this.isDetecting = false;
    }
  }

  /** Detect agent in process tree (platform specific) */
  private async detectAgent(): Promise<DetectionResult> {
    if (this.isWindows) {
      return this.detectAgentWindows();
    } else {
      return this.detectAgentUnix();
    }
  }

  /** Detect (Unix): uses ps -g */
  private async detectAgentUnix(): Promise<DetectionResult> {
    try {
      if (!Number.isInteger(this.ptyPid) || this.ptyPid <= 0) {
        console.warn(`Invalid PTY PID for terminal ${this.terminalId}: ${this.ptyPid}`);
        return { detected: false };
      }

      const { stdout } = await execAsync(`ps -o comm= -g ${this.ptyPid} 2>/dev/null || true`, {
        timeout: 5000,
      });

      const processes = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

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
      return { detected: false };
    }
  }

  /** Detect (Windows): uses wmic */
  private async detectAgentWindows(): Promise<DetectionResult> {
    try {
      if (!Number.isInteger(this.ptyPid) || this.ptyPid <= 0) {
        console.warn(`Invalid PTY PID for terminal ${this.terminalId}: ${this.ptyPid}`);
        return { detected: false };
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
              return {
                detected: true,
                agentType,
                processName: basename,
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
                };
              }
            }
          }
        } catch {
          // Ignore errors
        }
      }

      return { detected: false };
    } catch (error) {
      return { detected: false };
    }
  }

  /** Get last detected state */
  getLastDetected(): TerminalType | null {
    return this.lastDetected;
  }
}
