/** Interfaces with CopyTree SDK to generate codebase context for AI agents */

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
  private activeOperations = new Map<string, AbortController>();

  /** Generate context using CopyTree SDK */
  async generate(
    rootPath: string,
    options: CopyTreeOptions = {},
    onProgress?: ProgressCallback,
    traceId?: string
  ): Promise<CopyTreeResult> {
    const opId = crypto.randomUUID();
    const effectiveTraceId = traceId || opId;

    try {
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

      // Isolated config
      const config = await ConfigManager.create();

      // Map options to SDK
      const sdkOptions: SdkCopyOptions = {
        config: config,
        signal: controller.signal,
        display: false,
        clipboard: false,
        format: options.format || "xml",

        // Filter options
        filter: options.includePaths || options.filter || undefined,
        exclude: options.exclude || undefined,
        always: options.always,

        modified: options.modified,
        changed: options.changed,

        charLimit: options.charLimit,
        addLineNumbers: options.withLineNumbers,
        maxFileSize: options.maxFileSize,
        maxTotalSize: options.maxTotalSize,
        maxFileCount: options.maxFileCount,

        onProgress: onProgress
          ? (event: ProgressEvent) => {
              const controller = this.activeOperations.get(opId);
              if (!controller || controller.signal.aborted) return;

              const progress: CopyTreeProgress = {
                stage: event.stage || "Processing",
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
        progressThrottleMs: 100,
      };

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

  /** Cancel all operations */
  cancelAll(): void {
    for (const controller of this.activeOperations.values()) {
      controller.abort();
    }
    this.activeOperations.clear();
  }

  /** Cancel specific operation by ID */
  cancel(opId: string): boolean {
    const controller = this.activeOperations.get(opId);
    if (controller) {
      controller.abort();
      this.activeOperations.delete(opId);
      return true;
    }
    return false;
  }

  /** Handle SDK errors */
  private handleError(error: unknown): CopyTreeResult {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        content: "",
        fileCount: 0,
        error: "Context generation cancelled",
      };
    }

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

    return {
      content: "",
      fileCount: 0,
      error: `CopyTree Error: ${String(error)}`,
    };
  }

  /** Check availability (always true for bundled SDK) */
  async isAvailable(): Promise<boolean> {
    return true;
  }
}

/** Singleton instance of CopyTreeService */
export const copyTreeService = new CopyTreeService();
