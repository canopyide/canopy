// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { McpServerSettingsTab } from "../McpServerSettingsTab";
import { notify } from "@/lib/notify";
import { logError } from "@/utils/logger";

vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));
vi.mock("@/utils/logger", () => ({
  logError: vi.fn(),
  logDebug: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));
vi.mock("@/components/icons", () => ({
  McpServerIcon: () => null,
}));

const mockedNotify = vi.mocked(notify);
const mockedLogError = vi.mocked(logError);

function createMcpApi(overrides: Partial<typeof window.electron.mcpServer> = {}) {
  return {
    getStatus: vi.fn().mockResolvedValue({
      enabled: true,
      port: 9020,
      configuredPort: 9020,
      apiKey: "dnt-key-abc123",
    }),
    setEnabled: vi.fn(),
    setPort: vi.fn(),
    getConfigSnippet: vi.fn().mockResolvedValue("http://127.0.0.1:9020/sse"),
    rotateApiKey: vi.fn().mockResolvedValue("dnt-key-rotated789"),
    getAuditRecords: vi.fn().mockResolvedValue([]),
    getAuditConfig: vi.fn().mockResolvedValue({ enabled: true, maxRecords: 500 }),
    clearAuditLog: vi.fn().mockResolvedValue(undefined),
    setAuditEnabled: vi.fn().mockResolvedValue({ enabled: true, maxRecords: 500 }),
    setAuditMaxRecords: vi.fn().mockResolvedValue({ enabled: true, maxRecords: 500 }),
    ...overrides,
  };
}

const writeText = vi.fn().mockResolvedValue(undefined);

function installMcpApi(overrides: Partial<typeof window.electron.mcpServer> = {}) {
  window.electron = {
    mcpServer: createMcpApi(overrides),
  } as unknown as typeof window.electron;
}

describe("McpServerSettingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });
    installMcpApi();
  });

  const waitForContent = (container: HTMLElement, text: string) =>
    waitFor(
      () => {
        expect(container.textContent).toContain(text);
      },
      { timeout: 5000 }
    );

  it("renders API key in a non-input display element", async () => {
    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "API key active");

    const displayArea = container.querySelector(".bg-surface-disabled");
    expect(displayArea).toBeTruthy();
    expect(displayArea?.tagName).toBe("DIV");

    const inputs = container.querySelectorAll("input[readonly]");
    expect(inputs.length).toBe(0);
  });

  it("shows masked bullets by default, reveals key on toggle", async () => {
    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "API key active");

    const displayArea = container.querySelector(".bg-surface-disabled")!;
    expect(displayArea.textContent).not.toContain("dnt-key-abc123");
    expect(displayArea.textContent).toContain("•");

    fireEvent.click(screen.getByLabelText("Show API key"));
    await waitFor(() => {
      expect(displayArea.textContent).toContain("dnt-key-abc123");
    });

    fireEvent.click(screen.getByLabelText("Hide API key"));
    await waitFor(() => {
      expect(displayArea.textContent).not.toContain("dnt-key-abc123");
    });
  });

  it("copy button writes unmasked key to clipboard", async () => {
    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "API key active");

    fireEvent.click(screen.getByLabelText("Copy API key"));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("dnt-key-abc123");
    });
  });

  it("copy button shows Copied! feedback", async () => {
    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "API key active");

    fireEvent.click(screen.getByLabelText("Copy API key"));

    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeTruthy();
    });
    expect(writeText).toHaveBeenCalledWith("dnt-key-abc123");
  });

  it("Rotate calls rotateApiKey and surfaces the new key", async () => {
    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "API key active");

    fireEvent.click(screen.getByTitle("Rotate API key"));
    await waitFor(() => {
      expect(window.electron.mcpServer.rotateApiKey).toHaveBeenCalledTimes(1);
    });

    const displayArea = container.querySelector(".bg-surface-disabled")!;
    await waitFor(() => {
      expect(displayArea.textContent).toContain("dnt-key-rotated789");
    });
  });

  it("does not render a Remove button — the key is mandatory", async () => {
    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "API key active");

    expect(screen.queryByRole("button", { name: /^remove$/i })).toBeNull();
  });

  it("shows inline error and logs IPC failure without notifying", async () => {
    installMcpApi({
      getStatus: vi.fn().mockRejectedValue(new Error("IPC down")),
    });

    const { container } = render(<McpServerSettingsTab />);

    await waitForContent(container, "IPC down");

    expect(mockedNotify).not.toHaveBeenCalled();
    expect(mockedLogError).toHaveBeenCalledWith("Failed to load MCP status", expect.any(Error));
  });

  it("renders empty state with 'Turn on MCP server' CTA when MCP is disabled", async () => {
    installMcpApi({
      getStatus: vi.fn().mockResolvedValue({
        enabled: false,
        port: null,
        configuredPort: null,
        apiKey: "",
      }),
    });

    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "MCP server is off");

    expect(screen.getByRole("button", { name: /turn on mcp server/i })).toBeTruthy();
  });

  it("clicking 'Turn on MCP server' from the empty state calls setEnabled(true)", async () => {
    const setEnabledMock = vi.fn().mockResolvedValue({
      enabled: true,
      port: 9020,
      configuredPort: 9020,
      apiKey: "",
    });
    installMcpApi({
      getStatus: vi.fn().mockResolvedValue({
        enabled: false,
        port: null,
        configuredPort: null,
        apiKey: "",
      }),
      setEnabled: setEnabledMock,
    });

    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "MCP server is off");

    fireEvent.click(screen.getByRole("button", { name: /turn on mcp server/i }));

    await waitFor(() => {
      expect(setEnabledMock).toHaveBeenCalledWith(true);
    });
  });

  it("does not render the empty state while MCP status is still loading", () => {
    installMcpApi({
      // Pending forever so the loading state is the rendered state.
      getStatus: vi.fn().mockReturnValue(new Promise(() => {})),
    });

    render(<McpServerSettingsTab />);
    expect(screen.queryByText("MCP server is off")).toBeNull();
  });

  it("hides the empty state once MCP is enabled", async () => {
    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "API key active");

    expect(screen.queryByText("MCP server is off")).toBeNull();
  });

  it("does not show the empty state when MCP status load fails", async () => {
    installMcpApi({
      getStatus: vi.fn().mockRejectedValue(new Error("IPC down")),
    });

    const { container } = render(<McpServerSettingsTab />);

    await waitForContent(container, "IPC down");

    expect(screen.queryByText("MCP server is off")).toBeNull();
  });

  it("hides the empty state once MCP is enabled via the CTA", async () => {
    const setEnabledMock = vi.fn().mockResolvedValue({
      enabled: true,
      port: 9020,
      configuredPort: 9020,
      apiKey: "",
    });
    installMcpApi({
      getStatus: vi.fn().mockResolvedValue({
        enabled: false,
        port: null,
        configuredPort: null,
        apiKey: "",
      }),
      setEnabled: setEnabledMock,
    });

    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "MCP server is off");

    fireEvent.click(screen.getByRole("button", { name: /turn on mcp server/i }));

    await waitFor(() => {
      expect(screen.queryByText("MCP server is off")).toBeNull();
    });
  });

  it("shows inline error and logs toggle failure without notifying", async () => {
    installMcpApi({
      setEnabled: vi.fn().mockRejectedValue(new Error("toggle failed")),
    });

    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "MCP Server");

    fireEvent.click(screen.getByLabelText("Enable MCP server"));

    await waitForContent(container, "toggle failed");
    expect(mockedNotify).not.toHaveBeenCalled();
    expect(mockedLogError).toHaveBeenCalledWith("Failed to update MCP server", expect.any(Error));
  });

  it("shows inline error for invalid audit max records instead of notifying", async () => {
    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "API key active");

    const maxRecordsInput = container.querySelector("#mcp-audit-max-records") as HTMLInputElement;
    fireEvent.change(maxRecordsInput, { target: { value: "99999" } });
    fireEvent.keyDown(maxRecordsInput, { key: "Enter" });

    await waitForContent(container, "Enter a number between");
    expect(window.electron.mcpServer.setAuditMaxRecords).not.toHaveBeenCalled();
    expect(mockedNotify).not.toHaveBeenCalled();
    expect(mockedLogError).not.toHaveBeenCalled();
  });

  it("shows inline error and logs audit toggle failure without notifying", async () => {
    installMcpApi({
      setAuditEnabled: vi.fn().mockRejectedValue(new Error("audit toggle failed")),
    });

    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "API key active");

    fireEvent.click(screen.getByRole("button", { name: /capture on/i }));

    await waitForContent(container, "audit toggle failed");
    expect(mockedNotify).not.toHaveBeenCalled();
    expect(mockedLogError).toHaveBeenCalledWith(
      "Failed to toggle MCP audit log",
      expect.any(Error)
    );
  });

  it("clears audit log without notifying", async () => {
    installMcpApi({
      getAuditRecords: vi.fn().mockResolvedValue([
        {
          id: "1",
          toolId: "files.read",
          argsSummary: "{}",
          result: "success" as const,
          timestamp: Date.now(),
          durationMs: 42,
        },
      ]),
    });

    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "files.read");

    fireEvent.click(screen.getByRole("button", { name: /clear log/i }));

    await waitForContent(container, "No tool dispatches recorded yet.");
    expect(mockedNotify).not.toHaveBeenCalled();
  });

  it("shows inline error and logs audit clear failure without notifying", async () => {
    installMcpApi({
      getAuditRecords: vi.fn().mockResolvedValue([
        {
          id: "1",
          toolId: "files.read",
          argsSummary: "{}",
          result: "success" as const,
          timestamp: Date.now(),
          durationMs: 42,
        },
      ]),
      clearAuditLog: vi.fn().mockRejectedValue(new Error("clear failed")),
    });

    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "files.read");

    fireEvent.click(screen.getByRole("button", { name: /clear log/i }));

    await waitForContent(container, "clear failed");
    expect(mockedNotify).not.toHaveBeenCalled();
    expect(mockedLogError).toHaveBeenCalledWith("Failed to clear MCP audit log", expect.any(Error));
  });

  it("shows Copied! pill on audit copy instead of notifying", async () => {
    installMcpApi({
      getAuditRecords: vi.fn().mockResolvedValue([
        {
          id: "1",
          toolId: "files.read",
          argsSummary: "{}",
          result: "success" as const,
          timestamp: Date.now(),
          durationMs: 42,
        },
      ]),
    });

    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "files.read");

    fireEvent.click(screen.getByRole("button", { name: /copy all as json/i }));

    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeTruthy();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    const jsonArg = writeText.mock.calls[0][0] as string;
    const parsed = JSON.parse(jsonArg) as Array<{ id: string; toolId: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("1");
    expect(parsed[0].toolId).toBe("files.read");
    expect(mockedNotify).not.toHaveBeenCalled();
  });

  it("shows inline error and logs audit copy failure without notifying", async () => {
    const writeTextReject = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextReject },
      writable: true,
      configurable: true,
    });
    installMcpApi({
      getAuditRecords: vi.fn().mockResolvedValue([
        {
          id: "1",
          toolId: "files.read",
          argsSummary: "{}",
          result: "success" as const,
          timestamp: Date.now(),
          durationMs: 42,
        },
      ]),
    });

    const { container } = render(<McpServerSettingsTab />);
    await waitForContent(container, "files.read");

    fireEvent.click(screen.getByRole("button", { name: /copy all as json/i }));

    await waitForContent(container, "clipboard denied");
    expect(mockedNotify).not.toHaveBeenCalled();
    expect(mockedLogError).toHaveBeenCalledWith("Failed to copy MCP audit log", expect.any(Error));
  });
});
