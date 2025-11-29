import { describe, it, expect } from "vitest";
import {
  nextAgentState,
  isValidTransition,
  detectPrompt,
  getStateChangeTimestamp,
  type AgentEvent,
} from "../AgentStateMachine.js";
import type { AgentState } from "../../types/index.js";

describe("AgentStateMachine", () => {
  describe("isValidTransition", () => {
    it("should allow idle → working", () => {
      expect(isValidTransition("idle", "working")).toBe(true);
    });

    it("should allow idle → failed", () => {
      expect(isValidTransition("idle", "failed")).toBe(true);
    });

    it("should allow working → waiting", () => {
      expect(isValidTransition("working", "waiting")).toBe(true);
    });

    it("should allow working → completed", () => {
      expect(isValidTransition("working", "completed")).toBe(true);
    });

    it("should allow working → failed", () => {
      expect(isValidTransition("working", "failed")).toBe(true);
    });

    it("should allow waiting → working", () => {
      expect(isValidTransition("waiting", "working")).toBe(true);
    });

    it("should allow waiting → failed", () => {
      expect(isValidTransition("waiting", "failed")).toBe(true);
    });

    it("should allow completed → failed (error override)", () => {
      expect(isValidTransition("completed", "failed")).toBe(true);
    });

    it("should not allow completed → other states", () => {
      expect(isValidTransition("completed", "idle")).toBe(false);
      expect(isValidTransition("completed", "working")).toBe(false);
      expect(isValidTransition("completed", "waiting")).toBe(false);
    });

    it("should allow failed → failed (error update)", () => {
      expect(isValidTransition("failed", "failed")).toBe(true);
    });

    it("should not allow failed → other states", () => {
      expect(isValidTransition("failed", "idle")).toBe(false);
      expect(isValidTransition("failed", "working")).toBe(false);
      expect(isValidTransition("failed", "waiting")).toBe(false);
      expect(isValidTransition("failed", "completed")).toBe(false);
    });

    it("should not allow invalid transitions", () => {
      expect(isValidTransition("idle", "waiting")).toBe(false);
      expect(isValidTransition("idle", "completed")).toBe(false);
      expect(isValidTransition("waiting", "completed")).toBe(false);
    });
  });

  describe("nextAgentState", () => {
    describe("start event", () => {
      it("should transition idle → working on start", () => {
        const event: AgentEvent = { type: "start" };
        expect(nextAgentState("idle", event)).toBe("working");
      });

      it("should not transition from other states on start", () => {
        const event: AgentEvent = { type: "start" };
        expect(nextAgentState("working", event)).toBe("working");
        expect(nextAgentState("waiting", event)).toBe("waiting");
        expect(nextAgentState("completed", event)).toBe("completed");
        expect(nextAgentState("failed", event)).toBe("failed");
      });
    });

    describe("output event", () => {
      it("should transition working → waiting when prompt detected", () => {
        const event: AgentEvent = { type: "output", data: "Continue? " };
        expect(nextAgentState("working", event)).toBe("waiting");
      });

      it("should stay in working when no prompt detected", () => {
        const event: AgentEvent = { type: "output", data: "Processing data..." };
        expect(nextAgentState("working", event)).toBe("working");
      });

      it("should not transition from other states on output", () => {
        const event: AgentEvent = { type: "output", data: "Continue? " };
        expect(nextAgentState("idle", event)).toBe("idle");
        expect(nextAgentState("waiting", event)).toBe("waiting");
        expect(nextAgentState("completed", event)).toBe("completed");
        expect(nextAgentState("failed", event)).toBe("failed");
      });
    });

    describe("prompt event", () => {
      it("should transition working → waiting on prompt", () => {
        const event: AgentEvent = { type: "prompt" };
        expect(nextAgentState("working", event)).toBe("waiting");
      });

      it("should not transition from other states on prompt", () => {
        const event: AgentEvent = { type: "prompt" };
        expect(nextAgentState("idle", event)).toBe("idle");
        expect(nextAgentState("waiting", event)).toBe("waiting");
        expect(nextAgentState("completed", event)).toBe("completed");
        expect(nextAgentState("failed", event)).toBe("failed");
      });
    });

    describe("input event", () => {
      it("should transition waiting → working on input", () => {
        const event: AgentEvent = { type: "input" };
        expect(nextAgentState("waiting", event)).toBe("working");
      });

      it("should not transition from other states on input", () => {
        const event: AgentEvent = { type: "input" };
        expect(nextAgentState("idle", event)).toBe("idle");
        expect(nextAgentState("working", event)).toBe("working");
        expect(nextAgentState("completed", event)).toBe("completed");
        expect(nextAgentState("failed", event)).toBe("failed");
      });
    });

    describe("exit event", () => {
      it("should transition working → completed on exit code 0", () => {
        const event: AgentEvent = { type: "exit", code: 0 };
        expect(nextAgentState("working", event)).toBe("completed");
      });

      it("should transition working → failed on non-zero exit code", () => {
        const event: AgentEvent = { type: "exit", code: 1 };
        expect(nextAgentState("working", event)).toBe("failed");
      });

      it("should transition waiting → completed on exit code 0", () => {
        const event: AgentEvent = { type: "exit", code: 0 };
        expect(nextAgentState("waiting", event)).toBe("completed");
      });

      it("should transition waiting → failed on non-zero exit code", () => {
        const event: AgentEvent = { type: "exit", code: 1 };
        expect(nextAgentState("waiting", event)).toBe("failed");
      });

      it("should not transition from other states on exit", () => {
        const event: AgentEvent = { type: "exit", code: 0 };
        expect(nextAgentState("idle", event)).toBe("idle");
        expect(nextAgentState("completed", event)).toBe("completed");
        expect(nextAgentState("failed", event)).toBe("failed");
      });
    });

    describe("error event", () => {
      it("should transition to failed from any state", () => {
        const event: AgentEvent = { type: "error", error: "Something went wrong" };
        const states: AgentState[] = ["idle", "working", "waiting", "completed", "failed"];

        for (const state of states) {
          expect(nextAgentState(state, event)).toBe("failed");
        }
      });
    });
  });

  describe("detectPrompt", () => {
    it("should detect question mark prompts", () => {
      expect(detectPrompt("Continue? ")).toBe(true);
      expect(detectPrompt("Are you sure?")).toBe(true);
      expect(detectPrompt("Retry?")).toBe(true);
    });

    it("should detect yes/no prompts", () => {
      expect(detectPrompt("Proceed (y/n)")).toBe(true);
      expect(detectPrompt("Confirm (Y/N)")).toBe(true);
      expect(detectPrompt("Continue (yes/no)")).toBe(true);
      expect(detectPrompt("Accept (YES/NO)")).toBe(true);
    });

    it("should detect enter prompts", () => {
      expect(detectPrompt("Press enter to continue")).toBe(true);
      expect(detectPrompt("Press ENTER to proceed")).toBe(true);
      expect(detectPrompt("Enter to continue")).toBe(true);
    });

    it("should detect colon prompts", () => {
      expect(detectPrompt("Username: ")).toBe(true);
      expect(detectPrompt("Password:")).toBe(true);
    });

    it("should detect greater-than prompts", () => {
      expect(detectPrompt("cmd> ")).toBe(true);
      expect(detectPrompt(">>>")).toBe(true);
    });

    it("should not detect prompts in regular output", () => {
      expect(detectPrompt("Processing data...")).toBe(false);
      expect(detectPrompt("Task completed successfully")).toBe(false);
      expect(detectPrompt("Running tests")).toBe(false);
    });

    it("should not detect very short strings as prompts", () => {
      expect(detectPrompt("? ")).toBe(false); // Length 2, below MIN_PROMPT_LENGTH
      expect(detectPrompt(": ")).toBe(false); // Length 2
      expect(detectPrompt(">")).toBe(false); // Length 1
    });

    it("should handle edge cases", () => {
      expect(detectPrompt("")).toBe(false);
      expect(detectPrompt("   ")).toBe(false);
    });
  });

  describe("getStateChangeTimestamp", () => {
    it("should return a valid timestamp", () => {
      const timestamp = getStateChangeTimestamp();
      expect(typeof timestamp).toBe("number");
      expect(timestamp).toBeGreaterThan(0);
    });

    it("should return current time approximately", () => {
      const before = Date.now();
      const timestamp = getStateChangeTimestamp();
      const after = Date.now();

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });
});
