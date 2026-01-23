import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDefaultShell, getDefaultShellArgs, buildNonInteractiveEnv } from "../terminalShell.js";

describe("terminalShell", () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    process.env = { ...originalEnv };
  });

  describe("getDefaultShell", () => {
    it("should return SHELL env var when set on unix", () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      process.env.SHELL = "/usr/local/bin/fish";
      expect(getDefaultShell()).toBe("/usr/local/bin/fish");
    });

    it("should return COMSPEC on windows", () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      process.env.COMSPEC = "C:\\Windows\\System32\\cmd.exe";
      expect(getDefaultShell()).toBe("C:\\Windows\\System32\\cmd.exe");
    });

    it("should default to powershell.exe if COMSPEC not set on windows", () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      delete process.env.COMSPEC;
      expect(getDefaultShell()).toBe("powershell.exe");
    });
  });

  describe("getDefaultShellArgs", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "darwin" });
    });

    it("should return -l for zsh", () => {
      expect(getDefaultShellArgs("/bin/zsh")).toEqual(["-l"]);
      expect(getDefaultShellArgs("/usr/local/bin/zsh")).toEqual(["-l"]);
    });

    it("should return -l for bash", () => {
      expect(getDefaultShellArgs("/bin/bash")).toEqual(["-l"]);
      expect(getDefaultShellArgs("/usr/local/bin/bash")).toEqual(["-l"]);
    });

    it("should return empty array for other shells", () => {
      expect(getDefaultShellArgs("/bin/sh")).toEqual([]);
      expect(getDefaultShellArgs("/usr/local/bin/fish")).toEqual([]);
    });

    it("should return empty array on windows", () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      expect(getDefaultShellArgs("powershell.exe")).toEqual([]);
      expect(getDefaultShellArgs("cmd.exe")).toEqual([]);
    });
  });

  describe("buildNonInteractiveEnv", () => {
    it("should preserve base environment variables", () => {
      const baseEnv = {
        PATH: "/usr/bin:/bin",
        HOME: "/Users/test",
        CUSTOM_VAR: "value",
      };
      const result = buildNonInteractiveEnv(baseEnv, "/bin/zsh");

      expect(result.PATH).toBe("/usr/bin:/bin");
      expect(result.HOME).toBe("/Users/test");
      expect(result.CUSTOM_VAR).toBe("value");
    });

    it("should filter out undefined values from base env", () => {
      const baseEnv = {
        DEFINED: "yes",
        UNDEFINED: undefined,
      };
      const result = buildNonInteractiveEnv(baseEnv, "/bin/zsh");

      expect(result.DEFINED).toBe("yes");
      expect("UNDEFINED" in result).toBe(false);
    });

    it("should set DISABLE_AUTO_UPDATE for oh-my-zsh", () => {
      const result = buildNonInteractiveEnv({}, "/bin/zsh");
      expect(result.DISABLE_AUTO_UPDATE).toBe("true");
    });

    it("should set HOMEBREW_NO_AUTO_UPDATE", () => {
      const result = buildNonInteractiveEnv({}, "/bin/zsh");
      expect(result.HOMEBREW_NO_AUTO_UPDATE).toBe("1");
    });

    it("should set DEBIAN_FRONTEND to noninteractive", () => {
      const result = buildNonInteractiveEnv({}, "/bin/bash");
      expect(result.DEBIAN_FRONTEND).toBe("noninteractive");
    });

    it("should set generic NONINTERACTIVE flag", () => {
      const result = buildNonInteractiveEnv({}, "/bin/zsh");
      expect(result.NONINTERACTIVE).toBe("1");
    });

    it("should set PAGER to empty string to suppress interactive pagers", () => {
      const result = buildNonInteractiveEnv({}, "/bin/zsh");
      expect(result.PAGER).toBe("");
    });

    it("should set GIT_PAGER to empty string", () => {
      const result = buildNonInteractiveEnv({}, "/bin/zsh");
      expect(result.GIT_PAGER).toBe("");
    });

    it("should set CI flag when not already set", () => {
      const result = buildNonInteractiveEnv({}, "/bin/zsh");
      expect(result.CI).toBe("1");
    });

    it("should preserve existing CI value", () => {
      const baseEnv = { CI: "true" };
      const result = buildNonInteractiveEnv(baseEnv, "/bin/zsh");
      expect(result.CI).toBe("true");
    });

    it("should set NVM_DIR_SILENT", () => {
      const result = buildNonInteractiveEnv({}, "/bin/zsh");
      expect(result.NVM_DIR_SILENT).toBe("1");
    });

    it("should set PYENV_VIRTUALENV_DISABLE_PROMPT", () => {
      const result = buildNonInteractiveEnv({}, "/bin/zsh");
      expect(result.PYENV_VIRTUALENV_DISABLE_PROMPT).toBe("1");
    });

    it("should set rvm_silence_path_mismatch_check_flag", () => {
      const result = buildNonInteractiveEnv({}, "/bin/zsh");
      expect(result.rvm_silence_path_mismatch_check_flag).toBe("1");
    });

    it("should set GIT_TERMINAL_PROMPT to disable credential prompts", () => {
      const result = buildNonInteractiveEnv({}, "/bin/zsh");
      expect(result.GIT_TERMINAL_PROMPT).toBe("0");
    });

    it("should set ZSH_DISABLE_COMPFIX", () => {
      const result = buildNonInteractiveEnv({}, "/bin/zsh");
      expect(result.ZSH_DISABLE_COMPFIX).toBe("true");
    });

    it("should set DISABLE_UPDATE_PROMPT", () => {
      const result = buildNonInteractiveEnv({}, "/bin/zsh");
      expect(result.DISABLE_UPDATE_PROMPT).toBe("true");
    });

    it("should work with all common shells", () => {
      const shells = ["/bin/zsh", "/bin/bash", "/bin/sh", "/usr/local/bin/fish"];
      for (const shell of shells) {
        const result = buildNonInteractiveEnv({}, shell);
        expect(result.DISABLE_AUTO_UPDATE).toBe("true");
        expect(result.NONINTERACTIVE).toBe("1");
      }
    });

    it("should override user-provided pager settings for agent terminals", () => {
      const baseEnv = {
        PAGER: "less",
        GIT_PAGER: "delta",
      };
      const result = buildNonInteractiveEnv(baseEnv, "/bin/zsh");
      // The non-interactive env vars intentionally override user settings for agent terminals
      expect(result.PAGER).toBe("");
      expect(result.GIT_PAGER).toBe("");
    });
  });
});
