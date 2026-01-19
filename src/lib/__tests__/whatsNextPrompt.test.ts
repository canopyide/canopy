import { describe, it, expect } from "vitest";
import { buildWhatsNextPrompt } from "../whatsNextPrompt";
import type { GitHubIssue } from "@shared/types/github";
import type { FileTreeNode } from "@shared/types";

const mockIssues: GitHubIssue[] = [
  {
    number: 1,
    title: "Add dark mode support",
    url: "https://github.com/test/repo/issues/1",
    state: "OPEN",
    updatedAt: "2024-01-01T00:00:00Z",
    author: { login: "user1", avatarUrl: "https://avatar.url" },
    assignees: [],
    commentCount: 2,
    labels: [{ name: "enhancement", color: "00ff00" }],
  },
  {
    number: 2,
    title: "Fix authentication bug",
    url: "https://github.com/test/repo/issues/2",
    state: "OPEN",
    updatedAt: "2024-01-02T00:00:00Z",
    author: { login: "user2", avatarUrl: "https://avatar.url" },
    assignees: [{ login: "user3", avatarUrl: "https://avatar.url" }],
    commentCount: 5,
    labels: [{ name: "bug", color: "ff0000" }],
  },
];

const mockFileTree: FileTreeNode[] = [
  {
    name: "src",
    isDirectory: true,
    path: "src",
    children: [
      { name: "components", isDirectory: true, path: "src/components", children: [] },
      { name: "lib", isDirectory: true, path: "src/lib", children: [] },
    ],
  },
  { name: "package.json", isDirectory: false, path: "package.json" },
];

describe("buildWhatsNextPrompt", () => {
  it("should include GitHub issues in the prompt", () => {
    const prompt = buildWhatsNextPrompt(mockIssues);
    expect(prompt).toContain("GitHub Issues");
    expect(prompt).toContain("Add dark mode support");
    expect(prompt).toContain("Fix authentication bug");
  });

  it("should include issue metadata in JSON format", () => {
    const prompt = buildWhatsNextPrompt(mockIssues);
    expect(prompt).toContain('"number": 1');
    expect(prompt).toContain('"title": "Add dark mode support"');
    expect(prompt).toContain('"enhancement"');
    expect(prompt).toContain('"user3"');
  });

  it("should include file tree when provided", () => {
    const prompt = buildWhatsNextPrompt(mockIssues, mockFileTree);
    expect(prompt).toContain("File Tree");
    expect(prompt).toContain("src");
    expect(prompt).toContain("components");
    expect(prompt).toContain("package.json");
  });

  it("should not include file tree section when not provided", () => {
    const prompt = buildWhatsNextPrompt(mockIssues);
    expect(prompt).not.toContain("File Tree");
  });

  it("should include task guidelines", () => {
    const prompt = buildWhatsNextPrompt(mockIssues);
    expect(prompt).toContain("4 high-impact, actionable tasks");
    expect(prompt).toContain("Why");
    expect(prompt).toContain("Where");
    expect(prompt).toContain("Prioritize bugs or clearly defined features");
  });

  it("should limit issues to 30", () => {
    const manyIssues: GitHubIssue[] = Array.from({ length: 50 }, (_, i) => ({
      number: i + 1,
      title: `Issue ${i + 1}`,
      url: `https://github.com/test/repo/issues/${i + 1}`,
      state: "OPEN" as const,
      updatedAt: "2024-01-01T00:00:00Z",
      author: { login: "user", avatarUrl: "https://avatar.url" },
      assignees: [],
      commentCount: 0,
      labels: [],
    }));

    const prompt = buildWhatsNextPrompt(manyIssues);
    const issuesInPrompt = prompt.match(/"number":/g)?.length ?? 0;
    expect(issuesInPrompt).toBeLessThanOrEqual(30);
  });

  it("should truncate extremely large prompts while preserving structure", () => {
    const hugeIssues: GitHubIssue[] = Array.from({ length: 30 }, (_, i) => ({
      number: i + 1,
      title: "A".repeat(10000),
      url: `https://github.com/test/repo/issues/${i + 1}`,
      state: "OPEN" as const,
      updatedAt: "2024-01-01T00:00:00Z",
      author: { login: "user", avatarUrl: "https://avatar.url" },
      assignees: [],
      commentCount: 0,
      labels: [],
    }));

    const prompt = buildWhatsNextPrompt(hugeIssues);
    expect(prompt).toContain("```json");
    expect(prompt).toContain("```");
    expect(prompt.split("```").length).toBeGreaterThanOrEqual(3);
  });

  it("should handle empty issues array", () => {
    const prompt = buildWhatsNextPrompt([]);
    expect(prompt).toContain("GitHub Issues");
    expect(prompt).toContain("[]");
  });

  it("should handle issues without labels", () => {
    const issuesWithoutLabels: GitHubIssue[] = [
      {
        number: 1,
        title: "Test issue",
        url: "https://github.com/test/repo/issues/1",
        state: "OPEN",
        updatedAt: "2024-01-01T00:00:00Z",
        author: { login: "user", avatarUrl: "https://avatar.url" },
        assignees: [],
        commentCount: 0,
      },
    ];

    const prompt = buildWhatsNextPrompt(issuesWithoutLabels);
    expect(prompt).toContain('"labels": []');
  });

  it("should be a well-formed prompt for LLM", () => {
    const prompt = buildWhatsNextPrompt(mockIssues, mockFileTree);
    expect(prompt).toContain("You are the Lead Engineer");
    expect(prompt).toContain("Your Task");
    expect(prompt).toContain("Guidelines");
    expect(prompt).toContain("Output Format");
  });

  it("should handle empty file tree array", () => {
    const prompt = buildWhatsNextPrompt(mockIssues, []);
    expect(prompt).not.toContain("File Tree");
  });

  it("should handle issues with null assignees", () => {
    const issueWithNullAssignees: GitHubIssue[] = [
      {
        number: 1,
        title: "Test issue",
        url: "https://github.com/test/repo/issues/1",
        state: "OPEN",
        updatedAt: "2024-01-01T00:00:00Z",
        author: { login: "user", avatarUrl: "https://avatar.url" },
        assignees: null as any,
        commentCount: 0,
        labels: [],
      },
    ];

    const prompt = buildWhatsNextPrompt(issueWithNullAssignees);
    expect(prompt).toContain('"assignees": []');
  });

  it("should preserve code fence structure when truncating tree", () => {
    const largeTree: FileTreeNode[] = Array.from({ length: 500 }, (_, i) => ({
      name: `very-long-directory-name-${i}`.repeat(20),
      isDirectory: true,
      path: `dir${i}`,
      children: [],
    }));

    const prompt = buildWhatsNextPrompt(mockIssues, largeTree);
    const treeSectionMatch = prompt.match(/## File Tree[\s\S]*?```[\s\S]*?```/);
    expect(treeSectionMatch).toBeTruthy();
    if (treeSectionMatch) {
      expect(treeSectionMatch[0]).toContain("```");
      const codeBlocks = treeSectionMatch[0].split("```");
      expect(codeBlocks.length).toBe(3);
    }
  });
});
