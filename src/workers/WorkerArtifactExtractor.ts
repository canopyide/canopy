/**
 * Browser-compatible artifact extractor using Web Crypto API.
 * Runs in Web Worker context - no Node.js APIs available.
 */

import type { Artifact } from "../../shared/types/ipc.js";

interface CodeBlock {
  language: string;
  content: string;
}

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

function extractCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
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

function extractPatches(text: string): string[] {
  const patches: string[] = [];
  const lines = text.split("\n");
  let currentPatch: string[] = [];
  let inPatch = false;

  for (const line of lines) {
    if (line.startsWith("diff ") || line.startsWith("---")) {
      if (inPatch && currentPatch.length > 0) {
        patches.push(currentPatch.join("\n"));
      }
      currentPatch = [line];
      inPatch = true;
    } else if (inPatch) {
      if (
        line.startsWith("+++") ||
        line.startsWith("@@") ||
        line.startsWith("+") ||
        line.startsWith("-") ||
        line.startsWith(" ")
      ) {
        currentPatch.push(line);
      } else if (line.trim() === "") {
        currentPatch.push(line);
      } else {
        if (currentPatch.length > 3) {
          patches.push(currentPatch.join("\n"));
        }
        currentPatch = [];
        inPatch = false;
      }
    }
  }

  if (inPatch && currentPatch.length > 3) {
    patches.push(currentPatch.join("\n"));
  }

  return patches;
}

function extractPatchFilename(patch: string): string | undefined {
  const match = patch.match(/^\+\+\+ b\/(.+)$/m) || patch.match(/^---\s*a\/(.+)$/m);
  return match ? match[1] : undefined;
}

function suggestFilename(language: string, content: string): string | undefined {
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

  let name = "code";

  const classMatch = content.match(/(?:export\s+)?(?:class|interface)\s+(\w+)/);
  if (classMatch) {
    name = classMatch[1];
  }

  const functionMatch = content.match(/(?:export\s+)?(?:function|const)\s+(\w+)/);
  if (functionMatch && !classMatch) {
    name = functionMatch[1];
  }

  const pythonMatch = content.match(/(?:class|def)\s+(\w+)/);
  if (pythonMatch && language === "python") {
    name = pythonMatch[1];
  }

  return name + extension;
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

/**
 * Strip ANSI escape codes from text.
 */
export function stripAnsiCodes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}
