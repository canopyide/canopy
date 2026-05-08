// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { ToolbarProblemsButton } from "../ToolbarProblemsButton";
import { useDiagnosticsStore } from "@/store/diagnosticsStore";

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...rest
  }: { children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
}));

vi.mock("@/components/ui/ShortcutRevealChip", () => ({
  ShortcutRevealChip: () => null,
}));

vi.mock("lucide-react", () => ({
  AlertCircle: () => <span data-testid="icon-alert" />,
}));

vi.mock("@/hooks", () => ({
  useAriaKeyshortcuts: () => "",
  useKeybindingDisplay: () => "",
  useShortcutHintHover: () => ({}),
}));

vi.mock("@/lib/tooltipShortcut", () => ({
  createTooltipContent: () => null,
}));

describe("ToolbarProblemsButton — aria-expanded / aria-controls", () => {
  beforeEach(() => {
    useDiagnosticsStore.setState({ isOpen: false });
  });

  it("exposes aria-expanded=false and aria-controls when the dock is closed", () => {
    const { container } = render(<ToolbarProblemsButton errorCount={0} />);
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    expect(button?.getAttribute("aria-controls")).toBe("diagnostics-dock-region");
  });

  it("flips aria-expanded to true when the dock opens", () => {
    const { container } = render(<ToolbarProblemsButton errorCount={2} />);
    const button = container.querySelector("button");
    expect(button?.getAttribute("aria-expanded")).toBe("false");

    act(() => {
      useDiagnosticsStore.setState({ isOpen: true });
    });

    expect(button?.getAttribute("aria-expanded")).toBe("true");
    expect(button?.getAttribute("aria-controls")).toBe("diagnostics-dock-region");
  });
});
