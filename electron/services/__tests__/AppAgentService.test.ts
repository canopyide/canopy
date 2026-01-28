import { describe, it, expect } from "vitest";
import { AGENT_ACCESSIBLE_ACTIONS } from "../../../shared/types/appAgent.js";

/**
 * Tests for AppAgentService configuration and accessible actions.
 *
 * Note: Full integration tests require mocking Electron's BrowserWindow, ipcMain,
 * and network requests. These tests focus on the configuration that can be tested
 * independently.
 */

describe("AGENT_ACCESSIBLE_ACTIONS", () => {
  describe("query actions", () => {
    it("includes terminal.list query action", () => {
      expect(AGENT_ACCESSIBLE_ACTIONS).toContain("terminal.list");
    });

    it("includes panel.list query action", () => {
      expect(AGENT_ACCESSIBLE_ACTIONS).toContain("panel.list");
    });

    it("includes worktree.list query action", () => {
      expect(AGENT_ACCESSIBLE_ACTIONS).toContain("worktree.list");
    });

    it("includes worktree.getCurrent query action", () => {
      expect(AGENT_ACCESSIBLE_ACTIONS).toContain("worktree.getCurrent");
    });

    it("includes project.getCurrent query action", () => {
      expect(AGENT_ACCESSIBLE_ACTIONS).toContain("project.getCurrent");
    });
  });

  describe("command actions", () => {
    it("includes terminal.new command action", () => {
      expect(AGENT_ACCESSIBLE_ACTIONS).toContain("terminal.new");
    });

    it("includes terminal.kill command action", () => {
      expect(AGENT_ACCESSIBLE_ACTIONS).toContain("terminal.kill");
    });

    it("includes terminal.close command action", () => {
      expect(AGENT_ACCESSIBLE_ACTIONS).toContain("terminal.close");
    });

    it("includes terminal.trash command action", () => {
      expect(AGENT_ACCESSIBLE_ACTIONS).toContain("terminal.trash");
    });

    it("includes worktree.setActive command action", () => {
      expect(AGENT_ACCESSIBLE_ACTIONS).toContain("worktree.setActive");
    });

    it("includes agent.launch command action", () => {
      expect(AGENT_ACCESSIBLE_ACTIONS).toContain("agent.launch");
    });
  });

  describe("action counts", () => {
    it("has expected number of accessible actions", () => {
      // Query actions: 5 (terminal.list, panel.list, worktree.list, worktree.getCurrent, project.getCurrent)
      // Command actions: terminal.new, terminal.kill, terminal.close, terminal.trash, terminal.palette,
      //   worktree.createDialog.open, worktree.setActive, agent.launch, nav.toggleSidebar, panel.toggleDock,
      //   sidecar.toggle, app.settings, app.settings.openTab
      expect(AGENT_ACCESSIBLE_ACTIONS.length).toBeGreaterThanOrEqual(15);
    });

    it("all action IDs are strings", () => {
      for (const actionId of AGENT_ACCESSIBLE_ACTIONS) {
        expect(typeof actionId).toBe("string");
        expect(actionId.length).toBeGreaterThan(0);
      }
    });

    it("all action IDs follow dot notation convention", () => {
      for (const actionId of AGENT_ACCESSIBLE_ACTIONS) {
        expect(actionId).toMatch(/^[a-z]+\.[a-zA-Z.]+$/);
      }
    });
  });
});

describe("Tool name sanitization", () => {
  /**
   * Replicates the sanitizeToolName logic from AppAgentService.
   * OpenAI/Fireworks strips dots from tool names, so we replace with underscores.
   */
  function sanitizeToolName(name: string): string {
    return name.replace(/\./g, "_");
  }

  it("converts dots to underscores", () => {
    expect(sanitizeToolName("terminal.new")).toBe("terminal_new");
  });

  it("handles multiple dots", () => {
    expect(sanitizeToolName("app.settings.openTab")).toBe("app_settings_openTab");
  });

  it("handles action IDs without dots", () => {
    expect(sanitizeToolName("test")).toBe("test");
  });

  it("preserves case", () => {
    expect(sanitizeToolName("worktree.getCurrent")).toBe("worktree_getCurrent");
  });
});

