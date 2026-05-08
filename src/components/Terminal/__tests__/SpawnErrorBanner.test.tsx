// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SpawnError, SpawnErrorCode } from "@shared/types/pty-host";

const dispatchMock = vi.fn();

vi.mock("@/services/ActionService", () => ({
  actionService: {
    dispatch: (...args: unknown[]) => dispatchMock(...args),
  },
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { SpawnErrorBanner } from "../SpawnErrorBanner";

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

beforeEach(() => {
  dispatchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderBanner(
  code: SpawnErrorCode,
  overrides: Partial<{
    isRestarting: boolean;
    onRetry: (id: string) => void;
    onTrash: (id: string) => void;
    onUpdateCwd: (id: string) => void;
  }> = {}
) {
  const error: SpawnError = {
    code,
    message: `simulated ${code} error`,
  };
  return render(
    <SpawnErrorBanner
      terminalId="t-1"
      error={error}
      onUpdateCwd={overrides.onUpdateCwd ?? vi.fn()}
      onRetry={overrides.onRetry ?? vi.fn()}
      onTrash={overrides.onTrash ?? vi.fn()}
      isRestarting={overrides.isRestarting}
    />
  );
}

describe("SpawnErrorBanner", () => {
  it.each(["EMFILE", "EAGAIN", "ENOMEM", "ENXIO"] as const)(
    "renders the terminal-limits action for %s",
    (code) => {
      renderBanner(code);
      expect(screen.getByRole("button", { name: /open terminal limits settings/i })).toBeTruthy();
    }
  );

  it("does not render the terminal-limits action for unrelated codes", () => {
    renderBanner("ENOENT");
    expect(screen.queryByRole("button", { name: /open terminal limits settings/i })).toBeNull();
  });

  it("dispatches app.settings.openTab with the terminal/performance/panel-limits target", () => {
    renderBanner("EMFILE");
    fireEvent.click(screen.getByRole("button", { name: /open terminal limits settings/i }));
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledWith(
      "app.settings.openTab",
      { tab: "terminal", subtab: "performance", sectionId: "terminal-panel-limits" },
      { source: "user" }
    );
  });

  it("renders the destructive action with verb-noun label", () => {
    renderBanner("ENOENT");
    expect(screen.getByRole("button", { name: /move to trash/i }).textContent).toContain(
      "Remove terminal"
    );
  });

  it("disables retry and shows aria-busy when isRestarting is true", () => {
    renderBanner("ENOENT", { isRestarting: true });
    const retry = screen.getByRole("button", { name: /retry starting terminal/i });
    expect(retry.hasAttribute("disabled")).toBe(true);
    expect(retry.getAttribute("aria-busy")).toBe("true");
  });

  it("does not invoke onRetry while isRestarting is true", () => {
    const onRetry = vi.fn();
    renderBanner("ENOENT", { isRestarting: true, onRetry });
    fireEvent.click(screen.getByRole("button", { name: /retry starting terminal/i }));
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("invokes onRetry when not restarting", () => {
    const onRetry = vi.fn();
    renderBanner("ENOENT", { onRetry });
    fireEvent.click(screen.getByRole("button", { name: /retry starting terminal/i }));
    expect(onRetry).toHaveBeenCalledWith("t-1");
  });
});
