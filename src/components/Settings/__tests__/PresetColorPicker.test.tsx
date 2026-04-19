// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { PresetColorPicker } from "../PresetColorPicker";

vi.mock("lucide-react", () => ({
  Check: () => <span data-testid="check-icon" />,
  X: () => <span data-testid="x-icon" />,
}));

// Radix Popover renders conditionally via portal — mock to render all children
// inline so we can assert on the palette grid without real portal plumbing.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("PresetColorPicker", () => {
  let onChange: ReturnType<typeof vi.fn<(color: string | undefined) => void>>;

  beforeEach(() => {
    onChange = vi.fn<(color: string | undefined) => void>();
  });

  it("trigger swatch reflects the current color", () => {
    const { getByTestId } = render(
      <PresetColorPicker color="#ff0000" onChange={onChange} agentColor="#888" />
    );
    const trigger = getByTestId("preset-color-picker-trigger");
    expect(trigger.querySelector("span")?.getAttribute("style")).toContain("rgb(255, 0, 0)");
  });

  it("trigger swatch falls back to agentColor when color is undefined", () => {
    const { getByTestId } = render(
      <PresetColorPicker color={undefined} onChange={onChange} agentColor="#0000ff" />
    );
    const trigger = getByTestId("preset-color-picker-trigger");
    expect(trigger.querySelector("span")?.getAttribute("style")).toContain("rgb(0, 0, 255)");
  });

  it("clicking a palette swatch invokes onChange with that hex", () => {
    const { container } = render(
      <PresetColorPicker color={undefined} onChange={onChange} agentColor="#888" />
    );
    // Find the first palette swatch button by data-testid prefix.
    const swatch = container.querySelector(
      '[data-testid^="preset-color-swatch-"]'
    ) as HTMLButtonElement;
    expect(swatch).toBeTruthy();
    fireEvent.click(swatch);
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]![0];
    expect(arg).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("clicking Clear invokes onChange with undefined (inherit)", () => {
    const { getByTestId } = render(
      <PresetColorPicker color="#ff0000" onChange={onChange} agentColor="#888" />
    );
    fireEvent.click(getByTestId("preset-color-clear"));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("Custom… button programmatically opens the native color input", () => {
    const { getByTestId } = render(
      <PresetColorPicker color={undefined} onChange={onChange} agentColor="#888" />
    );
    // Spy on the hidden input's click handler — confirm the click propagates.
    const customBtn = getByTestId("preset-color-custom") as HTMLButtonElement;
    const nativeInput = customBtn.parentElement?.querySelector(
      'input[type="color"]'
    ) as HTMLInputElement;
    expect(nativeInput).toBeTruthy();
    const clickSpy = vi.spyOn(nativeInput, "click");
    fireEvent.click(customBtn);
    expect(clickSpy).toHaveBeenCalled();
  });

  it("selected palette swatch is marked aria-pressed", () => {
    const { getByTestId } = render(
      <PresetColorPicker color="#e06c75" onChange={onChange} agentColor="#888" />
    );
    const swatch = getByTestId("preset-color-swatch-e06c75");
    expect(swatch.getAttribute("aria-pressed")).toBe("true");
  });
});
