// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    type = "button",
    ...rest
  }: React.PropsWithChildren<{ onClick?: () => void; type?: "button" | "submit" }>) => (
    <button type={type} onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

import { EmptyState } from "../EmptyState";

describe("EmptyState — zero-data variant", () => {
  it("renders title and description", () => {
    render(
      <EmptyState
        variant="zero-data"
        title="No recipes yet"
        description="Recipes launch multi-terminal workflows"
      />
    );
    expect(screen.getByText("No recipes yet")).toBeTruthy();
    expect(screen.getByText("Recipes launch multi-terminal workflows")).toBeTruthy();
  });

  it("omits description when not provided", () => {
    render(<EmptyState variant="zero-data" title="No recipes yet" />);
    expect(screen.getByText("No recipes yet")).toBeTruthy();
    expect(screen.queryByText(/Recipes launch/)).toBeNull();
  });

  it("renders an aria-hidden icon when provided", () => {
    const Icon = (props: { className?: string; "aria-hidden"?: boolean | "true" }) => (
      <svg data-testid="empty-icon" {...props} />
    );
    render(<EmptyState variant="zero-data" title="t" icon={Icon} />);
    const icon = screen.getByTestId("empty-icon");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders CTA and fires onCta on click", () => {
    const onCta = vi.fn();
    render(<EmptyState variant="zero-data" title="t" ctaLabel="Create recipe" onCta={onCta} />);
    fireEvent.click(screen.getByText("Create recipe"));
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it("does not render CTA when ctaLabel or onCta missing", () => {
    render(<EmptyState variant="zero-data" title="t" ctaLabel="X" />);
    expect(screen.queryByText("X")).toBeNull();
  });

  it("does not have role=status (mount-once, no SR announcement)", () => {
    const { container } = render(<EmptyState variant="zero-data" title="t" />);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe("EmptyState — filtered-empty variant", () => {
  it("renders message", () => {
    render(<EmptyState variant="filtered-empty" message="No issues match this search" />);
    expect(screen.getByText("No issues match this search")).toBeTruthy();
  });

  it("has role=status and aria-live=polite for dynamic announcement", () => {
    const { container } = render(<EmptyState variant="filtered-empty" message="No matches" />);
    const region = container.querySelector('[role="status"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute("aria-live")).toBe("polite");
  });

  it("renders default 'Clear search' label and fires onClear", () => {
    const onClear = vi.fn();
    render(<EmptyState variant="filtered-empty" message="m" onClear={onClear} />);
    fireEvent.click(screen.getByText("Clear search"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("respects custom clearLabel", () => {
    render(
      <EmptyState
        variant="filtered-empty"
        message="m"
        clearLabel="Reset filter"
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText("Reset filter")).toBeTruthy();
  });

  it("omits clear button when onClear is not provided", () => {
    render(<EmptyState variant="filtered-empty" message="m" />);
    expect(screen.queryByText("Clear search")).toBeNull();
  });
});

describe("EmptyState — acknowledged variant", () => {
  it("renders message only", () => {
    const { container } = render(<EmptyState variant="acknowledged" message="Nothing to show" />);
    expect(screen.getByText("Nothing to show")).toBeTruthy();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });
});
