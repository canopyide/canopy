import { app } from "electron";
import path from "path";
import fs from "fs/promises";
import { events } from "./events.js";
import type { AgentSession } from "../../shared/types/ipc.js";
import type { TerminalType } from "../types/index.js";

const MAX_RETAINED_SESSIONS = 500;
const EVICTION_BATCH_SIZE = 50;

class TranscriptService {
  private storageDir: string;
  private activeSessions = new Map<string, AgentSession>();
  private initialized = false;
  private eventCleanups: Array<() => void> = [];

  constructor() {
    this.storageDir = path.join(app.getPath("userData"), "transcripts");
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      this.bindEvents();
      this.initialized = true;
      void this.pruneOldSessions();
    } catch (err) {
      console.error("[TranscriptService] Failed to create transcripts directory:", err);
    }
  }

  private bindEvents(): void {
    const spawnedHandler = (payload: {
      terminalId: string;
      type: TerminalType;
      worktreeId?: string;
      timestamp?: number;
    }) => {
      const agentType = this.mapTerminalTypeToAgentType(payload.type);
      this.activeSessions.set(payload.terminalId, {
        id: payload.terminalId,
        agentType,
        worktreeId: payload.worktreeId,
        startTime: payload.timestamp ?? Date.now(),
        state: "active",
        transcript: [],
        artifacts: [],
        metadata: {
          terminalId: payload.terminalId,
          cwd: "",
        },
      });
    };
    events.on("agent:spawned", spawnedHandler);
    this.eventCleanups.push(() => events.off("agent:spawned", spawnedHandler));

    const outputHandler = (payload: {
      terminalId?: string;
      agentId?: string;
      data: string;
      timestamp?: number;
    }) => {
      const sessionId = payload.terminalId ?? payload.agentId;
      if (!sessionId) return;

      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.transcript.push({
          timestamp: payload.timestamp ?? Date.now(),
          type: "agent",
          content: payload.data,
        });
      }
    };
    events.on("agent:output", outputHandler);
    this.eventCleanups.push(() => events.off("agent:output", outputHandler));

    const artifactHandler = (payload: { terminalId: string; artifacts: unknown[] }) => {
      const session = this.activeSessions.get(payload.terminalId);
      if (session) {
        session.artifacts.push(...(payload.artifacts as never[]));
      }
    };
    events.on("artifact:detected", artifactHandler);
    this.eventCleanups.push(() => events.off("artifact:detected", artifactHandler));

    const completedHandler = (payload: {
      terminalId?: string;
      agentId?: string;
      exitCode?: number;
    }) => {
      const sessionId = payload.terminalId ?? payload.agentId;
      if (sessionId) {
        this.finalizeSession(sessionId, "completed", payload.exitCode);
      }
    };
    events.on("agent:completed", completedHandler);
    this.eventCleanups.push(() => events.off("agent:completed", completedHandler));

    const failedHandler = (payload: { terminalId?: string; agentId?: string }) => {
      const sessionId = payload.terminalId ?? payload.agentId;
      if (sessionId) {
        this.finalizeSession(sessionId, "failed");
      }
    };
    events.on("agent:failed", failedHandler);
    this.eventCleanups.push(() => events.off("agent:failed", failedHandler));

    const killedHandler = (payload: { terminalId?: string; agentId?: string }) => {
      const sessionId = payload.terminalId ?? payload.agentId;
      if (sessionId) {
        this.finalizeSession(sessionId, "failed");
      }
    };
    events.on("agent:killed", killedHandler);
    this.eventCleanups.push(() => events.off("agent:killed", killedHandler));
  }

  private mapTerminalTypeToAgentType(type: TerminalType): AgentSession["agentType"] {
    switch (type) {
      case "claude":
        return "claude";
      case "gemini":
        return "gemini";
      case "codex":
        return "codex";
      default:
        return "custom";
    }
  }

  private async finalizeSession(
    id: string,
    state: "completed" | "failed",
    exitCode?: number
  ): Promise<void> {
    const session = this.activeSessions.get(id);
    if (!session) return;

    session.state = state;
    session.endTime = Date.now();
    if (exitCode !== undefined) {
      session.metadata.exitCode = exitCode;
    }

    const lastEntry = session.transcript.slice(-1)[0];
    if (lastEntry) {
      const ansiRegex = /\x1b\[[0-9;]*m/g; // eslint-disable-line no-control-regex
      const summary = lastEntry.content.replace(ansiRegex, "").slice(0, 100).trim();
      (session as AgentSession & { summary?: string }).summary = summary;
    }

    const filePath = path.join(this.storageDir, `${id}.json`);
    try {
      await fs.writeFile(filePath, JSON.stringify(session, null, 2));
      void this.pruneOldSessions();
    } catch (err) {
      console.error(`[TranscriptService] Failed to save session ${id}:`, err);
    }

    this.activeSessions.delete(id);
  }

  private async pruneOldSessions(): Promise<void> {
    try {
      const files = await fs.readdir(this.storageDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      if (jsonFiles.length <= MAX_RETAINED_SESSIONS) return;

      console.log(
        `[TranscriptService] Pruning sessions. Current: ${jsonFiles.length}, Max: ${MAX_RETAINED_SESSIONS}`
      );

      const allSessions = await this.getAllSessions();
      const sessionsToDelete = allSessions.slice(MAX_RETAINED_SESSIONS);
      const batch = sessionsToDelete.slice(0, EVICTION_BATCH_SIZE);

      await Promise.all(
        batch.map(async (session) => {
          try {
            await fs.unlink(path.join(this.storageDir, `${session.id}.json`));
          } catch {
            // Ignore if file already gone
          }
        })
      );

      console.log(`[TranscriptService] Evicted ${batch.length} old sessions.`);
    } catch (err) {
      console.error("[TranscriptService] Eviction error:", err);
    }
  }

  async getAllSessions(): Promise<AgentSession[]> {
    try {
      const files = await fs.readdir(this.storageDir);
      const sessions = await Promise.all(
        files
          .filter((f) => f.endsWith(".json"))
          .map(async (f) => {
            try {
              const content = await fs.readFile(path.join(this.storageDir, f), "utf-8");
              return JSON.parse(content) as AgentSession;
            } catch {
              return null;
            }
          })
      );
      return sessions
        .filter((s): s is AgentSession => s !== null)
        .sort((a, b) => b.startTime - a.startTime);
    } catch (err) {
      console.error("[TranscriptService] Failed to read sessions:", err);
      return [];
    }
  }

  private validateSessionId(id: string): boolean {
    const basename = path.basename(id);
    return basename === id && /^[a-zA-Z0-9_-]+$/.test(id);
  }

  async getSession(id: string): Promise<AgentSession | null> {
    if (!this.validateSessionId(id)) {
      console.error(`[TranscriptService] Invalid session ID: ${id}`);
      return null;
    }

    try {
      const filePath = path.join(this.storageDir, `${id}.json`);
      const resolvedPath = path.resolve(filePath);
      const resolvedStorageDir = path.resolve(this.storageDir);

      if (!resolvedPath.startsWith(resolvedStorageDir)) {
        console.error(`[TranscriptService] Path traversal attempt: ${id}`);
        return null;
      }

      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content) as AgentSession;
    } catch {
      return null;
    }
  }

  async deleteSession(id: string): Promise<void> {
    if (!this.validateSessionId(id)) {
      console.error(`[TranscriptService] Invalid session ID: ${id}`);
      return;
    }

    try {
      const filePath = path.join(this.storageDir, `${id}.json`);
      const resolvedPath = path.resolve(filePath);
      const resolvedStorageDir = path.resolve(this.storageDir);

      if (!resolvedPath.startsWith(resolvedStorageDir)) {
        console.error(`[TranscriptService] Path traversal attempt: ${id}`);
        return;
      }

      await fs.unlink(filePath);
    } catch (err) {
      console.error(`[TranscriptService] Failed to delete session ${id}:`, err);
    }
  }

  async exportSession(id: string, targetPath: string): Promise<void> {
    const session = await this.getSession(id);
    if (!session) throw new Error("Session not found");

    const markdown = this.sessionToMarkdown(session);
    await fs.writeFile(targetPath, markdown);
  }

  private sessionToMarkdown(session: AgentSession): string {
    const lines: string[] = [];
    lines.push(`# Agent Session: ${session.id}`);
    lines.push("");
    lines.push(`**Agent Type**: ${session.agentType}`);
    lines.push(`**Started**: ${new Date(session.startTime).toLocaleString()}`);
    if (session.endTime) {
      lines.push(`**Ended**: ${new Date(session.endTime).toLocaleString()}`);
    }
    lines.push(`**State**: ${session.state}`);
    lines.push("");
    lines.push("## Transcript");
    lines.push("");

    const ansiStripRegex = /\x1b\[[0-9;]*m/g; // eslint-disable-line no-control-regex
    for (const entry of session.transcript) {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      lines.push(`**[${time}] ${entry.type}**`);
      const cleanContent = entry.content.replace(ansiStripRegex, "");
      lines.push(cleanContent);
      lines.push("");
    }

    if (session.artifacts.length > 0) {
      lines.push("## Artifacts");
      lines.push("");
      session.artifacts.forEach((artifact, i) => {
        lines.push(`### Artifact ${i + 1}: ${artifact.type}`);
        if (artifact.filename) lines.push(`**File**: ${artifact.filename}`);
        lines.push("```" + (artifact.language || ""));
        lines.push(artifact.content);
        lines.push("```");
        lines.push("");
      });
    }

    return lines.join("\n");
  }

  dispose(): void {
    this.eventCleanups.forEach((cleanup) => cleanup());
    this.eventCleanups = [];
    this.activeSessions.clear();
  }
}

let transcriptServiceInstance: TranscriptService | null = null;

export function getTranscriptService(): TranscriptService {
  if (!transcriptServiceInstance) {
    transcriptServiceInstance = new TranscriptService();
  }
  return transcriptServiceInstance;
}

export function disposeTranscriptService(): void {
  if (transcriptServiceInstance) {
    transcriptServiceInstance.dispose();
    transcriptServiceInstance = null;
  }
}

export { TranscriptService };
