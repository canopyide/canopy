import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectOS, getInstallBlocksForOS } from "../agentInstall";
import type { AgentInstallHelp } from "../../../shared/config/agentRegistry";

describe("agentInstall", () => {
  let originalPlatform: string;

  beforeEach(() => {
    originalPlatform = navigator.platform;
  });

  afterEach(() => {
    Object.defineProperty(navigator, "platform", {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
  });

  describe("detectOS", () => {
    it("should detect macOS", () => {
      Object.defineProperty(navigator, "platform", {
        value: "MacIntel",
        writable: true,
      });
      expect(detectOS()).toBe("macos");
    });

    it("should detect Windows", () => {
      Object.defineProperty(navigator, "platform", {
        value: "Win32",
        writable: true,
      });
      expect(detectOS()).toBe("windows");
    });

    it("should detect Linux as default", () => {
      Object.defineProperty(navigator, "platform", {
        value: "Linux x86_64",
        writable: true,
      });
      expect(detectOS()).toBe("linux");
    });

    it("should be case-insensitive", () => {
      Object.defineProperty(navigator, "platform", {
        value: "macintosh",
        writable: true,
      });
      expect(detectOS()).toBe("macos");
    });

    it("should return generic when navigator.platform is undefined", () => {
      Object.defineProperty(navigator, "platform", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(detectOS()).toBe("generic");
    });

    it("should return generic when navigator.platform is not a string", () => {
      Object.defineProperty(navigator, "platform", {
        value: null,
        writable: true,
        configurable: true,
      });
      expect(detectOS()).toBe("generic");
    });

    it("should return generic for unknown platforms", () => {
      Object.defineProperty(navigator, "platform", {
        value: "FreeBSD",
        writable: true,
        configurable: true,
      });
      expect(detectOS()).toBe("generic");
    });
  });

  describe("getInstallBlocksForOS", () => {
    const mockInstall: AgentInstallHelp = {
      docsUrl: "https://example.com/docs",
      byOs: {
        macos: [{ label: "Homebrew", commands: ["brew install cli"] }],
        windows: [{ label: "npm", commands: ["npm install -g cli"] }],
        linux: [{ label: "apt", commands: ["apt install cli"] }],
        generic: [{ label: "Generic", commands: ["download from website"] }],
      },
    };

    it("should return OS-specific blocks", () => {
      const blocks = getInstallBlocksForOS(mockInstall, "macos");
      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.label).toBe("Homebrew");
    });

    it("should return generic blocks as fallback", () => {
      const installNoLinux: AgentInstallHelp = {
        byOs: {
          macos: [{ label: "Homebrew" }],
          generic: [{ label: "Generic" }],
        },
      };
      const blocks = getInstallBlocksForOS(installNoLinux, "linux");
      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.label).toBe("Generic");
    });

    it("should return empty array if no install metadata", () => {
      const blocks = getInstallBlocksForOS(undefined, "macos");
      expect(blocks).toEqual([]);
    });

    it("should return empty array if no byOs field", () => {
      const installNoByOs: AgentInstallHelp = {
        docsUrl: "https://example.com/docs",
      };
      const blocks = getInstallBlocksForOS(installNoByOs, "macos");
      expect(blocks).toEqual([]);
    });

    it("should return empty array if no matching OS and no generic", () => {
      const installNoGeneric: AgentInstallHelp = {
        byOs: {
          macos: [{ label: "Homebrew" }],
        },
      };
      const blocks = getInstallBlocksForOS(installNoGeneric, "windows");
      expect(blocks).toEqual([]);
    });
  });
});
