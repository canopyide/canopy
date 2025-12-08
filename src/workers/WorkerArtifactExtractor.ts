/**
 * Browser-compatible artifact extractor using Web Crypto API.
 * Runs in Web Worker context - no Node.js APIs available.
 */

import type { Artifact } from "../../shared/types/ipc.js";
import {
  extractCodeBlocks,
  extractPatches,
  extractPatchFilename,
  suggestFilename,
} from "../../shared/utils/artifactParser.js";
export { stripAnsiCodes } from "../../shared/utils/artifactParser.js";

/**
 * Generate artifact ID using Web Crypto API (async).
 * Replaces Node.js crypto.createHash with browser-native crypto.subtle.
 */
async function generateArtifactId(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 16);
}

/**
 * Extract artifacts from text (async due to Web Crypto).
 * @param text - Text to analyze for artifacts
 * @param seenIds - Set of already-seen artifact IDs to avoid duplicates
 * @returns Array of newly detected artifacts
 */
export async function extractArtifacts(text: string, seenIds: Set<string>): Promise<Artifact[]> {
  const artifacts: Artifact[] = [];

  const codeBlocks = extractCodeBlocks(text);
  for (const block of codeBlocks) {
    const id = await generateArtifactId(block.content);
    if (!seenIds.has(id)) {
      artifacts.push({
        id,
        type: "code",
        language: block.language,
        filename: suggestFilename(block.language, block.content),
        content: block.content,
        extractedAt: Date.now(),
      });
      seenIds.add(id);
    }
  }

  const patches = extractPatches(text);
  for (const patch of patches) {
    const id = await generateArtifactId(patch);
    if (!seenIds.has(id)) {
      artifacts.push({
        id,
        type: "patch",
        filename: extractPatchFilename(patch),
        content: patch,
        extractedAt: Date.now(),
      });
      seenIds.add(id);
    }
  }

  return artifacts;
}
