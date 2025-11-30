/**
 * CopyTree Service
 *
 * Interfaces with the CopyTree SDK to generate context for AI agents.
 * CopyTree generates a text representation of a codebase suitable for injection
 * into AI chat interfaces.
 *
 * Uses the native SDK (npm install copytree) instead of spawning CLI processes,
 * enabling better performance, streaming support, and richer progress feedback.
 */

import { copy, ConfigManager } from "copytree";
import type { CopyResult, CopyOptions as SdkCopyOptions, ProgressEvent } from "copytree";
import * as path from "path";
import * as fs from "fs/promises";
import type { CopyTreeOptions, CopyTreeResult, CopyTreeProgress } from "../types/index.js";

// Re-export types for convenience
export type { CopyTreeOptions, CopyTreeResult, CopyTreeProgress };

/** Progress callback signature for context generation */
export type ProgressCallback = (progress: CopyTreeProgress) => void;

class CopyTreeService {
  // Track active operations for cancellation
  private activeOperations = new Map<string, AbortController>();

  /**
   * Generate context for a worktree using the native CopyTree SDK
   *
   * @param rootPath - Absolute path to the worktree root
   * @param options - CopyTree options (format, filters, etc.)
   * @param onProgress - Optional callback for progress updates
   * @param traceId - Optional trace ID for event correlation
   * @returns CopyTreeResult with content, file count, and optional error
   */
  async generate(
    rootPath: string,
    options: CopyTreeOptions = {},
    onProgress?: ProgressCallback,
    traceId?: string
  ): Promise<CopyTreeResult> {
    const opId = crypto.randomUUID();
    const effectiveTraceId = traceId || opId;

    try {
      // Validation
      if (!path.isAbsolute(rootPath)) {
        return {
          content: "",
          fileCount: 0,
          error: "rootPath must be an absolute path",
        };
      }

      try {
        await fs.access(rootPath);
      } catch {
        return {
          content: "",
          fileCount: 0,
          error: `Path does not exist or is not accessible: ${rootPath}`,
        };
      }

      // Setup cancellation
      const controller = new AbortController();
      this.activeOperations.set(opId, controller);

      // Create isolated configuration for concurrent operations
      // Pass cwd to ensure gitignore and config are read from the worktree root
      const config = await ConfigManager.create();

      // Map IPC options to SDK options
      const sdkOptions: SdkCopyOptions = {
        // Core settings
        config: config,
        signal: controller.signal,

        // Output settings (CLI side effects disabled)
        display: false,
        clipboard: false,
        format: options.format || "xml",

        // Filtering
        // If includePaths is provided, use it as the filter (replaces any existing filter)
        // Otherwise, use the filter option as-is
        filter: options.includePaths || options.filter || undefined,
        exclude: options.exclude || undefined,
        always: options.always,

        // Git
        modified: options.modified,
        changed: options.changed,

        // Limits & Formatting
        charLimit: options.charLimit,
        addLineNumbers: options.withLineNumbers,
        maxFileSize: options.maxFileSize,
        maxTotalSize: options.maxTotalSize,
        maxFileCount: options.maxFileCount,

        // Progress reporting
        onProgress: onProgress
          ? (event: ProgressEvent) => {
              // Don't emit progress if operation was cancelled
              const controller = this.activeOperations.get(opId);
              if (!controller || controller.signal.aborted) return;

              const progress: CopyTreeProgress = {
                stage: event.stage || "Processing",
                // Clamp percent to [0, 100] and convert to [0, 1]
                progress: Math.max(0, Math.min(100, event.percent || 0)) / 100,
                message: event.message || `Processing: ${event.stage || "files"}`,
                filesProcessed: event.filesProcessed,
                totalFiles: event.totalFiles,
                currentFile: event.currentFile,
                traceId: effectiveTraceId,
              };
              onProgress(progress);
            }
          : undefined,
        progressThrottleMs: 100, // Throttle to 10 updates per second max

        // Profile loading (SDK auto-loads .copytree.yml from rootPath)
        // The profile option is kept for future explicit profile support
      };

      // Execute via SDK
      const result: CopyResult = await copy(rootPath, sdkOptions);

      return {
        content: result.output,
        fileCount: result.stats.totalFiles,
        stats: {
          totalSize: result.stats.totalSize,
          duration: result.stats.duration,
        },
      };
    } catch (error: unknown) {
      return this.handleError(error);
    } finally {
      this.activeOperations.delete(opId);
    }
  }

  /**
   * Cancel all running context generations
   */
  cancelAll(): void {
    for (const controller of this.activeOperations.values()) {
      controller.abort();
    }
    this.activeOperations.clear();
  }

  /**
   * Cancel a specific operation by ID (if we expose operation IDs in future)
   */
  cancel(opId: string): boolean {
    const controller = this.activeOperations.get(opId);
    if (controller) {
      controller.abort();
      this.activeOperations.delete(opId);
      return true;
    }
    return false;
  }

  /**
   * Handle errors from SDK operations
   */
  private handleError(error: unknown): CopyTreeResult {
    // Handle cancellation
    if (error instanceof Error && error.name === "AbortError") {
      return {
        content: "",
        fileCount: 0,
        error: "Context generation cancelled",
      };
    }

    // Handle SDK specific errors by name (avoid importing broken error classes)
    if (error instanceof Error) {
      const errorName = error.name;
      const errorCode = (error as Error & { code?: string }).code;

      if (errorName === "ValidationError") {
        return {
          content: "",
          fileCount: 0,
          error: `Validation Error: ${error.message}`,
        };
      }

      if (errorName === "CopyTreeError" || errorCode) {
        return {
          content: "",
          fileCount: 0,
          error: `CopyTree Error${errorCode ? ` [${errorCode}]` : ""}: ${error.message}`,
        };
      }

      return {
        content: "",
        fileCount: 0,
        error: `CopyTree Error: ${error.message}`,
      };
    }

    // Generic error
    return {
      content: "",
      fileCount: 0,
      error: `CopyTree Error: ${String(error)}`,
    };
  }

  /**
   * SDK is bundled, so it is always available.
   * This method is kept for backwards compatibility but always returns true.
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }
}

/** Singleton instance of CopyTreeService */
export const copyTreeService = new CopyTreeService();
