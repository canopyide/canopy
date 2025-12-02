import { app } from "electron";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { events } from "./events.js";
import { extractArtifacts, stripAnsiCodes } from "./ArtifactExtractor.js";
import type { AgentSession } from "../types/index.js";
import type { TerminalType } from "../types/index.js";

const MAX_SESSIONS = 100;
const MAX_SESSION_SIZE = 10 * 1024 * 1024;
const DEBOUNCE_WRITE_MS = 2000;

export class TranscriptManager {
  private sessionsDir: string;
  private activeSessions: Map<string, AgentSession> = new Map();
  private writeTimers: Map<string, NodeJS.Timeout> = new Map();
  private disposed = false;
  private eventUnsubscribers: Array<() => void> = [];

  constructor() {
    this.sessionsDir = path.join(app.getPath("userData"), "sessions");
  }

  async initialize(): Promise<void> {
    if (!existsSync(this.sessionsDir)) {
      await fs.mkdir(this.sessionsDir, { recursive: true });
    }

    this.eventUnsubscribers.push(events.on("agent:spawned", this.handleAgentSpawned.bind(this)));
    this.eventUnsubscribers.push(events.on("agent:output", this.handleAgentOutput.bind(this)));
    this.eventUnsubscribers.push(
      events.on("agent:completed", this.handleAgentCompleted.bind(this))
    );
    this.eventUnsubscribers.push(events.on("agent:failed", this.handleAgentFailed.bind(this)));
    this.eventUnsubscribers.push(events.on("agent:killed", this.handleAgentKilled.bind(this)));

    console.log("[TranscriptManager] Initialized, sessions dir:", this.sessionsDir);
  }

  private handleAgentSpawned(payload: {
    agentId: string;
    terminalId: string;
    type: TerminalType;
    worktreeId?: string;
    timestamp: number;
  }): void {
    if (this.disposed) return;

    const nonAgentTypes: TerminalType[] = ["shell", "npm", "yarn", "pnpm", "bun"];
    if (nonAgentTypes.includes(payload.type)) {
      return;
    }

    const agentType = payload.type as "claude" | "gemini" | "codex" | "custom";

    const session: AgentSession = {
      id: payload.agentId,
      agentType: agentType,
      worktreeId: payload.worktreeId,
      startTime: payload.timestamp,
      state: "active",
      transcript: [
        {
          timestamp: payload.timestamp,
          type: "system",
          content: `Agent ${payload.type} started in terminal ${payload.terminalId}`,
        },
      ],
      artifacts: [],
      metadata: {
        terminalId: payload.terminalId,
        cwd: "",
      },
    };

    this.activeSessions.set(payload.agentId, session);
    console.log("[TranscriptManager] Started session:", payload.agentId);
  }

  private handleAgentOutput(payload: { agentId: string; data: string; timestamp: number }): void {
    if (this.disposed) return;

    const session = this.activeSessions.get(payload.agentId);
    if (!session) {
      return;
    }

    const cleanData = stripAnsiCodes(payload.data);

    const currentSize = this.estimateSessionSize(session);
    if (currentSize > MAX_SESSION_SIZE) {
      console.warn(
        `[TranscriptManager] Session ${payload.agentId} exceeded size limit, truncating`
      );
      return;
    }

    session.transcript.push({
      timestamp: payload.timestamp,
      type: "agent",
      content: cleanData,
    });

    const newArtifacts = extractArtifacts(cleanData, session.artifacts);
    session.artifacts.push(...newArtifacts);

    if (newArtifacts.length > 0) {
      events.emit("artifact:detected", {
        agentId: payload.agentId,
        terminalId: session.metadata.terminalId,
        worktreeId: session.worktreeId,
        artifacts: newArtifacts,
        timestamp: payload.timestamp,
      });
    }

    this.scheduleWrite(payload.agentId);
  }

