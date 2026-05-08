import { describe, it, expect } from "vitest";
import { getGitignoreTemplate, computeMissingTemplateEntries } from "../projectCrud/gitInit.js";

describe("getGitignoreTemplate", () => {
  it("node template excludes env files and build outputs", () => {
    const content = getGitignoreTemplate("node");
    expect(content).not.toBeNull();
    expect(content).toMatch(/^\.env$/m);
    expect(content).toMatch(/^\.env\.local$/m);
    expect(content).toMatch(/^\.env\.\*\.local$/m);
    expect(content).toMatch(/^node_modules\/$/m);
  });

  it("python template includes secret/env coverage", () => {
    const content = getGitignoreTemplate("python");
    expect(content).not.toBeNull();
    expect(content).toMatch(/^\.env$/m);
    expect(content).toMatch(/^\.env\.\*$/m);
    expect(content).toMatch(/^!\.env\.example$/m);
    expect(content).toMatch(/^__pycache__\/$/m);
  });

  it("minimal template includes secret/env coverage", () => {
    const content = getGitignoreTemplate("minimal");
    expect(content).not.toBeNull();
    expect(content).toMatch(/^\.env$/m);
    expect(content).toMatch(/^\.env\.\*$/m);
    expect(content).toMatch(/^!\.env\.example$/m);
    expect(content).toMatch(/^\*\.pem$/m);
    expect(content).toMatch(/^\*\.key$/m);
  });

  it("returns null for unknown templates", () => {
    expect(getGitignoreTemplate("unknown")).toBeNull();
  });
});

describe("computeMissingTemplateEntries", () => {
  it("returns all template entries when existing file is empty", () => {
    const template = "# comment\n.env\nnode_modules/\n";
    const missing = computeMissingTemplateEntries("", template);
    expect(missing).toEqual([".env", "node_modules/"]);
  });

  it("returns an empty list when the existing file covers every entry", () => {
    const template = "# OS\n.DS_Store\n.env\n";
    const existing = "# my notes\n.env\nfoo/\n.DS_Store\n";
    expect(computeMissingTemplateEntries(existing, template)).toEqual([]);
  });

  it("ignores comments and blank lines on both sides", () => {
    const template = "# header\n\n.env\n\n.DS_Store\n";
    const existing = "\n\n# other\n.env\n";
    expect(computeMissingTemplateEntries(existing, template)).toEqual([".DS_Store"]);
  });

  it("normalizes CRLF line endings", () => {
    const template = ".env\r\n.DS_Store\r\n";
    const existing = ".env\r\n";
    expect(computeMissingTemplateEntries(existing, template)).toEqual([".DS_Store"]);
  });

  it("trims whitespace before comparing", () => {
    const template = ".env\n.DS_Store\n";
    const existing = "  .env  \n .DS_Store \n";
    expect(computeMissingTemplateEntries(existing, template)).toEqual([]);
  });
});
