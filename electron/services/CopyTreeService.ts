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

import { copy, ConfigManager, CopyTreeError, ValidationError } from 'copytree';
import type { CopyResult, CopyOptions as SdkCopyOptions } from 'copytree';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { CopyTreeOptions, CopyTreeResult } from '../ipc/types.js';

// Re-export types for convenience
export type { CopyTreeOptions, CopyTreeResult };

class CopyTreeService {
  // Track active operations for cancellation
  private activeOperations = new Map<string, AbortController>();

  /**
   * Generate context for a worktree using the native CopyTree SDK
   *
   * @param rootPath - Absolute path to the worktree root
   * @param options - CopyTree options (format, filters, etc.)
   * @returns CopyTreeResult with content, file count, and optional error
   */
  async generate(rootPath: string, options: CopyTreeOptions = {}): Promise<CopyTreeResult> {
    const opId = crypto.randomUUID();

    try {
      // Validation
      if (!path.isAbsolute(rootPath)) {
        return {
          content: '',
          fileCount: 0,
          error: 'rootPath must be an absolute path',
        };
      }

      try {
        await fs.access(rootPath);
      } catch {
        return {
          content: '',
          fileCount: 0,
          error: `Path does not exist or is not accessible: ${rootPath}`,
        };
      }

      // Setup cancellation
      const controller = new AbortController();
      this.activeOperations.set(opId, controller);

      // Create isolated configuration for concurrent operations
      const config = await ConfigManager.create();

      // Map IPC options to SDK options
      const sdkOptions: SdkCopyOptions = {
        // Core settings
        config: config,
        signal: controller.signal,

        // Output settings (CLI side effects disabled)
        display: false,
        clipboard: false,
        format: options.format || 'xml',

        // Filtering
        filter: options.filter,
        exclude: options.exclude,
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
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        content: '',
        fileCount: 0,
        error: 'Context generation cancelled',
      };
    }

    // Handle SDK specific errors
    if (error instanceof ValidationError) {
      return {
        content: '',
        fileCount: 0,
        error: `Validation Error: ${error.message}`,
      };
    }

    if (error instanceof CopyTreeError) {
      return {
        content: '',
        fileCount: 0,
        error: `CopyTree Error [${error.code}]: ${error.message}`,
      };
    }

    // Generic error
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: '',
      fileCount: 0,
      error: `CopyTree Error: ${message}`,
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
