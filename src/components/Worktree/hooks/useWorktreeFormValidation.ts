import { useCallback } from "react";
import { parseBranchInput } from "../branchPrefixUtils";
import type { ErrorField } from "./useWorktreeFormErrors";

type BranchMode = "new" | "existing";

interface ValidationInput {
  branchMode: BranchMode;
  baseBranch: string;
  branchInput: string;
  selectedExistingBranch: string | null;
  worktreePath: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: {
    message: string;
    field: ErrorField | null;
  };
  fullBranchName?: string;
}

export function useWorktreeFormValidation() {
  const validate = useCallback(
    ({
      branchMode,
      baseBranch,
      branchInput,
      selectedExistingBranch,
      worktreePath,
    }: ValidationInput): ValidationResult => {
      if (branchMode === "existing") {
        if (!selectedExistingBranch) {
          return {
            valid: false,
            error: { message: "Please select a branch", field: null },
          };
        }
        if (!worktreePath.trim()) {
          return {
            valid: false,
            error: { message: "Please enter a worktree path", field: "worktree-path" },
          };
        }
        return { valid: true };
      }

      if (!baseBranch) {
        return {
          valid: false,
          error: { message: "Please select a base branch", field: "base-branch" },
        };
      }

      const trimmedInput = branchInput.trim();
      if (!trimmedInput) {
        return {
          valid: false,
          error: { message: "Please enter a branch name", field: "new-branch" },
        };
      }

      const parsed = parseBranchInput(trimmedInput);

      if (parsed.hasPrefix) {
        if (!parsed.slug || !parsed.slug.trim()) {
          return {
            valid: false,
            error: { message: "Please enter a branch name after the prefix", field: "new-branch" },
          };
        }
        if (
          /[\s.:]/.test(parsed.prefix) ||
          /^[.-]/.test(parsed.prefix) ||
          parsed.prefix.includes("..")
        ) {
          return {
            valid: false,
            error: { message: "Branch prefix contains invalid characters", field: "new-branch" },
          };
        }
        if (/[\s.]$/.test(parsed.slug) || /^[.-]/.test(parsed.slug)) {
          return {
            valid: false,
            error: {
              message: "Branch name cannot start with '.', '-' or end with space or '.'",
              field: "new-branch",
            },
          };
        }
        if (/[\\:]/.test(parsed.slug) || parsed.slug.includes("..")) {
          return {
            valid: false,
            error: { message: "Branch name contains invalid characters", field: "new-branch" },
          };
        }
      } else {
        if (/[\s.]$/.test(trimmedInput) || /^[.-]/.test(trimmedInput)) {
          return {
            valid: false,
            error: {
              message: "Branch name cannot start with '.', '-' or end with space or '.'",
              field: "new-branch",
            },
          };
        }
        if (/[/\\:]/.test(trimmedInput) || trimmedInput.includes("..")) {
          return {
            valid: false,
            error: { message: "Branch name contains invalid characters", field: "new-branch" },
          };
        }
      }

      if (!worktreePath.trim()) {
        return {
          valid: false,
          error: { message: "Please enter a worktree path", field: "worktree-path" },
        };
      }

      return { valid: true, fullBranchName: parsed.fullBranchName };
    },
    []
  );

  return { validate };
}
