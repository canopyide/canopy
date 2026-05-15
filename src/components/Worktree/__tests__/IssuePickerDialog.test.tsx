/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { WorktreeState } from "@/types";
import { IssuePickerDialog } from "../IssuePickerDialog";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const { listIssuesMock } = vi.hoisted(() => ({
  listIssuesMock: vi.fn(),
}));

vi.mock("@/clients", () => ({
  githubClient: {
    listIssues: listIssuesMock,
  },
}));

vi.mock("@/components/ui/AppDialog", () => {
  const Dialog = ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div data-testid="issue-picker-dialog">{children}</div> : null;
  Dialog.Header = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Dialog.Title = ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>;
  Dialog.CloseButton = () => <button type="button">close</button>;
  Dialog.Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return { AppDialog: Dialog };
});

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  listIssuesMock.mockReset();
});

const worktree = { path: "/repo" } as WorktreeState;

function renderDialog() {
  return render(
    <IssuePickerDialog
      isOpen
      onClose={() => {}}
      worktree={worktree}
      onAttach={() => {}}
      onDetach={() => {}}
    />
  );
}

describe("IssuePickerDialog empty states", () => {
  it("renders zero-data EmptyState when no issues and no query", async () => {
    listIssuesMock.mockResolvedValue({ items: [] });
    renderDialog();
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("No issues found");
    });
  });

  it("renders filtered-empty EmptyState with interpolated query", async () => {
    listIssuesMock.mockResolvedValue({ items: [] });
    renderDialog();
    await waitFor(() => screen.getByRole("status"));

    fireEvent.change(screen.getByPlaceholderText("Search issues by title or number..."), {
      target: { value: "foobar" },
    });

    await waitFor(
      () => {
        expect(screen.getByRole("status").textContent).toContain('No matches for "foobar"');
      },
      { timeout: 2000 }
    );
  });

  it("keeps the error state as a non-EmptyState banner", async () => {
    listIssuesMock.mockRejectedValue(new Error("boom"));
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText(/boom|Failed to load issues/)).toBeTruthy();
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
