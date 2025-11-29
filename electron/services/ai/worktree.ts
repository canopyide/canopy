/**
 * AI-powered worktree summary generation
 *
 * Generates concise, contextual summaries of git changes in worktrees
 * using OpenAI's API.
 */

import { simpleGit } from "simple-git";
import * as fs from "fs/promises";
import * as path from "path";
import type { WorktreeChanges } from "../../types/index.js";
import { getAIClient, getAIModel } from "./client.js";
import { extractOutputText, formatErrorSnippet, withRetry } from "./utils.js";

export interface WorktreeSummary {
  summary: string;
  modifiedCount: number;
}

const MAX_WORDS = 10;

/**
 * Normalize summary text to a single line with max word count
 */
function normalizeSummary(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  let compressed = firstLine.replace(/\s+/g, " ").trim();
  if (!compressed) return "";

  // Ensure space after emoji before alphanumeric characters
  compressed = compressed.replace(/([\u{80}-\u{10ffff}])([a-zA-Z0-9])/gu, "$1 $2");

  const words = compressed.split(" ").slice(0, MAX_WORDS);
  return words.join(" ");
}

/**
 * Resilient JSON parser for summary responses
 */
function parseSummaryJSON(text: string): string | null {
  // First try: standard JSON parsing
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.summary === "string") {
      return parsed.summary.replace(/\s+/g, " ").trim();
    }
  } catch {
    // Fall through to regex parsing
  }

  // Second try: regex extraction
  const patterns = [
    /"summary"\s*:\s*"([^"]+)"/,
    /"summary"\s*:\s*'([^']+)'/,
    /'summary'\s*:\s*"([^"]+)"/,
    /'summary'\s*:\s*'([^']+)'/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/\s+/g, " ").trim();
    }
  }

  // Third try: look for any quoted string after "summary"
  const laxMatch = text.match(/"summary"[^"']*["']([^"']+)["']/);
  if (laxMatch?.[1]) {
    return laxMatch[1].replace(/\s+/g, " ").trim();
  }

  return null;
}

/**
 * Generate AI summary for worktree changes
 *
 * @param worktreePath - Absolute path to worktree
 * @param branch - Branch name (used for context)
 * @param mainBranch - Main branch to compare against
 * @param changes - Optional WorktreeChanges with file-level details
 * @returns Summary and modified file count, or null if AI client is unavailable
 */
