// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { EventsActions } from "../DiagnosticsActions";

const mockDispatch = vi.fn().mockResolvedValue(undefined);

vi.mock("@/services/ActionService", () => ({
  actionService: {
    dispatch: (...args: unknown[]) => mockDispatch(...args),
  },
}));

vi.mock("zustand/react/shallow", () => ({
  useShallow: (fn: unknown) => fn,
}));

vi.mock("@/store", () => ({
  useLogsStore: () => ({ autoScroll: false, setAutoScroll: vi.fn() }),
  useErrorStore: () => ({ errors: [] }),
  usePortalStore: () => ({ isOpen: false, width: 0 }),
}));

vi.mock("@/store/telemetryPreviewStore", () => ({
  useTelemetryPreviewStore: () => ({ active: false, events: [] }),
}));

vi.mock("@/hooks", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useOverlayState: () => {},
  };
});

vi.mock("@/hooks/useAnimatedPresence", () => ({
  useAnimatedPresence: ({ isOpen }: { isOpen: boolean }) => ({
    isVisible: isOpen,
    shouldRender: isOpen,
  }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/icons", () => {
  const stub = () => null;
  return {
    DaintreeIcon: stub,
    NpmIcon: stub,
    YarnIcon: stub,
    PnpmIcon: stub,
    BunIcon: stub,
    PythonIcon: stub,
    ComposerIcon: stub,
    DockerIcon: stub,
    RustIcon: stub,
    GoIcon: stub,
    RubyIcon: stub,
    NodeIcon: stub,
    DenoIcon: stub,
    GradleIcon: stub,
    PhpIcon: stub,
    ViteIcon: stub,
    WebpackIcon: stub,
    KotlinIcon: stub,
    SwiftIcon: stub,
    TerraformIcon: stub,
    ElixirIcon: stub,
  };
});

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

describe("EventsActions — ConfirmDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  });

  it("opens ConfirmDialog when Clear button is clicked", async () => {
    render(<EventsActions />);

    fireEvent.click(screen.getByText("Clear"));

    expect(screen.getByText("Clear events?")).toBeTruthy();
    expect(
      screen.getByText("All captured event records will be permanently deleted.")
    ).toBeTruthy();
    expect(screen.getByText("Clear events")).toBeTruthy();
  });

  it("closes dialog without dispatching when Cancel is clicked", async () => {
    render(<EventsActions />);

    fireEvent.click(screen.getByText("Clear"));

    fireEvent.click(screen.getByText("Cancel"));

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(screen.queryByText("Clear events?")).toBeNull();
  });

  it("dispatches clear action and closes dialog on Confirm", async () => {
    render(<EventsActions />);

    fireEvent.click(screen.getByText("Clear"));

    fireEvent.click(screen.getByText("Clear events"));

    expect(mockDispatch).toHaveBeenCalledWith("eventInspector.clear", undefined, {
      source: "user",
    });
    // After dispatch resolves, dialog should close
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("Clear events?")).toBeNull();
  });

  it("does not show dialog before clicking Clear", () => {
    render(<EventsActions />);

    expect(screen.queryByText("Clear events?")).toBeNull();
  });

  it("does not use window.confirm", () => {
    const confirmSpy = vi.spyOn(window, "confirm");

    render(<EventsActions />);

    fireEvent.click(screen.getByText("Clear"));

    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
