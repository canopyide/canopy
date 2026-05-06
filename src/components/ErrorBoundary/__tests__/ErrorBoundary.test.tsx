// @vitest-environment jsdom
import type { ReactNode } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ErrorBoundary } from "../ErrorBoundary";
import { useErrorStore } from "@/store/errorStore";
import { actionService } from "@/services/ActionService";

vi.mock("@/services/ActionService", () => ({
  actionService: {
    dispatch: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock("@/utils/logger", () => ({
  logError: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/utils/rendererSentry", () => ({
  captureRendererException: vi.fn().mockReturnValue(undefined),
}));

vi.mock("@/lib/notify", () => ({
  notify: vi.fn(),
}));

vi.mock("@/utils/safeFireAndForget", () => ({
  safeFireAndForget: vi.fn(),
}));

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test render error");
  return <div>Child rendered</div>;
}

function makeLargeError(stackBytes: number): Error {
  const err = new Error("Massive crash");
  err.stack = `Error: Massive crash\n${"    at frame (file.ts:1:1)\n".repeat(Math.ceil(stackBytes / 30))}`;
  return err;
}

// Returns `null` so TypeScript treats this as a proper React component
// (ReactNode) rather than inferring `void` from the unconditional throw.
function ThrowingChildWithError({ error }: { error: Error }): ReactNode {
  throw error;
}

type WriteTextMock = ReturnType<typeof makeWriteTextMock>;
function makeWriteTextMock() {
  return vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
}

type OpenExternalMock = ReturnType<typeof makeOpenExternalMock>;
function makeOpenExternalMock() {
  return vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined);
}

interface ElectronMock {
  system?: { openExternal?: OpenExternalMock };
  clipboard?: { writeText?: WriteTextMock };
}

function setElectronMock(mock: ElectronMock): void {
  Object.assign(window, { electron: mock });
}

function clearElectronMock(): void {
  Object.assign(window, { electron: undefined });
}

function lastDispatchedUrl(): string {
  const calls = vi.mocked(actionService.dispatch).mock.calls;
  const last = calls.at(-1);
  if (!last) throw new Error("actionService.dispatch was not called");
  const args = last[1];
  if (!args || typeof (args as { url?: unknown }).url !== "string") {
    throw new Error("actionService.dispatch was called without a string url arg");
  }
  return (args as { url: string }).url;
}

function firstWriteTextPayload(writeText: WriteTextMock): string {
  const arg = writeText.mock.calls[0]?.[0];
  if (typeof arg !== "string") {
    throw new Error("clipboard.writeText was not called with a string");
  }
  return arg;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", true);
    vi.clearAllMocks();
    useErrorStore.getState().reset();
    vi.spyOn(console, "error").mockImplementation(() => {});

    setElectronMock({
      system: { openExternal: makeOpenExternalMock() },
      clipboard: { writeText: makeWriteTextMock() },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    clearElectronMock();
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

  it("captures incidentId from addError and passes to fallback", () => {
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

    expect(screen.getByText("Report Issue")).toBeTruthy();
  });

  it("provides onReport to fullscreen variant", () => {
    render(
      <ErrorBoundary variant="fullscreen">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Report Issue")).toBeTruthy();
  });

  it("does not provide onReport to component variant", () => {
    render(
      <ErrorBoundary variant="component">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.queryByText("Report Issue")).toBeNull();
  });

  it("renders incident ID in production mode for section variant (falls back to store id)", () => {
    vi.stubEnv("DEV", false);

    render(
      <ErrorBoundary variant="section">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    const errors = useErrorStore.getState().errors;
    const storeId = errors[0]!.id;

    expect(screen.getByText(`Error ID: ${storeId}`)).toBeTruthy();
    expect(screen.queryByText("Test render error")).toBeNull();
    expect(
      screen.getByText("This pane crashed but the rest of Daintree is still running.")
    ).toBeTruthy();
  });

  it("displays the Sentry event id when telemetry returns one", async () => {
    vi.stubEnv("DEV", false);
    const { captureRendererException } = await import("@/utils/rendererSentry");
    vi.mocked(captureRendererException).mockReturnValueOnce("sentry-event-abc123");

    render(
      <ErrorBoundary variant="section">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Error ID: sentry-event-abc123")).toBeTruthy();
  });

  it("hides technical details in production mode", () => {
    vi.stubEnv("DEV", false);

    render(
      <ErrorBoundary variant="section">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.queryByText("Technical Details")).toBeNull();
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

    expect(screen.getByText("Test error at key 0")).toBeTruthy();

    rerender(
      <ErrorBoundary variant="component" resetKeys={[key]}>
        <ConditionalNumericThrow resetKey={key} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Test error at key 0")).toBeTruthy();

    key = 1;
    shouldThrow = false;
    rerender(
      <ErrorBoundary variant="component" resetKeys={[key]}>
        <ConditionalNumericThrow resetKey={key} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Recovered at key 1")).toBeTruthy();
  });

  describe("handleReport", () => {
    it("copies the full report to the clipboard before opening the URL", async () => {
      const { safeFireAndForget } = await import("@/utils/safeFireAndForget");
      const writeText = makeWriteTextMock();
      setElectronMock({
        clipboard: { writeText },
        system: { openExternal: makeOpenExternalMock() },
      });

      render(
        <ErrorBoundary variant="section">
          <ThrowingChild shouldThrow={true} />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByText("Report Issue"));

      expect(writeText).toHaveBeenCalledTimes(1);
      const payload = firstWriteTextPayload(writeText);
      expect(payload).toContain("Test render error");
      expect(payload).toContain("Sentry Event ID:");
      expect(payload).toContain("Incident ID:");
      expect(safeFireAndForget).toHaveBeenCalled();
    });

    it("includes both Sentry event id and incident id in the clipboard payload", async () => {
      const { captureRendererException } = await import("@/utils/rendererSentry");
      vi.mocked(captureRendererException).mockReturnValueOnce("sentry-evt-99");

      const writeText = makeWriteTextMock();
      setElectronMock({
        clipboard: { writeText },
        system: { openExternal: makeOpenExternalMock() },
      });

      render(
        <ErrorBoundary variant="section">
          <ThrowingChild shouldThrow={true} />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByText("Report Issue"));

      const errors = useErrorStore.getState().errors;
      const storeId = errors[0]!.id;
      const payload = firstWriteTextPayload(writeText);
      expect(payload).toContain("sentry-evt-99");
      expect(payload).toContain(storeId);
    });

    it("opens a URL within the GitHub URL budget for normal-sized errors", () => {
      render(
        <ErrorBoundary variant="section">
          <ThrowingChild shouldThrow={true} />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByText("Report Issue"));

      expect(actionService.dispatch).toHaveBeenCalledWith(
        "system.openExternal",
        expect.objectContaining({ url: expect.any(String) }),
        { source: "user" }
      );
      const url = lastDispatchedUrl();
      expect(url.length).toBeLessThanOrEqual(7200);
      expect(url).toContain("github.com/daintreehq/daintree/issues/new");
    });

    it("truncates oversized stacks so the URL stays within budget", () => {
      const huge = makeLargeError(20000);

      render(
        <ErrorBoundary variant="section">
          <ThrowingChildWithError error={huge} />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByText("Report Issue"));

      const url = lastDispatchedUrl();
      expect(url.length).toBeLessThanOrEqual(7200);
      const decodedBody = decodeURIComponent(url.split("&body=")[1]!);
      expect(decodedBody).toContain("middle truncated");
    });

    it("falls back to a minimal URL with a clipboard toast when even truncated content overflows", async () => {
      const { notify } = await import("@/lib/notify");

      const oversizedMessage = "x".repeat(8000);
      const huge = new Error(oversizedMessage);
      huge.stack = `Error: ${oversizedMessage}\n${"    at frame (file.ts:1:1)\n".repeat(500)}`;

      render(
        <ErrorBoundary variant="section">
          <ThrowingChildWithError error={huge} />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByText("Report Issue"));

      const url = lastDispatchedUrl();
      const decodedBody = decodeURIComponent(url.split("&body=")[1]!);
      expect(decodedBody).toContain("copied to your clipboard");
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "info",
          title: "Report copied to clipboard",
        })
      );
    });

    it("does not crash when the clipboard binding is unavailable", () => {
      setElectronMock({
        system: { openExternal: makeOpenExternalMock() },
      });

      render(
        <ErrorBoundary variant="section">
          <ThrowingChild shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(() => fireEvent.click(screen.getByText("Report Issue"))).not.toThrow();
    });

    it("keeps the URL within budget even when error.message is huge", () => {
      const longMessage = "x".repeat(8000);
      const huge = new Error(longMessage);
      huge.stack = `Error: ${longMessage}\n    at frame (file.ts:1:1)`;

      render(
        <ErrorBoundary variant="section">
          <ThrowingChildWithError error={huge} />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByText("Report Issue"));

      const url = lastDispatchedUrl();
      expect(url.length).toBeLessThanOrEqual(7200);
    });

    it("preserves the top and bottom stack frames when truncating", () => {
      const top = Array.from({ length: 15 }, (_, i) => `    at TOP_${i} (file.ts:${i}:1)`);
      const middle = Array.from({ length: 200 }, (_, i) => `    at MIDDLE_${i} (file.ts:${i}:1)`);
      const bottom = Array.from({ length: 5 }, (_, i) => `    at BOTTOM_${i} (file.ts:${i}:1)`);
      const huge = new Error("huge");
      huge.stack = ["Error: huge", ...top, ...middle, ...bottom].join("\n");

      const writeText = makeWriteTextMock();
      setElectronMock({
        clipboard: { writeText },
        system: { openExternal: makeOpenExternalMock() },
      });

      render(
        <ErrorBoundary variant="section">
          <ThrowingChildWithError error={huge} />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByText("Report Issue"));

      const clipboardPayload = firstWriteTextPayload(writeText);
      expect(clipboardPayload).toContain("MIDDLE_0");

      const url = lastDispatchedUrl();
      const decodedBody = decodeURIComponent(url.split("&body=")[1]!);
      expect(decodedBody).toContain("TOP_0");
      expect(decodedBody).toContain("BOTTOM_0");
      expect(decodedBody).not.toContain("MIDDLE_30");
    });

    it("survives lone surrogate characters in the error message", () => {
      const huge = new Error("\uD800 invalid surrogate");

      render(
        <ErrorBoundary variant="section">
          <ThrowingChildWithError error={huge} />
        </ErrorBoundary>
      );

      expect(() => fireEvent.click(screen.getByText("Report Issue"))).not.toThrow();
      expect(actionService.dispatch).toHaveBeenCalled();
    });

    it("still opens a URL when clipboard.writeText throws synchronously", () => {
      const writeText = vi.fn<(text: string) => Promise<void>>().mockImplementation(() => {
        throw new Error("sync clipboard failure");
      });
      setElectronMock({
        clipboard: { writeText },
        system: { openExternal: makeOpenExternalMock() },
      });

      render(
        <ErrorBoundary variant="section">
          <ThrowingChild shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(() => fireEvent.click(screen.getByText("Report Issue"))).not.toThrow();
      expect(actionService.dispatch).toHaveBeenCalled();
    });
  });
});
