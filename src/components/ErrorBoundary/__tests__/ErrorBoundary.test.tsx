// @vitest-environment jsdom
import type React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ErrorBoundary, withErrorBoundary } from "../ErrorBoundary";
import { useErrorStore } from "@/store/errorStore";
import { captureRendererException } from "@/utils/rendererSentry";
import { notify } from "@/lib/notify";
import { actionService } from "@/services/ActionService";

vi.mock("@/services/ActionService", () => ({
  actionService: {
    dispatch: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock("@/utils/logger", () => ({
  logError: vi.fn(),
}));

vi.mock("@/utils/rendererSentry", () => ({
  captureRendererException: vi.fn(),
}));

vi.mock("@/lib/notify", () => ({
  notify: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

interface ElectronMock {
  system: { openExternal: ReturnType<typeof vi.fn> };
  clipboard: { writeText: ReturnType<typeof vi.fn> };
}

function installElectronMock(): ElectronMock {
  const mock: ElectronMock = {
    system: { openExternal: vi.fn().mockResolvedValue(undefined) },
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  };
  (window as unknown as { electron: ElectronMock }).electron = mock;
  return mock;
}

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test render error");
  return <div>Child rendered</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", true);
    vi.clearAllMocks();
    useErrorStore.getState().reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Default: Sentry SDK not initialized → null. Individual tests override.
    vi.mocked(captureRendererException).mockReturnValue(null);
    installElectronMock();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    delete (window as unknown as { electron?: unknown }).electron;
  });

  it("renders children when no error", () => {
    render(
      <ErrorBoundary variant="section">
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Child rendered")).toBeTruthy();
  });

  it("renders fallback when child throws", () => {
    render(
      <ErrorBoundary variant="section">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Section stopped working")).toBeTruthy();
  });

  it("still adds the error to the store for cross-referencing", () => {
    render(
      <ErrorBoundary variant="section">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    const errors = useErrorStore.getState().errors;
    expect(errors.length).toBe(1);

    const storeId = errors[0]!.id;
    expect(storeId).toMatch(
      /^error-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("passes incidentId to logError context", async () => {
    const { logError } = await import("@/utils/logger");

    render(
      <ErrorBoundary variant="section">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    const errors = useErrorStore.getState().errors;
    const storeId = errors[0]!.id;

    expect(logError).toHaveBeenCalledWith(
      "React error boundary caught render error",
      expect.any(Error),
      expect.objectContaining({ incidentId: storeId })
    );
  });

  it("resets state when resetError is called and child stops throwing", () => {
    let shouldThrow = true;
    function ConditionalThrow() {
      if (shouldThrow) throw new Error("Test render error");
      return <div>Recovered</div>;
    }

    render(
      <ErrorBoundary variant="section">
        <ConditionalThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText("Section stopped working")).toBeTruthy();

    shouldThrow = false;
    fireEvent.click(screen.getByText("Reload pane"));

    expect(screen.getByText("Recovered")).toBeTruthy();
    expect(screen.queryByText("Section stopped working")).toBeNull();
  });

  it("provides onReport to section variant", () => {
    render(
      <ErrorBoundary variant="section">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Report issue")).toBeTruthy();
  });

  it("provides onReport to fullscreen variant", () => {
    render(
      <ErrorBoundary variant="fullscreen">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Report issue")).toBeTruthy();
  });

  it("does not provide onReport to component variant", () => {
    render(
      <ErrorBoundary variant="component">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.queryByText("Report issue")).toBeNull();
  });

  it("does not show View logs button for component variant", () => {
    render(
      <ErrorBoundary variant="component">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.queryByTestId("error-fallback-logs")).toBeNull();
  });

  it("renders Sentry event ID as Error ID in production mode for section variant", () => {
    vi.stubEnv("DEV", false);
    vi.mocked(captureRendererException).mockReturnValue("sentry-event-deadbeef");

    render(
      <ErrorBoundary variant="section">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Error ID: sentry-event-deadbeef")).toBeTruthy();
    expect(screen.queryByText("Test render error")).toBeNull();
    expect(
      screen.getByText("This pane crashed but the rest of Daintree is still running.")
    ).toBeTruthy();
  });

  it("falls back to store incident ID when Sentry returns null", () => {
    vi.stubEnv("DEV", false);
    vi.mocked(captureRendererException).mockReturnValue(null);

    render(
      <ErrorBoundary variant="section">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    const errors = useErrorStore.getState().errors;
    const storeId = errors[0]!.id;
    expect(screen.getByText(`Error ID: ${storeId}`)).toBeTruthy();
  });

  it("dispatches a full-body deeplink when the report fits the URL budget", async () => {
    render(
      <ErrorBoundary variant="section">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText("Report Issue"));
    // Wait a microtask so the async handler resolves.
    await Promise.resolve();
    await Promise.resolve();

    const electron = (window as unknown as { electron: ElectronMock }).electron;
    expect(electron.clipboard.writeText).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();

    expect(actionService.dispatch).toHaveBeenCalledWith(
      "system.openExternal",
      expect.objectContaining({
        url: expect.stringContaining("github.com/daintreehq/daintree/issues/new"),
      }),
      { source: "user" }
    );
  });

  it("copies full report to clipboard and notifies when payload exceeds URL budget", async () => {
    function ThrowGiantStack(): React.ReactElement {
      const error = new Error("Component blew up");
      // Force the encoded body well past 7000 even after stack truncation.
      error.stack =
        "Error: Component blew up\n" +
        Array.from({ length: 30 }, (_, i) => `    at frame${i} ${"x".repeat(800)}`).join("\n");
      throw error;
    }

    render(
      <ErrorBoundary variant="section">
        <ThrowGiantStack />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText("Report Issue"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const electron = (window as unknown as { electron: ElectronMock }).electron;
    expect(electron.clipboard.writeText).toHaveBeenCalledTimes(1);
    const clipboardArg = electron.clipboard.writeText.mock.calls[0]![0] as string;
    expect(clipboardArg).toContain("**Component:**");
    expect(clipboardArg).toContain("Component blew up");

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        title: "Error details copied",
      })
    );

    expect(actionService.dispatch).toHaveBeenCalledWith(
      "system.openExternal",
      expect.objectContaining({
        url: expect.stringContaining("copied%20to%20your%20clipboard"),
      }),
      { source: "user" }
    );
  });

  it("still opens the stub URL when clipboard write fails", async () => {
    const electron = (window as unknown as { electron: ElectronMock }).electron;
    electron.clipboard.writeText.mockRejectedValue(new Error("clipboard busy"));

    function ThrowGiantStack(): React.ReactElement {
      const error = new Error("Component blew up");
      error.stack =
        "Error: Component blew up\n" +
        Array.from({ length: 30 }, (_, i) => `    at frame${i} ${"x".repeat(800)}`).join("\n");
      throw error;
    }

    render(
      <ErrorBoundary variant="section">
        <ThrowGiantStack />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText("Report Issue"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(electron.clipboard.writeText).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        title: "Error details too long",
      })
    );
    expect(actionService.dispatch).toHaveBeenCalledWith("system.openExternal", expect.any(Object), {
      source: "user",
    });
  });

  it("hides technical details in production mode", () => {
    vi.stubEnv("DEV", false);

    render(
      <ErrorBoundary variant="section">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.queryByText("Technical details")).toBeNull();
  });

  it("calls onError callback when provided", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary variant="section" onError={onError}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({}));
  });

  it("resets error state when numeric resetKeys change", () => {
    let key = 0;
    let shouldThrow = true;

    function ConditionalNumericThrow({ resetKey }: { resetKey: number }) {
      if (shouldThrow) throw new Error(`Test error at key ${resetKey}`);
      return <div>Recovered at key {resetKey}</div>;
    }

    const { rerender } = render(
      <ErrorBoundary variant="component" resetKeys={[key]}>
        <ConditionalNumericThrow resetKey={key} />
      </ErrorBoundary>
    );

    // DEV mode shows the actual error message for component variant
    expect(screen.getByText("Test error at key 0")).toBeTruthy();

    // Same key, still throwing — boundary stays in error state
    rerender(
      <ErrorBoundary variant="component" resetKeys={[key]}>
        <ConditionalNumericThrow resetKey={key} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Test error at key 0")).toBeTruthy();

    // Change key (simulating dialog close → reopen) and stop throwing
    key = 1;
    shouldThrow = false;
    rerender(
      <ErrorBoundary variant="component" resetKeys={[key]}>
        <ConditionalNumericThrow resetKey={key} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Recovered at key 1")).toBeTruthy();
  });

  it("calls onReset callback when reload button is clicked", () => {
    const onReset = vi.fn();
    let shouldThrow = true;
    function ConditionalThrow() {
      if (shouldThrow) throw new Error("Test render error");
      return <div>Recovered</div>;
    }

    render(
      <ErrorBoundary variant="section" onReset={onReset}>
        <ConditionalThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText("Section stopped working")).toBeTruthy();
    expect(onReset).not.toHaveBeenCalled();

    shouldThrow = false;
    fireEvent.click(screen.getByText("Reload pane"));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Recovered")).toBeTruthy();
  });

  it("calls onReset before rendering recovered children", () => {
    const events: string[] = [];
    let shouldThrow = true;

    const onReset = vi.fn(() => {
      shouldThrow = false;
      events.push("onReset");
    });

    function ConditionalThrow() {
      events.push("child-render");
      if (shouldThrow) throw new Error("Test render error");
      return <div>Recovered</div>;
    }

    render(
      <ErrorBoundary variant="section" onReset={onReset}>
        <ConditionalThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText("Section stopped working")).toBeTruthy();

    events.length = 0;
    fireEvent.click(screen.getByText("Reload pane"));

    expect(events).toEqual(["onReset", "child-render"]);
    expect(screen.getByText("Recovered")).toBeTruthy();
  });

  it("logs error when onReset throws but still recovers", async () => {
    const { logError } = await import("@/utils/logger");
    const onReset = vi.fn(() => {
      throw new Error("onReset failed");
    });
    let shouldThrow = true;
    function ConditionalThrow() {
      if (shouldThrow) throw new Error("Test render error");
      return <div>Recovered</div>;
    }

    render(
      <ErrorBoundary variant="section" onReset={onReset}>
        <ConditionalThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText("Section stopped working")).toBeTruthy();

    shouldThrow = false;
    fireEvent.click(screen.getByText("Reload pane"));

    expect(onReset).toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith("Error in onReset handler", expect.any(Error));
    expect(screen.getByText("Recovered")).toBeTruthy();
  });

  it("withErrorBoundary forwards onReset option", () => {
    const onReset = vi.fn();
    let shouldThrow = true;

    function TestComponent() {
      if (shouldThrow) throw new Error("Test error");
      return <div>Test component</div>;
    }

    const WrappedComponent = withErrorBoundary(TestComponent, {
      variant: "component",
      onReset,
    });

    const { rerender } = render(<WrappedComponent />);

    expect(screen.getByText("Test error")).toBeTruthy();

    shouldThrow = false;
    rerender(<WrappedComponent />);

    // Click the "Try again" button from the error fallback (component variant)
    fireEvent.click(screen.getByText("Try again"));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Test component")).toBeTruthy();
  });

  it("onReset is called when resetKeys change", () => {
    const onReset = vi.fn();
    let key = 0;
    let shouldThrow = true;

    function ConditionalNumericThrow({ resetKey }: { resetKey: number }) {
      if (shouldThrow) throw new Error(`Test error at key ${resetKey}`);
      return <div>Recovered at key {resetKey}</div>;
    }

    const { rerender } = render(
      <ErrorBoundary variant="component" resetKeys={[key]} onReset={onReset}>
        <ConditionalNumericThrow resetKey={key} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Test error at key 0")).toBeTruthy();
    expect(onReset).not.toHaveBeenCalled();

    // Change key to trigger reset
    key = 1;
    shouldThrow = false;
    rerender(
      <ErrorBoundary variant="component" resetKeys={[key]} onReset={onReset}>
        <ConditionalNumericThrow resetKey={key} />
      </ErrorBoundary>
    );

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Recovered at key 1")).toBeTruthy();
  });
});
