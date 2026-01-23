import { existsSync } from "fs";

export interface ShellArgsOptions {
  nonInteractive?: boolean;
}

export function getDefaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "powershell.exe";
  }

  if (process.env.SHELL) {
    return process.env.SHELL;
  }

  const commonShells = ["/bin/zsh", "/bin/bash", "/bin/sh"];
  for (const shell of commonShells) {
    try {
      if (existsSync(shell)) {
        return shell;
      }
    } catch {
      // Continue to next shell
    }
  }

  return "/bin/sh";
}

export function getDefaultShellArgs(shell: string, _options?: ShellArgsOptions): string[] {
  const shellName = shell.toLowerCase();

  if (process.platform !== "win32") {
    if (shellName.includes("zsh") || shellName.includes("bash")) {
      return ["-l"];
    }
  }

  return [];
}

/**
 * Build environment variables that suppress interactive prompts during shell initialization.
 * Used for agent terminals where predictable, non-interactive startup is required.
 */
export function buildNonInteractiveEnv(
  baseEnv: Record<string, string | undefined>,
  _shell: string
): Record<string, string> {
  const env: Record<string, string> = {};

  // Copy base environment, filtering out undefined values
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  // oh-my-zsh and similar frameworks
  // Disables automatic update checks that show interactive prompts
  env.DISABLE_AUTO_UPDATE = "true";
  env.DISABLE_UPDATE_PROMPT = "true";

  // Zsh completion verification
  env.ZSH_DISABLE_COMPFIX = "true";

  // Homebrew
  // Prevents "brew update" from running automatically during shell startup
  env.HOMEBREW_NO_AUTO_UPDATE = "1";

  // Debian/Ubuntu package managers
  // Prevents dpkg/apt from asking configuration questions
  env.DEBIAN_FRONTEND = "noninteractive";

  // Generic non-interactive flag
  // Many shell tools check this to disable interactive behavior
  env.NONINTERACTIVE = "1";

  // Suppress pagers (less, more, etc.) that would block command output
  // Use empty string instead of "cat" to avoid dependency on external commands
  env.PAGER = "";

  // GIT_PAGER: Suppress git's pager for diff, log, etc.
  env.GIT_PAGER = "";

  // CI flag: Many tools detect CI environments and disable prompts
  // Only set if not already defined to avoid overriding explicit values
  // Note: This can change tool behavior (e.g., warnings-as-errors)
  if (!env.CI) {
    env.CI = "1";
  }

  // Force color output: Many CLI tools (chalk, supports-color, etc.) disable
  // colors when they detect CI=1. Override this since our xterm.js terminal
  // fully supports ANSI colors. FORCE_COLOR=3 enables 256-color support.
  env.FORCE_COLOR = "3";
  env.COLORTERM = "truecolor";

  // Git credential prompts
  env.GIT_TERMINAL_PROMPT = "0";

  // NVM (Node Version Manager)
  // Suppress "NVM is out of date" messages
  env.NVM_DIR_SILENT = "1";

  // Pyenv
  // Suppress shell initialization warnings
  env.PYENV_VIRTUALENV_DISABLE_PROMPT = "1";

  // RVM (Ruby Version Manager)
  // Suppress rvm auto-update prompts
  env.rvm_silence_path_mismatch_check_flag = "1";

  return env;
}
