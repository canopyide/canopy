// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { FlavorSelector } from "../FlavorSelector";
import type { AgentFlavor } from "@/config/agents";

vi.mock("lucide-react", () => ({
  ChevronDown: () => <span data-testid="chevron-icon" />,
  Check: () => <span data-testid="check-icon" />,
}));

// Render Popover children inline for test visibility — we're asserting on the
// listbox markup, not on portal/focus-trap mechanics.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mkFlavor = (id: string, name: string, color?: string): AgentFlavor =>
  ({
    id,
    name,
    color,
  }) as AgentFlavor;

describe("FlavorSelector", () => {
  let onChange: ReturnType<typeof vi.fn<(flavorId: string | undefined) => void>>;

  beforeEach(() => {
    onChange = vi.fn<(flavorId: string | undefined) => void>();
  });

  it("trigger label shows 'Vanilla (no overrides)' when no flavor selected", () => {
    const { getByTestId } = render(
      <FlavorSelector
        selectedFlavorId={undefined}
        allFlavors={[]}
        ccrFlavors={[]}
        customFlavors={[]}
        onChange={onChange}
        agentColor="#888"
      />
    );
    expect(getByTestId("flavor-selector-trigger").textContent).toContain("Vanilla");
  });

  it("trigger shows the stripped CCR name (without 'CCR:' prefix) when a CCR flavor is selected", () => {
    const ccr = mkFlavor("ccr-opus", "CCR: Opus");
    const { getByTestId } = render(
      <FlavorSelector
        selectedFlavorId="ccr-opus"
        allFlavors={[ccr]}
        ccrFlavors={[ccr]}
        customFlavors={[]}
        onChange={onChange}
        agentColor="#888"
      />
    );
    const label = getByTestId("flavor-selector-trigger").textContent ?? "";
    expect(label).toContain("Opus");
    expect(label).not.toContain("CCR:"); // prefix is stripped in the visible label
    expect(label).toContain("CCR"); // but the "CCR" badge is present
  });

  it("renders a group label for each non-empty category (Settings is explicit-management context)", () => {
    const ccr = mkFlavor("ccr-a", "CCR: A");
    const custom = mkFlavor("user-b", "B");
    const { queryByTestId, rerender } = render(
      <FlavorSelector
        selectedFlavorId={undefined}
        allFlavors={[ccr]}
        ccrFlavors={[ccr]}
        customFlavors={[]}
        onChange={onChange}
        agentColor="#888"
      />
    );
    // Only CCR group present → show CCR label but no Custom label.
    expect(queryByTestId("flavor-group-ccr-routes")).toBeTruthy();
    expect(queryByTestId("flavor-group-custom")).toBeNull();

    rerender(
      <FlavorSelector
        selectedFlavorId={undefined}
        allFlavors={[ccr, custom]}
        ccrFlavors={[ccr]}
        customFlavors={[custom]}
        onChange={onChange}
        agentColor="#888"
      />
    );
    expect(queryByTestId("flavor-group-ccr-routes")).toBeTruthy();
    expect(queryByTestId("flavor-group-custom")).toBeTruthy();
  });

  it("selecting a custom flavor invokes onChange with its id", () => {
    const custom = mkFlavor("user-x", "X", "#123456");
    const { getByTestId } = render(
      <FlavorSelector
        selectedFlavorId={undefined}
        allFlavors={[custom]}
        ccrFlavors={[]}
        customFlavors={[custom]}
        onChange={onChange}
        agentColor="#888"
      />
    );
    fireEvent.click(getByTestId("flavor-option-user-x"));
    expect(onChange).toHaveBeenCalledWith("user-x");
  });

  it("selecting Vanilla invokes onChange with undefined", () => {
    const custom = mkFlavor("user-x", "X");
    const { getByTestId } = render(
      <FlavorSelector
        selectedFlavorId="user-x"
        allFlavors={[custom]}
        ccrFlavors={[]}
        customFlavors={[custom]}
        onChange={onChange}
        agentColor="#888"
      />
    );
    fireEvent.click(getByTestId("flavor-option-vanilla"));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("options announce aria-selected on the currently selected flavor", () => {
    const custom = mkFlavor("user-x", "X");
    const { getByTestId } = render(
      <FlavorSelector
        selectedFlavorId="user-x"
        allFlavors={[custom]}
        ccrFlavors={[]}
        customFlavors={[custom]}
        onChange={onChange}
        agentColor="#888"
      />
    );
    expect(getByTestId("flavor-option-user-x").getAttribute("aria-selected")).toBe("true");
    expect(getByTestId("flavor-option-vanilla").getAttribute("aria-selected")).toBe("false");
  });

  it("keyboard Enter on an option invokes onChange", () => {
    const custom = mkFlavor("user-x", "X");
    const { getByTestId } = render(
      <FlavorSelector
        selectedFlavorId={undefined}
        allFlavors={[custom]}
        ccrFlavors={[]}
        customFlavors={[custom]}
        onChange={onChange}
        agentColor="#888"
      />
    );
    fireEvent.keyDown(getByTestId("flavor-option-user-x"), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("user-x");
  });
});
