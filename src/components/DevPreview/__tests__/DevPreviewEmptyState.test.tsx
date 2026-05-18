// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RunCommand } from "@shared/types";

vi.mock("@/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    title,
  }: React.ComponentProps<"button">) => (
    <button onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { DevPreviewEmptyState } from "../DevPreviewEmptyState";

function devRunner(): RunCommand {
  return { id: "npm-dev", name: "dev", command: "npm run dev", icon: "npm", description: "vite" };
}

function startRunner(): RunCommand {
  return { id: "npm-start", name: "start", command: "npm run start", icon: "npm" };
}

function devcontainerRunner(): RunCommand {
  return {
    id: "devcontainer-poststart",
    name: "postStartCommand",
    command: "npm run dev",
    icon: "terminal",
  };
}

const baseProps = {
  isUnconfigured: true,
  detectedCandidate: undefined as RunCommand | undefined,
  allDetectedRunners: undefined as RunCommand[] | undefined,
  isAutoDetecting: false,
  isSettingsLoading: false,
  isSavingManual: false,
  onAutoDetect: vi.fn(),
  onSelectRunner: vi.fn(),
  onManualSubmit: vi.fn(),
  onOpenSettings: vi.fn(),
};

describe("DevPreviewEmptyState", () => {
  describe("waiting branch (configured)", () => {
    it("renders sentence-case waiting heading", () => {
      render(<DevPreviewEmptyState {...baseProps} isUnconfigured={false} />);
      expect(screen.getByText("Waiting for dev server")).toBeDefined();
      expect(screen.queryByText("Waiting for Dev Server")).toBeNull();
    });
  });

  describe("candidate branch", () => {
    it("renders sentence-case heading, detection badge, and primary CTA", () => {
      render(
        <DevPreviewEmptyState
          {...baseProps}
          detectedCandidate={devRunner()}
          allDetectedRunners={[devRunner()]}
        />
      );
      expect(screen.getByRole("heading", { name: "Start the dev server" })).toBeDefined();
      expect(screen.queryByText("Configure Dev Server")).toBeNull();
      // command appears in the detection badge
      expect(screen.getByText("npm run dev")).toBeDefined();
    });

    it("primary CTA calls onAutoDetect", () => {
      const onAutoDetect = vi.fn();
      render(
        <DevPreviewEmptyState
          {...baseProps}
          detectedCandidate={devRunner()}
          allDetectedRunners={[devRunner()]}
          onAutoDetect={onAutoDetect}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /Start the dev server/ }));
      expect(onAutoDetect).toHaveBeenCalledTimes(1);
    });

    it("renders candidate branch for devcontainer fallback", () => {
      render(
        <DevPreviewEmptyState
          {...baseProps}
          detectedCandidate={devcontainerRunner()}
          allDetectedRunners={[devcontainerRunner()]}
        />
      );
      expect(screen.getByRole("heading", { name: "Start the dev server" })).toBeDefined();
    });

    it("shows the picker only when more than one runner is detected", () => {
      const { rerender } = render(
        <DevPreviewEmptyState
          {...baseProps}
          detectedCandidate={devRunner()}
          allDetectedRunners={[devRunner()]}
        />
      );
      expect(screen.queryByText("Use a different script…")).toBeNull();

      rerender(
        <DevPreviewEmptyState
          {...baseProps}
          detectedCandidate={devRunner()}
          allDetectedRunners={[devRunner(), startRunner()]}
        />
      );
      expect(screen.getByText("Use a different script…")).toBeDefined();
    });

    it("selecting a runner from the picker calls onSelectRunner", () => {
      const onSelectRunner = vi.fn();
      render(
        <DevPreviewEmptyState
          {...baseProps}
          detectedCandidate={devRunner()}
          allDetectedRunners={[devRunner(), startRunner()]}
          onSelectRunner={onSelectRunner}
        />
      );
      fireEvent.click(screen.getByText("npm run start"));
      expect(onSelectRunner).toHaveBeenCalledWith(startRunner());
    });
  });

  describe("no-candidate branch", () => {
    it("renders sentence-case heading and inline input", () => {
      render(<DevPreviewEmptyState {...baseProps} />);
      expect(screen.getByText("Set a dev command")).toBeDefined();
      expect(screen.getByLabelText("Dev server command")).toBeDefined();
    });

    it("disables the submit button for empty input", () => {
      render(<DevPreviewEmptyState {...baseProps} />);
      expect(screen.getByText("Start server").closest("button")?.disabled).toBe(true);
    });

    it("disables the submit button for shell-control input", () => {
      const onManualSubmit = vi.fn();
      render(<DevPreviewEmptyState {...baseProps} onManualSubmit={onManualSubmit} />);
      const input = screen.getByLabelText("Dev server command");
      fireEvent.change(input, { target: { value: "npm run dev; rm -rf /" } });
      const button = screen.getByText("Start server").closest("button");
      expect(button?.disabled).toBe(true);
      fireEvent.click(button!);
      expect(onManualSubmit).not.toHaveBeenCalled();
    });

    it("submits a valid command with trimmed value", () => {
      const onManualSubmit = vi.fn();
      render(<DevPreviewEmptyState {...baseProps} onManualSubmit={onManualSubmit} />);
      const input = screen.getByLabelText("Dev server command");
      fireEvent.change(input, { target: { value: "  npm run dev  " } });
      fireEvent.click(screen.getByText("Start server"));
      expect(onManualSubmit).toHaveBeenCalledWith("npm run dev");
    });

    it("submits on Enter key", () => {
      const onManualSubmit = vi.fn();
      render(<DevPreviewEmptyState {...baseProps} onManualSubmit={onManualSubmit} />);
      const input = screen.getByLabelText("Dev server command");
      fireEvent.change(input, { target: { value: "vite" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onManualSubmit).toHaveBeenCalledWith("vite");
    });
  });

  it("settings link calls onOpenSettings in both unconfigured branches", () => {
    const onOpenSettings = vi.fn();
    const { rerender } = render(
      <DevPreviewEmptyState {...baseProps} onOpenSettings={onOpenSettings} />
    );
    fireEvent.click(screen.getByText("Open project settings"));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    rerender(
      <DevPreviewEmptyState
        {...baseProps}
        detectedCandidate={devRunner()}
        allDetectedRunners={[devRunner()]}
        onOpenSettings={onOpenSettings}
      />
    );
    fireEvent.click(screen.getByText("Open project settings"));
    expect(onOpenSettings).toHaveBeenCalledTimes(2);
  });
});
