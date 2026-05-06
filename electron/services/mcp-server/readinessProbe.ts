import http from "node:http";

export const PROBE_MAX_ATTEMPTS = 3;
export const PROBE_BASE_DELAY_MS = 50;
export const PROBE_REQUEST_TIMEOUT_MS = 1000;
export const PROBE_HARD_TIMEOUT_MS = 3000;
export const PROBE_PROTOCOL_VERSION = "2025-11-25";

export interface ProbeOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  requestTimeoutMs?: number;
  hardTimeoutMs?: number;
}

interface InitializeResult {
  sessionId: string;
}

/**
 * Active readiness probe — POSTs an MCP `initialize` request to the bound
 * MCP server and verifies the server responds with HTTP 200 plus a real
 * `mcp-session-id` header. This proves end-to-end that the HTTP handler,
 * auth path, and Streamable HTTP transport are all wired up — not just
 * that the OS socket is bound.
 *
 * On success the probe immediately tears down its own session via DELETE
 * so the probe doesn't linger as a zombie session for the 30-minute idle
 * window. DELETE failures are logged but non-fatal — the session will
 * idle out on its own.
 *
 * Throws if every attempt fails within the hard timeout.
 */
export async function probeMcpServer(
  port: number,
  apiKey: string,
  options: ProbeOptions = {}
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? PROBE_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? PROBE_BASE_DELAY_MS;
  const requestTimeoutMs = options.requestTimeoutMs ?? PROBE_REQUEST_TIMEOUT_MS;
  const hardTimeoutMs = options.hardTimeoutMs ?? PROBE_HARD_TIMEOUT_MS;

  const deadline = Date.now() + hardTimeoutMs;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      lastError = lastError ?? new Error("hard timeout reached");
      break;
    }
    const perAttemptTimeout = Math.min(requestTimeoutMs, remaining);

    try {
      const result = await sendInitialize(port, apiKey, perAttemptTimeout);
      // Best-effort cleanup so the probe session doesn't sit in the
      // session map for 30 minutes. Swallow errors — session will expire.
      await sendDelete(port, apiKey, result.sessionId, perAttemptTimeout).catch((err) => {
        console.warn("[MCP] Readiness probe cleanup DELETE failed (non-fatal):", err);
      });
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt >= maxAttempts) break;

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      const remainingAfterAttempt = deadline - Date.now();
      if (remainingAfterAttempt <= 0) break;
      await wait(Math.min(delay, remainingAfterAttempt));
    }
  }

  const reason = lastError?.message ?? "unknown error";
  throw new Error(
    `MCP readiness probe failed after ${maxAttempts} attempt(s) on port ${port}: ${reason}`
  );
}

function sendInitialize(
  port: number,
  apiKey: string,
  timeoutMs: number
): Promise<InitializeResult> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: PROBE_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "daintree-readiness-probe", version: "1.0.0" },
    },
  });

  return new Promise<InitializeResult>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    let req: http.ClientRequest | undefined;
    try {
      req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/mcp",
          method: "POST",
          timeout: timeoutMs,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "Content-Length": Buffer.byteLength(body),
            Authorization: `Bearer ${apiKey}`,
          },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          const headerValue = res.headers["mcp-session-id"];
          const sessionId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
          // Drop the SSE body — it's a long-lived stream, the headers are
          // the readiness signal.
          res.resume();

          if (status !== 200) {
            settle(() => {
              req?.destroy();
              reject(new Error(`status ${status}`));
            });
            return;
          }
          if (typeof sessionId !== "string" || sessionId.length === 0) {
            settle(() => {
              req?.destroy();
              reject(new Error("missing mcp-session-id response header"));
            });
            return;
          }
          settle(() => {
            req?.destroy();
            resolve({ sessionId });
          });
        }
      );

      req.on("error", (err) => {
        settle(() => reject(err));
      });
      req.on("timeout", () => {
        settle(() => {
          req?.destroy();
          reject(new Error("request timed out"));
        });
      });

      req.write(body);
      req.end();
    } catch (err) {
      settle(() => reject(err instanceof Error ? err : new Error(String(err))));
    }
  });
}

function sendDelete(
  port: number,
  apiKey: string,
  sessionId: string,
  timeoutMs: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    let req: http.ClientRequest | undefined;
    try {
      req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/mcp",
          method: "DELETE",
          timeout: timeoutMs,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Mcp-Session-Id": sessionId,
          },
        },
        (res) => {
          res.resume();
          settle(() => resolve());
        }
      );
      req.on("error", (err) => {
        settle(() => reject(err));
      });
      req.on("timeout", () => {
        settle(() => {
          req?.destroy();
          reject(new Error("DELETE timed out"));
        });
      });
      req.end();
    } catch (err) {
      settle(() => reject(err instanceof Error ? err : new Error(String(err))));
    }
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}
