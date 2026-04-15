// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { AgentSettings, CliAvailability } from "@shared/types";

const dispatchMock = vi.fn();
const setAgentPinnedMock = vi.fn().mockResolvedValue(undefined);

// Mutable mock store state so tests can control what the component reads.
let mockSettings: AgentSettings | null = null;

vi.mock("@/services/ActionService", () => ({
  actionService: { dispatch: (...args: unknown[]) => dispatchMock(...args) },
}));

type MockStoreState = {
  settings: AgentSettings | null;
  setAgentPinned: typeof setAgentPinnedMock;
};

vi.mock("@/store/agentSettingsStore", () => ({
  useAgentSettingsStore: (selector: (s: MockStoreState) => unknown) =>
    selector({ settings: mockSettings, setAgentPinned: setAgentPinnedMock }),
}));

vi.mock("@shared/config/agentIds", () => ({
  BUILT_IN_AGENT_IDS: ["claude", "gemini", "codex"] as const,
}));

vi.mock("@/config/agents", () => ({
  getAgentConfig: (id: string) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    icon: (props: { brandColor?: string }) => (
      <span data-testid={`agent-icon-${id}`} data-brand={props.brandColor} />
    ),
  }),
}));

vi.mock("@/lib/colorUtils", () => ({
  getBrandColorHex: (id: string) => `#brand-${id}`,
}));

