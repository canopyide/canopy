// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { AlertTriangle, CheckCircle2, FileEdit, Info, XCircle } from "lucide-react";
import { InlineStatusBanner } from "../InlineStatusBanner";

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("InlineStatusBanner", () => {
  it("defaults to role='alert' and emits no aria-live attribute", () => {
    render(
      <InlineStatusBanner
        icon={XCircle}
        title="Something broke"
        severity="error"
        animated={false}
        actions={[]}
      />
    );
    const region = screen.getByRole("alert");
    expect(region.hasAttribute("aria-live")).toBe(false);
    expect(region.hasAttribute("aria-atomic")).toBe(false);
  });

  it.each([
    ["error", XCircle, "--color-status-error"],
    ["warning", AlertTriangle, "--color-status-warning"],
    ["info", Info, "--color-status-info"],
    ["success", CheckCircle2, "--color-status-success"],
  ] as const)("renders %s severity using its status token", (severity, icon, token) => {
    render(
      <InlineStatusBanner
        icon={icon}
        title={severity}
        severity={severity}
        animated={false}
        actions={[]}
      />
    );
    const region = screen.getByRole("alert");
    expect(region.style.backgroundColor).toContain(token);
    expect(region.style.borderBottom).toContain(token);
  });

  it("emits aria-live='off' without aria-atomic", () => {
    render(
      <InlineStatusBanner
        icon={Info}
        title="Quiet"
        severity="info"
        animated={false}
        ariaLive="off"
        actions={[]}
      />
    );
    const region = screen.getByRole("alert");
    expect(region.getAttribute("aria-live")).toBe("off");
    expect(region.hasAttribute("aria-atomic")).toBe(false);
  });

  it("applies aria-live and aria-atomic when ariaLive is provided", () => {
    render(
      <InlineStatusBanner
        icon={Info}
        title="Working"
        severity="info"
        animated={false}
        role="status"
        ariaLive="polite"
        actions={[]}
      />
    );
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
  });

  it("supports role='status' override", () => {
    render(
      <InlineStatusBanner
        icon={Info}
        title="Status"
        severity="info"
        animated={false}
        role="status"
        actions={[]}
      />
    );
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders neutral severity without leaking a status-color var into inline styles", () => {
    const { container } = render(
      <InlineStatusBanner
        icon={FileEdit}
        title="Files changed"
        severity="neutral"
        animated={false}
        role="status"
        actions={[]}
      />
    );
    const root = container.firstElementChild as HTMLElement;
    // No inline color-mix surface: neutral uses the overlay-subtle token class.
    expect(root.style.backgroundColor).toBe("");
    expect(root.style.borderBottom).toBe("");
    expect(root.className).toContain("bg-overlay-subtle");
    expect(root.outerHTML).not.toContain("var(undefined)");
  });

  it("renders trailingSlot before the dismiss button in DOM order", () => {
    const onClose = vi.fn();
    render(
      <InlineStatusBanner
        icon={Info}
        title="With slot"
        severity="info"
        animated={false}
        trailingSlot={<button type="button">Show details</button>}
        actions={[]}
        onClose={onClose}
      />
    );
    const slot = screen.getByRole("button", { name: "Show details" });
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    expect(slot).toBeTruthy();
    expect(slot.compareDocumentPosition(dismiss) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders descriptionExtras as a sibling, never inside the description paragraph", () => {
    const { container } = render(
      <InlineStatusBanner
        icon={AlertTriangle}
        title="Lots open"
        description="Consider closing idle panels."
        descriptionExtras={
          <button type="button" className="extras-btn">
            Close completed
          </button>
        }
        severity="warning"
        animated={false}
        actions={[]}
      />
    );
    const extras = container.querySelector(".extras-btn") as HTMLElement;
    expect(extras).toBeTruthy();
    expect(extras.closest("p")).toBeNull();
  });

  it("uses a custom closeAriaLabel for the dismiss button", () => {
    render(
      <InlineStatusBanner
        icon={Info}
        title="Custom"
        severity="info"
        animated={false}
        actions={[]}
        onClose={() => {}}
        closeAriaLabel="Dismiss recovery confirmation"
      />
    );
    expect(screen.getByRole("button", { name: "Dismiss recovery confirmation" })).toBeTruthy();
  });

  it("fires onClose after autoDismissAfter elapses and clears the timer on unmount", () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      const { unmount, rerender } = render(
        <InlineStatusBanner
          icon={Info}
          title="Auto"
          severity="info"
          animated={false}
          actions={[]}
          onClose={onClose}
          autoDismissAfter={10_000}
        />
      );
      act(() => {
        vi.advanceTimersByTime(9_999);
      });
      expect(onClose).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onClose).toHaveBeenCalledTimes(1);

      // Re-mounting then unmounting must not fire onClose again.
      rerender(
        <InlineStatusBanner
          icon={Info}
          title="Auto"
          severity="info"
          animated={false}
          actions={[]}
          onClose={onClose}
          autoDismissAfter={10_000}
        />
      );
      unmount();
      act(() => {
        vi.advanceTimersByTime(20_000);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not schedule an auto-dismiss when onClose is absent", () => {
    vi.useFakeTimers();
    try {
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
      render(
        <InlineStatusBanner
          icon={Info}
          title="No close"
          severity="info"
          animated={false}
          actions={[]}
          autoDismissAfter={5_000}
        />
      );
      const scheduledAutoDismiss = setTimeoutSpy.mock.calls.some(([, delay]) => delay === 5_000);
      expect(scheduledAutoDismiss).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the 250ms entrance duration class when animated", () => {
    const { container } = render(
      <InlineStatusBanner
        icon={Info}
        title="Animated"
        severity="info"
        animated={true}
        actions={[]}
      />
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("duration-250");
    expect(root.className).not.toContain("duration-150");
  });
});
