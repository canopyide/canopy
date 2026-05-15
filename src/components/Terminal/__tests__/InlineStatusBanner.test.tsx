// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
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

  it("renders info severity using the info status token", () => {
    render(
      <InlineStatusBanner
        icon={Info}
        title="Heads up"
        severity="info"
        animated={false}
        actions={[]}
      />
    );
    const region = screen.getByRole("alert");
    expect(region.style.backgroundColor).toContain("--color-status-info");
    expect(region.style.borderBottom).toContain("--color-status-info");
  });

  it("renders success severity using the success status token", () => {
    render(
      <InlineStatusBanner
        icon={CheckCircle2}
        title="All set"
        severity="success"
        animated={false}
        actions={[]}
      />
    );
    const region = screen.getByRole("alert");
    expect(region.style.backgroundColor).toContain("--color-status-success");
    expect(region.style.borderBottom).toContain("--color-status-success");
  });

  it("renders warning severity using the warning status token", () => {
    render(
      <InlineStatusBanner
        icon={AlertTriangle}
        title="Careful"
        severity="warning"
        animated={false}
        actions={[]}
      />
    );
    const region = screen.getByRole("alert");
    expect(region.style.backgroundColor).toContain("--color-status-warning");
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