describe("Schema sanitization", () => {
  /**
   * Replicates the sanitizeSchema logic from AppAgentService.
   * Cleans up JSON schemas for OpenAI/Fireworks compatibility.
   */
  function sanitizeSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> {
    const defaultSchema = { type: "object", properties: {} };

    if (!schema) {
      return defaultSchema;
    }

    const sanitized = { ...schema };

    // Remove $schema - Fireworks/OpenAI doesn't support it
    delete sanitized["$schema"];

    // Handle anyOf from .optional() - unwrap if it contains an object type
    if (sanitized["anyOf"] && Array.isArray(sanitized["anyOf"])) {
      const objectSchema = (sanitized["anyOf"] as Array<Record<string, unknown>>).find(
        (s) => s.type === "object"
      );
      if (objectSchema) {
        Object.assign(sanitized, objectSchema);
        delete sanitized["anyOf"];
      }
    }

    // Only add defaults if we don't have real structure
    if (!sanitized["type"]) {
      sanitized["type"] = "object";
    }
    if (sanitized["type"] === "object" && !sanitized["properties"]) {
      sanitized["properties"] = {};
    }

    return sanitized;
  }

  it("returns default schema for undefined input", () => {
    const result = sanitizeSchema(undefined);
    expect(result).toEqual({ type: "object", properties: {} });
  });

  it("removes $schema field", () => {
    const result = sanitizeSchema({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { name: { type: "string" } },
    });
    expect(result).not.toHaveProperty("$schema");
    expect(result.properties).toEqual({ name: { type: "string" } });
  });

  it("unwraps anyOf with object type", () => {
    const result = sanitizeSchema({
      anyOf: [
        { type: "object", properties: { id: { type: "string" } } },
        { type: "null" },
      ],
    });
    expect(result).not.toHaveProperty("anyOf");
    expect(result.type).toBe("object");
    expect(result.properties).toEqual({ id: { type: "string" } });
  });

  it("adds default type if missing", () => {
    const result = sanitizeSchema({ properties: {} });
    expect(result.type).toBe("object");
  });

  it("adds default properties if missing for object type", () => {
    const result = sanitizeSchema({ type: "object" });
    expect(result.properties).toEqual({});
  });

  it("preserves existing properties", () => {
    const result = sanitizeSchema({
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "number" },
      },
    });
    expect(result.properties).toEqual({
      name: { type: "string" },
      count: { type: "number" },
    });
  });
});

describe("OneShotRunRequest configuration", () => {
  interface OneShotRunRequest {
    prompt: string;
    clarificationChoice?: string;
    maxTurns?: number;
  }

  it("accepts basic request with just prompt", () => {
    const request: OneShotRunRequest = { prompt: "list all terminals" };
    expect(request.prompt).toBe("list all terminals");
    expect(request.maxTurns).toBeUndefined();
  });

  it("accepts request with maxTurns", () => {
    const request: OneShotRunRequest = {
      prompt: "create a new terminal and list all",
      maxTurns: 5,
    };
    expect(request.maxTurns).toBe(5);
  });

  it("accepts request with clarificationChoice", () => {
    const request: OneShotRunRequest = {
      prompt: "open settings",
      clarificationChoice: "General",
    };
    expect(request.clarificationChoice).toBe("General");
  });
});

describe("OneShotRunResult configuration", () => {
  interface OneShotRunResult {
    success: boolean;
    decision?: {
      type: "dispatch" | "ask" | "reply";
      id?: string;
      args?: Record<string, unknown>;
      question?: string;
      choices?: Array<{ label: string; value: string }>;
      text?: string;
    };
    error?: string;
    traceId?: string;
    rawModelOutput?: string;
    turnsUsed?: number;
    totalToolCalls?: number;
  }

  it("includes turnsUsed for successful multi-step execution", () => {
    const result: OneShotRunResult = {
      success: true,
      decision: { type: "reply", text: "Done!" },
      turnsUsed: 3,
      totalToolCalls: 5,
    };
    expect(result.turnsUsed).toBe(3);
    expect(result.totalToolCalls).toBe(5);
  });

  it("includes turnsUsed for failed execution", () => {
    const result: OneShotRunResult = {
      success: false,
      error: "Request cancelled",
      turnsUsed: 2,
      totalToolCalls: 3,
    };
    expect(result.turnsUsed).toBe(2);
    expect(result.totalToolCalls).toBe(3);
  });

  it("allows undefined turnsUsed for backward compatibility", () => {
    const result: OneShotRunResult = {
      success: true,
      decision: { type: "dispatch", id: "terminal.new" },
    };
    expect(result.turnsUsed).toBeUndefined();
  });
});
