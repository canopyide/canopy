/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWorktreeFormErrors } from "../useWorktreeFormErrors";

describe("useWorktreeFormErrors", () => {
  it("initializes with null errors and untouched fields", () => {
    const { result } = renderHook(() => useWorktreeFormErrors());

    expect(result.current.errors.validationError).toBeNull();
    expect(result.current.errors.errorField).toBeNull();
    expect(result.current.errors.creationError).toBeNull();
    expect(result.current.errors.touchedFields.branchInput).toBe(false);
    expect(result.current.errors.touchedFields.worktreePath).toBe(false);
    expect(result.current.errors.touchedFields.recipe).toBe(false);
    expect(result.current.errors.touchedFields.issue).toBe(false);
  });

  it("setValidationError sets message and field, clears creationError", () => {
    const { result } = renderHook(() => useWorktreeFormErrors());

    act(() => {
      result.current.setValidationError("Branch name required", "new-branch");
    });

    expect(result.current.errors.validationError).toBe("Branch name required");
    expect(result.current.errors.errorField).toBe("new-branch");
    expect(result.current.errors.creationError).toBeNull();
  });

  it("clearErrors clears all error state", () => {
    const { result } = renderHook(() => useWorktreeFormErrors());

    act(() => {
      result.current.setValidationError("test error", "new-branch");
    });
    act(() => {
      result.current.clearErrors();
    });

    expect(result.current.errors.validationError).toBeNull();
    expect(result.current.errors.errorField).toBeNull();
    expect(result.current.errors.creationError).toBeNull();
  });

  it("setCreationError sets creation error and clears validation", () => {
    const { result } = renderHook(() => useWorktreeFormErrors());

    act(() => {
      result.current.setValidationError("before", "new-branch");
    });
    act(() => {
      result.current.setCreationError({
        friendly: "Creation failed",
        raw: "Error: Creation failed",
        recovery: undefined,
      });
    });

    expect(result.current.errors.validationError).toBeNull();
    expect(result.current.errors.errorField).toBeNull();
    expect(result.current.errors.creationError?.friendly).toBe("Creation failed");
  });

  it("markTouched updates specific touched field", () => {
    const { result } = renderHook(() => useWorktreeFormErrors());

    act(() => {
      result.current.markTouched("branchInput");
    });

    expect(result.current.errors.touchedFields.branchInput).toBe(true);
    expect(result.current.errors.touchedFields.worktreePath).toBe(false);
    expect(result.current.errors.touchedFields.recipe).toBe(false);
  });

  it("resetErrors returns to initial state", () => {
    const { result } = renderHook(() => useWorktreeFormErrors());

    act(() => {
      result.current.setValidationError("err", "base-branch");
      result.current.markTouched("branchInput");
      result.current.markTouched("worktreePath");
    });
    act(() => {
      result.current.resetErrors();
    });

    expect(result.current.errors.validationError).toBeNull();
    expect(result.current.errors.errorField).toBeNull();
    expect(result.current.errors.touchedFields.branchInput).toBe(false);
    expect(result.current.errors.touchedFields.worktreePath).toBe(false);
  });

  it("isFormDirty returns true when any field is touched", () => {
    const { result } = renderHook(() => useWorktreeFormErrors());

    expect(result.current.isFormDirty()).toBe(false);

    act(() => {
      result.current.markTouched("recipe");
    });

    expect(result.current.isFormDirty()).toBe(true);
  });

  it("isFormDirty returns false when no fields touched", () => {
    const { result } = renderHook(() => useWorktreeFormErrors());
    expect(result.current.isFormDirty()).toBe(false);
  });

  it("setValidationError with null field works", () => {
    const { result } = renderHook(() => useWorktreeFormErrors());

    act(() => {
      result.current.setValidationError("General error", null);
    });

    expect(result.current.errors.validationError).toBe("General error");
    expect(result.current.errors.errorField).toBeNull();
  });
});
