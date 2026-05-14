/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIssueSelection } from "../useIssueSelection";
import { useIssueSelectionStore } from "@/store/issueSelectionStore";

const PROJECT = "/test/project";

describe("useIssueSelection", () => {
  beforeEach(() => {
    useIssueSelectionStore.setState({ selections: new Map() });
  });

  it("starts with empty selection", () => {
    const { result } = renderHook(() => useIssueSelection("issue", PROJECT));
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.isSelectionActive).toBe(false);
  });

  it("toggles an item on and off", () => {
    const { result } = renderHook(() => useIssueSelection("issue", PROJECT));

    act(() => result.current.toggle(42, 0));
    expect(result.current.selectedIds.has(42)).toBe(true);
    expect(result.current.isSelectionActive).toBe(true);

    act(() => result.current.toggle(42, 0));
    expect(result.current.selectedIds.has(42)).toBe(false);
    expect(result.current.isSelectionActive).toBe(false);
  });

  it("selects multiple items independently", () => {
    const { result } = renderHook(() => useIssueSelection("issue", PROJECT));

    act(() => result.current.toggle(1, 0));
    act(() => result.current.toggle(2, 1));
    act(() => result.current.toggle(3, 2));

    expect(result.current.selectedIds.size).toBe(3);
    expect(result.current.selectedIds.has(1)).toBe(true);
    expect(result.current.selectedIds.has(2)).toBe(true);
    expect(result.current.selectedIds.has(3)).toBe(true);
  });

  it("selects a range from the last toggled item", () => {
    const { result } = renderHook(() => useIssueSelection("issue", PROJECT));
    const getIdAt = (i: number) => [10, 20, 30, 40, 50][i]!;

    // Select item at index 1
    act(() => result.current.toggle(20, 1));
    // Shift-click at index 4
    act(() => result.current.toggleRange(4, getIdAt));

    expect(result.current.selectedIds.has(20)).toBe(true);
    expect(result.current.selectedIds.has(30)).toBe(true);
    expect(result.current.selectedIds.has(40)).toBe(true);
    expect(result.current.selectedIds.has(50)).toBe(true);
  });

  it("handles reverse range selection", () => {
    const { result } = renderHook(() => useIssueSelection("issue", PROJECT));
    const getIdAt = (i: number) => [10, 20, 30, 40, 50][i]!;

    act(() => result.current.toggle(50, 4));
    act(() => result.current.toggleRange(1, getIdAt));

    expect(result.current.selectedIds.has(20)).toBe(true);
    expect(result.current.selectedIds.has(30)).toBe(true);
    expect(result.current.selectedIds.has(40)).toBe(true);
    expect(result.current.selectedIds.has(50)).toBe(true);
  });

  it("selects all items", () => {
    const { result } = renderHook(() => useIssueSelection("issue", PROJECT));

    act(() => result.current.selectAll([1, 2, 3, 4, 5]));
    expect(result.current.selectedIds.size).toBe(5);
  });

  it("clears all selection", () => {
    const { result } = renderHook(() => useIssueSelection("issue", PROJECT));

    act(() => result.current.selectAll([1, 2, 3]));
    expect(result.current.selectedIds.size).toBe(3);

    act(() => result.current.clear());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.isSelectionActive).toBe(false);
  });

  it("range select without prior anchor defaults to single toggle", () => {
    const { result } = renderHook(() => useIssueSelection("issue", PROJECT));
    const getIdAt = (i: number) => [10, 20, 30][i]!;

    // No prior toggle, so no anchor — should fall back to single toggle
    act(() => result.current.toggleRange(2, getIdAt));
    expect(result.current.selectedIds.has(30)).toBe(true);
    expect(result.current.selectedIds.size).toBe(1);
  });

  it("clear is idempotent when selection is already empty", () => {
    const { result } = renderHook(() => useIssueSelection("issue", PROJECT));

    const initialIds = result.current.selectedIds;
    expect(initialIds.size).toBe(0);

    act(() => result.current.clear());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.selectedIds).toBe(initialIds);

    act(() => result.current.clear());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.selectedIds).toBe(initialIds);
  });

  it("isolates selection by type and project path", () => {
    const issuesA = renderHook(() => useIssueSelection("issue", "/proj/a"));
    const prsA = renderHook(() => useIssueSelection("pr", "/proj/a"));
    const issuesB = renderHook(() => useIssueSelection("issue", "/proj/b"));

    act(() => issuesA.result.current.toggle(1, 0));

    expect(issuesA.result.current.selectedIds.has(1)).toBe(true);
    expect(prsA.result.current.selectedIds.size).toBe(0);
    expect(issuesB.result.current.selectedIds.size).toBe(0);
  });

  it("clear reaches the same selection regardless of which hook instance calls it", () => {
    // Mirrors the bulk-create flow: the dropdown hands its `clear` to the
    // dialog, then may remount before "Done" fires. A stale-but-key-bound
    // clear must still empty the live selection.
    const first = renderHook(() => useIssueSelection("issue", PROJECT));
    act(() => first.result.current.selectAll([1, 2, 3]));
    const staleClear = first.result.current.clear;
    first.unmount();

    const second = renderHook(() => useIssueSelection("issue", PROJECT));
    expect(second.result.current.selectedIds.size).toBe(3);

    act(() => staleClear());
    expect(second.result.current.selectedIds.size).toBe(0);
  });

  it("clear resets the range anchor", () => {
    const { result } = renderHook(() => useIssueSelection("issue", PROJECT));
    const getIdAt = (i: number) => [10, 20, 30][i]!;

    act(() => result.current.toggle(20, 1));
    act(() => result.current.clear());
    // No anchor after clear — range select falls back to a single toggle.
    act(() => result.current.toggleRange(2, getIdAt));

    expect(result.current.selectedIds.size).toBe(1);
    expect(result.current.selectedIds.has(30)).toBe(true);
  });

  it("keeps range anchors isolated per key", () => {
    const a = renderHook(() => useIssueSelection("issue", "/proj/a"));
    const b = renderHook(() => useIssueSelection("issue", "/proj/b"));
    const getIdAt = (i: number) => [10, 20, 30, 40][i]!;

    act(() => a.result.current.toggle(20, 1)); // anchor on /proj/a only
    // /proj/b has no anchor → single toggle, unaffected by /proj/a's anchor.
    act(() => b.result.current.toggleRange(3, getIdAt));

    expect(b.result.current.selectedIds.size).toBe(1);
    expect(b.result.current.selectedIds.has(40)).toBe(true);
  });

  it("two hooks on the same key observe each other's mutations", () => {
    const first = renderHook(() => useIssueSelection("issue", PROJECT));
    const second = renderHook(() => useIssueSelection("issue", PROJECT));

    act(() => first.result.current.toggle(7, 0));
    expect(second.result.current.selectedIds.has(7)).toBe(true);

    act(() => second.result.current.clear());
    expect(first.result.current.selectedIds.size).toBe(0);
  });
});
