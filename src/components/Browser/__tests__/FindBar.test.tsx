// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FindBar } from "../FindBar";
import type { FindInPageState } from "@/hooks/useFindInPage";

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));

function makeFindState(overrides: Partial<FindInPageState> = {}): FindInPageState {
  return {
    isOpen: true,
    query: "",
    activeMatch: 0,
    matchCount: 0,
    inputRef: { current: null },
    isComposingRef: { current: false },
    open: vi.fn(),
    close: vi.fn(),
    setQuery: vi.fn(),
    goNext: vi.fn(),
    goPrev: vi.fn(),
    ...overrides,
  };
}

describe("FindBar accessibility", () => {
  it("input is reachable via aria-label and carries data-testid", () => {
    render(<FindBar find={makeFindState()} />);
    const input = screen.getByLabelText("Find in page") as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("data-testid")).toBe("find-bar-input");
  });

  it("input aria-controls matches counter span id", () => {
    const { container } = render(<FindBar find={makeFindState({ query: "foo", matchCount: 3 })} />);
    const input = container.querySelector('input[aria-label="Find in page"]') as HTMLInputElement;
    const controlsId = input.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    const counter = container.querySelector(`[id="${controlsId}"]`);
    expect(counter).not.toBeNull();
    expect(counter?.getAttribute("role")).toBe("status");
    expect(counter?.getAttribute("aria-atomic")).toBe("true");
  });

  it("counter span omits role=status when there is no query", () => {
    const { container } = render(<FindBar find={makeFindState({ query: "" })} />);
    const input = container.querySelector('input[aria-label="Find in page"]') as HTMLInputElement;
    const controlsId = input.getAttribute("aria-controls")!;
    const counter = container.querySelector(`[id="${controlsId}"]`);
    expect(counter?.getAttribute("role")).toBeNull();
  });
});
