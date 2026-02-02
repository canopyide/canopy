import { randomUUID } from "node:crypto";

export interface ContinuationContext {
  plan?: string;
  lastToolCalls?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface Continuation {
  id: string;
  sessionId: string;
  listenerId: string;
  resumePrompt: string;
  context: ContinuationContext;
  createdAt: number;
  expiresAt: number;
}

const DEFAULT_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export class ContinuationManager {
  private continuations = new Map<string, Continuation>();
  private listenerToContinuation = new Map<string, string>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupInterval();
  }

  create(
    sessionId: string,
    listenerId: string,
    resumePrompt: string,
    context: ContinuationContext = {},
    expirationMs: number = DEFAULT_EXPIRATION_MS
  ): Continuation {
    // Remove any existing continuation for this listener
    const existingId = this.listenerToContinuation.get(listenerId);
    if (existingId) {
      this.continuations.delete(existingId);
    }

    const id = randomUUID();
    const now = Date.now();

    const continuation: Continuation = {
      id,
      sessionId,
      listenerId,
      resumePrompt,
      context,
      createdAt: now,
      expiresAt: now + expirationMs,
    };

    this.continuations.set(id, continuation);
    this.listenerToContinuation.set(listenerId, id);

    return continuation;
  }

  get(id: string): Continuation | undefined {
    const continuation = this.continuations.get(id);
    if (continuation && this.isExpired(continuation)) {
      this.remove(id);
      return undefined;
    }
    return continuation;
  }

  getByListenerId(listenerId: string): Continuation | undefined {
    const id = this.listenerToContinuation.get(listenerId);
    if (!id) {
      return undefined;
    }
    return this.get(id);
  }

  remove(id: string): boolean {
    const continuation = this.continuations.get(id);
    if (continuation) {
      this.listenerToContinuation.delete(continuation.listenerId);
      this.continuations.delete(id);
      return true;
    }
    return false;
  }

  removeByListenerId(listenerId: string): boolean {
    const id = this.listenerToContinuation.get(listenerId);
    if (id) {
      return this.remove(id);
    }
    return false;
  }

  listForSession(sessionId: string): Continuation[] {
    const result: Continuation[] = [];
    for (const continuation of this.continuations.values()) {
      if (continuation.sessionId === sessionId && !this.isExpired(continuation)) {
        result.push(continuation);
      }
    }
    return result;
  }

  clearSession(sessionId: string): number {
    const toRemove: string[] = [];
    for (const continuation of this.continuations.values()) {
      if (continuation.sessionId === sessionId) {
        toRemove.push(continuation.id);
      }
    }

    for (const id of toRemove) {
      this.remove(id);
    }

    if (toRemove.length > 0) {
      console.log(
        `[ContinuationManager] Cleared ${toRemove.length} continuation(s) for session ${sessionId}`
      );
    }

    return toRemove.length;
  }

  clearExpired(): number {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const continuation of this.continuations.values()) {
      if (continuation.expiresAt <= now) {
        toRemove.push(continuation.id);
      }
    }

    for (const id of toRemove) {
      this.remove(id);
    }

    if (toRemove.length > 0) {
      console.log(`[ContinuationManager] Cleared ${toRemove.length} expired continuation(s)`);
    }

    return toRemove.length;
  }

  clearAll(): number {
    const count = this.continuations.size;
    this.continuations.clear();
    this.listenerToContinuation.clear();

    if (count > 0) {
      console.log(`[ContinuationManager] Cleared all ${count} continuation(s)`);
    }

    return count;
  }

  size(): number {
    return this.continuations.size;
  }

  private isExpired(continuation: Continuation): boolean {
    return Date.now() >= continuation.expiresAt;
  }

  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      return;
    }
    this.cleanupInterval = setInterval(() => {
      this.clearExpired();
    }, CLEANUP_INTERVAL_MS);

    // Don't prevent process exit
    this.cleanupInterval.unref();
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clearAll();
  }
}

export const continuationManager = new ContinuationManager();
