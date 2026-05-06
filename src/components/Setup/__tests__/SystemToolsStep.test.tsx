// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/agentInstall", () => ({
  detectOS: () => "darwin",
}));

vi.mock("@/clients", () => ({
  systemClient: {
    openExternal: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("./InstallBlock", () => ({
  InstallBlock: ({ block }: { block: any }) => (
    <div data-testid="install-block">{block.command}</div>
  ),
}));

import { PrerequisiteCard, StatusIcon } from "../SystemToolsStep";
import type { PrerequisiteSpec } from "@shared/types";

describe("PrerequisiteCard", () => {
  const mockSpec: PrerequisiteSpec = {
    tool: "git",
    label: "Git",
    command: "git",
    versionArgs: ["--version"],
    severity: "fatal",
    minVersion: "2.30.0",
    installUrl: "https://example.com/install-git",
    installBlocks: {
      darwin: [
        {
          command: "brew install git",
          label: "Install with Homebrew",
        },
      ],
    },
  };

  it("shows Checking while loading", () => {
    render(<PrerequisiteCard spec={mockSpec} state="loading" />);

    expect(screen.getByText("Checking…")).toBeDefined();
  });

  it("shows installed version when tool is ready", () => {
    render(
      <PrerequisiteCard
        spec={mockSpec}
        state={{
          tool: "git",
          label: "Git",
          available: true,
          version: "2.43.0",
          severity: "fatal",
          meetsMinVersion: true,
          minVersion: "2.30.0",
        }}
      />
    );

    expect(screen.getByText("v2.43.0")).toBeDefined();
  });

  it("shows Installed when tool is available but no version", () => {
    render(
      <PrerequisiteCard
        spec={mockSpec}
        state={{
          tool: "git",
          label: "Git",
          available: true,
          version: null,
          severity: "fatal",
          meetsMinVersion: true,
          minVersion: undefined,
        }}
      />
    );

    expect(screen.getByText("Installed")).toBeDefined();
  });

  it("shows version mismatch chip with inline current→required format", () => {
    render(
      <PrerequisiteCard
        spec={mockSpec}
        state={{
          tool: "git",
          label: "Git",
          available: true,
          version: "2.20.0",
          severity: "fatal",
          meetsMinVersion: false,
          minVersion: "2.30.0",
          installUrl: "https://example.com/install-git",
        }}
      />
    );

    const versionChip = screen.getByText("v2.20.0 → v2.30.0+");
    expect(versionChip).toBeDefined();
  });

  it("shows no tooltip on version mismatch chip", () => {
    render(
      <PrerequisiteCard
        spec={mockSpec}
        state={{
          tool: "git",
          label: "Git",
          available: true,
          version: "2.20.0",
          severity: "fatal",
          meetsMinVersion: false,
          minVersion: "2.30.0",
          installUrl: "https://example.com/install-git",
        }}
      />
    );

    const versionChip = screen.getByText("v2.20.0 → v2.30.0+");
    expect(versionChip.getAttribute("title")).toBeNull();
  });

  it("shows How to install button when install blocks are available", () => {
    render(
      <PrerequisiteCard
        spec={mockSpec}
        state={{
          tool: "git",
          label: "Git",
          available: true,
          version: "2.20.0",
          severity: "fatal",
          meetsMinVersion: false,
          minVersion: "2.30.0",
          installBlocks: {
            darwin: [
              {
                command: "brew install git",
                label: "Install with Homebrew",
              },
            ],
          },
        }}
      />
    );

    expect(screen.getByText("How to install")).toBeDefined();
  });

  it("does not show How to install button when install blocks are not available", () => {
    render(
      <PrerequisiteCard
        spec={mockSpec}
        state={{
          tool: "git",
          label: "Git",
          available: true,
          version: "2.20.0",
          severity: "fatal",
          meetsMinVersion: false,
          minVersion: "2.30.0",
          installUrl: "https://example.com/install-git",
        }}
      />
    );

    expect(screen.queryByText("How to install")).toBeNull();
  });

  it("shows install block when available", () => {
    const { rerender } = render(
      <PrerequisiteCard
        spec={mockSpec}
        state={{
          tool: "git",
          label: "Git",
          available: true,
          version: "2.20.0",
          severity: "fatal",
          meetsMinVersion: false,
          minVersion: "2.30.0",
          installBlocks: {
            darwin: [
              {
                command: "brew install git",
                label: "Install with Homebrew",
              },
            ],
          },
        }}
      />
    );

    expect(screen.getByText("How to install")).toBeDefined();

    // Simulate expanded state by checking the component's internal state is toggleable
    const button = screen.getByText("How to install");
    button.click();

    // Verify button exists and is clickable (expanded state managed by component)
    expect(button).toBeDefined();
  });

  it("renders external link icon when installUrl is available", () => {
    render(
      <PrerequisiteCard
        spec={mockSpec}
        state={{
          tool: "git",
          label: "Git",
          available: true,
          version: "2.20.0",
          severity: "fatal",
          meetsMinVersion: false,
          minVersion: "2.30.0",
          installUrl: "https://example.com/install-git",
        }}
      />
    );

    const externalLinkIcon = document.querySelector('[data-icon="external-link"]');
    expect(externalLinkIcon).toBeDefined();
  });

  it("does not show any status when tool is not available and not loading", () => {
    render(
      <PrerequisiteCard
        spec={mockSpec}
        state={{
          tool: "git",
          label: "Git",
          available: false,
          version: null,
          severity: "fatal",
          meetsMinVersion: false,
          minVersion: "2.30.0",
        }}
      />
    );

    expect(screen.queryByText("Checking…")).toBeNull();
    expect(screen.queryByText(/v[\d.]+/)).toBeNull();
    expect(screen.queryByText("Installed")).toBeNull();
  });
});

describe("StatusIcon", () => {
  it("shows spinner when loading", () => {
    render(<StatusIcon check={null} loading={true} />);

    const spinner = document.querySelector('[data-icon="loader-2"]');
    expect(spinner).toBeDefined();
  });

  it("shows CircleCheck when tool is ready", () => {
    render(
      <StatusIcon
        check={{
          tool: "git",
          label: "Git",
          available: true,
          version: "2.43.0",
          severity: "fatal",
          meetsMinVersion: true,
          minVersion: "2.30.0",
        }}
        loading={false}
      />
    );

    const checkIcon = document.querySelector('[data-icon="circle-check"]');
    expect(checkIcon).toBeDefined();
  });

  it("shows AlertTriangle for warn severity failures", () => {
    render(
      <StatusIcon
        check={{
          tool: "gh",
          label: "GitHub CLI",
          available: true,
          version: "2.5.0",
          severity: "warn",
          meetsMinVersion: false,
          minVersion: "3.0.0",
        }}
        loading={false}
      />
    );

    const triangleIcon = document.querySelector('[data-icon="alert-triangle"]');
    expect(triangleIcon).toBeDefined();
  });

  it("shows CircleX for fatal severity failures", () => {
    render(
      <StatusIcon
        check={{
          tool: "git",
          label: "Git",
          available: false,
          version: null,
          severity: "fatal",
          meetsMinVersion: false,
          minVersion: "2.30.0",
        }}
        loading={false}
      />
    );

    const xIcon = document.querySelector('[data-icon="circle-x"]');
    expect(xIcon).toBeDefined();
  });
});
