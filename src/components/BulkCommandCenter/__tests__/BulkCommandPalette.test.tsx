// @vitest-environment jsdom
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { BulkCommandPalette, openBulkCommandPalette } from "../BulkCommandPalette";
import { usePaletteStore } from "@/store/paletteStore";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/hooks", () => ({
  useOverlayState: vi.fn(),
  useEscapeStack: vi.fn(),
}));

vi.mock("@/hooks/useAnimatedPresence", () => ({
  useAnimatedPresence: ({ isOpen }: { isOpen: boolean }) => ({
    isVisible: isOpen,
    shouldRender: isOpen,
  }),
}));

vi.mock("@/lib/animationUtils", () => ({
  UI_ENTER_DURATION: 0,
  UI_EXIT_DURATION: 0,
  UI_ENTER_EASING: "ease",
  UI_EXIT_EASING: "ease",
  getUiTransitionDuration: () => 0,
}));

const mockSendKey = vi.fn();
const mockSubmit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/clients", () => ({
  terminalClient: {
    sendKey: (...args: unknown[]) => mockSendKey(...args),
    submit: (...args: unknown[]) => mockSubmit(...args),
  },
}));

vi.mock("@/components/Worktree/AgentStatusIndicator", () => ({
  getDominantAgentState: (states: (string | undefined)[]) => {
    const valid = states.filter(Boolean);
    return valid.length > 0 ? valid[0] : null;
  },
}));

vi.mock("@/components/Worktree/terminalStateConfig", () => ({
  STATE_ICONS: {
    working: ({ className }: { className?: string }) =>
      `<span data-testid="state-icon-working" class="${className}">W</span>`,
    idle: ({ className }: { className?: string }) =>
      `<span data-testid="state-icon-idle" class="${className}">I</span>`,
  },
  STATE_COLORS: {
    working: "text-state-working",
    idle: "text-canopy-text/40",
  },
}));

vi.mock("@/utils/terminalType", () => ({
  isAgentTerminal: (kindOrType?: string, agentId?: string) => kindOrType === "agent" || !!agentId,
}));

const mockWorktrees = new Map([
  [
    "wt-1",
    {
      id: "wt-1",
      name: "feature-a",
      branch: "feature/a",
      isMainWorktree: false,
      path: "/tmp/wt1",
    },
  ],
  [
    "wt-2",
    {
      id: "wt-2",
      name: "feature-b",
      branch: "feature/b",
      isMainWorktree: false,
      path: "/tmp/wt2",
    },
  ],
  [
    "wt-main",
    {
      id: "wt-main",
      name: "main",
      branch: "main",
      isMainWorktree: true,
      path: "/tmp/main",
    },
  ],
]);

const mockTerminals = [
  {
    id: "t1",
    worktreeId: "wt-1",
    kind: "agent",
    agentId: "claude",
    agentState: "working",
    location: "grid",
    hasPty: true,
  },
  {
    id: "t2",
    worktreeId: "wt-1",
    kind: "agent",
    agentId: "claude",
    agentState: "idle",
    location: "grid",
    hasPty: true,
  },
  {
    id: "t3",
    worktreeId: "wt-2",
    kind: "agent",
    agentId: "claude",
    agentState: "waiting",
    location: "grid",
    hasPty: true,
  },
  {
    id: "t4",
    worktreeId: "wt-2",
    kind: "terminal",
    location: "grid",
    hasPty: true,
  },
  {
    id: "t5",
    worktreeId: "wt-1",
    kind: "agent",
    agentId: "claude",
    agentState: "idle",
    location: "trash",
    hasPty: true,
  },
];

vi.mock("@/store/worktreeDataStore", () => ({
  useWorktreeDataStore: (selector: (s: { worktrees: typeof mockWorktrees }) => unknown) =>
    selector({ worktrees: mockWorktrees }),
}));

vi.mock("@/store/terminalStore", () => ({
  useTerminalStore: Object.assign(
    (selector: (s: { terminals: typeof mockTerminals }) => unknown) =>
      selector({ terminals: mockTerminals }),
    {
      getState: () => ({ terminals: mockTerminals }),
    }
  ),
}));

function openPalette() {
  act(() => {
    usePaletteStore.getState().openPalette("bulk-command");
  });
}

