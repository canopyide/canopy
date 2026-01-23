import { describe, it, expect } from "vitest";
import {
  extractTemplateVariables,
  validatePromptTemplate,
  substituteTemplateVariables,
} from "../promptTemplate.js";

describe("extractTemplateVariables", () => {
  it("extracts single variable", () => {
    expect(extractTemplateVariables("Hello {name}")).toEqual(["name"]);
  });

  it("extracts multiple variables", () => {
    expect(extractTemplateVariables("{greeting} {name}, welcome to {place}")).toEqual([
      "greeting",
      "name",
      "place",
    ]);
  });

  it("returns unique variables only", () => {
    expect(extractTemplateVariables("{name} and {name} again")).toEqual(["name"]);
  });

  it("returns empty array for no variables", () => {
    expect(extractTemplateVariables("No variables here")).toEqual([]);
  });

  it("handles underscores in variable names", () => {
    expect(extractTemplateVariables("{issue_number} and {branch_name}")).toEqual([
      "issue_number",
      "branch_name",
    ]);
  });

  it("handles numbers in variable names (not at start)", () => {
    expect(extractTemplateVariables("{var1} and {item2}")).toEqual(["var1", "item2"]);
  });

  it("ignores malformed variables", () => {
    expect(extractTemplateVariables("{123start} and {valid}")).toEqual(["valid"]);
  });

  it("handles empty template", () => {
    expect(extractTemplateVariables("")).toEqual([]);
  });

  it("handles complex template", () => {
    expect(
      extractTemplateVariables(`
      Work on issue #{issueNumber}: {title}

      Create a worktree on branch {branchName} based on {baseBranch}.

      The issue URL is: {url}
    `)
    ).toEqual(["issueNumber", "title", "branchName", "baseBranch", "url"]);
  });
});

describe("validatePromptTemplate", () => {
  it("validates template with all known variables", () => {
    const result = validatePromptTemplate("Hello {name}, your id is {id}", ["name", "id"]);
    expect(result.valid).toBe(true);
    expect(result.foundVariables).toEqual(["name", "id"]);
    expect(result.invalidVariables).toBeUndefined();
  });

  it("rejects template with unknown variables", () => {
    const result = validatePromptTemplate("Hello {name} and {unknown}", ["name"]);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Unknown variable(s): {unknown}");
    expect(result.invalidVariables).toEqual(["unknown"]);
    expect(result.foundVariables).toEqual(["name", "unknown"]);
  });

  it("reports multiple unknown variables", () => {
    const result = validatePromptTemplate("{a} {b} {c}", []);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Unknown variable(s): {a}, {b}, {c}");
    expect(result.invalidVariables).toEqual(["a", "b", "c"]);
  });

  it("validates empty template", () => {
    const result = validatePromptTemplate("No variables", ["name"]);
    expect(result.valid).toBe(true);
    expect(result.foundVariables).toEqual([]);
  });

  it("handles subset of available variables", () => {
    const result = validatePromptTemplate("{name}", ["name", "id", "extra"]);
    expect(result.valid).toBe(true);
    expect(result.foundVariables).toEqual(["name"]);
  });
});

describe("substituteTemplateVariables", () => {
  it("substitutes single variable", () => {
    const result = substituteTemplateVariables("Hello {name}!", { name: "World" });
    expect(result.success).toBe(true);
    expect(result.prompt).toBe("Hello World!");
  });

  it("substitutes multiple variables", () => {
    const result = substituteTemplateVariables("{greeting} {name}!", {
      greeting: "Hi",
      name: "Alice",
    });
    expect(result.success).toBe(true);
    expect(result.prompt).toBe("Hi Alice!");
  });

  it("substitutes repeated variables", () => {
    const result = substituteTemplateVariables("{name} and {name} again", { name: "Bob" });
    expect(result.success).toBe(true);
    expect(result.prompt).toBe("Bob and Bob again");
  });

  it("converts numbers to strings", () => {
    const result = substituteTemplateVariables("Issue #{num}", { num: 123 });
    expect(result.success).toBe(true);
    expect(result.prompt).toBe("Issue #123");
  });

  it("converts booleans to strings", () => {
    const result = substituteTemplateVariables("Active: {active}", { active: true });
    expect(result.success).toBe(true);
    expect(result.prompt).toBe("Active: true");
  });

  it("fails on missing required variable", () => {
    const result = substituteTemplateVariables("{name} {missing}", { name: "Alice" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Missing value(s) for: {missing}");
    expect(result.missingVariables).toEqual(["missing"]);
  });

  it("fails on null value", () => {
    const result = substituteTemplateVariables("{name}", { name: null });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Missing value(s) for: {name}");
    expect(result.missingVariables).toEqual(["name"]);
  });

  it("fails on undefined value", () => {
    const result = substituteTemplateVariables("{name}", { name: undefined });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Missing value(s) for: {name}");
    expect(result.missingVariables).toEqual(["name"]);
  });

  it("reports all missing variables", () => {
    const result = substituteTemplateVariables("{a} {b} {c}", { a: "x" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Missing value(s) for: {b}, {c}");
    expect(result.missingVariables).toEqual(["b", "c"]);
  });

  it("handles empty template", () => {
    const result = substituteTemplateVariables("No variables", {});
    expect(result.success).toBe(true);
    expect(result.prompt).toBe("No variables");
  });

  it("handles complex template", () => {
    const result = substituteTemplateVariables(
      `Work on issue #{issueNumber}: {title}

Create a worktree on branch {branchName} based on {baseBranch}.`,
      {
        issueNumber: 1779,
        title: "Support custom prompts",
        branchName: "issue-1779-custom-prompts",
        baseBranch: "main",
      }
    );
    expect(result.success).toBe(true);
    expect(result.prompt).toBe(`Work on issue #1779: Support custom prompts

Create a worktree on branch issue-1779-custom-prompts based on main.`);
  });

  it("ignores extra values not in template", () => {
    const result = substituteTemplateVariables("{name}", { name: "Alice", extra: "ignored" });
    expect(result.success).toBe(true);
    expect(result.prompt).toBe("Alice");
  });
});