  private async handleAgentCompleted(payload: {
    agentId: string;
    exitCode: number;
    duration: number;
    timestamp: number;
  }): Promise<void> {
    const session = this.activeSessions.get(payload.agentId);
    if (!session) {
      return;
    }

    session.state = "completed";
    session.endTime = payload.timestamp;
    session.metadata.exitCode = payload.exitCode;
    session.transcript.push({
      timestamp: payload.timestamp,
      type: "system",
      content: `Agent completed with exit code ${payload.exitCode} (duration: ${(payload.duration / 1000).toFixed(1)}s)`,
    });

    await this.saveSession(session);
    this.activeSessions.delete(payload.agentId);

    await this.cleanupOldSessions();

    console.log("[TranscriptManager] Completed session:", payload.agentId);
  }

  private async handleAgentFailed(payload: {
    agentId: string;
    error: string;
    timestamp: number;
  }): Promise<void> {
    const session = this.activeSessions.get(payload.agentId);
    if (!session) {
      return;
    }

    session.state = "failed";
    session.endTime = payload.timestamp;
    session.transcript.push({
      timestamp: payload.timestamp,
      type: "system",
      content: `Agent failed: ${payload.error}`,
    });

    await this.saveSession(session);
    this.activeSessions.delete(payload.agentId);

    await this.cleanupOldSessions();

    console.log("[TranscriptManager] Failed session:", payload.agentId);
  }

  private async handleAgentKilled(payload: {
    agentId: string;
    reason?: string;
    timestamp: number;
  }): Promise<void> {
    const session = this.activeSessions.get(payload.agentId);
    if (!session) {
      return;
    }

    session.state = "failed";
    session.endTime = payload.timestamp;
    session.transcript.push({
      timestamp: payload.timestamp,
      type: "system",
      content: `Agent killed${payload.reason ? `: ${payload.reason}` : ""}`,
    });

    await this.saveSession(session);
    this.activeSessions.delete(payload.agentId);

    await this.cleanupOldSessions();

    console.log("[TranscriptManager] Killed session:", payload.agentId);
  }

  private scheduleWrite(agentId: string): void {
    const existingTimer = this.writeTimers.get(agentId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      try {
        const session = this.activeSessions.get(agentId);
        if (session) {
          await this.saveSession(session);
        }
      } catch (error) {
        console.error(`[TranscriptManager] Error in debounced write for ${agentId}:`, error);
      } finally {
        this.writeTimers.delete(agentId);
      }
    }, DEBOUNCE_WRITE_MS);

