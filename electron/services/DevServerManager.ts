import { execa } from "execa";
import type { ResultPromise, Result } from "execa";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserWindow } from "electron";
import stringArgv from "string-argv";
import { DevServerState, DevServerStatus } from "../types/index.js";
import { events } from "./events.js";

const URL_PATTERNS = [
  new RegExp("Local:\\s+(https?://localhost:\\d+/?/?)", "i"),
  new RegExp("Ready on (https?://localhost:\\d+/?/?)", "i"),
  new RegExp("Listening on (https?://[\\w.-]+:\\d+/?/?)", "i"),
  new RegExp("Server (?:is )?(?:running|started) (?:on|at) (https?://[\\w.-]+:\\d+/?/?)", "i"),
  new RegExp("Local:\\s+(https?://localhost:\\d+/?/?)", "i"),
  new RegExp("Server is listening on (https?://[\\w.-]+:\\d+/?/?)", "i"),
  new RegExp("(?:Listening|Started) on (?:port )?(\\d+)", "i"),
  new RegExp("Project is running at (https?://[\\w.-]+:\\d+/?/?)", "i"),
  new RegExp("(https?://[\\w.-]+:\\d+/?/?)", "i"),
];

const PORT_PATTERNS = [/(?:Listening|Started) on (?:port )?(\d+)/i, /port[:\s]+(\d+)/i];

const FORCE_KILL_TIMEOUT_MS = 5000;
const MAX_LOG_LINES = 100;

interface ParsedCommand {
  executable: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Parse command string into executable and arguments for array-style execution.
 * Handles quoted arguments, environment variables, and complex command patterns.
 * Avoids shell: true for security and reliability.
 */
function parseCommand(command: string): ParsedCommand {
  const trimmed = command.trim();

  if (!trimmed) {
    throw new Error("Command cannot be empty");
  }

  // Extract environment variables (KEY=VALUE prefixes)
  const env: Record<string, string> = {};
  let commandWithoutEnv = trimmed;
  const envVarRegex = /^(\w+)=(\S+)(?:\s+|$)/;
  let match;

  while ((match = envVarRegex.exec(commandWithoutEnv))) {
    env[match[1]] = match[2];
    commandWithoutEnv = commandWithoutEnv.slice(match[0].length).trim();
    if (!commandWithoutEnv) break;
  }

  // Use string-argv for shell-quote-aware parsing
  const parts = stringArgv(commandWithoutEnv);

  if (parts.length === 0) {
    throw new Error("Invalid command: no executable found");
  }

  const result: ParsedCommand = {
    executable: parts[0],
    args: parts.slice(1),
  };

  if (Object.keys(env).length > 0) {
    result.env = env;
  }

  return result;
}

interface DevScriptCacheEntry {
  hasDevScript: boolean;
  command: string | null;
  checkedAt: number;
}

const DEV_SCRIPT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * DevServerManager manages dev server processes for worktrees.
 * State changes emitted via event bus (server:update, server:error).
 */
export class DevServerManager {
  private servers = new Map<string, ResultPromise>();
  private states = new Map<string, DevServerState>();
  private logBuffers = new Map<string, string[]>();
  private devScriptCache = new Map<string, DevScriptCacheEntry>();
  private lastKnownProjectId: string | null = null;

  public initialize(
    _mainWindow: BrowserWindow,
    _sendToRenderer: (channel: string, ...args: unknown[]) => void
  ): void {}

  public getState(worktreeId: string): DevServerState {
    return (
      this.states.get(worktreeId) ?? {
        worktreeId,
        status: "stopped",
      }
    );
  }

  public getAllStates(): Map<string, DevServerState> {
    return new Map(this.states);
  }

  public isRunning(worktreeId: string): boolean {
    const state = this.states.get(worktreeId);
    return state?.status === "running" || state?.status === "starting";
  }

