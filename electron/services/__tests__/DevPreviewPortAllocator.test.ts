import { describe, expect, it, vi } from "vitest";
import { allocatePort, releasePort } from "../DevPreviewPortAllocator.js";

vi.mock("node:net", () => {
  const createServer = vi.fn((_options?: Record<string, unknown>) => {
    let port = 0;
    return {
      unref: vi.fn(function (this: ReturnType<typeof createServer>) {
        return this;
      }),
      once(_event: string, cb: (err?: Error) => void) {
        if (_event === "error") {
          if (port === 4444) {
            cb(new Error("EADDRINUSE"));
          }
        }
        return this;
      },
      listen(_port: number, _host: string, cb: () => void) {
        port = _port;
        if (_port === 4444) return;
        cb();
        return this;
      },
      close(cb: () => void) {
        cb();
        return this;
      },
      address() {
        return { port: 5678 };
      },
    };
  });

  return {
    default: { createServer },
    createServer,
  };
});

describe("allocatePort", () => {
  it("returns existing port from registry", async () => {
    const registry = new Map<string, number>();
    registry.set("session-1", 4000);
    const port = await allocatePort(registry, "session-1");
    expect(port).toBe(4000);
  });

  it("allocates and stores a new port", async () => {
    const registry = new Map<string, number>();
    const port = await allocatePort(registry, "session-new");
    expect(port).toBeGreaterThan(0);
    expect(registry.get("session-new")).toBe(port);
  });
});

describe("releasePort", () => {
  it("removes the session key from registry", () => {
    const registry = new Map<string, string | number>();
    registry.set("session-1", 4000);
    releasePort(registry as Map<string, number>, "session-1");
    expect(registry.has("session-1")).toBe(false);
  });

  it("is harmless for missing keys", () => {
    const registry = new Map<string, number>();
    expect(() => releasePort(registry, "nonexistent")).not.toThrow();
  });
});
