import { createHash } from "crypto";
import type { Artifact } from "../types/index.js";
import {
  extractCodeBlocks,
  extractPatches,
  extractPatchFilename,
  suggestFilename,
} from "../../shared/utils/artifactParser.js";
export { stripAnsiCodes } from "../../shared/utils/artifactParser.js";

export function extractArtifacts(text: string, previousArtifacts: Artifact[] = []): Artifact[] {
  const artifacts: Artifact[] = [];
  const previousIds = new Set(previousArtifacts.map((a) => a.id));

  const codeBlocks = extractCodeBlocks(text);
  for (const block of codeBlocks) {
    const id = generateArtifactId(block.content);
    if (!previousIds.has(id)) {
      artifacts.push({
        id,
        type: "code",
        language: block.language,
        filename: suggestFilename(block.language, block.content),
        content: block.content,
        extractedAt: Date.now(),
      });
      previousIds.add(id);
    }
  }

  const patches = extractPatches(text);
  for (const patch of patches) {
    const id = generateArtifactId(patch);
    if (!previousIds.has(id)) {
      artifacts.push({
        id,
        type: "patch",
        filename: extractPatchFilename(patch),
        content: patch,
        extractedAt: Date.now(),
      });
      previousIds.add(id);
    }
  }

  return artifacts;
}

function generateArtifactId(content: string): string {
  return createHash("sha256").update(content).digest("hex").substring(0, 16);
}
