import { appendFileSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { app } from "electron";
import type { AssistantMessage, StreamChunk } from "../../shared/types/assistant.js";
import type { ActionManifestEntry, ActionContext } from "../../shared/types/actions.js";

const IS_TEST = process.env.NODE_ENV === "test";

type AssistantLogType = "request" | "stream" | "complete" | "error" | "cancelled";

interface BaseLogEntry {
  ts: string;
  type: AssistantLogType;
  sessionId: string;
}

interface RequestLogEntry extends BaseLogEntry {
  type: "request";
  messages: AssistantMessage[];
  tools: string[];
  listenerToolCount: number;
  context: Partial<ActionContext> | null;
  model: string;
  systemPromptLength: number;
}

interface StreamLogEntry extends BaseLogEntry {
  type: "stream";
  event: "text-delta" | "tool-call" | "tool-result" | "error" | "other";
  content?: string;
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  partType?: string;
  data?: unknown;
}

interface CompleteLogEntry extends BaseLogEntry {
  type: "complete";
  finishReason: string | undefined;
  durationMs: number;
}

interface ErrorLogEntry extends BaseLogEntry {
  type: "error";
  error: string;
  durationMs?: number;
}

interface CancelledLogEntry extends BaseLogEntry {
  type: "cancelled";
  durationMs: number;
}

type AssistantLogEntry =
  | RequestLogEntry
  | StreamLogEntry
  | CompleteLogEntry
  | ErrorLogEntry
  | CancelledLogEntry;

let logFilePath: string | null = null;
let isInitialized = false;

function isDevelopmentMode(): boolean {
  if (IS_TEST || process.env.CANOPY_DISABLE_FILE_LOGGING === "1") {
    return false;
  }
  try {
    return !app.isPackaged || process.env.NODE_ENV === "development";
  } catch {
    return process.env.NODE_ENV === "development";
  }
}

function getLogFilePath(): string {
  if (logFilePath) {
    return logFilePath;
  }

  let basePath: string;
  if (process.env.CANOPY_USER_DATA) {
    basePath = process.env.CANOPY_USER_DATA;
  } else {
    try {
      basePath = app.getPath("userData");
    } catch {
      basePath = process.cwd();
    }
  }

  const logsDir = join(basePath, "logs");
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  logFilePath = join(logsDir, "assistant.log");
  return logFilePath;
}

export function initializeAssistantLogger(): void {
  if (isInitialized || !isDevelopmentMode()) {
    return;
  }

  try {
    const filePath = getLogFilePath();
    writeFileSync(filePath, "", "utf8");
    isInitialized = true;
  } catch {
    // Silently fail - logging is optional
  }
}

function safeJSONStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === "bigint") {
        return val.toString();
      }
      if (val && typeof val === "object") {
        if (seen.has(val as object)) {
          return "[Circular]";
        }
        seen.add(val as object);
      }
      return val;
    });
  } catch {
    return JSON.stringify({ error: "Failed to serialize" });
  }
}

function writeLogEntry(entry: AssistantLogEntry): void {
  if (!isDevelopmentMode()) {
    return;
  }

  if (!isInitialized) {
    initializeAssistantLogger();
  }

  try {
    const filePath = getLogFilePath();
    const line = safeJSONStringify(entry) + "\n";
    appendFileSync(filePath, line, "utf8");
  } catch {
    // Silently fail - logging should not break functionality
  }
}

export function logAssistantRequest(
  sessionId: string,
  messages: AssistantMessage[],
  tools: ActionManifestEntry[] | undefined,
  listenerToolCount: number,
  context: ActionContext | undefined,
  model: string,
  systemPromptLength: number
): void {
  const entry: RequestLogEntry = {
    ts: new Date().toISOString(),
    type: "request",
    sessionId,
    messages,
    tools: tools?.map((t) => t.id) ?? [],
    listenerToolCount,
    context: context
      ? {
          projectId: context.projectId,
          projectName: context.projectName,
          activeWorktreeId: context.activeWorktreeId,
          activeWorktreeName: context.activeWorktreeName,
          focusedTerminalId: context.focusedTerminalId,
        }
      : null,
    model,
    systemPromptLength,
  };
  writeLogEntry(entry);
}

export function logAssistantStreamEvent(sessionId: string, chunk: StreamChunk): void {
  let entry: StreamLogEntry;

  switch (chunk.type) {
    case "text":
      entry = {
        ts: new Date().toISOString(),
        type: "stream",
        sessionId,
        event: "text-delta",
        content: chunk.content,
      };
      break;

    case "tool_call":
      if (!chunk.toolCall) return;
      entry = {
        ts: new Date().toISOString(),
        type: "stream",
        sessionId,
        event: "tool-call",
        toolName: chunk.toolCall.name,
        toolCallId: chunk.toolCall.id,
        args: chunk.toolCall.args,
      };
      break;

    case "tool_result":
      if (!chunk.toolResult) return;
      entry = {
        ts: new Date().toISOString(),
        type: "stream",
        sessionId,
        event: "tool-result",
        toolName: chunk.toolResult.toolName,
        toolCallId: chunk.toolResult.toolCallId,
        result: chunk.toolResult.result,
      };
      break;

    case "error":
      entry = {
        ts: new Date().toISOString(),
        type: "stream",
        sessionId,
        event: "error",
        error: chunk.error,
      };
      break;

    default:
      return;
  }

  writeLogEntry(entry);
}

export function logAssistantComplete(
  sessionId: string,
  finishReason: string | undefined,
  durationMs: number
): void {
  const entry: CompleteLogEntry = {
    ts: new Date().toISOString(),
    type: "complete",
    sessionId,
    finishReason,
    durationMs,
  };
  writeLogEntry(entry);
}

export function logAssistantError(sessionId: string, error: string, durationMs?: number): void {
  const entry: ErrorLogEntry = {
    ts: new Date().toISOString(),
    type: "error",
    sessionId,
    error,
    durationMs,
  };
  writeLogEntry(entry);
}

export function logAssistantCancelled(sessionId: string, durationMs: number): void {
  const entry: CancelledLogEntry = {
    ts: new Date().toISOString(),
    type: "cancelled",
    sessionId,
    durationMs,
  };
  writeLogEntry(entry);
}

export function logAssistantStreamPart(
  sessionId: string,
  partType: string,
  partData?: unknown
): void {
  const entry: StreamLogEntry = {
    ts: new Date().toISOString(),
    type: "stream",
    sessionId,
    event: "other",
    partType,
    data: partData,
  };
  writeLogEntry(entry);
}
