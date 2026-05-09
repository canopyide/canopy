// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));
vi.mock("@/utils/logger", () => ({
  logError: vi.fn(),
  logDebug: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

// The icons barrel is imported transitively by ConfirmDialog → AppDialog →
// @/hooks → terminalRunIconRegistry, which references many brand icon names.
// Stub every named export so the test file doesn't need to enumerate them.
vi.mock("@/components/icons", () => {
  const stub = () => null;
  return {
    DaintreeIcon: ({ className }: { className?: string }) => (
      <span data-testid="daintree-icon" className={className} />
    ),
    McpServerIcon: ({ className }: { className?: string }) => (
      <span data-testid="mcp-icon" className={className} />
    ),
    SpinnerCircle: stub,
    HollowCircle: stub,
    InteractingCircle: stub,
    ExitedCircle: stub,
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

interface SettingsSelectStubOption {
  value: string;
  label: string;
}

vi.mock("../SettingsSelect", () => ({
  SettingsSelect: ({
    label,
    value,
    onValueChange,
    options,
  }: {
    label: string;
    value: string;
    onValueChange: (v: string) => void;
    options: SettingsSelectStubOption[];
  }) => (
    <label>
      {label}
      <select aria-label={label} value={value} onChange={(e) => onValueChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));

vi.mock("../SettingsInput", () => ({
  SettingsInput: ({
    label,
    value,
    onChange,
    placeholder,
    disabled,
  }: {
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
      />
    </label>
  ),
}));

const helpPanelState = {
  preferredAgentId: null as string | null,
  setPreferredAgent: vi.fn(),
};

vi.mock("@/store/helpPanelStore", () => {
  const store = (selector?: (s: typeof helpPanelState) => unknown) =>
    selector ? selector(helpPanelState) : helpPanelState;
  store.getState = () => helpPanelState;
  return {
    useHelpPanelStore: store,
    HELP_PANEL_MIN_WIDTH: 320,
    HELP_PANEL_MAX_WIDTH: 800,
    HELP_PANEL_DEFAULT_WIDTH: 380,
  };
});

const { mockGetAssistantSupportedAgentIds } = vi.hoisted(() => ({
  mockGetAssistantSupportedAgentIds: vi.fn<() => string[]>(() => ["claude"]),
}));

vi.mock("@/config/agents", () => ({
  getAgentIds: () => ["claude", "codex"],
  getAssistantSupportedAgentIds: () => mockGetAssistantSupportedAgentIds(),
  getAgentConfig: (id: string) => {
    if (id === "claude") return { name: "Claude Code" };
    if (id === "codex") return { name: "Codex" };
    return undefined;
  },
}));

import { DaintreeAssistantSettingsTab } from "../DaintreeAssistantSettingsTab";
import { SettingsValidationProvider } from "../SettingsValidationRegistry";

const writeText = vi.fn().mockResolvedValue(undefined);

interface HelpAssistantApi {
  getSettings: ReturnType<typeof vi.fn>;
  setSettings: ReturnType<typeof vi.fn>;
}

interface McpServerApi {
  getStatus: ReturnType<typeof vi.fn>;
  setEnabled: ReturnType<typeof vi.fn>;
  rotateApiKey: ReturnType<typeof vi.fn>;
  getConfigSnippet: ReturnType<typeof vi.fn>;
  onRuntimeStateChanged: ReturnType<typeof vi.fn>;
  getAuditConfig: ReturnType<typeof vi.fn>;
  getAuditRecords: ReturnType<typeof vi.fn>;
  getMetrics: ReturnType<typeof vi.fn>;
  clearAuditLog: ReturnType<typeof vi.fn>;
}

function installApi(
  helpAssistant: Partial<HelpAssistantApi> = {},
  mcpServer: Partial<McpServerApi> = {}
) {
  const helpDefaults: HelpAssistantApi = {
    getSettings: vi.fn().mockResolvedValue({
      docSearch: true,
      daintreeControl: true,
      skipPermissions: false,
      auditRetention: 7,
      customArgs: "",
    }),
    setSettings: vi.fn().mockResolvedValue(undefined),
  };
  const mcpDefaults: McpServerApi = {
    getStatus: vi.fn().mockResolvedValue({
      enabled: true,
      port: 45454,
      configuredPort: 45454,
      apiKey: "dnt-key-abc",
    }),
    setEnabled: vi.fn().mockResolvedValue({
      enabled: true,
      port: 45454,
      configuredPort: 45454,
      apiKey: "dnt-key-abc",
    }),
    rotateApiKey: vi.fn().mockResolvedValue("dnt-key-new"),
    getConfigSnippet: vi.fn().mockResolvedValue('{ "url": "http://127.0.0.1:45454/sse" }'),
    onRuntimeStateChanged: vi.fn(() => () => {}),
    getAuditConfig: vi.fn().mockResolvedValue({ enabled: true, maxRecords: 500 }),
    getAuditRecords: vi.fn().mockResolvedValue([]),
    getMetrics: vi.fn().mockResolvedValue({ unauthorizedCount: 0 }),
    clearAuditLog: vi.fn().mockResolvedValue(undefined),
  };
  window.electron = {
    helpAssistant: { ...helpDefaults, ...helpAssistant },
    mcpServer: { ...mcpDefaults, ...mcpServer },
  } as unknown as typeof window.electron;
}

describe("DaintreeAssistantSettingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    helpPanelState.preferredAgentId = null;
    helpPanelState.setPreferredAgent = vi.fn();
    mockGetAssistantSupportedAgentIds.mockReturnValue(["claude"]);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });
    installApi();
  });

  const waitForContent = (container: HTMLElement, text: string) =>
    waitFor(
      () => {
        expect(container.textContent).toContain(text);
      },
      { timeout: 5000 }
    );

  it("loads settings and MCP status on mount", async () => {
    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Search documentation");

    expect(window.electron.helpAssistant.getSettings).toHaveBeenCalledTimes(1);
    expect(window.electron.mcpServer.getStatus).toHaveBeenCalledTimes(1);
  });

  it("toggling doc search persists docSearch=false", async () => {
    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Search documentation");

    const toggle = screen.getByLabelText("Allow the assistant to search Daintree documentation");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(window.electron.helpAssistant.setSettings).toHaveBeenCalledWith({ docSearch: false });
    });
  });

  it("turning on skip permissions reveals the inline warning copy", async () => {
    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Skip permission prompts");

    expect(container.textContent).not.toContain("becomes the only safeguard");

    const toggle = screen.getByLabelText("Skip permission prompts during help sessions");
    fireEvent.click(toggle);

    await waitForContent(container, "becomes the only safeguard");
    expect(window.electron.helpAssistant.setSettings).toHaveBeenCalledWith({
      skipPermissions: true,
    });
  });

  it("rotate key opens confirm dialog; confirming calls mcpServer.rotateApiKey", async () => {
    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Rotate MCP key");

    fireEvent.click(screen.getByRole("button", { name: /rotate mcp key/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /rotate api key\?/i })).toBeTruthy();
    });
    expect(window.electron.mcpServer.rotateApiKey).not.toHaveBeenCalled();

    const confirmButton = screen.getByRole("button", {
      name: /^rotate key$/i,
    }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    const typedInput = screen.getByLabelText(/^Type .* to confirm$/i) as HTMLInputElement;
    fireEvent.change(typedInput, { target: { value: "y-abc" } });
    expect(confirmButton.disabled).toBe(true);

    fireEvent.change(typedInput, { target: { value: "-abc" } });
    expect(confirmButton.disabled).toBe(false);

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(window.electron.mcpServer.rotateApiKey).toHaveBeenCalledTimes(1);
    });
  });

  it("disables the Rotate MCP key button when the API key has not loaded yet", async () => {
    installApi(
      {},
      {
        getStatus: vi.fn().mockResolvedValue({
          enabled: true,
          port: 45454,
          configuredPort: 45454,
          apiKey: "",
        }),
      }
    );

    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Rotate MCP key");

    const button = screen.getByRole("button", { name: /rotate mcp key/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    expect(screen.queryByRole("heading", { name: /rotate api key\?/i })).toBeNull();
  });

  it("does not expose the full API key in the rotate dialog body", async () => {
    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Rotate MCP key");

    fireEvent.click(screen.getByRole("button", { name: /rotate mcp key/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /rotate api key\?/i })).toBeTruthy();
    });

    const dialogText = document.body.textContent ?? "";
    expect(dialogText).not.toContain("dnt-key-abc");
    expect(dialogText).toContain("-abc");
  });

  it("rotate key dialog can be canceled without rotating", async () => {
    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Rotate MCP key");

    fireEvent.click(screen.getByRole("button", { name: /rotate mcp key/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /rotate api key\?/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /rotate api key\?/i })).toBeNull();
    });
    expect(window.electron.mcpServer.rotateApiKey).not.toHaveBeenCalled();
  });

  it("copy MCP config writes the snippet to the clipboard and shows confirmation", async () => {
    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Copy MCP config");

    fireEvent.click(screen.getByRole("button", { name: /copy mcp config/i }));

    await waitFor(() => {
      expect(window.electron.mcpServer.getConfigSnippet).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith('{ "url": "http://127.0.0.1:45454/sse" }');
    });
    await waitForContent(container, "Copied");
  });

  it("hides connection details and shows guidance when MCP is disabled", async () => {
    installApi(
      {},
      {
        getStatus: vi.fn().mockResolvedValue({
          enabled: false,
          port: null,
          configuredPort: null,
          apiKey: "",
        }),
      }
    );

    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "MCP server is off");

    expect(screen.queryByRole("button", { name: /rotate mcp key/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /copy mcp config/i })).toBeNull();
  });

  it("lists Codex in the agent dropdown when it passes the assistant gate", async () => {
    mockGetAssistantSupportedAgentIds.mockReturnValue(["claude", "codex"]);

    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Search documentation");

    const select = container.querySelector("select[aria-label='Agent']");
    expect(select).toBeInstanceOf(HTMLSelectElement);
    if (!(select instanceof HTMLSelectElement)) throw new Error("select not found");
    const labels = Array.from(select.options).map((o) => o.textContent ?? "");
    expect(labels).toContain("Claude Code");
    expect(labels).toContain("Codex");
  });

  it("hides Codex from the dropdown when only Claude passes the assistant gate", async () => {
    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Search documentation");

    const select = container.querySelector("select[aria-label='Agent']");
    expect(select).toBeInstanceOf(HTMLSelectElement);
    if (!(select instanceof HTMLSelectElement)) throw new Error("select not found");
    const labels = Array.from(select.options).map((o) => o.textContent ?? "");
    expect(labels).toContain("Claude Code");
    expect(labels).not.toContain("Codex");
  });

  it("does not render a Preferred model section", async () => {
    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Search documentation");

    expect(container.textContent).not.toContain("Preferred model");
    expect(screen.queryByLabelText("Model")).toBeNull();
  });

  it("keeps settings visible when MCP status load fails", async () => {
    installApi(
      {
        getSettings: vi.fn().mockResolvedValue({
          docSearch: false,
          daintreeControl: true,
          skipPermissions: false,
          auditRetention: 7,
        }),
      },
      { getStatus: vi.fn().mockRejectedValue(new Error("ipc down")) }
    );

    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Search documentation");

    const docSearchToggle = screen.getByLabelText(
      "Allow the assistant to search Daintree documentation"
    );
    expect(docSearchToggle.getAttribute("data-state")).toBe("unchecked");
    expect(container.textContent).toContain("Couldn't load MCP status");
  });

  it("surfaces a setSettings IPC failure as an inline error banner", async () => {
    installApi({
      setSettings: vi.fn().mockRejectedValue(new Error("disk full")),
    });

    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Search documentation");

    fireEvent.click(screen.getByLabelText("Allow the assistant to search Daintree documentation"));

    await waitForContent(container, "disk full");
  });

  it("does not flash 'Copied' when clipboard.writeText rejects", async () => {
    writeText.mockRejectedValueOnce(new Error("permission denied"));

    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Copy MCP config");

    fireEvent.click(screen.getByRole("button", { name: /copy mcp config/i }));

    await waitFor(() => {
      expect(window.electron.mcpServer.getConfigSnippet).toHaveBeenCalled();
    });
    expect(container.textContent).not.toContain("Copied");
  });

  it("does not call setEnabled when toggling Daintree control off", async () => {
    const setEnabled = vi.fn();
    installApi({}, { setEnabled });

    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Daintree control");

    fireEvent.click(screen.getByLabelText("Allow the assistant to call Daintree control tools"));

    await waitFor(() => {
      expect(window.electron.helpAssistant.setSettings).toHaveBeenCalledWith({
        daintreeControl: false,
      });
    });
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it("audit retention select offers off / 7 / 30 day options and persists changes", async () => {
    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Audit log retention");

    const select = screen.getByLabelText("Audit log retention") as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.label);
    expect(optionLabels).toEqual(["7 days (default)", "30 days", "Off"]);

    fireEvent.change(select, { target: { value: "30" } });

    await waitFor(() => {
      expect(window.electron.helpAssistant.setSettings).toHaveBeenCalledWith({
        auditRetention: 30,
      });
    });
  });

  it("renders an agent dropdown listing assistant-supported agents", async () => {
    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Agent");

    const select = screen.getByRole("combobox", { name: "Agent" }) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.label);
    expect(labels).toContain("Claude Code");
  });

  it("calls helpPanelStore.setPreferredAgent when the agent dropdown changes", async () => {
    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Agent");

    const select = screen.getByRole("combobox", { name: "Agent" }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "claude" } });

    expect(helpPanelState.setPreferredAgent).toHaveBeenCalledWith("claude");
  });

  it("loads customArgs from the IPC settings into the input", async () => {
    installApi({
      getSettings: vi.fn().mockResolvedValue({
        docSearch: true,
        daintreeControl: true,
        skipPermissions: false,
        auditRetention: 7,
        customArgs: "--model sonnet",
      }),
    });

    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Custom CLI args");

    const input = screen.getByLabelText("Custom CLI args") as HTMLInputElement;
    expect(input.value).toBe("--model sonnet");
  });

  it("persists customArgs via setSettings on input change", async () => {
    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Custom CLI args");

    const input = screen.getByLabelText("Custom CLI args") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "--model sonnet" } });

    await waitFor(() => {
      expect(window.electron.helpAssistant.setSettings).toHaveBeenCalledWith({
        customArgs: "--model sonnet",
      });
    });
  });

  it("persists an empty customArgs string when the user clears the input", async () => {
    installApi({
      getSettings: vi.fn().mockResolvedValue({
        docSearch: true,
        daintreeControl: true,
        skipPermissions: false,
        auditRetention: 7,
        customArgs: "--model sonnet",
      }),
    });

    const { container } = render(
      <SettingsValidationProvider>
        <DaintreeAssistantSettingsTab />
      </SettingsValidationProvider>
    );
    await waitForContent(container, "Custom CLI args");

    const input = screen.getByLabelText("Custom CLI args") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });

    await waitFor(() => {
      expect(window.electron.helpAssistant.setSettings).toHaveBeenCalledWith({
        customArgs: "",
      });
    });
  });

  describe("activity log", () => {
    let recordCounter = 0;
    function makeRecord(overrides: Partial<import("@shared/types").McpAuditRecord> = {}) {
      recordCounter += 1;
      return {
        id: overrides.id ?? `record-${recordCounter}`,
        timestamp: Date.now() - 1000,
        toolId: "panel.focus",
        sessionId: "sess-1",
        tier: "workbench",
        argsSummary: '{"panelId":"abc"}',
        result: "success" as const,
        durationMs: 12,
        ...overrides,
      };
    }

    it("renders the empty state when audit logging is off", async () => {
      installApi(
        {},
        {
          getAuditConfig: vi.fn().mockResolvedValue({ enabled: false, maxRecords: 500 }),
        }
      );

      const { container } = render(
        <SettingsValidationProvider>
          <DaintreeAssistantSettingsTab />
        </SettingsValidationProvider>
      );

      await waitForContent(container, "Activity log");
      expect(container.textContent).toContain("Audit log is off");
      expect(container.textContent).toContain("Turn it on in the MCP Server tab");
    });

    it("renders the empty state when audit is enabled but no records", async () => {
      const { container } = render(
        <SettingsValidationProvider>
          <DaintreeAssistantSettingsTab />
        </SettingsValidationProvider>
      );

      await waitForContent(container, "Activity log");
      expect(container.textContent).toContain("No help-session calls recorded yet");
    });

    it("filters out records with tier='external' from the help-session view", async () => {
      const records = [
        makeRecord({ id: "ext-1", toolId: "external.only.tool", tier: "external" }),
        makeRecord({ id: "wb-1", toolId: "workbench.tool", tier: "workbench" }),
      ];
      installApi(
        {},
        {
          getAuditRecords: vi.fn().mockResolvedValue(records),
        }
      );

      const { container } = render(
        <SettingsValidationProvider>
          <DaintreeAssistantSettingsTab />
        </SettingsValidationProvider>
      );

      await waitForContent(container, "workbench.tool");
      expect(container.textContent).not.toContain("external.only.tool");
    });

    it("shows the unauthorized response counter from getMetrics", async () => {
      installApi(
        {},
        {
          getAuditRecords: vi
            .fn()
            .mockResolvedValue([makeRecord({ id: "wb-1", toolId: "panel.focus" })]),
          getMetrics: vi.fn().mockResolvedValue({ unauthorizedCount: 7 }),
        }
      );

      const { container } = render(
        <SettingsValidationProvider>
          <DaintreeAssistantSettingsTab />
        </SettingsValidationProvider>
      );

      await waitForContent(container, "Unauthorized responses");
      expect(container.textContent).toContain("7");
    });

    it("shows the unauthorized counter even when no help-session records exist", async () => {
      installApi(
        {},
        {
          getAuditRecords: vi.fn().mockResolvedValue([]),
          getMetrics: vi.fn().mockResolvedValue({ unauthorizedCount: 12 }),
        }
      );

      const { container } = render(
        <SettingsValidationProvider>
          <DaintreeAssistantSettingsTab />
        </SettingsValidationProvider>
      );

      await waitForContent(container, "Unauthorized responses");
      expect(container.textContent).toContain("12");
      expect(container.textContent).toContain("No help-session calls recorded yet");
    });

    it("renders the recent tier rejections sub-list", async () => {
      installApi(
        {},
        {
          getAuditRecords: vi.fn().mockResolvedValue([
            makeRecord({
              id: "rej-1",
              toolId: "system.restart",
              result: "unauthorized",
              errorCode: "TIER_NOT_PERMITTED",
            }),
            makeRecord({ id: "ok-1", toolId: "panel.focus" }),
          ]),
        }
      );

      const { container } = render(
        <SettingsValidationProvider>
          <DaintreeAssistantSettingsTab />
        </SettingsValidationProvider>
      );

      await waitForContent(container, "Recent tier rejections");
      expect(container.textContent).toContain("system.restart");
    });

    it("renders the per-tool latency table when records exist", async () => {
      installApi(
        {},
        {
          getAuditRecords: vi
            .fn()
            .mockResolvedValue([
              makeRecord({ id: "a", toolId: "panel.focus", durationMs: 10 }),
              makeRecord({ id: "b", toolId: "panel.focus", durationMs: 20 }),
              makeRecord({ id: "c", toolId: "panel.focus", durationMs: 30 }),
            ]),
        }
      );

      const { container } = render(
        <SettingsValidationProvider>
          <DaintreeAssistantSettingsTab />
        </SettingsValidationProvider>
      );

      await waitForContent(container, "Tool latency");
      expect(container.textContent).toContain("panel.focus");
      // Header columns
      expect(container.textContent).toContain("p50");
      expect(container.textContent).toContain("p95");
    });

    it("clear log opens confirm dialog and calls clearAuditLog on confirm", async () => {
      const clearAuditLog = vi.fn().mockResolvedValue(undefined);
      installApi(
        {},
        {
          getAuditRecords: vi
            .fn()
            .mockResolvedValue([makeRecord({ id: "wb-1", toolId: "panel.focus" })]),
          clearAuditLog,
        }
      );

      const { container } = render(
        <SettingsValidationProvider>
          <DaintreeAssistantSettingsTab />
        </SettingsValidationProvider>
      );
      await waitForContent(container, "panel.focus");

      const clearButton = screen.getByRole("button", { name: /^clear log$/i });
      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /clear activity log\?/i })).toBeTruthy();
      });
      expect(clearAuditLog).not.toHaveBeenCalled();

      const confirmButtons = screen.getAllByRole("button", { name: /^clear log$/i });
      // The dialog confirm button is the second match (the inline button stays mounted).
      const confirmButton = confirmButtons[confirmButtons.length - 1];
      expect(confirmButton).toBeDefined();
      fireEvent.click(confirmButton!);

      await waitFor(() => {
        expect(clearAuditLog).toHaveBeenCalledTimes(1);
      });
    });

    it("does not crash if getMetrics rejects — records still render", async () => {
      installApi(
        {},
        {
          getAuditRecords: vi
            .fn()
            .mockResolvedValue([makeRecord({ id: "wb-1", toolId: "panel.focus" })]),
          getMetrics: vi.fn().mockRejectedValue(new Error("ipc down")),
        }
      );

      const { container } = render(
        <SettingsValidationProvider>
          <DaintreeAssistantSettingsTab />
        </SettingsValidationProvider>
      );
      await waitForContent(container, "Activity log");

      // Audit fetch is bundled — when one promise rejects, the whole audit
      // load is treated as failed. The fallback copy renders instead of the
      // log list, but the rest of the tab is still present.
      expect(container.textContent).toContain("Couldn't load activity log");
      expect(container.textContent).toContain("Search documentation");
    });
  });
});
