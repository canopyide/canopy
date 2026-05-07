import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock store BEFORE imports. The source file imports from "../../store.js"
// which resolves to electron/store.js. From this test file (one directory deeper),
// the correct relative path is "../../../store.js".
vi.mock("../../../store.js", () => ({
  store: {
    get: vi.fn().mockReturnValue({
      enabled: true,
      port: 45454,
      apiKey: "test-api-key",
    }),
  },
}));

import http from "node:http";
import { EventEmitter } from "node:events";
import { HttpLifecycle } from "../httpLifecycle.js";
import type { HttpLifecycleDeps } from "../httpLifecycle.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockServer = any;

function mockServer(port = 45454): MockServer {
  const s = new EventEmitter() as unknown as MockServer;
  s.closeAllConnections = vi.fn();
  s.close = vi.fn((cb?: () => void) => {
    cb?.();
    return s;
  });
  s.listen = vi.fn((_p: number, _h: string, cb?: () => void) => {
    Object.defineProperty(s, "listening", { value: true, writable: true, configurable: true });
    cb?.();
    return s;
  });
  s.address = vi.fn(() => ({ port, family: "IPv4" as const, address: "127.0.0.1" }));
  Object.defineProperty(s, "listening", { value: false, writable: true, configurable: true });
  s.keepAliveTimeout = 5000;
  s.headersTimeout = 60000;
  s.requestTimeout = 300000;
  return s;
}

function fakeDeps(overrides?: Partial<HttpLifecycleDeps>): HttpLifecycleDeps {
  return {
    sessionStore: {
      sessions: new Map(),
      httpSessions: new Map(),
      sessionTierMap: new Map(),
      sessionWebContentsMap: new Map(),
      resourceSubscriptions: new Map(),
      drain: vi.fn(),
      getTier: vi.fn(() => "workbench" as const),
      createIdleTimer: vi.fn(() => setTimeout(() => {}, 1_000_000)),
      createHttpIdleTimer: vi.fn(() => setTimeout(() => {}, 1_000_000)),
      resetIdleTimer: vi.fn(),
      resetHttpIdleTimer: vi.fn(),
    },
    auditService: {
      hydrate: vi.fn(),
      flushNow: vi.fn(),
      appendRecord: vi.fn(),
    },
    requestManifest: vi.fn().mockResolvedValue([]),
    dispatchAction: vi.fn().mockResolvedValue({ result: { ok: true, result: null } }),
    handleWaitUntilIdle: vi.fn(),
    getCachedManifest: vi.fn(() => null),
    clearCachedManifest: vi.fn(),
    cleanupListeners: [],
    pendingManifests: new Map(),
    pendingDispatches: new Map(),
    setupIpcListeners: vi.fn(),
    emitStatusChange: vi.fn(),
    emitRuntimeStateChange: vi.fn(),
    setConfig: vi.fn(),
    ...overrides,
  } as unknown as HttpLifecycleDeps;
}