// Passthrough UI primitives so dropdown content renders without a portal.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
    ...props
  }: {
    children: React.ReactNode;
    onSelect?: (e: Event) => void;
  } & React.HTMLAttributes<HTMLDivElement>) => (
    <div role="menuitem" onClick={(e) => onSelect?.(e as unknown as Event)} {...props}>
      {children}
    </div>
  ),
  DropdownMenuCheckboxItem: ({
    children,
    checked,
    onCheckedChange,
  }: {
    children: React.ReactNode;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    onSelect?: (e: Event) => void;
  }) => (
    <div role="menuitemcheckbox" aria-checked={checked} onClick={() => onCheckedChange?.(!checked)}>
      {children}
    </div>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="menu-label">{children}</div>
  ),
  DropdownMenuSeparator: () => <hr data-testid="menu-separator" />,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: { children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("lucide-react", () => ({
  Plug: () => <span data-testid="plug-icon" />,
}));

import { AgentTrayButton } from "../AgentTrayButton";

function settingsWith(overrides: Record<string, { pinned: boolean }>): AgentSettings {
  return { agents: overrides } as unknown as AgentSettings;
}

describe("AgentTrayButton", () => {
  beforeEach(() => {
    dispatchMock.mockClear();
    setAgentPinnedMock.mockClear();
    mockSettings = null;
  });

  it("renders the plug trigger with accessible label", () => {
    const { getByLabelText, getByTestId } = render(<AgentTrayButton />);
    expect(getByLabelText("Agent tray")).toBeTruthy();
    expect(getByTestId("plug-icon")).toBeTruthy();
  });

  it("only shows ready (not merely installed) agents in the Launch section", () => {
    const availability = {
      claude: "ready",
      gemini: "installed",
      codex: "ready",
    } as unknown as CliAvailability;
    mockSettings = settingsWith({
      claude: { pinned: true },
      gemini: { pinned: false },
      codex: { pinned: false },
    });

    const { getAllByTestId, getAllByRole } = render(
      <AgentTrayButton agentAvailability={availability} />
    );

    const labels = getAllByTestId("menu-label").map((el) => el.textContent);
    expect(labels).toContain("Launch");
    expect(labels).toContain("Needs Setup");

    const launchItems = getAllByRole("menuitem")
      .map((el) => el.textContent)
      .filter((t) => !t?.includes("Set up"));
    // Only Codex (ready + unpinned). Gemini is "installed" → Needs Setup.
    expect(launchItems).toEqual(["Codex"]);
  });

  it("dispatches agent.launch when a Launch item is clicked", () => {
    const availability = { gemini: "ready" } as unknown as CliAvailability;
    mockSettings = settingsWith({ gemini: { pinned: false } });

    const { getAllByRole } = render(<AgentTrayButton agentAvailability={availability} />);

    const geminiItem = getAllByRole("menuitem").find((el) => el.textContent === "Gemini");
    expect(geminiItem).toBeTruthy();
    fireEvent.click(geminiItem!);

    expect(dispatchMock).toHaveBeenCalledWith(
      "agent.launch",
      { agentId: "gemini" },
      { source: "user" }
    );
  });

  it("renders pin checkboxes for all READY agents with correct checked state", () => {
    const availability = {
      claude: "ready",
      gemini: "ready",
      codex: "missing",
    } as unknown as CliAvailability;
    mockSettings = settingsWith({
      claude: { pinned: true },
      gemini: { pinned: false },
    });

    const { getAllByRole } = render(<AgentTrayButton agentAvailability={availability} />);

    const checkboxes = getAllByRole("menuitemcheckbox");
    const byName = Object.fromEntries(
      checkboxes.map((el) => [el.textContent, el.getAttribute("aria-checked")])
    );
    expect(byName["Claude"]).toBe("true");
    expect(byName["Gemini"]).toBe("false");
    // Codex is missing → NOT in the pin section.
    expect(byName["Codex"]).toBeUndefined();
  });

  it("does NOT list an 'installed' (unauthenticated) agent in the Pin section", () => {
    const availability = {
      claude: "installed",
    } as unknown as CliAvailability;
    mockSettings = settingsWith({ claude: { pinned: true } });

    const { queryAllByRole, getAllByTestId } = render(
      <AgentTrayButton agentAvailability={availability} />
    );

    expect(queryAllByRole("menuitemcheckbox")).toHaveLength(0);
    const labels = getAllByTestId("menu-label").map((el) => el.textContent);
    expect(labels).toContain("Needs Setup");
    expect(labels).not.toContain("Pin to Toolbar");
  });

  it("calls setAgentPinned with the toggled value when checkbox is clicked", () => {
    const availability = { claude: "ready" } as unknown as CliAvailability;
    mockSettings = settingsWith({ claude: { pinned: true } });

    const { getAllByRole } = render(<AgentTrayButton agentAvailability={availability} />);

    const claudeBox = getAllByRole("menuitemcheckbox").find((el) => el.textContent === "Claude");
    fireEvent.click(claudeBox!);
    expect(setAgentPinnedMock).toHaveBeenCalledWith("claude", false);
  });

  it("lists missing agents in Needs Setup and dispatches the correct subtab on click", () => {
    const availability = {
      claude: "ready",
      gemini: "missing",
      codex: "missing",
    } as unknown as CliAvailability;
    mockSettings = settingsWith({ claude: { pinned: true } });

    const { getAllByRole, getAllByTestId } = render(
      <AgentTrayButton agentAvailability={availability} />
    );

    const labels = getAllByTestId("menu-label").map((el) => el.textContent);
    expect(labels).toContain("Needs Setup");

    const setupItems = getAllByRole("menuitem").filter((el) => el.textContent?.includes("Set up"));
    expect(setupItems.length).toBe(2);

    const geminiSetup = setupItems.find((el) => el.textContent?.includes("Gemini"));
    expect(geminiSetup).toBeTruthy();
    fireEvent.click(geminiSetup!);
    expect(dispatchMock).toHaveBeenCalledWith(
      "app.settings.openTab",
      { tab: "agents", subtab: "gemini" },
      { source: "user" }
    );
  });

  it("shows a loading placeholder while agentAvailability is undefined", () => {
    mockSettings = settingsWith({ claude: { pinned: true } });
    const { getByText, queryAllByTestId } = render(<AgentTrayButton />);
    expect(getByText("Checking agents…")).toBeTruthy();
    const labels = queryAllByTestId("menu-label").map((el) => el.textContent);
    expect(labels).not.toContain("Needs Setup");
    expect(labels).not.toContain("Launch");
  });

  it("shows 'No agents available' when availability has resolved with no entries", () => {
    const { getByText } = render(
      <AgentTrayButton agentAvailability={{} as unknown as CliAvailability} />
    );
    expect(getByText("No agents available")).toBeTruthy();
  });

  it("handles null store settings gracefully (agents default to pinned)", () => {
    mockSettings = null;
    const availability = {
      claude: "ready",
      gemini: "ready",
    } as unknown as CliAvailability;

    const { getAllByRole, queryAllByTestId } = render(
      <AgentTrayButton agentAvailability={availability} />
    );

    const labels = queryAllByTestId("menu-label").map((el) => el.textContent);
    // With null settings, every entry's pinned reads as undefined, which the
    // tray treats as pinned — so ready agents only appear in "Pin to Toolbar"
    // and never in the launch list.
    expect(labels).not.toContain("Launch");
    expect(labels).toContain("Pin to Toolbar");

    const boxes = getAllByRole("menuitemcheckbox");
    for (const box of boxes) {
      expect(box.getAttribute("aria-checked")).toBe("true");
    }
  });
});
