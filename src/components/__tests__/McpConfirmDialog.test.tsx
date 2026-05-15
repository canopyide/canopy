// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpConfirmDialog } from "../McpConfirmDialog";
import { __resetMcpConfirmStoreForTesting, requestMcpConfirmation } from "@/store/mcpConfirmStore";
import type { ActionDanger } from "@shared/types/actions";

vi.mock("zustand/react/shallow", () => ({
  useShallow: (fn: unknown) => fn,
}));

vi.mock("@/store", () => ({
  usePortalStore: () => ({ isOpen: false, width: 0 }),
}));

vi.mock("@/hooks", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useOverlayState: () => {} };
});

vi.mock("@/hooks/useAnimatedPresence", () => ({
  useAnimatedPresence: ({ isOpen }: { isOpen: boolean }) => ({
    isVisible: isOpen,
    shouldRender: isOpen,
  }),
}));

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

function enqueue(
  overrides: { requestId?: string; actionTitle?: string; danger?: ActionDanger } = {}
) {
  return requestMcpConfirmation({
    requestId: overrides.requestId ?? "req-1",
    actionId: "worktree.delete",
    actionTitle: overrides.actionTitle ?? "Delete worktree",
    actionDescription: "Permanently delete a worktree.",
    argsSummary: '{"worktreeId":"wt-1"}',
    danger: overrides.danger ?? "confirm",
  });
}

describe("McpConfirmDialog", () => {
  beforeEach(() => {
    __resetMcpConfirmStoreForTesting();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  });

  afterEach(() => {
    __resetMcpConfirmStoreForTesting();
    cleanup();
    vi.restoreAllMocks();
  });

  it("labels the confirm button with the action title, not a generic verb", () => {
    void enqueue({ actionTitle: "Delete worktree" });
    render(<McpConfirmDialog />);

    expect(screen.getByRole("button", { name: "Delete worktree" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^run action$/i })).toBeNull();
  });

  it("renders destructive styling only for danger:confirm dispatches", () => {
    void enqueue({ actionTitle: "Delete worktree", danger: "confirm" });
    const { unmount } = render(<McpConfirmDialog />);

    expect(screen.getByRole("button", { name: "Delete worktree" }).className).toContain(
      "bg-destructive"
    );

    unmount();
    __resetMcpConfirmStoreForTesting();

    void enqueue({ actionTitle: "List worktrees", danger: "safe" });
    render(<McpConfirmDialog />);

    expect(screen.getByRole("button", { name: "List worktrees" }).className).not.toContain(
      "bg-destructive"
    );
  });

  it("resolves exactly once on a rapid double-confirm, never approving the queued item", async () => {
    const pA = enqueue({ requestId: "A", actionTitle: "Delete worktree" });
    const pB = enqueue({ requestId: "B", actionTitle: "Push branch" });

    render(<McpConfirmDialog />);

    const confirmBtn = screen.getByRole("button", { name: "Delete worktree" });

    // Two native clicks dispatched within a single batched update — both
    // handlers run against the same render snapshot (item A visible) before
    // React advances the queue, mirroring a real double-click.
    act(() => {
      confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await expect(pA).resolves.toBe("approved");

    const sentinel = Symbol("pending");
    const bOutcome = await Promise.race([
      pB,
      new Promise((resolve) => setTimeout(() => resolve(sentinel), 20)),
    ]);
    expect(bOutcome).toBe(sentinel);
  });
});
