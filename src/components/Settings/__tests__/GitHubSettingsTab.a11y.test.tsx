// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { GitHubSettingsTab } from "../GitHubSettingsTab";

vi.mock("@/store", () => ({
  useGitHubConfigStore: vi.fn(),
}));

vi.mock("@/services/ActionService", () => ({
  actionService: {
    dispatch: vi.fn(() => new Promise(() => {})),
  },
}));

import { useGitHubConfigStore } from "@/store";

const mockedUseGitHubConfigStore = vi.mocked(useGitHubConfigStore);

function setupStore(overrides: Record<string, unknown> = {}) {
  mockedUseGitHubConfigStore.mockReturnValue({
    config: { hasToken: false, owner: null, repo: null },
    isLoading: false,
    error: null,
    initialize: vi.fn(),
    updateConfig: vi.fn(),
    ...overrides,
  } as any);
}

describe("GitHubSettingsTab accessibility", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("password input has an accessible name and autoComplete", () => {
    render(<GitHubSettingsTab />);
    const input = screen.getByLabelText(/github personal access token/i);
    expect(input).toBeTruthy();
    expect(input.getAttribute("type")).toBe("password");
    expect(input.getAttribute("autocomplete")).toBe("new-password");
  });

  it("Test button has aria-label and aria-busy=false when idle", () => {
    render(<GitHubSettingsTab />);
    const btn = screen.getByRole("button", { name: "Test token" });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-busy")).toBe("false");
  });

  it("Save button has aria-label and aria-busy=false when idle", () => {
    render(<GitHubSettingsTab />);
    const btn = screen.getByRole("button", { name: "Save token" });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-busy")).toBe("false");
  });

  it("decorative icons inside buttons have aria-hidden", () => {
    render(<GitHubSettingsTab />);
    const testBtn = screen.getByRole("button", { name: "Test token" });
    const svgs = testBtn.querySelectorAll("svg");
    for (const svg of svgs) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
