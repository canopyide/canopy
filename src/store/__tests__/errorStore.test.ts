import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useErrorStore } from "../errorStore";

describe("errorStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useErrorStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deduplicates rapid matching errors and refreshes timestamp", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const firstId = useErrorStore.getState().addError({
      type: "process",
      message: "Process crashed",
      source: "pty",
      retryability: "auto",
      context: { terminalId: "term-1" },
    });

    vi.setSystemTime(new Date("2026-01-01T00:00:00.200Z"));
    const secondId = useErrorStore.getState().addError({
      type: "process",
      message: "Process crashed",
      source: "pty",
      retryability: "auto",
      context: { terminalId: "term-1" },
    });

    const state = useErrorStore.getState();
    expect(secondId).toBe(firstId);
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0]?.timestamp).toBe(new Date("2026-01-01T00:00:00.200Z").getTime());
  });

  it("does not deduplicate after rate limit window", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    useErrorStore.getState().addError({
      type: "network",
      message: "Timeout",
      source: "fetcher",
      retryability: "auto",
    });

    vi.setSystemTime(new Date("2026-01-01T00:00:00.600Z"));
    useErrorStore.getState().addError({
      type: "network",
      message: "Timeout",
      source: "fetcher",
      retryability: "auto",
    });

    expect(useErrorStore.getState().errors).toHaveLength(2);
  });

  it("enforces max error history", () => {
    for (let index = 0; index < 55; index++) {
      useErrorStore.getState().addError({
        type: "unknown",
        message: `error-${index}`,
        source: "test",
        retryability: "none",
      });
      vi.advanceTimersByTime(600);
    }

    const state = useErrorStore.getState();
    expect(state.errors).toHaveLength(50);
    expect(state.errors.some((entry) => entry.message === "error-0")).toBe(false);
    expect(state.errors.some((entry) => entry.message === "error-54")).toBe(true);
  });

  it("preserves correlationId through addError", () => {
    const id = useErrorStore.getState().addError({
      type: "git",
      message: "push rejected",
      source: "git",
      retryability: "none",
      correlationId: "test-corr-1234",
    });

    const error = useErrorStore.getState().errors.find((e) => e.id === id);
    expect(error?.correlationId).toBe("test-corr-1234");
  });

  it("preserves original correlationId on deduplicated errors", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    useErrorStore.getState().addError({
      type: "git",
      message: "push rejected",
      source: "git",
      retryability: "none",
      correlationId: "original-corr-id",
    });

    vi.setSystemTime(new Date("2026-01-01T00:00:00.200Z"));
    useErrorStore.getState().addError({
      type: "git",
      message: "push rejected",
      source: "git",
      retryability: "none",
      correlationId: "new-corr-id",
    });

    const state = useErrorStore.getState();
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0]?.correlationId).toBe("original-corr-id");
  });

  it("preserves recoveryHint through addError", () => {
    const id = useErrorStore.getState().addError({
      type: "filesystem",
      message: "EACCES: permission denied",
      source: "fs",
      retryability: "none",
      recoveryHint: "Check file permissions or run with elevated privileges.",
    });

    const error = useErrorStore.getState().errors.find((e) => e.id === id);
    expect(error?.recoveryHint).toBe("Check file permissions or run with elevated privileges.");
  });

  it("does not include recoveryHint in dedup comparison", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    useErrorStore.getState().addError({
      type: "network",
      message: "Timeout",
      source: "fetcher",
      retryability: "auto",
      recoveryHint: "Check your network connection and try again.",
    });

    vi.setSystemTime(new Date("2026-01-01T00:00:00.200Z"));
    useErrorStore.getState().addError({
      type: "network",
      message: "Timeout",
      source: "fetcher",
      retryability: "auto",
      recoveryHint: "Different hint text.",
    });

    const state = useErrorStore.getState();
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0]?.recoveryHint).toBe("Check your network connection and try again.");
  });

  describe("retryProgress", () => {
    it("updateRetryProgress sets progress on matching error", () => {
      const id = useErrorStore.getState().addError({
        type: "process",
        message: "spawn failed",
        source: "pty",
        retryability: "auto",
      });

      useErrorStore.getState().updateRetryProgress(id, 2, 3);

      const error = useErrorStore.getState().errors.find((e) => e.id === id);
      expect(error?.retryProgress).toEqual({ attempt: 2, maxAttempts: 3 });
    });

    it("clearRetryProgress removes progress from matching error", () => {
      const id = useErrorStore.getState().addError({
        type: "process",
        message: "spawn failed",
        source: "pty",
        retryability: "auto",
      });

      useErrorStore.getState().updateRetryProgress(id, 1, 3);
      useErrorStore.getState().clearRetryProgress(id);

      const error = useErrorStore.getState().errors.find((e) => e.id === id);
      expect(error?.retryProgress).toBeUndefined();
    });

    it("reset removes all retryProgress", () => {
      const id = useErrorStore.getState().addError({
        type: "process",
        message: "spawn failed",
        source: "pty",
        retryability: "auto",
      });

      useErrorStore.getState().updateRetryProgress(id, 1, 3);
      useErrorStore.getState().reset();

      expect(useErrorStore.getState().errors).toEqual([]);
    });
  });

  it("propagates recoveryAction and gitReason on dedup when classification upgrades", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const firstId = useErrorStore.getState().addError({
      type: "git",
      message: "Push failed",
      source: "git",
      retryability: "auto",
      context: { worktreeId: "w-1" },
    });

    vi.setSystemTime(new Date("2026-01-01T00:00:00.200Z"));
    useErrorStore.getState().addError({
      type: "git",
      message: "Push failed",
      source: "git",
      retryability: "user-gated",
      gitReason: "auth-failed",
      recoveryAction: { label: "Reconnect", actionId: "github.connect" },
      context: { worktreeId: "w-1" },
    });

    const stored = useErrorStore.getState().errors.find((e) => e.id === firstId);
    expect(stored?.retryability).toBe("user-gated");
    expect(stored?.recoveryAction?.actionId).toBe("github.connect");
    expect(stored?.gitReason).toBe("auth-failed");
  });

  it("overwrites retryability on dedup so 'exhausted' transitions are visible", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const firstId = useErrorStore.getState().addError({
      type: "process",
      message: "Process crashed",
      source: "pty",
      retryability: "auto",
      context: { terminalId: "term-1" },
    });

    vi.setSystemTime(new Date("2026-01-01T00:00:00.200Z"));
    useErrorStore.getState().addError({
      type: "process",
      message: "Process crashed",
      source: "pty",
      retryability: "exhausted",
      context: { terminalId: "term-1" },
    });

    const stored = useErrorStore.getState().errors.find((e) => e.id === firstId);
    expect(stored?.retryability).toBe("exhausted");
  });

  it("reset fully clears error panel state", () => {
    useErrorStore.getState().setPanelOpen(true);
    useErrorStore.getState().addError({
      type: "git",
      message: "Bad HEAD",
      source: "git",
      retryability: "none",
    });

    const before = useErrorStore.getState();
    expect(before.errors.length).toBe(1);
    expect(before.lastErrorTime).toBeGreaterThan(0);

    useErrorStore.getState().reset();

    const after = useErrorStore.getState();
    expect(after.errors).toEqual([]);
    expect(after.lastErrorTime).toBe(0);
    expect(after.isPanelOpen).toBe(false);
  });
});
