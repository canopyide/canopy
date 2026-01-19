import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { access } from "fs/promises";
import { waitForPathExists } from "../fs.js";

vi.mock("fs/promises", () => ({
  access: vi.fn(),
}));

describe("waitForPathExists", () => {
  const mockAccess = vi.mocked(access);

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should resolve immediately if path exists", async () => {
    mockAccess.mockResolvedValueOnce(undefined);

    const promise = waitForPathExists("/test/path");
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();

    expect(mockAccess).toHaveBeenCalledTimes(1);
    expect(mockAccess).toHaveBeenCalledWith("/test/path");
  });

  it("should retry with exponential backoff until path exists", async () => {
    mockAccess
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce(undefined);

    const promise = waitForPathExists("/test/path", {
      initialRetryDelayMs: 50,
      backoffMultiplier: 2,
      timeoutMs: 5000,
    });

    // First check fails
    await vi.advanceTimersByTimeAsync(0);
    expect(mockAccess).toHaveBeenCalledTimes(1);

    // First retry after 50ms
    await vi.advanceTimersByTimeAsync(50);
    expect(mockAccess).toHaveBeenCalledTimes(2);

    // Second retry after 100ms (50 * 2)
    await vi.advanceTimersByTimeAsync(100);
    expect(mockAccess).toHaveBeenCalledTimes(3);

    await expect(promise).resolves.toBeUndefined();
  });

  it("should respect maxRetryDelayMs cap", async () => {
    mockAccess
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce(undefined);

    const promise = waitForPathExists("/test/path", {
      initialRetryDelayMs: 50,
      backoffMultiplier: 2,
      maxRetryDelayMs: 120,
      timeoutMs: 5000,
    });

    // First check fails
    await vi.advanceTimersByTimeAsync(0);
    expect(mockAccess).toHaveBeenCalledTimes(1);

    // First retry after 50ms
    await vi.advanceTimersByTimeAsync(50);
    expect(mockAccess).toHaveBeenCalledTimes(2);

    // Second retry after 100ms (50 * 2)
    await vi.advanceTimersByTimeAsync(100);
    expect(mockAccess).toHaveBeenCalledTimes(3);

    // Third retry should be capped at 120ms instead of 200ms (100 * 2)
    await vi.advanceTimersByTimeAsync(120);
    expect(mockAccess).toHaveBeenCalledTimes(4);

    await expect(promise).resolves.toBeUndefined();
  });

  it("should timeout if path never appears", async () => {
    mockAccess.mockRejectedValue(new Error("ENOENT"));

    const promise = waitForPathExists("/test/path", {
      initialRetryDelayMs: 100,
      backoffMultiplier: 2,
      timeoutMs: 500,
    });

    // Advance past timeout
    await vi.advanceTimersByTimeAsync(600);

    await expect(promise).rejects.toThrow(/Timeout waiting for path to exist/);
    await expect(promise).rejects.toThrow("/test/path");
  });

  it("should use default options when none provided", async () => {
    mockAccess.mockResolvedValueOnce(undefined);

    const promise = waitForPathExists("/test/path");
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
  });

  it("should respect initialDelayMs", async () => {
    mockAccess.mockResolvedValueOnce(undefined);

    const promise = waitForPathExists("/test/path", {
      initialDelayMs: 100,
      timeoutMs: 5000,
    });

    // Should not check immediately
    expect(mockAccess).toHaveBeenCalledTimes(0);

    // Should check after initial delay
    await vi.advanceTimersByTimeAsync(100);
    expect(mockAccess).toHaveBeenCalledTimes(1);

    await expect(promise).resolves.toBeUndefined();
  });

  it("should not exceed timeout even with long retry delays", async () => {
    mockAccess.mockRejectedValue(new Error("ENOENT"));

    const promise = waitForPathExists("/test/path", {
      initialRetryDelayMs: 200,
      backoffMultiplier: 2,
      maxRetryDelayMs: 1000,
      timeoutMs: 500,
    });

    // First check at 0ms fails
    await vi.advanceTimersByTimeAsync(0);
    expect(mockAccess).toHaveBeenCalledTimes(1);

    // Should try once at 200ms
    await vi.advanceTimersByTimeAsync(200);
    expect(mockAccess).toHaveBeenCalledTimes(2);

    // Should try again at 400ms (200 * 2)
    await vi.advanceTimersByTimeAsync(200);
    expect(mockAccess).toHaveBeenCalledTimes(3);

    // Next retry would be at 800ms (400 * 2) but that exceeds 500ms timeout
    // So it should timeout before scheduling another retry
    await vi.advanceTimersByTimeAsync(100);

    await expect(promise).rejects.toThrow(/Timeout waiting for path to exist/);
  });

  it("should clean up pending timers on success", async () => {
    mockAccess.mockRejectedValueOnce(new Error("ENOENT")).mockResolvedValueOnce(undefined);

    const promise = waitForPathExists("/test/path", {
      initialRetryDelayMs: 50,
      timeoutMs: 5000,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(50);

    await expect(promise).resolves.toBeUndefined();

    // Verify no pending timers
    expect(vi.getTimerCount()).toBe(0);
  });

  it("should clean up pending timers on timeout", async () => {
    mockAccess.mockRejectedValue(new Error("ENOENT"));

    const promise = waitForPathExists("/test/path", {
      initialRetryDelayMs: 100,
      timeoutMs: 150,
    });

    await vi.advanceTimersByTimeAsync(200);

    await expect(promise).rejects.toThrow(/Timeout waiting for path to exist/);

    // Verify no pending timers
    expect(vi.getTimerCount()).toBe(0);
  });

  it("should handle path with spaces and special characters", async () => {
    const specialPath = "/test/path with spaces/special-chars_123";
    mockAccess.mockResolvedValueOnce(undefined);

    const promise = waitForPathExists(specialPath);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();

    expect(mockAccess).toHaveBeenCalledWith(specialPath);
  });

  it("should fail fast on permission errors (EACCES, EPERM)", async () => {
    const eaccesError = Object.assign(new Error("Permission denied"), {
      code: "EACCES",
    });
    mockAccess.mockRejectedValueOnce(eaccesError);

    const promise = waitForPathExists("/test/path", {
      initialRetryDelayMs: 50,
      timeoutMs: 5000,
    });

    await vi.advanceTimersByTimeAsync(0);

    await expect(promise).rejects.toThrow(/Cannot access path/);
    await expect(promise).rejects.toThrow(/EACCES/);
    expect(mockAccess).toHaveBeenCalledTimes(1);
  });

  it("should fail fast on ENOTDIR errors", async () => {
    const enotdirError = Object.assign(new Error("Not a directory"), {
      code: "ENOTDIR",
    });
    mockAccess.mockRejectedValueOnce(enotdirError);

    const promise = waitForPathExists("/test/path/file", {
      initialRetryDelayMs: 50,
      timeoutMs: 5000,
    });

    await vi.advanceTimersByTimeAsync(0);

    await expect(promise).rejects.toThrow(/Cannot access path/);
    await expect(promise).rejects.toThrow(/ENOTDIR/);
    expect(mockAccess).toHaveBeenCalledTimes(1);
  });

  it("should retry only on ENOENT errors", async () => {
    const enoentError = Object.assign(new Error("No such file or directory"), {
      code: "ENOENT",
    });
    mockAccess
      .mockRejectedValueOnce(enoentError)
      .mockRejectedValueOnce(enoentError)
      .mockResolvedValueOnce(undefined);

    const promise = waitForPathExists("/test/path", {
      initialRetryDelayMs: 50,
      timeoutMs: 5000,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(100);

    await expect(promise).resolves.toBeUndefined();
    expect(mockAccess).toHaveBeenCalledTimes(3);
  });

  it("should calculate remaining time correctly to avoid exceeding timeout", async () => {
    mockAccess.mockRejectedValue(new Error("ENOENT"));

    const promise = waitForPathExists("/test/path", {
      initialRetryDelayMs: 100,
      backoffMultiplier: 2,
      timeoutMs: 350,
    });

    // First check at 0ms
    await vi.advanceTimersByTimeAsync(0);
    expect(mockAccess).toHaveBeenCalledTimes(1);

    // Retry at 100ms
    await vi.advanceTimersByTimeAsync(100);
    expect(mockAccess).toHaveBeenCalledTimes(2);

    // Retry at 300ms (100 + 200)
    await vi.advanceTimersByTimeAsync(200);
    expect(mockAccess).toHaveBeenCalledTimes(3);

    // Should timeout before next retry (would be at 700ms but timeout is 350ms)
    await vi.advanceTimersByTimeAsync(60);

    await expect(promise).rejects.toThrow(/Timeout waiting for path to exist/);
  });

  it("should timeout immediately when initialDelayMs >= timeoutMs", async () => {
    mockAccess.mockResolvedValue(undefined);

    const promise = waitForPathExists("/test/path", {
      initialDelayMs: 1000,
      timeoutMs: 500,
    });

    // Initial delay would be 1000ms but timeout is 500ms
    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).rejects.toThrow(/Timeout waiting for path to exist/);
    // Should not have called access at all since initial delay exceeded timeout
    expect(mockAccess).toHaveBeenCalledTimes(0);
  });

  it("should timeout immediately when timeoutMs is 0", async () => {
    mockAccess.mockResolvedValue(undefined);

    const promise = waitForPathExists("/test/path", {
      timeoutMs: 0,
    });

    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow(/Timeout waiting for path to exist/);
  });
});
