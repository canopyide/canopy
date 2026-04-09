// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { AgentSettings, CliAvailability } from "@shared/types";

const dispatchMock = vi.fn();
const setAgentSelectedMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/services/ActionService", () => ({
  actionService: { dispatch: (...args: unknown[]) => dispatchMock(...args) },
}));

vi.mock("@/store/agentSettingsStore", () => ({
  useAgentSettingsStore: (
    selector: (s: { setAgentSelected: typeof setAgentSelectedMock }) => unknown
  ) => selector({ setAgentSelected: setAgentSelectedMock }),
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

// Passthrough UI primitives so dropdown content renders in the tree without a portal.
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
  Puzzle: () => <span data-testid="puzzle-icon" />,
}));

import { AgentTrayButton } from "../AgentTrayButton";

function settingsWith(overrides: Record<string, { selected: boolean }>): AgentSettings {
  return { agents: overrides } as unknown as AgentSettings;
}

describe("AgentTrayButton", () => {
  beforeEach(() => {
    dispatchMock.mockClear();
    setAgentSelectedMock.mockClear();
  });

  it("renders the puzzle trigger with accessible label", () => {
    const { getByLabelText, getByTestId } = render(<AgentTrayButton />);
    expect(getByLabelText("Agent tray")).toBeTruthy();
    expect(getByTestId("puzzle-icon")).toBeTruthy();
  });

  it("shows installed-but-unpinned agents in the Launch section", () => {
    const availability: CliAvailability = {
      claude: "ready",
      gemini: "installed",
      codex: "ready",
    } as CliAvailability;
    const settings = settingsWith({
      claude: { selected: true },
      gemini: { selected: false }, // unpinned
      codex: { selected: false }, // unpinned
    });

    const { getAllByTestId, getAllByRole } = render(
      <AgentTrayButton agentAvailability={availability} agentSettings={settings} />
    );

    const labels = getAllByTestId("menu-label").map((el) => el.textContent);
    expect(labels).toContain("Launch");

    const items = getAllByRole("menuitem").map((el) => el.textContent);
    // Only Gemini + Codex should appear in the Launch section
    expect(items).toEqual(expect.arrayContaining(["Gemini", "Codex"]));
    expect(items.find((t) => t === "Claude")).toBeUndefined();
  });

  it("dispatches agent.launch when a Launch item is clicked", () => {
    const availability: CliAvailability = { gemini: "ready" } as CliAvailability;
    const settings = settingsWith({ gemini: { selected: false } });

    const { getAllByRole } = render(
      <AgentTrayButton agentAvailability={availability} agentSettings={settings} />
    );

    const geminiItem = getAllByRole("menuitem").find((el) => el.textContent === "Gemini");
    expect(geminiItem).toBeTruthy();
    fireEvent.click(geminiItem!);

    expect(dispatchMock).toHaveBeenCalledWith(
      "agent.launch",
      { agentId: "gemini" },
      { source: "user" }
    );
  });

  it("renders pin checkboxes for all installed agents with correct checked state", () => {
    const availability: CliAvailability = {
      claude: "ready",
      gemini: "ready",
      codex: "missing",
    } as CliAvailability;
    const settings = settingsWith({
      claude: { selected: true },
      gemini: { selected: false },
    });

    const { getAllByRole } = render(
      <AgentTrayButton agentAvailability={availability} agentSettings={settings} />
    );

    const checkboxes = getAllByRole("menuitemcheckbox");
    const byName = Object.fromEntries(
      checkboxes.map((el) => [el.textContent, el.getAttribute("aria-checked")])
    );
    expect(byName["Claude"]).toBe("true");
    expect(byName["Gemini"]).toBe("false");
    // codex is missing, so it should NOT appear in the pin section
    expect(byName["Codex"]).toBeUndefined();
  });

  it("calls setAgentSelected with the toggled value when checkbox is clicked", () => {
    const availability: CliAvailability = { claude: "ready" } as CliAvailability;
    const settings = settingsWith({ claude: { selected: true } });

    const { getAllByRole } = render(
      <AgentTrayButton agentAvailability={availability} agentSettings={settings} />
    );

    const claudeBox = getAllByRole("menuitemcheckbox").find((el) => el.textContent === "Claude");
    fireEvent.click(claudeBox!);
    expect(setAgentSelectedMock).toHaveBeenCalledWith("claude", false);
  });

  it("lists missing agents in the Not Installed section with Set up navigation", () => {
    const availability: CliAvailability = {
      claude: "ready",
      gemini: "missing",
      codex: "missing",
    } as CliAvailability;
    const settings = settingsWith({ claude: { selected: true } });

    const { getAllByRole, getAllByTestId } = render(
      <AgentTrayButton agentAvailability={availability} agentSettings={settings} />
    );

    const labels = getAllByTestId("menu-label").map((el) => el.textContent);
    expect(labels).toContain("Not Installed");

    const setupItems = getAllByRole("menuitem").filter((el) => el.textContent?.includes("Set up"));
    expect(setupItems.length).toBe(2);

    fireEvent.click(setupItems[0]);
    expect(dispatchMock).toHaveBeenCalledWith(
      "app.settings.openTab",
      expect.objectContaining({ tab: "agents", subtab: expect.any(String) }),
      { source: "user" }
    );
  });

  it("does NOT list agents as uninstalled while availability is still loading (undefined)", () => {
    // agentAvailability is undefined entirely — still loading.
    const settings = settingsWith({ claude: { selected: true } });
    const { queryAllByTestId } = render(<AgentTrayButton agentSettings={settings} />);
    const labels = queryAllByTestId("menu-label").map((el) => el.textContent);
    expect(labels).not.toContain("Not Installed");
    expect(labels).not.toContain("Launch");
  });

  it("shows an empty-state message when no agents are available at all", () => {
    const { getByText } = render(<AgentTrayButton agentAvailability={{} as CliAvailability} />);
    expect(getByText("No agents available")).toBeTruthy();
  });

  it("handles null agentSettings gracefully (agents treated as pinned)", () => {
    const availability: CliAvailability = {
      claude: "ready",
      gemini: "ready",
    } as CliAvailability;

    const { getAllByRole, queryAllByTestId } = render(
      <AgentTrayButton agentAvailability={availability} agentSettings={null} />
    );

    // No Launch section because all are pinned (selected !== false)
    const labels = queryAllByTestId("menu-label").map((el) => el.textContent);
    expect(labels).not.toContain("Launch");
    expect(labels).toContain("Pin to Toolbar");

    const boxes = getAllByRole("menuitemcheckbox");
    for (const box of boxes) {
      expect(box.getAttribute("aria-checked")).toBe("true");
    }
  });
});