  public async start(
    worktreeId: string,
    worktreePath: string,
    command?: string,
    projectId?: string // Which project owns this server (for multi-tenancy)
  ): Promise<void> {
    if (this.isRunning(worktreeId)) {
      console.warn("Dev server already running for worktree", worktreeId);
      return;
    }

    const resolvedCommand = command ?? (await this.detectDevCommandAsync(worktreePath));

    if (!resolvedCommand) {
      this.updateState(worktreeId, {
        status: "error",
        errorMessage: "No dev script found in package.json",
        projectId, // Store project ID even for errors
      });
      this.emitError(worktreeId, "No dev script found in package.json");
      return;
    }

    console.log("Starting dev server", { worktreeId, projectId, command: resolvedCommand });

    this.updateState(worktreeId, { status: "starting", errorMessage: undefined, projectId });

    this.logBuffers.set(worktreeId, []);

    try {
      const parsed = parseCommand(resolvedCommand);
      const proc = execa(parsed.executable, parsed.args, {
        cwd: worktreePath,
        env: parsed.env ? { ...process.env, ...parsed.env } : undefined,
        buffer: false,
        cleanup: true,
        reject: false,
      });

      this.servers.set(worktreeId, proc);
      this.updateState(worktreeId, { pid: proc.pid });

      if (proc.stdout) {
        proc.stdout.on("data", (data: Buffer) => {
          const output = data.toString();
          this.appendLog(worktreeId, output);
          this.detectUrl(worktreeId, output);
        });
      }

      if (proc.stderr) {
        proc.stderr.on("data", (data: Buffer) => {
          const output = data.toString();
          this.appendLog(worktreeId, output);
          this.detectUrl(worktreeId, output);
        });
      }

      proc
        .then((result: Result) => {
          console.log("Dev server exited", {
            worktreeId,
            exitCode: result.exitCode,
            signal: result.signal,
          });
          this.servers.delete(worktreeId);

          const currentState = this.states.get(worktreeId);

          if (currentState?.status !== "error") {
            const exitCode = result.exitCode ?? null;
            const signal = result.signal ?? null;

            if (
              exitCode !== 0 &&
              exitCode !== null &&
              signal !== "SIGTERM" &&
              signal !== "SIGKILL"
            ) {
              const errorMessage = `Process exited with code ${exitCode}`;
              this.updateState(worktreeId, {
                status: "error",
                errorMessage,
              });
              this.emitError(worktreeId, errorMessage);
            } else {
              this.updateState(worktreeId, {
                status: "stopped",
                url: undefined,
                port: undefined,
                pid: undefined,
                errorMessage: undefined,
              });
            }
          }
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Unknown error";
          console.error("Dev server process error", { worktreeId, error: message });
          this.servers.delete(worktreeId);
          this.updateState(worktreeId, {
            status: "error",
            errorMessage: message,
          });
          this.emitError(worktreeId, message);
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to start dev server", { worktreeId, error: message });
      this.updateState(worktreeId, {
        status: "error",
        errorMessage: message,
      });
      this.emitError(worktreeId, message);
    }
  }

  public async stop(worktreeId: string): Promise<void> {
    const proc = this.servers.get(worktreeId);

    if (!proc) {
      this.updateState(worktreeId, {
        status: "stopped",
        url: undefined,
        port: undefined,
        pid: undefined,
        errorMessage: undefined,
      });
      return;
    }

    console.log("Stopping dev server", { worktreeId, pid: proc.pid });

    return new Promise((resolve) => {
      const forceKillTimer = setTimeout(() => {
        console.warn("Force killing dev server", { worktreeId });
        try {
          proc.kill("SIGKILL");
        } catch {
          // ignore
        }
      }, FORCE_KILL_TIMEOUT_MS);

      proc.finally(() => {
        clearTimeout(forceKillTimer);
        this.servers.delete(worktreeId);
        this.updateState(worktreeId, {
          status: "stopped",
          url: undefined,
          port: undefined,
          pid: undefined,
        });
        resolve();
      });

      try {
        proc.kill("SIGTERM");
      } catch {
        clearTimeout(forceKillTimer);
        resolve();
      }
    });
  }

  public async toggle(
    worktreeId: string,
    worktreePath: string,
    command?: string,
    projectId?: string
  ): Promise<void> {
    const state = this.getState(worktreeId);

    if (state.status === "stopped" || state.status === "error") {
      await this.start(worktreeId, worktreePath, command, projectId);
    } else {
      await this.stop(worktreeId);
    }
  }

  public async stopAll(): Promise<void> {
    console.log("Stopping all dev servers", { count: this.servers.size });

    const promises = Array.from(this.servers.keys()).map((worktreeId) => this.stop(worktreeId));

    await Promise.all(promises);
    this.servers.clear();
    this.states.clear();
    this.logBuffers.clear();
  }

  /**
   * Handle project switch - filter servers by project instead of stopping.
   * Servers from other projects are "backgrounded" (kept running but hidden from UI).
   * @param newProjectId - The ID of the project being switched to
   */
  public async onProjectSwitch(newProjectId: string): Promise<void> {
    console.log(`[DevServerManager] Switching to project: ${newProjectId}`);

    let backgrounded = 0;
    let foregrounded = 0;

    // Do NOT stop servers - just emit state changes for UI filtering
    for (const [worktreeId, state] of this.states) {
      // For legacy servers without projectId, use lastKnownProjectId (not newProjectId)
      // This prevents legacy servers from appearing in every project they don't belong to
      const serverProjectId = state.projectId || this.lastKnownProjectId;

      // If still no projectId (very first switch), background the server to be safe
      if (!serverProjectId || serverProjectId !== newProjectId) {
        // Server belongs to different project (or unknown) - background it
        backgrounded++;
        events.emit("server:backgrounded", {
          worktreeId,
          projectId: serverProjectId || "unknown",
          timestamp: Date.now(),
        });
      } else {
        // Server belongs to current project - foreground it
        foregrounded++;
        events.emit("server:foregrounded", {
          worktreeId,
          projectId: serverProjectId,
          timestamp: Date.now(),
        });
      }
    }

    // Update lastKnownProjectId for future legacy servers
    this.lastKnownProjectId = newProjectId;

    // Clear cache since different projects may have different package.json files
    this.clearCache();

    console.log(
      `[DevServerManager] Project switch complete: ${foregrounded} foregrounded, ${backgrounded} backgrounded`
    );
  }

  /**
   * Get servers for a specific project.
   * Uses same classification logic as onProjectSwitch for consistency.
   * @param projectId - The project ID to filter by
   * @returns Array of worktree IDs with servers belonging to the project
   */
  public getServersForProject(projectId: string): string[] {
    const result: string[] = [];
    for (const [worktreeId, state] of this.states) {
      // Use same fallback logic as onProjectSwitch
      const serverProjectId = state.projectId || this.lastKnownProjectId;
      if (serverProjectId === projectId) {
        result.push(worktreeId);
      }
    }
    return result;
  }

  public getLogs(worktreeId: string): string[] {
    return this.logBuffers.get(worktreeId) ?? [];
  }

  public async detectDevCommandAsync(worktreePath: string): Promise<string | null> {
    const cached = this.devScriptCache.get(worktreePath);
    if (cached && Date.now() - cached.checkedAt < DEV_SCRIPT_CACHE_TTL_MS) {
      return cached.command;
    }

    const packageJsonPath = path.join(worktreePath, "package.json");

    if (!existsSync(packageJsonPath)) {
      this.devScriptCache.set(worktreePath, {
        hasDevScript: false,
        command: null,
        checkedAt: Date.now(),
      });
      return null;
    }

    try {
      const content = await readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      const scripts = pkg.scripts || {};

      const candidates = ["dev", "start:dev", "serve", "start"];

      for (const script of candidates) {
        if (scripts[script]) {
          const command = `npm run ${script}`;
          this.devScriptCache.set(worktreePath, {
            hasDevScript: true,
            command,
            checkedAt: Date.now(),
          });
          return command;
        }
      }

      this.devScriptCache.set(worktreePath, {
        hasDevScript: false,
        command: null,
        checkedAt: Date.now(),
      });
      return null;
    } catch {
      this.devScriptCache.set(worktreePath, {
        hasDevScript: false,
        command: null,
        checkedAt: Date.now(),
      });
      return null;
    }
  }

  public async hasDevScriptAsync(worktreePath: string): Promise<boolean> {
    const command = await this.detectDevCommandAsync(worktreePath);
    return command !== null;
  }

  public invalidateCache(worktreePath: string): void {
    this.devScriptCache.delete(worktreePath);
  }

  public clearCache(): void {
    this.devScriptCache.clear();
  }

  public async warmCache(worktreePaths: string[]): Promise<void> {
    await Promise.all(worktreePaths.map((path) => this.hasDevScriptAsync(path)));
  }

  private updateState(
    worktreeId: string,
    updates: Partial<Omit<DevServerState, "worktreeId">>
  ): void {
    const current = this.states.get(worktreeId) ?? {
      worktreeId,
      status: "stopped" as DevServerStatus,
    };
    const next: DevServerState = { ...current, ...updates };

    const hasChanged =
      current.status !== next.status ||
      current.url !== next.url ||
      current.port !== next.port ||
      current.pid !== next.pid ||
      current.projectId !== next.projectId ||
      current.errorMessage !== next.errorMessage;

    if (hasChanged) {
      this.states.set(worktreeId, next);
      this.emitUpdate(next);
    }
  }

  private emitUpdate(state: DevServerState): void {
    events.emit("server:update", {
      ...state,
      timestamp: Date.now(),
    });
  }

  private emitError(worktreeId: string, error: string): void {
    // Include projectId in error event for proper correlation
    const state = this.states.get(worktreeId);
    events.emit("server:error", {
      worktreeId,
      projectId: state?.projectId,
      error,
      timestamp: Date.now(),
    });
  }

  private appendLog(worktreeId: string, output: string): void {
    const logs = this.logBuffers.get(worktreeId) ?? [];

    const lines = output.split("\n").filter((line) => line.trim());
    logs.push(...lines);

    if (logs.length > MAX_LOG_LINES) {
      logs.splice(0, logs.length - MAX_LOG_LINES);
    }

    this.logBuffers.set(worktreeId, logs);

    const current = this.states.get(worktreeId);
    if (current) {
      this.states.set(worktreeId, { ...current, logs });
    }
  }

  private detectUrl(worktreeId: string, output: string): void {
    const currentState = this.states.get(worktreeId);

    if (currentState?.status !== "starting") {
      return;
    }

    for (const pattern of URL_PATTERNS) {
      const match = output.match(pattern);
      if (match?.[1]) {
        let url = match[1];

        if (/^\d+$/.test(url)) {
          url = `http://localhost:${url}`;
        }

        const portMatch = url.match(/:(\d+)/);
        const port = portMatch ? parseInt(portMatch[1], 10) : undefined;

        console.log("Detected dev server URL", { worktreeId, url, port });

        this.updateState(worktreeId, {
          status: "running",
          url,
          port,
          errorMessage: undefined,
        });
        return;
      }
    }

    for (const pattern of PORT_PATTERNS) {
      const match = output.match(pattern);
      if (match?.[1]) {
        const port = parseInt(match[1], 10);
        const url = `http://localhost:${port}`;

        console.log("Detected dev server port", { worktreeId, url, port });

        this.updateState(worktreeId, {
          status: "running",
          url,
          port,
          errorMessage: undefined,
        });
        return;
      }
    }
  }
}
