import net from "node:net";

export async function allocatePort(
  portRegistry: Map<string, number>,
  sessionKey: string
): Promise<number> {
  const existing = portRegistry.get(sessionKey);
  if (existing !== undefined) return existing;

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = 3000 + Math.floor(Math.random() * 7000);
    const usedPorts = new Set(portRegistry.values());
    if (usedPorts.has(candidate)) continue;
    // Reserve before the async probe so concurrent allocatePort() calls for
    // different session keys can't pick the same candidate between probe and registration.
    portRegistry.set(sessionKey, candidate);
    const available = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.unref();
      srv.once("error", () => resolve(false));
      // Gap between close() and the dev server's eventual bind() is an intrinsic TOCTOU we accept.
      srv.listen(candidate, "0.0.0.0", () => srv.close(() => resolve(true)));
    });
    if (available) return candidate;
    releasePort(portRegistry, sessionKey);
  }
  return new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", (err) => reject(err));
    srv.listen(0, "0.0.0.0", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => {
        if (port) {
          portRegistry.set(sessionKey, port);
          resolve(port);
        } else {
          reject(new Error("Failed to allocate port"));
        }
      });
    });
  });
}

export function releasePort(portRegistry: Map<string, number>, sessionKey: string): void {
  portRegistry.delete(sessionKey);
}