describe("BulkCommandPalette", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSendKey.mockClear();
    mockSubmit.mockClear();
    usePaletteStore.setState({ activePaletteId: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not render when closed", () => {
    render(<BulkCommandPalette />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders worktree rows excluding main worktree when open", () => {
    render(<BulkCommandPalette />);
    openPalette();
    expect(screen.getByText("feature/a")).toBeTruthy();
    expect(screen.getByText("feature/b")).toBeTruthy();
    expect(screen.queryByText("main")).toBeNull();
  });

  it("shows agent terminal count per worktree", () => {
    render(<BulkCommandPalette />);
    openPalette();
    expect(screen.getByText("2 agents")).toBeTruthy(); // wt-1 has 2 (t1, t2), t5 is trashed
    expect(screen.getByText("1 agent")).toBeTruthy(); // wt-2 has 1 (t3), t4 is not agent
  });

  it("toggles worktree selection via checkbox row click", () => {
    render(<BulkCommandPalette />);
    openPalette();
    const row = screen.getByText("feature/a").closest("button")!;
    fireEvent.click(row);
    const checkbox = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(row);
    expect(checkbox.checked).toBe(false);
  });

  it("select all toggles all enabled rows", () => {
    render(<BulkCommandPalette />);
    openPalette();
    fireEvent.click(screen.getByText("Select All"));
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    const enabled = checkboxes.filter((c) => !c.disabled);
    expect(enabled.every((c) => c.checked)).toBe(true);
    fireEvent.click(screen.getByText("Deselect All"));
    expect(enabled.every((c) => !c.checked)).toBe(true);
  });

  it("disables send button when no worktrees selected", () => {
    render(<BulkCommandPalette />);
    openPalette();
    const sendBtn = screen.getByText("Send").closest("button") as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
  });

  it("sends keystroke to all agent terminals in selected worktrees", () => {
    render(<BulkCommandPalette />);
    openPalette();
    // Select wt-1
    fireEvent.click(screen.getByText("feature/a").closest("button")!);
    // Click Send
    fireEvent.click(screen.getByText("Send"));
    // Should send "escape" to t1 and t2 (not t5 which is trashed)
    expect(mockSendKey).toHaveBeenCalledTimes(2);
    expect(mockSendKey).toHaveBeenCalledWith("t1", "escape");
    expect(mockSendKey).toHaveBeenCalledWith("t2", "escape");
  });

  it("sends double-escape with 1s delay between escapes", () => {
    render(<BulkCommandPalette />);
    openPalette();
    // Select wt-2
    fireEvent.click(screen.getByText("feature/b").closest("button")!);
    // Switch to Double Escape preset
    fireEvent.click(screen.getByText("Double Escape"));
    // Click Send — the button text is still "Send" at click time
    const sendBtn = screen.getByRole("button", { name: "Send" });
    fireEvent.click(sendBtn);
    // First escape should fire immediately
    expect(mockSendKey).toHaveBeenCalledTimes(1);
    expect(mockSendKey).toHaveBeenCalledWith("t3", "escape");
    // Advance timer by 1s
    act(() => vi.advanceTimersByTime(1000));
    // Second escape should fire
    expect(mockSendKey).toHaveBeenCalledTimes(2);
  });

  it("sends text command via submit to agent terminals", async () => {
    render(<BulkCommandPalette />);
    openPalette();
    // Switch to text mode
    fireEvent.click(screen.getByText("Text Command"));
    // Select wt-1
    fireEvent.click(screen.getByText("feature/a").closest("button")!);
    // Type command
    const input = screen.getByPlaceholderText("Enter command to send...");
    fireEvent.change(input, { target: { value: "npm test" } });
    // Click Send
    await act(async () => {
      fireEvent.click(screen.getByText("Send"));
    });
    expect(mockSubmit).toHaveBeenCalledTimes(2);
    expect(mockSubmit).toHaveBeenCalledWith("t1", "npm test");
    expect(mockSubmit).toHaveBeenCalledWith("t2", "npm test");
  });

  it("disables send in text mode when command is empty", () => {
    render(<BulkCommandPalette />);
    openPalette();
    fireEvent.click(screen.getByText("Text Command"));
    fireEvent.click(screen.getByText("feature/a").closest("button")!);
    const sendBtn = screen.getByText("Send").closest("button") as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
  });

  it("openBulkCommandPalette sets palette store", () => {
    openBulkCommandPalette();
    expect(usePaletteStore.getState().activePaletteId).toBe("bulk-command");
  });

  it("resets state when palette closes", () => {
    render(<BulkCommandPalette />);
    openPalette();
    // Select a worktree
    fireEvent.click(screen.getByText("feature/a").closest("button")!);
    // Close palette
    act(() => usePaletteStore.getState().closePalette("bulk-command"));
    // Reopen
    openPalette();
    // Should be reset - no selection
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes.every((c) => !c.checked)).toBe(true);
  });
});