export async function generateWorktreeSummary(
  worktreePath: string,
  branch: string | undefined,
  _mainBranch: string = "main",
  changes?: WorktreeChanges
): Promise<WorktreeSummary | null> {
  const git = simpleGit(worktreePath);
  let modifiedCount = 0;
  let promptContext = "";
  const mechanicalNewFiles: string[] = [];

  try {
    const status = await git.status();
    const deletedFiles = [...status.deleted];
    const createdFiles = Array.from(new Set([...status.created, ...status.not_added]));
    const modifiedFiles = Array.from(new Set(status.modified));
    const renamedFiles = status.renamed.map((r) => `${r.from} -> ${r.to}`);
    const renamedTargets = status.renamed.map((r) => r.to);

    modifiedCount =
      status.modified.length +
      status.created.length +
      status.deleted.length +
      status.renamed.length +
      status.not_added.length;

    // If no changes, show last commit instead of AI summary
    if (modifiedCount === 0) {
      try {
        const log = await git.log({ maxCount: 1 });
        const lastCommitMsg = log.latest?.message ?? "";

        if (lastCommitMsg) {
          const firstLine = lastCommitMsg.split("\n")[0].trim();
          return {
            summary: `\u2705 ${firstLine}`,
            modifiedCount: 0,
          };
        }
      } catch {
        // Git log failed - fall through to fallback
      }

      const branchLabel = branch || "worktree";
      return {
        summary: `Clean: ${branchLabel}`,
        modifiedCount: 0,
      };
    }

    // Noise filtering patterns
    const IGNORED_PATTERNS = [
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
      /\.map$/,
      /\.svg$/,
      /\.png$/,
      /\.ico$/,
      /\.jpg$/,
      /\.jpeg$/,
      /^dist\//,
      /^build\//,
      /^\.next\//,
      /\.log$/,
      /\.tmp$/,
      /^coverage\//,
      /^\.nyc_output\//,
      /__snapshots__\//,
      /\.snap$/,
      /^vendor\//,
      /^generated\//,
      /\.lock\.db$/,
      /\.sqlite$/,
    ];

    const isHighValue = (file: string) => !IGNORED_PATTERNS.some((p) => p.test(file));

    // Build scored file list
    interface ScoredFile {
      path: string;
      relPath: string;
      score: number;
      isNew: boolean;
      status: string;
      insertions: number;
      deletions: number;
    }

    const scoredFiles: ScoredFile[] = [];
    const now = Date.now();

    if (changes) {
      // Use detailed change data with scoring
      for (const change of changes.changes) {
        const relPath = path.relative(worktreePath, change.path);
        if (!isHighValue(relPath)) continue;

        const isSrc = relPath.startsWith("src/");
        const isTest = /(__tests__|\.test\.|\.spec\.)/.test(relPath);
        const isDoc = /README|docs?\//i.test(relPath);

        const typeWeight = isSrc ? 1.0 : isTest ? 0.9 : isDoc ? 0.8 : 0.7;

        const absChanges = (change.insertions ?? 0) + (change.deletions ?? 0);
        const magnitudeScore = Math.log2(1 + absChanges);

        const ageMs = change.mtimeMs ? now - change.mtimeMs : Number.MAX_SAFE_INTEGER;
        const recencyScore =
          ageMs < 5 * 60_000
            ? 2.0 // < 5 min
            : ageMs < 60 * 60_000
              ? 1.0 // < 1 hour
              : ageMs < 24 * 60 * 60_000
                ? 0.5 // < 1 day
                : 0.25;

        const score = 3 * recencyScore + 2 * magnitudeScore + 1 * typeWeight;

        scoredFiles.push({
          path: change.path,
          relPath,
          score,
          isNew: change.status === "added" || change.status === "untracked",
          status: change.status,
          insertions: change.insertions ?? 0,
          deletions: change.deletions ?? 0,
        });
      }
    } else {
      // Fallback to simple git status
      const allFiles = Array.from(new Set([...createdFiles, ...modifiedFiles, ...renamedTargets]));
      for (const file of allFiles) {
        if (!isHighValue(file)) continue;
        const isSrc = file.startsWith("src/");
        const typeWeight = isSrc ? 1.0 : 0.7;
        scoredFiles.push({
          path: path.join(worktreePath, file),
          relPath: file,
          score: typeWeight,
          isNew: createdFiles.includes(file),
          status: createdFiles.includes(file) ? "added" : "modified",
          insertions: 0,
          deletions: 0,
        });
      }
    }

    // Sort by score descending
    scoredFiles.sort((a, b) => b.score - a.score);

    // If all changes were ignored, surface a mechanical summary
    if (scoredFiles.length === 0 && createdFiles.length > 0) {
      const target = path.basename(createdFiles[0]);
      return {
        summary: `\ud83d\udcdd Created ${target}`,
        modifiedCount,
      };
    }

    // Tiered context: Tier 1 (top 3-5 files with rich diffs), Tier 2 (next 5-10 with light summaries)
    const TIER_1_COUNT =
      scoredFiles.length <= 3 ? scoredFiles.length : Math.min(5, scoredFiles.length);
    const TIER_2_COUNT = Math.min(10, scoredFiles.length - TIER_1_COUNT);
    const tier1Files = scoredFiles.slice(0, TIER_1_COUNT);
    const tier2Files = scoredFiles.slice(TIER_1_COUNT, TIER_1_COUNT + TIER_2_COUNT);

    // Budgets
    const META_BUDGET = 500;
    const DIFF_BUDGET = 1000;
    let metaLength = 0;
    let diffLength = 0;

    // Start with deleted files (metadata)
    if (deletedFiles.length > 0) {
      const deletedLines = deletedFiles.map((f) => `deleted: ${f}`).join("\n") + "\n";
      if (metaLength + deletedLines.length <= META_BUDGET) {
        promptContext += deletedLines;
        metaLength += deletedLines.length;
      }
    }

    if (renamedFiles.length > 0) {
      const renamedLines = renamedFiles.map((r) => `renamed: ${r}`).join("\n") + "\n";
      if (metaLength + renamedLines.length <= META_BUDGET) {
        promptContext += renamedLines;
        metaLength += renamedLines.length;
      }
    }

    // Tier 2: Light summaries (metadata budget)
    for (const file of tier2Files) {
      if (metaLength >= META_BUDGET) break;
      const ins = file.insertions > 0 ? `+${file.insertions}` : "";
      const del = file.deletions > 0 ? `-${file.deletions}` : "";
      const changeStr = ins && del ? `${ins}/${del}` : ins || del || "";
      const line = `${file.status}: ${file.relPath}${changeStr ? ` (${changeStr})` : ""}\n`;
      if (metaLength + line.length <= META_BUDGET) {
        promptContext += line;
        metaLength += line.length;
      }
    }

    // Tier 1: Rich diffs (diff budget)
    for (const file of tier1Files) {
      if (diffLength >= DIFF_BUDGET) break;

      try {
        let diff = "";

        if (file.isNew) {
          // Skeletonize new files
          let content: string | null = null;
          try {
            content = await fs.readFile(file.path, "utf8");
          } catch {
            content = null;
          }

          const isEmpty = content !== null && content.trim().length === 0;
          const isLikelyBinary = /\.(png|jpe?g|gif|bmp|svg|ico|webp|heic|avif|bin)$/i.test(
            file.relPath
          );

          if (isEmpty || isLikelyBinary || content === null) {
            mechanicalNewFiles.push(file.relPath);
            continue;
          }

          const lines = content.split("\n");
          const skeleton = lines
            .filter((line) =>
              /^(import|export|class|function|interface|type|const|let|var)\s/.test(line.trim())
            )
            .slice(0, 10)
            .join("\n");

          if (!skeleton) {
            mechanicalNewFiles.push(file.relPath);
            continue;
          }
          diff = `NEW FILE STRUCTURE:\n${skeleton}`;
        } else {
          // Zero-context diffs with aggressive line filtering
          diff = await git.diff([
            "--unified=0",
            "--minimal",
            "--ignore-all-space",
            "--ignore-blank-lines",
            "HEAD",
            "--",
            file.relPath,
          ]);
        }

        const cleanDiff = diff
          .split("\n")
          .filter(
            (line) =>
              !line.startsWith("index ") &&
              !line.startsWith("diff --git") &&
              !line.startsWith("@@") &&
              !/^[+-]\s*(import|from\s+['"])/.test(line) &&
              !/^[+-]\s*\/\//.test(line) &&
              line.trim() !== "+" &&
              line.trim() !== "-" &&
              line.trim() !== "+{" &&
              line.trim() !== "+}" &&
              line.trim() !== "-{" &&
              line.trim() !== "-}"
          )
          .join("\n");

        if (cleanDiff.trim()) {
          const diffBlock = `\nFile: ${file.relPath}\n${cleanDiff}\n`;
          if (diffLength + diffBlock.length <= DIFF_BUDGET) {
            promptContext += diffBlock;
            diffLength += diffBlock.length;
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    // If we have changes but no diff content, create minimal context
    if (!promptContext.trim()) {
      const fileList: string[] = [];
      if (createdFiles.length > 0) fileList.push(...createdFiles.map((f) => `added: ${f}`));
      if (modifiedFiles.length > 0) fileList.push(...modifiedFiles.map((f) => `modified: ${f}`));
      if (deletedFiles.length > 0) fileList.push(...deletedFiles.map((f) => `deleted: ${f}`));

      promptContext = fileList.slice(0, 5).join("\n");
    }

    // If only mechanical changes, return mechanical summary
    const onlyMechanical =
      mechanicalNewFiles.length > 0 && mechanicalNewFiles.length === modifiedCount;
    if (onlyMechanical) {
      const target = path.basename(mechanicalNewFiles[0]);
      return {
        summary: `\ud83d\udcdd Created ${target}`,
        modifiedCount,
      };
    }

    // --- AI GENERATION ---
    const client = getAIClient();
    if (!client) {
      // No AI client available
      return null;
    }

    const model = getAIModel();

    const callModel = async (): Promise<WorktreeSummary> => {
      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: `Summarize the git changes into a single active-tense sentence (max 10 words).
Pay most attention to files listed first and with diffs shown.
Ignore imports, formatting, and minor refactors.
Focus on the feature being added or the bug being fixed.
Start with an emoji.

IMPORTANT: Never use technical jargon like "noop", "no-op", "empty diff", "trivial", or parenthetical asides.
For formatting-only or whitespace changes, say "Minor code cleanup" or "Refactoring [component name]".

If context is minimal (just file names or empty files), infer the likely purpose from file names and make a reasonable guess.
For example: adding empty test files -> "Testing infrastructure setup"
For example: adding empty components -> "Creating UI components"

Respond with JSON: {"summary":"emoji + description"}
No newlines in your response.
Examples:
{"summary":"Building dashboard filters"}
{"summary":"Optimizing CLI flag parsing"}
{"summary":"Fixing auth handshake bug"}
{"summary":"Redesigning settings page"}
{"summary":"Minor code cleanup in WorktreeCard"}`,
          },
          {
            role: "user",
            content: promptContext,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 128,
      });

      const text = extractOutputText(response);
      if (!text) {
        throw new Error(
          `Worktree summary: empty response from model. Raw: ${formatErrorSnippet(response)}`
        );
      }

      // Remove all newlines and carriage returns before parsing
      const cleanedText = text.replace(/[\r\n]+/g, "");

      const summary = parseSummaryJSON(cleanedText);
      if (!summary) {
        throw new Error(
          `Worktree summary: failed to parse summary. Raw: ${formatErrorSnippet(text)}`
        );
      }

      const normalized = normalizeSummary(summary);
      if (!normalized) {
        throw new Error(
          `Worktree summary: empty normalized summary. Raw: ${formatErrorSnippet(summary)}`
        );
      }

      return {
        summary: normalized,
        modifiedCount,
      };
    };

    try {
      return await withRetry(callModel, {
        maxRetries: 2,
        baseDelay: 300,
        shouldRetry: () => true,
      });
    } catch (error) {
      console.error("[AI] Worktree summary retries exhausted", error);
      const branchLabel = branch || "worktree";
      return {
        summary: `${branchLabel} (analysis unavailable)`,
        modifiedCount,
      };
    }
  } catch (error) {
    console.error("[AI] generateWorktreeSummary failed", error);
    const branchLabel = branch || "worktree";
    return {
      summary: `${branchLabel} (git unavailable)`,
      modifiedCount: 0,
    };
  }
}
