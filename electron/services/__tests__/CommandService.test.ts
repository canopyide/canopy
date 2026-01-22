import { describe, it, expect } from "vitest";
import {
  substituteTemplateVariables,
  validatePromptTemplate,
} from "../../../shared/utils/promptTemplate.js";

/**
 * Tests for CommandOverride prompt field validation and template substitution.
 *
 * Note: Full integration tests for CommandService require mocking Electron's app module.
 * These tests focus on the validation logic that can be tested independently.
 */

describe("CommandOverride prompt field validation", () => {
  /**
   * Validates a raw parsed settings object for command overrides.
   * This mimics the validation logic in ProjectStore.getProjectSettings() and
   * ProjectStore.saveProjectSettings().
   */
  function validateCommandOverride(override: unknown): {
    valid: boolean;
    commandId?: string;
    defaults?: Record<string, unknown>;
    disabled?: boolean;
    prompt?: string;
  } {
    if (!override || typeof override !== "object") {
      return { valid: false };
    }

    const o = override as Record<string, unknown>;

    if (typeof o.commandId !== "string") {
      return { valid: false };
    }

    // Reject null defaults explicitly
    if (
      o.defaults !== undefined &&
      (o.defaults === null || typeof o.defaults !== "object" || Array.isArray(o.defaults))
    ) {
      return { valid: false };
    }

    if (o.disabled !== undefined && typeof o.disabled !== "boolean") {
      return { valid: false };
    }

    // Validate prompt field
    if (o.prompt !== undefined && typeof o.prompt !== "string") {
      return { valid: false };
    }

    return {
      valid: true,
      commandId: o.commandId as string,
      defaults: o.defaults as Record<string, unknown> | undefined,
      disabled: o.disabled as boolean | undefined,
      prompt: o.prompt as string | undefined,
    };
  }

  describe("prompt field type validation", () => {
    it("accepts valid override with prompt", () => {
      const result = validateCommandOverride({
        commandId: "test:command",
        prompt: "Hello {name}!",
      });

      expect(result.valid).toBe(true);
      expect(result.commandId).toBe("test:command");
      expect(result.prompt).toBe("Hello {name}!");
    });

    it("accepts override with empty prompt", () => {
      const result = validateCommandOverride({
        commandId: "test:command",
        prompt: "",
      });

      expect(result.valid).toBe(true);
      expect(result.prompt).toBe("");
    });

    it("rejects override with number prompt", () => {
      expect(
        validateCommandOverride({
          commandId: "test:command",
          prompt: 123,
        }).valid
      ).toBe(false);
    });

    it("rejects override with null prompt", () => {
      expect(
        validateCommandOverride({
          commandId: "test:command",
          prompt: null,
        }).valid
      ).toBe(false);
    });

    it("rejects override with object prompt", () => {
      expect(
        validateCommandOverride({
          commandId: "test:command",
          prompt: { template: "Hello" },
        }).valid
      ).toBe(false);
    });

    it("rejects override with array prompt", () => {
      expect(
        validateCommandOverride({
          commandId: "test:command",
          prompt: ["Hello"],
        }).valid
      ).toBe(false);
    });

    it("rejects override with boolean prompt", () => {
      expect(
        validateCommandOverride({
          commandId: "test:command",
          prompt: true,
        }).valid
      ).toBe(false);
    });
  });

  describe("prompt with other fields", () => {
    it("accepts override with defaults and prompt together", () => {
      const result = validateCommandOverride({
        commandId: "test:command",
        defaults: { name: "World" },
        prompt: "Greet {name} now!",
      });

      expect(result.valid).toBe(true);
      expect(result.defaults).toEqual({ name: "World" });
      expect(result.prompt).toBe("Greet {name} now!");
    });

    it("accepts override with disabled and prompt together", () => {
      const result = validateCommandOverride({
        commandId: "test:command",
        disabled: false,
        prompt: "Run {name}",
      });

      expect(result.valid).toBe(true);
      expect(result.disabled).toBe(false);
      expect(result.prompt).toBe("Run {name}");
    });

    it("accepts override with all fields", () => {
      const result = validateCommandOverride({
        commandId: "test:command",
        defaults: { name: "Default" },
        disabled: false,
        prompt: "Execute with {name}",
      });

      expect(result.valid).toBe(true);
      expect(result.commandId).toBe("test:command");
      expect(result.defaults).toEqual({ name: "Default" });
      expect(result.disabled).toBe(false);
      expect(result.prompt).toBe("Execute with {name}");
    });

    it("accepts override without prompt field", () => {
      const result = validateCommandOverride({
        commandId: "test:command",
        defaults: { name: "World" },
      });

      expect(result.valid).toBe(true);
      expect(result.prompt).toBeUndefined();
    });
  });
});

describe("prompt template substitution in command execution context", () => {
  const availableArgs = ["issueNumber", "branchName", "baseBranch", "title"];

  describe("validation before substitution", () => {
    it("validates prompt template before execution", () => {
      const result = validatePromptTemplate("Work on issue {issueNumber}: {title}", availableArgs);
      expect(result.valid).toBe(true);
    });

    it("detects unknown variables in prompt", () => {
      const result = validatePromptTemplate(
        "Work on {unknownVar} for {issueNumber}",
        availableArgs
      );
      expect(result.valid).toBe(false);
      expect(result.invalidVariables).toEqual(["unknownVar"]);
    });
  });

  describe("substitution during execution", () => {
    it("substitutes all variables with provided args", () => {
      const result = substituteTemplateVariables(
        "Work on issue #{issueNumber}: {title}\nBranch: {branchName}",
        {
          issueNumber: 1779,
          title: "Support custom prompts",
          branchName: "issue-1779-custom-prompts",
        }
      );

      expect(result.success).toBe(true);
      expect(result.prompt).toBe(
        "Work on issue #1779: Support custom prompts\nBranch: issue-1779-custom-prompts"
      );
    });

    it("fails if required variables are missing", () => {
      const result = substituteTemplateVariables("Work on issue #{issueNumber}: {title}", {
        issueNumber: 1779,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Missing value(s) for: {title}");
      expect(result.missingVariables).toEqual(["title"]);
    });

    it("uses default values from command args via effectiveArgs", () => {
      // In the CommandService, effectiveArgs is built by:
      // 1. Starting with provided args
      // 2. Applying command-level defaults for missing args
      // 3. Applying override defaults for missing args
      // This test simulates that flow

      const providedArgs = { issueNumber: 1779 };
      const commandDefaults = { branchName: "main", baseBranch: "develop" };
      const overrideDefaults = { baseBranch: "main" };

      // Build effective args (simulating CommandService logic)
      const effectiveArgs = { ...providedArgs };
      for (const [key, value] of Object.entries(commandDefaults)) {
        if (!(key in effectiveArgs)) {
          effectiveArgs[key as keyof typeof effectiveArgs] = value as never;
        }
      }
      for (const [key, value] of Object.entries(overrideDefaults)) {
        if (!(key in providedArgs)) {
          effectiveArgs[key as keyof typeof effectiveArgs] = value as never;
        }
      }

      const result = substituteTemplateVariables(
        "Issue #{issueNumber} on {baseBranch}",
        effectiveArgs
      );

      expect(result.success).toBe(true);
      expect(result.prompt).toBe("Issue #1779 on main");
    });
  });
});