describe("HttpLifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("server timeouts", () => {
    it("sets keepAliveTimeout=30_000 and headersTimeout=60_000", async () => {
      let capturedServer: http.Server | null = null;
      vi.spyOn(http, "createServer").mockImplementation((handler?: http.RequestListener) => {
        const s = mockServer();
        capturedServer = s;
        if (handler) s.on("request", handler);
        return s;
      });

      const deps = fakeDeps();
      const lc = new HttpLifecycle(deps);
      lc.isEnabled = () => true;

      await expect(lc.start({} as unknown as never)).resolves.toBeUndefined();

      expect(capturedServer).not.toBeNull();
      expect(capturedServer!.keepAliveTimeout).toBe(30_000);
      expect(capturedServer!.headersTimeout).toBe(60_000);
    });
  });

  describe("listenWithRetry", () => {
    it("retries on EADDRINUSE and succeeds on next port", async () => {
      const s = mockServer(45456);
      let attempts = 0;
      s.listen.mockImplementation((_port: number, _host: string, cb?: () => void) => {
        attempts++;
        if (attempts < 3) {
          s.emit("error", Object.assign(new Error("EADDRINUSE"), { code: "EADDRINUSE" }));
          return s;
        }
        Object.defineProperty(s, "listening", { value: true, writable: true, configurable: true });
        s.address = vi.fn(() => ({ port: 45456, family: "IPv4" as const, address: "127.0.0.1" }));
        cb?.();
        return s;
      });

      const lc = new HttpLifecycle(fakeDeps());
      const result = await (
        lc as unknown as {
          listenWithRetry: (s: http.Server, p: number) => Promise<number | null>;
        }
      ).listenWithRetry(s, 45454);

      expect(result).toBe(45456);
      expect(attempts).toBe(3);
    });

    it("returns null after exhausting all retries", async () => {
      const s = mockServer();
      s.listen.mockImplementation(() => {
        s.emit("error", Object.assign(new Error("EADDRINUSE"), { code: "EADDRINUSE" }));
        return s;
      });

      const lc = new HttpLifecycle(fakeDeps());
      const result = await (
        lc as unknown as {
          listenWithRetry: (s: http.Server, p: number) => Promise<number | null>;
        }
      ).listenWithRetry(s, 45454);

      expect(result).toBeNull();
    });
  });

  describe("IPC listener lifecycle", () => {
    it("does not call setupIpcListeners when bind fails", async () => {
      const setupIpcListeners = vi.fn();
      const deps = fakeDeps({ setupIpcListeners });

      const s = mockServer();
      s.listen.mockImplementation(() => {
        s.emit("error", Object.assign(new Error("EADDRINUSE"), { code: "EADDRINUSE" }));
        return s;
      });
      vi.spyOn(http, "createServer").mockReturnValue(s);

      const lc = new HttpLifecycle(deps);
      lc.isEnabled = () => true;

      await expect(lc.start({} as unknown as never)).rejects.toThrow("Failed to bind");

      expect(setupIpcListeners).not.toHaveBeenCalled();
    });
  });

  describe("stop()", () => {
    it("calls closeAllConnections before close", async () => {
      const deps = fakeDeps();
      const s = mockServer();
      (s as MockServer & { listening: boolean }).listening = true;
      const callOrder: string[] = [];
      s.closeAllConnections.mockImplementation(() => {
        callOrder.push("closeAllConnections");
      });
      s.close.mockImplementation((cb?: () => void) => {
        callOrder.push("close");
        cb?.();
        return s;
      });

      const lc = new HttpLifecycle(deps);
      (lc as unknown as { httpServer: MockServer }).httpServer = s;
      (lc as unknown as { port: number }).port = 45454;

      await lc.stop();

      expect(callOrder[0]).toBe("closeAllConnections");
      expect(callOrder[1]).toBe("close");
    });

    it("resolves after timeout when close hangs", async () => {
      const deps = fakeDeps();
      const s = mockServer();
      (s as MockServer & { listening: boolean }).listening = true;
      s.close.mockImplementation(() => s); // never calls callback

      const lc = new HttpLifecycle(deps);
      (lc as unknown as { httpServer: MockServer }).httpServer = s;
      (lc as unknown as { port: number }).port = 45454;

      const stopPromise = lc.stop();
      await vi.advanceTimersByTimeAsync(11_000);

      await expect(stopPromise).resolves.toBeUndefined();
      expect(s.closeAllConnections).toHaveBeenCalled();
      expect((lc as unknown as { httpServer: unknown }).httpServer).toBeNull();
    });
  });

  describe("auth gate", () => {
    it("returns 401 with WWW-Authenticate: Bearer realm header", async () => {
      const deps = fakeDeps();
      const lc = new HttpLifecycle(deps);
      lc.setApiKey("test-api-key");
      (lc as unknown as { port: number }).port = 45454;

      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
        headersSent: false,
      } as unknown as http.ServerResponse;
      const req = {
        method: "GET",
        url: "/sse",
        headers: { host: "127.0.0.1:45454" },
      } as unknown as http.IncomingMessage;

      await (
        lc as unknown as {
          handleRequest: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
        }
      ).handleRequest(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(
        401,
        expect.objectContaining({ "WWW-Authenticate": 'Bearer realm="Daintree MCP"' })
      );
      expect(res.end).toHaveBeenCalledWith("Unauthorized");
    });
  });
});
