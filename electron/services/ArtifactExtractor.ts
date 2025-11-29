/**
 * ArtifactExtractor
 *
 * Detects and extracts artifacts from agent terminal output.
 * Artifacts include code blocks, diffs/patches, file writes, and summaries.
 */

import { createHash } from "crypto";
import type { Artifact } from "../ipc/types.js";

/**
 * Extract artifacts from a text buffer
 * @param text - The raw text to extract artifacts from
 * @param previousArtifacts - Previously extracted artifacts (to avoid duplicates)
 * @returns Array of newly extracted artifacts
 */
export function extractArtifacts(text: string, previousArtifacts: Artifact[] = []): Artifact[] {
  const artifacts: Artifact[] = [];
  const previousIds = new Set(previousArtifacts.map((a) => a.id));

  // Extract code blocks (```language ... ```)
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

  // Extract diffs/patches
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

interface CodeBlock {
  language: string;
  content: string;
}

/**
 * Extract fenced code blocks from text
 */
function extractCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  // Match ```language\ncontent\n``` with proper escaping
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const language = match[1] || "text";
    const content = match[2].trim();
    if (content) {
      blocks.push({ language, content });
    }
  }

  return blocks;
}

/**
 * Extract diff/patch blocks from text
 * Detects unified diff format (diff, ---, +++, @@)
 */
function extractPatches(text: string): string[] {
  const patches: string[] = [];
  const lines = text.split("\n");
  let currentPatch: string[] = [];
  let inPatch = false;

  for (const line of lines) {
    // Start of patch (diff or --- line)
    if (line.startsWith("diff ") || line.startsWith("--- ")) {
      if (inPatch && currentPatch.length > 0) {
        // Save previous patch
        patches.push(currentPatch.join("\n"));
      }
      currentPatch = [line];
      inPatch = true;
    } else if (inPatch) {
      // Continue accumulating patch lines
      if (
        line.startsWith("+++") ||
        line.startsWith("@@") ||
        line.startsWith("+") ||
        line.startsWith("-") ||
        line.startsWith(" ")
      ) {
        currentPatch.push(line);
      } else if (line.trim() === "") {
        // Allow blank lines in patches
        currentPatch.push(line);
      } else {
        // End of patch
        if (currentPatch.length > 3) {
          // Only save if it has meaningful content
          patches.push(currentPatch.join("\n"));
        }
        currentPatch = [];
        inPatch = false;
      }
    }
  }

  // Save final patch if exists
  if (inPatch && currentPatch.length > 3) {
    patches.push(currentPatch.join("\n"));
  }

  return patches;
}

/**
 * Extract filename from a patch/diff
 */
function extractPatchFilename(patch: string): string | undefined {
  // Look for +++ b/filename or --- a/filename
  const match = patch.match(/^\+\+\+ b\/(.+)$/m) || patch.match(/^--- a\/(.+)$/m);
  return match ? match[1] : undefined;
}

/**
 * Suggest a filename based on language and content
 */
function suggestFilename(language: string, content: string): string | undefined {
  // Try to detect filename from content (e.g., class name, function name)
  const extensionMap: Record<string, string> = {
    typescript: ".ts",
    javascript: ".js",
    tsx: ".tsx",
    jsx: ".jsx",
    python: ".py",
    ruby: ".rb",
    rust: ".rs",
    go: ".go",
    java: ".java",
    cpp: ".cpp",
    c: ".c",
    html: ".html",
    css: ".css",
    json: ".json",
    yaml: ".yaml",
    yml: ".yml",
    markdown: ".md",
    sql: ".sql",
    bash: ".sh",
    shell: ".sh",
  };

  const extension = extensionMap[language.toLowerCase()];
  if (!extension) {
    return undefined;
  }

  // Try to extract class/function/component name for better filename
  let name = "code";

  // TypeScript/JavaScript class
  const classMatch = content.match(/(?:export\s+)?(?:class|interface)\s+(\w+)/);
  if (classMatch) {
    name = classMatch[1];
  }

  // TypeScript/JavaScript function
  const functionMatch = content.match(/(?:export\s+)?(?:function|const)\s+(\w+)/);
  if (functionMatch && !classMatch) {
    name = functionMatch[1];
  }

  // Python class or function
  const pythonMatch = content.match(/(?:class|def)\s+(\w+)/);
  if (pythonMatch && language === "python") {
    name = pythonMatch[1];
  }

  return name + extension;
}

/**
 * Generate a stable ID for an artifact based on its content
 */
function generateArtifactId(content: string): string {
  return createHash("sha256").update(content).digest("hex").substring(0, 16);
}

/**
 * Strip ANSI escape codes from text before artifact extraction
 * This ensures clean artifacts without terminal formatting
 */
export function stripAnsiCodes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}
