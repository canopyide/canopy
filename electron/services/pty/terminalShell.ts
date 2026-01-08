import { existsSync } from "fs";

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

export function getDefaultShellArgs(shell: string): string[] {
  const shellName = shell.toLowerCase();

  if (process.platform !== "win32") {
    if (shellName.includes("zsh") || shellName.includes("bash")) {
      return ["-l"];
    }
  }

  return [];
}
