import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { resilientAtomicWriteFileSync } from "../utils/fs.js";

const execFileAsync = promisify(execFile);

const TRASHED_PIDS_FILENAME = "trashed-pids.json";
const PROCESS_START_TIME_TIMEOUT_MS = 3000;

interface TrashedPidEntry {
  terminalId: string;
  pid: number;
  startTime: string;
  trashedAt: number;
}

async function getProcessStartTime(pid: number): Promise<string | null> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-NoLogo",
          "-Command",
          "$ErrorActionPreference = 'SilentlyContinue'; " +
            "$p = Get-CimInstance Win32_Process -Filter 'ProcessId=" +
            pid +
            "'; if ($p -and $p.CreationDate) { $p.CreationDate.ToString('o') }",
        ],
        {
          windowsHide: true,
          encoding: "utf8",
          shell: false,
          signal: AbortSignal.timeout(PROCESS_START_TIME_TIMEOUT_MS),
        }
      );
      const out = stdout.replace(/^\uFEFF/, "").trim();
      return out || null;
    }
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "lstart="], {
      encoding: "utf8",
      shell: false,
      signal: AbortSignal.timeout(PROCESS_START_TIME_TIMEOUT_MS),
    });
    const out = stdout.trim();
    return out || null;
  } catch {
    return null;
  }
}

async function verifyProcessStartTime(pid: number, expectedStartTime: string): Promise<boolean> {
  const currentStartTime = await getProcessStartTime(pid);
  if (!currentStartTime) return false;
  return currentStartTime === expectedStartTime;
}

export class TrashedPidTracker {
  private filePath: string;

  constructor(userDataPath?: string) {
    const userData = userDataPath ?? app.getPath("userData");
    this.filePath = path.join(userData, TRASHED_PIDS_FILENAME);
  }

  async persistTrashed(terminalId: string, pid: number | undefined): Promise<void> {
    if (pid === undefined || !Number.isFinite(pid) || pid <= 0) return;

    const startTime = await getProcessStartTime(pid);
    if (!startTime) return;

    const entries = this.readEntries();
    const existing = entries.findIndex((e) => e.terminalId === terminalId);
    const entry: TrashedPidEntry = { terminalId, pid, startTime, trashedAt: Date.now() };

    if (existing >= 0) {
      entries[existing] = entry;
    } else {
      entries.push(entry);
    }

    this.writeEntries(entries);
  }

  removeTrashed(terminalId: string): void {
    const entries = this.readEntries();
    const filtered = entries.filter((e) => e.terminalId !== terminalId);
    if (filtered.length === entries.length) return;

    if (filtered.length === 0) {
      this.deleteFile();
    } else {
      this.writeEntries(filtered);
    }
  }

  clearAll(): void {
    this.deleteFile();
  }

  async cleanupOrphans(): Promise<void> {
    if (!this.fileExists()) return;

    const entries = this.readEntries();
    if (entries.length === 0) {
      this.deleteFile();
      return;
    }

    console.log(`[TrashedPidTracker] Found ${entries.length} trashed PID(s) from previous session`);

    await Promise.all(
      entries.map(async (entry) => {
        if (!Number.isFinite(entry.pid) || entry.pid <= 0) return;
        if (entry.pid === process.pid) return;

        const matches = await verifyProcessStartTime(entry.pid, entry.startTime);
        if (!matches) {
          console.log(
            `[TrashedPidTracker] PID ${entry.pid} (terminal ${entry.terminalId}) no longer exists or was recycled, skipping`
          );
          return;
        }

        let killed = false;
        if (process.platform === "win32") {
          const result = spawnSync("taskkill", ["/T", "/F", "/PID", String(entry.pid)], {
            windowsHide: true,
            stdio: "ignore",
            timeout: 3000,
          });
          if (result.status === 0 || result.status === 128) {
            killed = true;
          }
        } else {
          try {
            process.kill(-entry.pid, "SIGKILL");
            killed = true;
          } catch {
            // fall back to direct kill
          }
        }

        if (!killed) {
          try {
            process.kill(entry.pid, "SIGKILL");
            killed = true;
          } catch {
            // process may already be gone
          }
        }

        if (killed) {
          console.log(
            `[TrashedPidTracker] Killed orphaned PTY pid=${entry.pid} (terminal ${entry.terminalId})`
          );
        } else {
          console.warn(
            `[TrashedPidTracker] Failed to kill orphaned PTY pid=${entry.pid} (terminal ${entry.terminalId})`
          );
        }
      })
    );

    this.deleteFile();
  }

  private fileExists(): boolean {
    return fs.existsSync(this.filePath);
  }

  private readEntries(): TrashedPidEntry[] {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (e: unknown): e is TrashedPidEntry =>
          typeof e === "object" &&
          e !== null &&
          typeof (e as TrashedPidEntry).terminalId === "string" &&
          typeof (e as TrashedPidEntry).pid === "number" &&
          typeof (e as TrashedPidEntry).startTime === "string" &&
          typeof (e as TrashedPidEntry).trashedAt === "number"
      );
    } catch {
      return [];
    }
  }

  private writeEntries(entries: TrashedPidEntry[]): void {
    try {
      resilientAtomicWriteFileSync(this.filePath, JSON.stringify(entries), "utf8");
    } catch (err) {
      console.warn("[TrashedPidTracker] Failed to write trashed PIDs:", err);
    }
  }

  private deleteFile(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch {
      // ignore
    }
  }
}

let instance: TrashedPidTracker | null = null;

export function getTrashedPidTracker(): TrashedPidTracker {
  if (!instance) {
    instance = new TrashedPidTracker();
  }
  return instance;
}

export function initializeTrashedPidCleanup(): void {
  const tracker = getTrashedPidTracker();
  tracker.cleanupOrphans().catch((err) => {
    console.warn("[TrashedPidTracker] cleanupOrphans failed:", err);
  });
}
