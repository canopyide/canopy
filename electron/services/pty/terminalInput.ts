import type { TerminalInfo } from "./types.js";
import {
  BRACKETED_PASTE_START,
  BRACKETED_PASTE_END,
  PASTE_THRESHOLD_CHARS,
  getSoftNewlineSequence as getSoftNewlineSequenceShared,
  containsFullBracketedPaste,
} from "../../../shared/utils/terminalInputProtocol.js";
import { WRITE_MAX_CHUNK_SIZE } from "./types.js";

export { BRACKETED_PASTE_START, BRACKETED_PASTE_END, PASTE_THRESHOLD_CHARS };

export const SUBMIT_ENTER_DELAY_MS = 200;
export const OUTPUT_SETTLE_DEBOUNCE_MS = 200;
export const OUTPUT_SETTLE_MAX_WAIT_MS = 2000;
export const OUTPUT_SETTLE_POLL_INTERVAL_MS = 50;

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeSubmitText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function splitTrailingNewlines(text: string): { body: string; enterCount: number } {
  let body = text;
  let enterCount = 0;
  while (body.endsWith("\n")) {
    body = body.slice(0, -1);
    enterCount++;
  }
  if (enterCount === 0) {
    enterCount = 1;
  }
  return { body, enterCount };
}

function isGeminiTerminal(terminal: TerminalInfo): boolean {
  return (
    terminal.type === "gemini" ||
    terminal.detectedAgentType === "gemini" ||
    (terminal.kind === "agent" && terminal.agentId === "gemini")
  );
}

function isCodexTerminal(terminal: TerminalInfo): boolean {
  return (
    terminal.type === "codex" ||
    terminal.detectedAgentType === "codex" ||
    (terminal.kind === "agent" && terminal.agentId === "codex")
  );
}

function getEffectiveAgentType(terminal: TerminalInfo): string | undefined {
  return terminal.detectedAgentType ?? terminal.agentId ?? terminal.type;
}

export function supportsBracketedPaste(terminal: TerminalInfo): boolean {
  return !isGeminiTerminal(terminal);
}

export function getSoftNewlineSequence(terminal: TerminalInfo): string {
  const effectiveType = getEffectiveAgentType(terminal);
  const agentType = isCodexTerminal(terminal) ? "codex" : effectiveType;
  return getSoftNewlineSequenceShared(agentType);
}

export function isBracketedPaste(data: string): boolean {
  return containsFullBracketedPaste(data);
}

export function chunkInput(data: string): string[] {
  if (data.length === 0) {
    return [];
  }
  if (data.length <= WRITE_MAX_CHUNK_SIZE) {
    return [data];
  }

  const chunks: string[] = [];
  let start = 0;

  for (let i = 0; i < data.length - 1; i++) {
    if (i - start + 1 >= WRITE_MAX_CHUNK_SIZE || data[i + 1] === "\x1b") {
      chunks.push(data.substring(start, i + 1));
      start = i + 1;
    }
  }

  if (start < data.length) {
    chunks.push(data.substring(start));
  }

  return chunks;
}
