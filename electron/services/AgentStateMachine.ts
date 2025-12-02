import stripAnsi from "strip-ansi";
import type { AgentState } from "../types/index.js";
import { getAgentProfile } from "./ai/agentProfiles.js";

export type AgentEvent =
  | { type: "start" }
  | { type: "output"; data: string }
  | { type: "busy" } // Detected busy/working indicator (e.g., "esc to interrupt")
  | { type: "prompt" } // Detected prompt/waiting for user input
  | { type: "input" } // User input received
  | { type: "exit"; code: number }
  | { type: "error"; error: string };

const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  idle: ["working", "failed"],
  working: ["waiting", "completed", "failed"],
  waiting: ["working", "failed"],
  completed: ["failed"], // Allow error events to override completed state
  failed: ["failed"],
};

export function isValidTransition(from: AgentState, to: AgentState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function nextAgentState(current: AgentState, event: AgentEvent): AgentState {
  if (event.type === "error") {
    return "failed";
  }

  switch (event.type) {
    case "start":
      if (current === "idle") {
        return "working";
      }
      break;

    case "busy":
      // Handles re-entry to working from waiting state when agent resumes
      if (current === "waiting" || current === "idle") {
        return "working";
      }
      break;

    case "output":
      if (current === "working" && detectPrompt(event.data)) {
        return "waiting";
      }
      break;

    case "prompt":
      if (current === "working") {
        return "waiting";
      }
      break;

    case "input":
      if (current === "waiting") {
        return "working";
      }
      break;

    case "exit":
      if (current === "working" || current === "waiting") {
        return event.code === 0 ? "completed" : "failed";
      }
      break;
  }

  return current;
}

const HIGH_CONFIDENCE_PROMPT_PATTERNS = [
  /\(y\/n\)/i, // Yes/no prompt
  /\(yes\/no\)/i, // Full yes/no prompt
  /\[y\/n\]/i, // Bracketed yes/no
  /\[yes\/no\]/i, // Bracketed full yes/no
  /enter\s+to\s+continue/i, // "Enter to continue"
  /press\s+enter/i, // "Press enter"
  /\(s\/n\)/i, // Spanish yes/no (sí/no)
  /\(o\/n\)/i, // French yes/no (oui/non)
  /continue\?\s*\(y\/n\)/i, // "Continue? (y/n)"
  /do\s+you\s+want\s+to\s+(proceed|continue)/i, // "Do you want to proceed/continue"
  /are\s+you\s+sure/i, // "Are you sure"
  /confirm/i, // Contains "confirm"
  /password:/i, // Password prompt
  /passphrase:/i, // SSH passphrase prompt
  /username:/i, // Username prompt
  /login:/i, // Login prompt
];

const LOW_CONFIDENCE_PROMPT_PATTERNS = [
  /\?\s*$/, // Question mark at end (could be log message or question in text)
  /:\s*$/, // Colon at end (common prompt but also log prefixes)
  />\s*$/, // Greater-than at end (shell prompts, but also comparison operators)
];

const NON_PROMPT_PATTERNS = [
  /^[\d\-.T:]+\s/, // Starts with timestamp (e.g., "2025-01-28T10:30:00")
  /^\[[\w-]+\]/, // Starts with log level bracket (e.g., "[INFO]", "[DEBUG]")
  /^(info|warn|error|debug|trace):/i, // Log level prefix
  /\d{4}-\d{2}-\d{2}/, // Contains date (ISO format)
  /https?:\/\//, // Contains URL
  /have\s+any\s+questions/i, // "Do you have any questions?" in output text
  /what\s+questions/i, // "What questions..." in output text
  /if\s+you\s+have\s+questions/i, // "If you have questions" in output
  /questions\?\s*\n/i, // "questions?" followed by newline (part of log/doc)
];

const MIN_PROMPT_LENGTH = 3;

const MAX_LOW_CONFIDENCE_LENGTH = 200;

const MAX_BUFFER_LENGTH = 2048;

export interface PromptDetectionOptions {
  timeSinceLastOutput?: number;
  processAlive?: boolean;
}

export function detectPrompt(
  data: string,
  options?: PromptDetectionOptions & { type?: string }
): boolean {
  const cleanData = stripAnsi(data);

  if (options?.type) {
    const profile = getAgentProfile(options.type);
    if (profile?.promptPatterns?.some((p) => p.test(cleanData))) {
      return true;
    }
  }

  if (cleanData.length < MIN_PROMPT_LENGTH) {
    return false;
  }

  const buffer =
    cleanData.length > MAX_BUFFER_LENGTH ? cleanData.slice(-MAX_BUFFER_LENGTH) : cleanData;

  const trimmed = buffer.trim();
  if (trimmed.length === 0) {
    return false;
  }

  const lines = trimmed.split("\n");
  const lastLine = lines[lines.length - 1].trim();

  if (HIGH_CONFIDENCE_PROMPT_PATTERNS.some((pattern) => pattern.test(lastLine))) {
    return true;
  }

  if (NON_PROMPT_PATTERNS.some((pattern) => pattern.test(lastLine))) {
    return false;
  }

  const endsWithNewline = cleanData.endsWith("\n") || cleanData.endsWith("\r");
  const isShortBuffer = lastLine.length < MAX_LOW_CONFIDENCE_LENGTH;

  if (isShortBuffer && !endsWithNewline) {
    if (LOW_CONFIDENCE_PROMPT_PATTERNS.some((pattern) => pattern.test(lastLine))) {
      return true;
    }
  }

  if (options?.timeSinceLastOutput !== undefined && options?.processAlive) {
    const silentFor500ms = options.timeSinceLastOutput > 500;
    const hasPromptChar = /[?:>]/.test(lastLine);

    if (silentFor500ms && !endsWithNewline && isShortBuffer && hasPromptChar) {
      return true;
    }
  }

  return false;
}

export function getStateChangeTimestamp(): number {
  return Date.now();
}

export function detectBusyState(data: string, type: string): boolean {
  const profile = getAgentProfile(type);
  if (!profile) return false;

  const cleanData = stripAnsi(data);
  return profile.busyPatterns.some((pattern) => pattern.test(cleanData));
}
