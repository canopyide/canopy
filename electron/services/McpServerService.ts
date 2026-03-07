import { ipcMain, BrowserWindow } from "electron";
import http from "node:http";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ActionManifestEntry, ActionDispatchResult } from "../../shared/types/actions.js";
import { store } from "../store.js";

const DISCOVERY_DIR = path.join(os.homedir(), ".canopy");
const DISCOVERY_FILE = path.join(DISCOVERY_DIR, "mcp.json");
const MCP_SERVER_KEY = "canopy";

interface PendingManifest {
  resolve: (manifest: ActionManifestEntry[]) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingDispatch {
  resolve: (result: ActionDispatchResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class McpServerService {
  private httpServer: http.Server | null = null;
  private port: number | null = null;
  private mainWindow: BrowserWindow | null = null;
  private sessions = new Map<string, SSEServerTransport>();
  private pendingManifest: PendingManifest | null = null;
  private pendingDispatches = new Map<string, PendingDispatch>();
  private cleanupListeners: Array<() => void> = [];

  get isRunning(): boolean {
    return this.httpServer !== null && this.port !== null;
  }

  get currentPort(): number | null {
    return this.port;
  }

  isEnabled(): boolean {
    return store.get("mcpServer").enabled;
  }

  setEnabled(enabled: boolean): void {
    store.set("mcpServer", { enabled });
    if (enabled && this.mainWindow && !this.isRunning) {
      void this.start(this.mainWindow);
    } else if (!enabled && this.isRunning) {
      void this.stop();
    }
  }

  async start(window: BrowserWindow): Promise<void> {
    this.mainWindow = window;

    if (this.httpServer) {
      return;
    }

    if (!this.isEnabled()) {
      console.log("[MCP] Server disabled — skipping start");
      return;
    }

    this.setupIpcListeners();

    this.httpServer = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.on("error", reject);
      this.httpServer!.listen(0, "127.0.0.1", () => {
        const addr = this.httpServer!.address() as AddressInfo | null;
        this.port = addr?.port ?? null;
        resolve();
      });
    });

    await this.writeDiscoveryFile();
    console.log(`[MCP] Server started on http://127.0.0.1:${this.port}/sse`);
  }

  async stop(): Promise<void> {
    for (const transport of this.sessions.values()) {
      try {
        await transport.close();
      } catch {
        // ignore close errors during shutdown
      }
    }
    this.sessions.clear();

    for (const cleanup of this.cleanupListeners) {
      cleanup();
    }
    this.cleanupListeners = [];

    // Reject any pending requests
    if (this.pendingManifest) {
      clearTimeout(this.pendingManifest.timer);
      this.pendingManifest.reject(new Error("MCP server stopped"));
      this.pendingManifest = null;
    }
    for (const [id, pending] of this.pendingDispatches) {
      clearTimeout(pending.timer);
      pending.reject(new Error("MCP server stopped"));
      this.pendingDispatches.delete(id);
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
      this.port = null;
    }

    await this.removeDiscoveryFile();
    console.log("[MCP] Server stopped");
  }

  getStatus(): { enabled: boolean; port: number | null } {
    return { enabled: this.isEnabled(), port: this.port };
  }

  getConfigSnippet(): string {
    const url = this.port ? `http://127.0.0.1:${this.port}/sse` : "http://127.0.0.1:<port>/sse";
    return JSON.stringify({ mcpServers: { [MCP_SERVER_KEY]: { type: "sse", url } } }, null, 2);
  }

  private setupIpcListeners(): void {
    const manifestHandler = (_event: Electron.IpcMainEvent, manifest: ActionManifestEntry[]) => {
      if (this.pendingManifest) {
        clearTimeout(this.pendingManifest.timer);
        this.pendingManifest.resolve(manifest);
        this.pendingManifest = null;
      }
    };

    const dispatchHandler = (
      _event: Electron.IpcMainEvent,
      payload: { requestId: string; result: ActionDispatchResult }
    ) => {
      const pending = this.pendingDispatches.get(payload.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingDispatches.delete(payload.requestId);
        pending.resolve(payload.result);
      }
    };

    ipcMain.on("mcp:get-manifest-response", manifestHandler);
    ipcMain.on("mcp:dispatch-action-response", dispatchHandler);

    this.cleanupListeners.push(
      () => ipcMain.removeListener("mcp:get-manifest-response", manifestHandler),
      () => ipcMain.removeListener("mcp:dispatch-action-response", dispatchHandler)
    );
  }

  private requestManifest(): Promise<ActionManifestEntry[]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingManifest = null;
        reject(new Error("Manifest request timed out"));
      }, 5000);

      this.pendingManifest = { resolve, reject, timer };
      this.mainWindow?.webContents.send("mcp:get-manifest-request");
    });
  }

  private dispatchAction(
    actionId: string,
    args: unknown,
    confirmed: boolean
  ): Promise<ActionDispatchResult> {
    return new Promise((resolve, reject) => {
      const requestId = randomUUID();
      const timer = setTimeout(() => {
        this.pendingDispatches.delete(requestId);
        reject(new Error(`Action dispatch timed out: ${actionId}`));
      }, 30000);

      this.pendingDispatches.set(requestId, { resolve, reject, timer });

      this.mainWindow?.webContents.send("mcp:dispatch-action-request", {
        requestId,
        actionId,
        args,
        confirmed,
      });
    });
  }

  private createSessionServer(): Server {
    const server = new Server(
      { name: "Canopy", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const manifest = await this.requestManifest();
      return {
        tools: manifest.map((entry) => ({
          name: entry.id,
          description: `[${entry.category}] ${entry.title}: ${entry.description}${entry.danger === "confirm" ? " ⚠️ Requires confirmation (pass __confirmed: true to proceed)" : ""}`,
          inputSchema: (entry.inputSchema as { type: string }) ?? {
            type: "object",
            properties: {},
          },
        })),
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const actionId = request.params.name;
      const rawArgs = request.params.arguments ?? {};
      const confirmed = (rawArgs as Record<string, unknown>)["__confirmed"] === true;

      // Strip the __confirmed meta-arg before passing to action
      const args = { ...(rawArgs as Record<string, unknown>) };
      delete args["__confirmed"];

      let result: ActionDispatchResult;
      try {
        result = await this.dispatchAction(actionId, args, confirmed);
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }

      if (result.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                result.result !== undefined && result.result !== null
                  ? JSON.stringify(result.result, null, 2)
                  : "OK",
            },
          ],
        };
      }

      if (result.error.code === "CONFIRMATION_REQUIRED") {
        return {
          content: [
            {
              type: "text" as const,
              text: `This action requires confirmation. Call again with "__confirmed": true to proceed.\nAction: ${actionId}\nMessage: ${result.error.message}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Error [${result.error.code}]: ${result.error.message}`,
          },
        ],
        isError: true,
      };
    });

    return server;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method === "GET" && req.url === "/sse") {
      const transport = new SSEServerTransport("/messages", res);
      const server = this.createSessionServer();
      const sessionId = transport.sessionId;

      this.sessions.set(sessionId, transport);
      transport.onclose = () => {
        this.sessions.delete(sessionId);
      };

      await server.connect(transport);
    } else if (req.method === "POST" && req.url?.startsWith("/messages")) {
      const url = new URL(req.url, `http://127.0.0.1:${this.port}`);
      const sessionId = url.searchParams.get("sessionId") ?? "";
      const transport = this.sessions.get(sessionId);

      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Session not found");
      }
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  }

  private async writeDiscoveryFile(): Promise<void> {
    if (!this.port) return;
    try {
      await fs.mkdir(DISCOVERY_DIR, { recursive: true });

      let existing: Record<string, unknown> = {};
      try {
        const raw = await fs.readFile(DISCOVERY_FILE, "utf-8");
        existing = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // file doesn't exist or isn't valid JSON — start fresh
      }

      const mcpServers = (existing["mcpServers"] as Record<string, unknown> | undefined) ?? {};
      mcpServers[MCP_SERVER_KEY] = {
        type: "sse",
        url: `http://127.0.0.1:${this.port}/sse`,
      };

      await fs.writeFile(
        DISCOVERY_FILE,
        JSON.stringify({ ...existing, mcpServers }, null, 2) + "\n",
        "utf-8"
      );
    } catch (err) {
      console.error("[MCP] Failed to write discovery file:", err);
    }
  }

  private async removeDiscoveryFile(): Promise<void> {
    try {
      const raw = await fs.readFile(DISCOVERY_FILE, "utf-8");
      const existing = JSON.parse(raw) as Record<string, unknown>;
      const mcpServers = (existing["mcpServers"] as Record<string, unknown> | undefined) ?? {};

      delete mcpServers[MCP_SERVER_KEY];

      if (Object.keys(mcpServers).length === 0) {
        delete existing["mcpServers"];
      } else {
        existing["mcpServers"] = mcpServers;
      }

      if (Object.keys(existing).length === 0) {
        await fs.unlink(DISCOVERY_FILE);
      } else {
        await fs.writeFile(DISCOVERY_FILE, JSON.stringify(existing, null, 2) + "\n", "utf-8");
      }
    } catch {
      // best-effort removal — don't crash on cleanup errors
    }
  }
}

export const mcpServerService = new McpServerService();
