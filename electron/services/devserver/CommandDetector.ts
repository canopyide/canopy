import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import stringArgv from "string-argv";

export interface ParsedCommand {
  executable: string;
  args: string[];
  env?: Record<string, string>;
}

interface DevScriptCacheEntry {
  hasDevScript: boolean;
  command: string | null;
  checkedAt: number;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEV_SCRIPT_CANDIDATES = ["dev", "start:dev", "serve", "start"];

/**
 * CommandDetector handles dev command parsing and package.json script detection.
 * Provides caching to avoid repeated filesystem reads.
 */
export class CommandDetector {
  private devScriptCache = new Map<string, DevScriptCacheEntry>();
  private cacheTTL: number;

  constructor(cacheTTL: number = DEFAULT_CACHE_TTL_MS) {
    this.cacheTTL = cacheTTL;
  }

  /**
   * Parse command string into executable and arguments.
   * Handles quoted arguments, environment variables, and complex command patterns.
   * Avoids shell: true for security and reliability.
   *
   * @param command - Command string to parse (e.g., "PORT=3000 npm run dev")
   * @returns Parsed command with executable, args, and optional env vars
   * @throws Error if command is empty or has no executable
   */
  parseCommand(command: string): ParsedCommand {
    const trimmed = command.trim();

    if (!trimmed) {
      throw new Error("Command cannot be empty");
    }

    // Use string-argv to tokenize the entire command (handles quotes properly)
    const allTokens = stringArgv(trimmed);

    if (allTokens.length === 0) {
      throw new Error("Invalid command: no executable found");
    }

    // Extract environment variables (KEY=VALUE tokens at the start)
    const env: Record<string, string> = {};
    let firstNonEnvIndex = 0;

    for (let i = 0; i < allTokens.length; i++) {
      const token = allTokens[i];
      const envMatch = /^(\w+)=(.*)$/.exec(token);

      if (envMatch) {
        let value = envMatch[2];
        // Strip surrounding quotes if present (string-argv preserves them)
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        env[envMatch[1]] = value;
        firstNonEnvIndex = i + 1;
      } else {
        // First non-env token marks the start of the command
        break;
      }
    }

    const commandTokens = allTokens.slice(firstNonEnvIndex);

    if (commandTokens.length === 0) {
      throw new Error("Invalid command: no executable found");
    }

    const result: ParsedCommand = {
      executable: commandTokens[0],
      args: commandTokens.slice(1),
    };

    if (Object.keys(env).length > 0) {
      result.env = env;
    }

    return result;
  }

  /**
   * Detect dev command from package.json scripts.
   * Checks candidate scripts in priority order and caches results.
   *
   * @param worktreePath - Absolute path to worktree root
   * @returns Dev command string (e.g., "npm run dev") or null if not found
   */
  async detectDevCommand(worktreePath: string): Promise<string | null> {
    const cached = this.devScriptCache.get(worktreePath);
    if (cached && Date.now() - cached.checkedAt < this.cacheTTL) {
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

      for (const script of DEV_SCRIPT_CANDIDATES) {
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
    } catch (error) {
      // Don't cache errors - allow retry on next call
      // This prevents hiding real issues (malformed JSON, permission errors)
      return null;
    }
  }

  /**
   * Check if a worktree has a dev script without returning the command.
   *
   * @param worktreePath - Absolute path to worktree root
   * @returns true if dev script exists, false otherwise
   */
  async hasDevScript(worktreePath: string): Promise<boolean> {
    const command = await this.detectDevCommand(worktreePath);
    return command !== null;
  }

  /**
   * Invalidate cache for a specific worktree path.
   * Useful when package.json is known to have changed.
   *
   * @param worktreePath - Path to invalidate
   */
  invalidateCache(worktreePath: string): void {
    this.devScriptCache.delete(worktreePath);
  }

  /**
   * Clear all cached dev script detections.
   * Useful during project switches or global cache resets.
   */
  clearCache(): void {
    this.devScriptCache.clear();
  }

  /**
   * Warm cache by pre-checking multiple worktree paths.
   * Executes checks in parallel for performance.
   *
   * @param worktreePaths - Array of worktree paths to check
   */
  async warmCache(worktreePaths: string[]): Promise<void> {
    await Promise.all(worktreePaths.map((path) => this.hasDevScript(path)));
  }
}
