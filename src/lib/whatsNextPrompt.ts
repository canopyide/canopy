import type { GitHubIssue } from "@shared/types/github";
import type { FileTreeNode } from "@shared/types";

const MAX_ISSUES = 30;
const MAX_TREE_DEPTH = 3;
const MAX_ISSUES_JSON_SIZE = 20000;
const MAX_TREE_SIZE = 5000;

export function buildWhatsNextPrompt(issues: GitHubIssue[], fileTree?: FileTreeNode[]): string {
  let issuesJson = JSON.stringify(
    issues.slice(0, MAX_ISSUES).map((issue) => ({
      number: issue.number,
      title: issue.title,
      labels: issue.labels?.map((l) => l.name) || [],
      updatedAt: issue.updatedAt,
      commentCount: issue.commentCount,
      assignees: (issue.assignees || []).map((a) => a.login),
    })),
    null,
    2
  );

  if (issuesJson.length > MAX_ISSUES_JSON_SIZE) {
    const truncatedIssues = issues.slice(0, Math.floor(MAX_ISSUES / 2));
    issuesJson = JSON.stringify(
      truncatedIssues.map((issue) => ({
        number: issue.number,
        title: issue.title,
        labels: issue.labels?.map((l) => l.name) || [],
        updatedAt: issue.updatedAt,
        commentCount: issue.commentCount,
        assignees: (issue.assignees || []).map((a) => a.login),
      })),
      null,
      2
    );
  }

  let treeSection = "";
  if (fileTree && fileTree.length > 0) {
    const treeContent = formatFileTree(fileTree, 0, MAX_TREE_DEPTH);
    if (treeContent) {
      const fullTreeSection = `\n\n## File Tree\nHere's a high-level view of the project structure:\n\`\`\`\n${treeContent}\n\`\`\``;
      if (fullTreeSection.length <= MAX_TREE_SIZE) {
        treeSection = fullTreeSection;
      } else {
        treeSection = `\n\n## File Tree\nHere's a high-level view of the project structure:\n\`\`\`\n${treeContent.slice(
          0,
          MAX_TREE_SIZE - 100
        )}\n...\n[Tree truncated]\n\`\`\``;
      }
    }
  }

  const prompt = `You are the Lead Engineer for this project. I am returning after a break and need to decide what to work on next.

## GitHub Issues
Here are the open issues for this project:
\`\`\`json
${issuesJson}
\`\`\`${treeSection}

## Your Task
1. Briefly explore the codebase to understand the current architecture and recent changes.
2. Based on the GitHub issues and codebase, identify **4 high-impact, actionable tasks** for me to tackle today.

## Guidelines
- Prioritize bugs or clearly defined features over vague refactoring.
- Avoid suggesting tasks that are already assigned to someone else.
- For each task, explain:
  - **Why** it's important (impact, urgency, or value).
  - **Where** to start in the code (specific files or components).
  - A brief 1-2 sentence implementation approach.

## Output Format
Please structure your response as a numbered list with each task clearly separated.`;

  return prompt;
}

function formatFileTree(nodes: FileTreeNode[], depth: number, maxDepth: number): string {
  if (depth >= maxDepth) return "";

  const indent = "  ".repeat(depth);
  const lines: string[] = [];

  for (const node of nodes) {
    const prefix = node.isDirectory ? "📁" : "📄";
    lines.push(`${indent}${prefix} ${node.name}`);

    if (node.isDirectory && node.children && depth < maxDepth - 1) {
      lines.push(formatFileTree(node.children, depth + 1, maxDepth));
    }
  }

  return lines.filter((line) => line.trim()).join("\n");
}
