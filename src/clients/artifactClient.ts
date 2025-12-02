import type {
  ArtifactDetectedPayload,
  SaveArtifactOptions,
  SaveArtifactResult,
  ApplyPatchOptions,
  ApplyPatchResult,
} from "@shared/types";

/**
 * @example
 * const cleanup = artifactClient.onDetected((data) => console.log(data.artifacts));
 * const result = await artifactClient.saveToFile({ content: "code" });
 */
export const artifactClient = {
  onDetected: (callback: (data: ArtifactDetectedPayload) => void): (() => void) => {
    return window.electron.artifact.onDetected(callback);
  },

  saveToFile: (options: SaveArtifactOptions): Promise<SaveArtifactResult | null> => {
    return window.electron.artifact.saveToFile(options);
  },

  applyPatch: (options: ApplyPatchOptions): Promise<ApplyPatchResult> => {
    return window.electron.artifact.applyPatch(options);
  },
} as const;
