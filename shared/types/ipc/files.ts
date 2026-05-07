import type { AppErrorCode } from "../appError.js";

export interface FileSearchPayload {
  cwd: string;
  query: string;
  limit?: number;
}

export interface FileSearchResult {
  files: string[];
}

export interface FileReadPayload {
  path: string;
  rootPath: string;
}

/**
 * Subset of `AppErrorCode` thrown by `files:read`. Renderer consumers narrow
 * caught `AppError`s with `if (e.code === "BINARY_FILE") { ... }` style checks.
 */
// `_AssertSubset<T, U>` constrains `U extends T` and returns `U`. Wrapping
// `FileReadErrorCode` in it makes the subset relationship a hard compile-time
// guarantee — if any member is dropped from `AppErrorCode`, this fails to
// typecheck.
type _AssertSubset<T, U extends T> = U;

export type FileReadErrorCode = _AssertSubset<
  AppErrorCode,
  | "BINARY_FILE"
  | "FILE_TOO_LARGE"
  | "LFS_POINTER"
  | "NOT_FOUND"
  | "OUTSIDE_ROOT"
  | "INVALID_PATH"
  | "PERMISSION"
>;

export interface FileReadResult {
  content: string;
}
