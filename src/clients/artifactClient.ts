/**
 * Artifact IPC Client
 *
 * Provides a typed interface for artifact-related IPC operations.
 * Wraps window.electron.artifact.* calls for testability and maintainability.
 */

import type {
  ArtifactDetectedPayload,
  SaveArtifactOptions,
  SaveArtifactResult,
  ApplyPatchOptions,
  ApplyPatchResult,
} from "@shared/types";

/**
 * Client for artifact IPC operations.
 *
 * @example
 * ```typescript
 * import { artifactClient } from "@/clients/artifactClient";
 *
 * const cleanup = artifactClient.onDetected((data) => console.log(data.artifacts));
 * const result = await artifactClient.saveToFile({ content: "code" });
 * ```
 */
export const artifactClient = {
  /** Subscribe to artifact detection events. Returns cleanup function. */
  onDetected: (callback: (data: ArtifactDetectedPayload) => void): (() => void) => {
    return window.electron.artifact.onDetected(callback);
  },

  /** Save an artifact to a file */
  saveToFile: (options: SaveArtifactOptions): Promise<SaveArtifactResult | null> => {
    return window.electron.artifact.saveToFile(options);
  },

  /** Apply a patch to files */
  applyPatch: (options: ApplyPatchOptions): Promise<ApplyPatchResult> => {
    return window.electron.artifact.applyPatch(options);
  },
} as const;
