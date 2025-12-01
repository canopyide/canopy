/**
 * DiffViewer Component
 *
 * Renders unified diff output in a syntax-highlighted split or unified view
 * using react-diff-view with refractor for syntax highlighting.
 */

import { useMemo } from "react";
import { parseDiff, Diff, Hunk, tokenize, markEdits, DiffType, ViewType } from "react-diff-view";
import type { HunkData, HunkTokens, TokenizeOptions } from "react-diff-view";
import { refractor } from "refractor";
import "react-diff-view/style/index.css";

export interface DiffViewerProps {
  /** Raw unified diff string */
  diff: string;
  /** File path for language detection */
  filePath: string;
  /** View mode: unified or split (side-by-side) */
  viewType?: ViewType;
}

/**
 * Map file extensions to refractor language names
 */
function getLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    mjs: "javascript",
    cjs: "javascript",
    // Web
    html: "markup",
    htm: "markup",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    // Data
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "markup",
    // Config
    md: "markdown",
    mdx: "markdown",
    // Languages
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "bash",
    // Other
    dockerfile: "docker",
    makefile: "makefile",
    graphql: "graphql",
    gql: "graphql",
  };

  return languageMap[ext] || "text";
}

/**
 * Tokenize hunks for syntax highlighting using refractor
 */
function useTokens(hunks: HunkData[], language: string): HunkTokens | null {
  return useMemo(() => {
    if (!hunks.length) return null;

    const options: TokenizeOptions = {
      highlight: true,
      refractor,
      language,
      enhancers: [markEdits(hunks, { type: "block" })],
    };

    try {
      return tokenize(hunks, options);
    } catch {
      // Fall back to no syntax highlighting if language not supported
      return null;
    }
  }, [hunks, language]);
}

export function DiffViewer({ diff, filePath, viewType = "split" }: DiffViewerProps) {
  // Parse the unified diff
  const files = useMemo(() => {
    try {
      return parseDiff(diff);
    } catch {
      return [];
    }
  }, [diff]);

  // Handle special cases
  if (!diff || diff === "NO_CHANGES") {
    return (
      <div className="flex items-center justify-center p-8 text-neutral-500">
        No changes detected
      </div>
    );
  }

  if (diff === "BINARY_FILE") {
    return (
      <div className="flex items-center justify-center p-8 text-neutral-500">
        Binary file - cannot display diff
      </div>
    );
  }

  if (diff === "FILE_TOO_LARGE") {
    return (
      <div className="flex items-center justify-center p-8 text-neutral-500">
        File too large to display diff ({">"} 1MB)
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-neutral-500">
        Unable to parse diff
      </div>
    );
  }

  const language = getLanguage(filePath);

  return (
    <div className="diff-viewer overflow-auto">
      {files.map((file: any, index: number) => (
        <FileDiff
          key={file.newRevision || file.oldRevision || index}
          file={file}
          viewType={viewType}
          language={language}
        />
      ))}
    </div>
  );
}

interface FileDiffProps {
  file: ReturnType<typeof parseDiff>[0];
  viewType: ViewType;
  language: string;
}

function FileDiff({ file, viewType, language }: FileDiffProps) {
  const tokens = useTokens(file.hunks ?? [], language);

  // Determine diff type from the parsed file
  const diffType: DiffType = file.type as DiffType;

  return (
    <Diff
      viewType={viewType}
      diffType={diffType}
      hunks={file.hunks ?? []}
      tokens={tokens ?? undefined}
    >
      {(hunks: HunkData[]) =>
        hunks.map((hunk) => <Hunk key={`${hunk.oldStart}-${hunk.newStart}`} hunk={hunk} />)
      }
    </Diff>
  );
}
