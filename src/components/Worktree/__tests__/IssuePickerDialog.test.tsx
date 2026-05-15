/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { IssuePickerDialog } from "../IssuePickerDialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { GitHubIssue } from "@shared/types/github";
import type { WorktreeState } from "@/types";

const mockListIssues = vi.fn();

vi.mock("@/clients/githubClient", () => ({
  githubClient: {
    listIssues: (opts: unknown) => mockListIssues(opts),
  },
}));

const mockIssue = (overrides: Partial<GitHubIssue> = {}): GitHubIssue => ({
  number: 1,
  title: "Test issue",
  state: "OPEN",
  url: "https://github.com/test/repo/issues/1",
  updatedAt: "2025-01-01T00:00:00Z",
  author: { login: "testuser", avatarUrl: "" },
  commentCount: 0,
  assignees: [],
  ...overrides,
});

const worktree = { path: "/test/project" } as WorktreeState;

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  worktree,
  onAttach: vi.fn(),
  onDetach: vi.fn(),
};

describe("IssuePickerDialog", () => {
  beforeEach(() => {
    mockListIssues.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not show the spinner before the 400ms Doherty gate, then shows it while still loading", async () => {
    mockListIssues.mockReturnValue(new Promise(() => {}));

    render(<IssuePickerDialog {...defaultProps} />, { wrapper: TooltipProvider });

    // Before the gate elapses there is no spinner (sub-threshold guard renders null)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.queryByText("Loading issues...")).toBeNull();

    // After the 400ms gate, the spinner appears since the fetch is still pending
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.getByText("Loading issues...")).toBeDefined();
  });

  it("never shows the spinner when the fetch resolves before the gate and renders the zero-data EmptyState", async () => {
    mockListIssues.mockResolvedValue({ items: [] });

    render(<IssuePickerDialog {...defaultProps} />, { wrapper: TooltipProvider });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.queryByText("Loading issues...")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.queryByText("Loading issues...")).toBeNull();
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No issues found");
  });

  it("renders the filtered-empty EmptyState with the query when a search yields no results", async () => {
    mockListIssues.mockResolvedValue({ items: [] });

    render(<IssuePickerDialog {...defaultProps} />, { wrapper: TooltipProvider });

    const input = screen.getByPlaceholderText("Search issues by title or number...");
    fireEvent.change(input, { target: { value: "nonexistent" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    const status = screen.getByRole("status");
    expect(status.textContent).toContain('No matches for "nonexistent"');
  });

  it("renders an inline error alert with a Retry button that refetches", async () => {
    mockListIssues.mockRejectedValue(new Error("boom"));

    render(<IssuePickerDialog {...defaultProps} />, { wrapper: TooltipProvider });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("boom");

    mockListIssues.mockResolvedValue({ items: [mockIssue()] });
    const retry = screen.getByRole("button", { name: /retry/i });

    await act(async () => {
      fireEvent.click(retry);
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(screen.getByRole("option", { name: /test issue/i })).toBeDefined();
  });

  it("trims the search term before sending it to the client", async () => {
    mockListIssues.mockResolvedValue({ items: [] });

    render(<IssuePickerDialog {...defaultProps} />, { wrapper: TooltipProvider });

    const input = screen.getByPlaceholderText("Search issues by title or number...");
    fireEvent.change(input, { target: { value: "  bug  " } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(mockListIssues).toHaveBeenCalledWith(
      expect.objectContaining({ search: "bug", state: "open" })
    );
  });

  it("treats a whitespace-only query as no search and shows the zero-data state", async () => {
    mockListIssues.mockResolvedValue({ items: [] });

    render(<IssuePickerDialog {...defaultProps} />, { wrapper: TooltipProvider });

    const input = screen.getByPlaceholderText("Search issues by title or number...");
    fireEvent.change(input, { target: { value: "   " } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(mockListIssues).toHaveBeenLastCalledWith(expect.objectContaining({ search: undefined }));
    expect(screen.getByRole("status").textContent).toContain("No issues found");
  });

  it("truncates an overly long query in the filtered-empty title", async () => {
    mockListIssues.mockResolvedValue({ items: [] });

    render(<IssuePickerDialog {...defaultProps} />, { wrapper: TooltipProvider });

    const longQuery = "x".repeat(80);
    const input = screen.getByPlaceholderText("Search issues by title or number...");
    fireEvent.change(input, { target: { value: longQuery } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("…");
    expect(status.textContent).not.toContain("x".repeat(80));
  });
});
