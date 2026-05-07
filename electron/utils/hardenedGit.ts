import path from "path";
import { simpleGit } from "simple-git";
import type { SimpleGit, SimpleGitProgressEvent } from "simple-git";

const SAFE_GIT_CONFIG = [
  "core.fsmonitor=false",
  "core.untrackedCache=false",
  "core.pager=cat",
  "protocol.ext.allow=never",
  "core.gitProxy=",
  "core.hooksPath=",
  // Emit literal UTF-8 paths in porcelain/status output so non-ASCII filenames
  // flow through to IPC consumers unquoted (e.g. conflict detection on
  // `café.txt` would otherwise be returned as `"caf\303\251.txt"`).
  "core.quotepath=false",
  // macOS HFS+/APFS returns filenames as NFD (decomposed Unicode); without
  // this flag git emits NFD paths in porcelain/status output, causing silent
  // bitwise inequality against NFC paths from any other source. Pinning it
  // ensures working-tree paths are reported as NFC; pre-existing NFD index
  // entries from legacy repos are unaffected. No-op on Linux/Windows.
  "core.precomposeunicode=true",
] as const;

/**
 * Git config overrides that neutralize dangerous .git/config directives.
 * Passed as -c flags to every git command, taking precedence over repo config.
 */
export const HARDENED_GIT_CONFIG = [
  ...SAFE_GIT_CONFIG,
  "core.askpass=",
  "credential.helper=",
  "core.sshCommand=",
] as const;

export const AUTHENTICATED_GIT_CONFIG = [...SAFE_GIT_CONFIG] as const;

const UNSAFE_FLAGS = {
  allowUnsafeProtocolOverride: true,
  allowUnsafeSshCommand: true,
  allowUnsafeGitProxy: true,
  allowUnsafeHooksPath: true,
} as const;

export function validateCwd(cwd: unknown): asserts cwd is string {
  if (typeof cwd !== "string" || !cwd.trim()) {
    throw new Error("Invalid working directory");
  }
  if (!path.isAbsolute(cwd)) {
    throw new Error("Working directory must be an absolute path");
  }
}

