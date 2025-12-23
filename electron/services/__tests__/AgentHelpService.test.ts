import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { AgentHelpService } from "../AgentHelpService.js";
import { execFile } from "child_process";
import type { ChildProcess } from "child_process";
import EventEmitter from "events";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("../../shared/config/agentRegistry.js", () => ({
  AGENT_REGISTRY: {
    claude: { command: "claude", help: { args: ["--help"] } },
    gemini: { command: "gemini" },
    codex: { command: "codex", help: { args: ["-h"] } },
  },
  getAgentConfig: (id: string) => {
    const registry: Record<string, { command: string; help?: { args: string[] } }> = {
      claude: { command: "claude", help: { args: ["--help"] } },
      gemini: { command: "gemini" },
      codex: { command: "codex", help: { args: ["-h"] } },
    };
    return registry[id];
  },
}));

describe("AgentHelpService", () => {
  let service: AgentHelpService;
  const mockedExecFile = vi.mocked(execFile);

  beforeEach(() => {
    service = new AgentHelpService();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function createMockChildProcess(
    stdout: string,
    stderr: string,
    exitCode: number | null,
    delay = 0
  ): ChildProcess {
    const mockProcess = new EventEmitter() as ChildProcess;
    mockProcess.stdout = new EventEmitter() as ChildProcess["stdout"];
    mockProcess.stderr = new EventEmitter() as ChildProcess["stderr"];

    setTimeout(() => {
      if (mockProcess.stdout) {
        mockProcess.stdout.emit("data", Buffer.from(stdout));
      }
      if (mockProcess.stderr) {
        mockProcess.stderr.emit("data", Buffer.from(stderr));
      }
      setTimeout(() => {
        mockProcess.emit("close", exitCode);
      }, 10);
    }, delay);

    return mockProcess;
  }

  describe("getAgentHelp", () => {
    it("executes help command and returns output", async () => {
      const expectedStdout = "Usage: claude [options]\n--help  Show help\n";
      const mockProcess = createMockChildProcess(expectedStdout, "", 0);

      mockedExecFile.mockReturnValue(mockProcess);

      const resultPromise = service.getAgentHelp("claude");
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.stdout).toBe(expectedStdout);
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(result.truncated).toBe(false);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it("uses default --help args when not specified in config", async () => {
      const mockProcess = createMockChildProcess("Help output", "", 0);
      mockedExecFile.mockReturnValue(mockProcess);

      const resultPromise = service.getAgentHelp("gemini");
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(mockedExecFile).toHaveBeenCalledWith(
        "gemini",
        ["--help"],
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it("uses custom help args from config", async () => {
      const mockProcess = createMockChildProcess("Help output", "", 0);
      mockedExecFile.mockReturnValue(mockProcess);

      const resultPromise = service.getAgentHelp("codex");
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(mockedExecFile).toHaveBeenCalledWith(
        "codex",
        ["-h"],
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it("captures both stdout and stderr", async () => {
      const mockProcess = createMockChildProcess("stdout content", "stderr content", 0);
      mockedExecFile.mockReturnValue(mockProcess);

      const resultPromise = service.getAgentHelp("claude");
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.stdout).toBe("stdout content");
      expect(result.stderr).toBe("stderr content");
    });

    it("handles non-zero exit codes", async () => {
      const mockProcess = createMockChildProcess("", "Error: unknown flag", 1);
      mockedExecFile.mockReturnValue(mockProcess);

      const resultPromise = service.getAgentHelp("claude");
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("Error: unknown flag");
    });

    it("rejects invalid agent IDs", async () => {
      await expect(service.getAgentHelp("invalid-id!")).rejects.toThrow("Invalid agent ID");
    });

    it("rejects unknown agent IDs", async () => {
      await expect(service.getAgentHelp("unknown")).rejects.toThrow("Unknown agent ID");
    });

    it("rejects commands with invalid characters", async () => {
      const maliciousService = new AgentHelpService();

      vi.doMock("../../shared/config/agentRegistry.js", () => ({
        AGENT_REGISTRY: { malicious: { command: "rm -rf" } },
        getAgentConfig: (id: string) => {
          if (id === "malicious") {
            return { command: "rm -rf" };
          }
          return undefined;
        },
      }));

      await expect(maliciousService.getAgentHelp("rm -rf")).rejects.toThrow("Invalid agent ID");
    });
  });

  describe("caching", () => {
    it("caches results and returns cached response", async () => {
      const mockProcess1 = createMockChildProcess("First call", "", 0);
      const mockProcess2 = createMockChildProcess("Second call", "", 0);

      mockedExecFile.mockReturnValueOnce(mockProcess1).mockReturnValueOnce(mockProcess2);

      const resultPromise1 = service.getAgentHelp("claude");
      await vi.runAllTimersAsync();
      const result1 = await resultPromise1;

      const resultPromise2 = service.getAgentHelp("claude");
      await vi.runAllTimersAsync();
      const result2 = await resultPromise2;

      expect(result1.stdout).toBe("First call");
      expect(result2.stdout).toBe("First call");
      expect(mockedExecFile).toHaveBeenCalledTimes(1);
    });

    it("bypasses cache when refresh flag is true", async () => {
      const mockProcess1 = createMockChildProcess("First call", "", 0);
      const mockProcess2 = createMockChildProcess("Second call", "", 0);

      mockedExecFile.mockReturnValueOnce(mockProcess1).mockReturnValueOnce(mockProcess2);

      const resultPromise1 = service.getAgentHelp("claude");
      await vi.runAllTimersAsync();
      const result1 = await resultPromise1;

      const resultPromise2 = service.getAgentHelp("claude", true);
      await vi.runAllTimersAsync();
      const result2 = await resultPromise2;

      expect(result1.stdout).toBe("First call");
      expect(result2.stdout).toBe("Second call");
      expect(mockedExecFile).toHaveBeenCalledTimes(2);
    });

    it("expires cache after TTL", async () => {
      const TTL_MS = 10 * 60 * 1000;
      const mockProcess1 = createMockChildProcess("First call", "", 0);
      const mockProcess2 = createMockChildProcess("Second call", "", 0);

      mockedExecFile.mockReturnValueOnce(mockProcess1).mockReturnValueOnce(mockProcess2);

      const resultPromise1 = service.getAgentHelp("claude");
      await vi.runAllTimersAsync();
      await resultPromise1;

      vi.advanceTimersByTime(TTL_MS + 1000);

      const resultPromise2 = service.getAgentHelp("claude");
      await vi.runAllTimersAsync();
      const result2 = await resultPromise2;

      expect(result2.stdout).toBe("Second call");
      expect(mockedExecFile).toHaveBeenCalledTimes(2);
    });
  });

  describe("timeout handling", () => {
    it("marks output as timed out and kills process", async () => {
      const mockProcess = createMockChildProcess("Partial output", "", null, 0);
      mockProcess.kill = vi.fn();

      mockedExecFile.mockReturnValue(mockProcess);

      const resultPromise = service.getAgentHelp("claude");

      vi.advanceTimersByTime(5000);
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.timedOut).toBe(true);
      expect(result.stdout).toBe("Partial output");
      expect(mockProcess.kill).toHaveBeenCalled();
    });
  });

  describe("output truncation", () => {
    it("truncates stdout when exceeding max size", async () => {
      const largeOutput = "x".repeat(300 * 1024);
      const mockProcess = createMockChildProcess(largeOutput, "", 0);

      mockedExecFile.mockReturnValue(mockProcess);

      const resultPromise = service.getAgentHelp("claude");
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.truncated).toBe(true);
      expect(result.stdout.length).toBeLessThanOrEqual(256 * 1024);
    });

    it("truncates stderr when exceeding max size", async () => {
      const largeError = "e".repeat(300 * 1024);
      const mockProcess = createMockChildProcess("", largeError, 1);

      mockedExecFile.mockReturnValue(mockProcess);

      const resultPromise = service.getAgentHelp("claude");
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.truncated).toBe(true);
      expect(result.stderr.length).toBeLessThanOrEqual(256 * 1024);
    });
  });

  describe("error handling", () => {
    it("captures error messages when process fails to spawn", async () => {
      const mockProcess = new EventEmitter() as ChildProcess;
      mockProcess.stdout = new EventEmitter() as ChildProcess["stdout"];
      mockProcess.stderr = new EventEmitter() as ChildProcess["stderr"];

      mockedExecFile.mockReturnValue(mockProcess);

      const resultPromise = service.getAgentHelp("claude");

      setTimeout(() => {
        mockProcess.emit("error", new Error("ENOENT: command not found"));
      }, 10);

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.exitCode).toBe(null);
      expect(result.stderr).toContain("ENOENT: command not found");
    });
  });
});