    this.writeTimers.set(agentId, timer);
  }

  private async saveSession(session: AgentSession): Promise<void> {
    try {
      const sessionPath = path.join(this.sessionsDir, `${session.id}.json`);
      await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), "utf-8");
    } catch (error) {
      console.error("[TranscriptManager] Failed to save session:", error);
    }
  }

  private estimateSessionSize(session: AgentSession): number {
    return JSON.stringify(session).length;
  }

  async getSessions(filters?: {
    worktreeId?: string;
    agentType?: "claude" | "gemini" | "custom";
    limit?: number;
  }): Promise<AgentSession[]> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const sessionFiles = files.filter((f) => f.endsWith(".json"));

      const sessions: AgentSession[] = [];

      for (const file of sessionFiles) {
        const sessionPath = path.join(this.sessionsDir, file);
        try {
          const content = await fs.readFile(sessionPath, "utf-8");
          const session: AgentSession = JSON.parse(content);

          if (filters?.worktreeId && session.worktreeId !== filters.worktreeId) {
            continue;
          }
          if (filters?.agentType && session.agentType !== filters.agentType) {
            continue;
          }

          sessions.push(session);
        } catch (error) {
          console.warn(`[TranscriptManager] Failed to read session ${file}:`, error);
        }
      }

      sessions.sort((a, b) => b.startTime - a.startTime);

      if (filters?.limit) {
        return sessions.slice(0, filters.limit);
      }

      return sessions;
    } catch (error) {
      console.error("[TranscriptManager] Failed to get sessions:", error);
      return [];
    }
  }

  async getSession(sessionId: string): Promise<AgentSession | null> {
    try {
      const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
      if (!existsSync(sessionPath)) {
        return null;
      }
      const content = await fs.readFile(sessionPath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error(`[TranscriptManager] Failed to get session ${sessionId}:`, error);
      return null;
    }
  }

  async exportSession(sessionId: string, format: "json" | "markdown"): Promise<string | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    if (format === "json") {
      return JSON.stringify(session, null, 2);
    }

    if (format === "markdown") {
      return this.sessionToMarkdown(session);
    }

    return null;
  }

  private sessionToMarkdown(session: AgentSession): string {
    const lines: string[] = [];

    lines.push(`# Agent Session: ${session.agentType}`);
    lines.push("");
    lines.push(`**Status:** ${session.state}`);
    lines.push(`**Started:** ${new Date(session.startTime).toLocaleString()}`);
    if (session.endTime) {
      lines.push(`**Ended:** ${new Date(session.endTime).toLocaleString()}`);
      const duration = session.endTime - session.startTime;
      lines.push(`**Duration:** ${(duration / 1000).toFixed(1)}s`);
    }
    if (session.worktreeId) {
      lines.push(`**Worktree:** ${session.worktreeId}`);
    }
    lines.push("");

    lines.push("## Transcript");
    lines.push("");
    for (const entry of session.transcript) {
      const timestamp = new Date(entry.timestamp).toLocaleTimeString();
      lines.push(`**[${timestamp}] ${entry.type}:**`);
      lines.push("");
      lines.push(entry.content);
      lines.push("");
    }

    if (session.artifacts.length > 0) {
      lines.push("## Artifacts");
      lines.push("");
      for (const artifact of session.artifacts) {
        lines.push(`### ${artifact.filename || artifact.type}`);
        lines.push("");
        if (artifact.language) {
          lines.push("`" + artifact.language);
        } else {
          lines.push("`");
        }
        lines.push(artifact.content);
        lines.push("`");
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      if (!/^[a-zA-Z0-9-]+$/.test(sessionId)) {
        throw new Error(`Invalid session ID format: ${sessionId}`);
      }

      const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);

      const normalizedPath = path.normalize(sessionPath);
      if (!normalizedPath.startsWith(this.sessionsDir + path.sep)) {
        throw new Error(`Session path outside sessions directory: ${sessionId}`);
      }

      if (existsSync(sessionPath)) {
        await fs.unlink(sessionPath);
        console.log("[TranscriptManager] Deleted session:", sessionId);
      }
    } catch (error) {
      console.error(`[TranscriptManager] Failed to delete session ${sessionId}:`, error);
      throw error;
    }
  }

  private async cleanupOldSessions(): Promise<void> {
    try {
      const sessions = await this.getSessions();

      if (sessions.length > MAX_SESSIONS) {
        const toDelete = sessions.slice(MAX_SESSIONS);
        for (const session of toDelete) {
          await this.deleteSession(session.id);
        }
        console.log(`[TranscriptManager] Cleaned up ${toDelete.length} old sessions`);
      }
    } catch (error) {
      console.error("[TranscriptManager] Failed to cleanup old sessions:", error);
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    for (const unsubscribe of this.eventUnsubscribers) {
      unsubscribe();
    }
    this.eventUnsubscribers = [];

    for (const timer of this.writeTimers.values()) {
      clearTimeout(timer);
    }
    this.writeTimers.clear();

    for (const session of this.activeSessions.values()) {
      await this.saveSession(session);
    }

    this.activeSessions.clear();
    console.log("[TranscriptManager] Disposed");
  }
}

let transcriptManagerInstance: TranscriptManager | null = null;

export function getTranscriptManager(): TranscriptManager {
  if (!transcriptManagerInstance) {
    transcriptManagerInstance = new TranscriptManager();
  }
  return transcriptManagerInstance;
}

export async function disposeTranscriptManager(): Promise<void> {
  if (transcriptManagerInstance) {
    await transcriptManagerInstance.dispose();
    transcriptManagerInstance = null;
  }
}