// eslint-disable-next-line no-control-regex
const BRANCH_NAME_FORBIDDEN_CHARS = /[\x00-\x1f\x7f ~^:?*[\\]/;

/**
 * Validate a branch name as a strict subset of `git check-ref-format --branch`.
 * Primarily blocks leading-dash names that git's argv parser would treat as
 * flags (e.g. `--exec=touch /tmp/x`); also rejects control chars and other
 * git-special sequences. Throws on invalid input.
 */
export function validateBranchName(branchName: unknown): asserts branchName is string {
  if (typeof branchName !== "string" || branchName.length === 0) {
    throw new Error("Branch name is required");
  }
  if (branchName.startsWith("-")) {
    throw new Error("Branch name must not start with '-'");
  }
  if (BRANCH_NAME_FORBIDDEN_CHARS.test(branchName)) {
    throw new Error("Branch name contains invalid characters");
  }
  if (branchName.includes("..")) {
    throw new Error("Branch name must not contain '..'");
  }
  if (branchName.includes("@{")) {
    throw new Error("Branch name must not contain '@{'");
  }
  if (branchName.endsWith(".")) {
    throw new Error("Branch name must not end with '.'");
  }
  if (branchName.startsWith("/") || branchName.endsWith("/")) {
    throw new Error("Branch name must not start or end with '/'");
  }
  if (branchName.includes("//")) {
    throw new Error("Branch name must not contain '//'");
  }
  // `.lock` is forbidden on every path component, not only the final one —
  // git rejects `foo.lock/bar` for the same reason it rejects `foo.lock`.
  for (const component of branchName.split("/")) {
    if (component.endsWith(".lock")) {
      throw new Error("Branch name must not contain a '.lock' component");
    }
  }
}

export const GIT_BLOCK_TIMEOUT_MS = 30_000;

/**
 * Locale env vars passed to every git invocation so non-ASCII paths survive
 * iconv on Windows (where the default ANSI codepage rejects multi-byte
 * sequences) and Linux containers built without a UTF-8 locale. macOS already
 * ships `en_US.UTF-8` and lacks `C.UTF-8` entirely; setting `LC_ALL=C.UTF-8`
 * there silently falls back to strict POSIX `C` and strips UTF-8 support.
 */
export function getGitLocaleEnv(
  platform: NodeJS.Platform = process.platform
): Record<string, string> {
  if (platform === "win32") {
    return { LC_CTYPE: "C.UTF-8", LANG: "C.UTF-8" };
  }
  if (platform === "darwin") {
    return { LC_CTYPE: "en_US.UTF-8" };
  }
  return { LC_CTYPE: "C.UTF-8" };
}

export function createHardenedGit(
  cwd: string,
  signal?: AbortSignal,
  platform: NodeJS.Platform = process.platform
): SimpleGit {
  return simpleGit({
    baseDir: cwd,
    config: [...HARDENED_GIT_CONFIG],
    timeout: { block: GIT_BLOCK_TIMEOUT_MS },
    ...(signal ? { abort: signal } : {}),
    unsafe: UNSAFE_FLAGS,
  }).env({
    ...process.env,
    ...getGitLocaleEnv(platform),
    // Clear inherited LC_ALL so the more specific LC_CTYPE / LC_MESSAGES
    // values above actually take effect. POSIX locale resolution gives LC_ALL
    // priority over every other LC_* variable.
    LC_ALL: "",
    LC_MESSAGES: "C",
    LANGUAGE: "",
    // Suppress optional .git/index.lock writes during status-only reads. Only
    // affects opportunistic locks (stat-cache refresh); mandatory locks for
    // git add/commit are unaffected, so this is safe even when the hardened
    // factory is used for write paths.
    GIT_OPTIONAL_LOCKS: "0",
    // Block git's built-in TTY prompt for credentials/passphrases. Some
    // commands (clone, fetch, push) still touch credential helpers even
    // through the hardened factory's `-c credential.helper=` blank, and an
    // interactive prompt in the Electron main process hangs forever.
    GIT_TERMINAL_PROMPT: "0",
    // Defense in depth: some credential helpers ignore GIT_TERMINAL_PROMPT
    // and still invoke an ASKPASS binary. `true` exits 0 with empty stdout,
    // so git treats it as an empty credential and fails fast instead of
    // hanging. `true` is not on PATH on Windows; GIT_TERMINAL_PROMPT=0 plus
    // GCM_INTERACTIVE=Never below cover that platform.
    ...(platform !== "win32" ? { GIT_ASKPASS: "true" } : {}),
    // Windows-only: prevent Git Credential Manager from spawning GUI auth
    // dialogs in background processes where no user can interact. No effect
    // on POSIX or on local read operations.
    GCM_INTERACTIVE: "Never",
  });
}

export interface WslGitInvocation {
  /** WSL distro name extracted from the worktree's UNC path. */
  distro: string;
  /**
   * Original Windows UNC path (e.g. `\\wsl$\Ubuntu\home\user\repo`). Passed
   * as `baseDir` so simple-git's synchronous folder-exists check (which calls
   * `fs.statSync`) succeeds via the Windows-side 9P mount. `wsl.exe` then
   * receives this UNC path as its spawn cwd and translates it automatically.
   */
  uncPath: string;
  /**
   * POSIX path inside the distro (must start with `/`). Retained for
   * diagnostics and for future invocation strategies that need to issue
   * `--cd` to wsl.exe directly.
   */
  posixPath: string;
}

/**
 * Create a hardened SimpleGit instance whose underlying git binary runs inside
 * a WSL distro. Used for worktrees mounted at `\\wsl$\<distro>\...` so that
 * git status polling stays inside the Linux filesystem and avoids the 9P
 * boundary penalty (5-10x slowdown for `git status` from Windows-side git).
 *
 * Implementation note: simple-git's `binary` option accepts a 1-2 element
 * tuple. The 2-element form prepends `binary[1]` as a single positional arg
 * to every spawn, so `["wsl.exe", "git"]` produces `wsl.exe git <args>` and
 * routes through the WSL default distro. Spaces are forbidden in the second
 * element, so a `-d <distro>` selector cannot be passed via this path —
 * non-default distros are filtered out before reaching this factory by the
 * caller (see `wslGitEligible` in WorkspaceService).
 *
 * `baseDir` MUST be the Windows-side UNC path: simple-git validates the
 * directory via `fs.statSync` synchronously at construction time, and a
 * POSIX path like `/home/user/repo` resolves to a non-existent path on the
 * current drive (`C:\home\user\repo`) on Windows, throwing
 * `GitConstructError`. The UNC form (e.g. `\\wsl$\Ubuntu\home\user\repo`)
 * resolves through the 9P mount and `wsl.exe` translates it back to POSIX
 * internally when spawning the git child process.
 *
 * Windows-only: throws on other platforms.
 */
export function createWslHardenedGit(
  invocation: WslGitInvocation,
  signal?: AbortSignal
): SimpleGit {
  if (process.platform !== "win32") {
    throw new Error("createWslHardenedGit is only available on Windows");
  }
  const { distro, uncPath, posixPath } = invocation;
  if (typeof distro !== "string" || !distro.trim()) {
    throw new Error("WSL distro name is required");
  }
  if (typeof posixPath !== "string" || !posixPath.startsWith("/")) {
    throw new Error("WSL posix path must start with /");
  }
  if (typeof uncPath !== "string" || !uncPath.startsWith("\\\\wsl")) {
    throw new Error("WSL UNC path must start with \\\\wsl");
  }

  return simpleGit({
    baseDir: uncPath,
    binary: ["wsl.exe", "git"],
    config: [...HARDENED_GIT_CONFIG],
    timeout: { block: GIT_BLOCK_TIMEOUT_MS },
    ...(signal ? { abort: signal } : {}),
    unsafe: UNSAFE_FLAGS,
  }).env({
    ...process.env,
    LC_MESSAGES: "C",
    LANGUAGE: "",
    // Surface the targeted distro to wsl.exe via env. wsl.exe doesn't honour
    // WSL_DISTRO_NAME for selection (it uses the default distro), but having
    // this env var present makes diagnostic output unambiguous if the user
    // captures process state during a hang.
    WSL_DISTRO_NAME: distro,
    // The git binary inside WSL is Linux git, so the same non-interactive +
    // lock-suppression hardening that createHardenedGit applies on POSIX
    // must reach the WSL distro too. GCM_INTERACTIVE is harmless inside
    // WSL (no GCM there) but kept for defense in depth in case wsl.exe ever
    // surfaces it back to the host credential helper chain.
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "true",
    GCM_INTERACTIVE: "Never",
  });
}

export interface AuthenticatedGitOptions {
  signal?: AbortSignal;
  progress?: (data: SimpleGitProgressEvent) => void;
  extraConfig?: string[];
}

export function createAuthenticatedGit(cwd: string, opts: AuthenticatedGitOptions = {}): SimpleGit {
  const { signal, progress, extraConfig } = opts;
  return simpleGit({
    baseDir: cwd,
    config: [...AUTHENTICATED_GIT_CONFIG, ...(extraConfig ?? [])],
    timeout: { block: 0 },
    ...(signal ? { abort: signal } : {}),
    ...(progress ? { progress } : {}),
    unsafe: UNSAFE_FLAGS,
  }).env({
    ...process.env,
    ...getGitLocaleEnv(),
    LC_ALL: "",
    LC_MESSAGES: "C",
    LANGUAGE: "",
    GIT_TERMINAL_PROMPT: "0",
    GIT_SSH_COMMAND:
      "ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=15",
    // Same lock-suppression and Windows-GCM hardening as createHardenedGit.
    // GIT_ASKPASS is intentionally NOT set here — credentialed commands
    // (clone/push) need legitimate ASKPASS resolution.
    GIT_OPTIONAL_LOCKS: "0",
    GCM_INTERACTIVE: "Never",
  });
}

/**
 * Background-fetch config additions on top of the authenticated profile:
 *   - `core.packedRefsTimeout=5000`: when a foreground git operation holds
 *     `.git/packed-refs.lock`, wait up to 5s instead of failing immediately.
 *   - `http.lowSpeedLimit=1000` + `http.lowSpeedTime=30`: abort fetches that
 *     stall under 1 KB/s for 30s, so a half-open TCP connection doesn't sit
 *     against the 60s AbortSignal timeout.
 *   - `gc.auto=0`: belt-and-braces — `--no-auto-gc` is also passed at the
 *     fetch call site, but pinning the config too prevents any sub-invocation
 *     (e.g., a fetch hook) from racing a gc against foreground git CLI.
 */
const BACKGROUND_FETCH_CONFIG = [
  "core.packedRefsTimeout=5000",
  "http.lowSpeedLimit=1000",
  "http.lowSpeedTime=30",
  "gc.auto=0",
] as const;

export interface BackgroundFetchGitOptions {
  signal: AbortSignal;
  progress?: (data: SimpleGitProgressEvent) => void;
  extraConfig?: string[];
  /** Override platform detection — test-only. */
  platform?: NodeJS.Platform;
}

/**
 * SimpleGit instance for background `git fetch` invocations. Wraps
 * `createAuthenticatedGit` so the system credential helper still works for
 * HTTPS remotes, but layers on:
 *   - lock-friendly config (see `BACKGROUND_FETCH_CONFIG`)
 *   - `GIT_ASKPASS=true` on POSIX so credential helpers that ignore
 *     `GIT_TERMINAL_PROMPT=0` fail fast instead of hanging on a TTY prompt
 *     (Windows omits this — `true` is not on PATH there, and
 *     `GIT_TERMINAL_PROMPT=0` blocks Windows credential dialogs)
 *
 * The signal is required: every background fetch must carry an
 * AbortController so a stalled connection can be cancelled.
 */
export function createBackgroundFetchGit(cwd: string, opts: BackgroundFetchGitOptions): SimpleGit {
  const { signal, progress, extraConfig, platform = process.platform } = opts;
  const git = createAuthenticatedGit(cwd, {
    signal,
    progress,
    extraConfig: [...BACKGROUND_FETCH_CONFIG, ...(extraConfig ?? [])],
  });
  if (platform !== "win32") {
    return git.env({
      ...process.env,
      ...getGitLocaleEnv(platform),
      LC_ALL: "",
      LC_MESSAGES: "C",
      LANGUAGE: "",
      GIT_TERMINAL_PROMPT: "0",
      GIT_SSH_COMMAND:
        "ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=15",
      GIT_ASKPASS: "true",
      // simple-git's .env() replaces the env wholesale, so the hardening
      // flags from createAuthenticatedGit's first .env() call must be
      // re-stated here or they will be lost on POSIX.
      GIT_OPTIONAL_LOCKS: "0",
      GCM_INTERACTIVE: "Never",
    });
  }
  return git;
}
