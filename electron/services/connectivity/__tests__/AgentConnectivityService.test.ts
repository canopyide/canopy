import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  AgentConnectivityServiceImpl,
  AGENT_CONNECTIVITY_FOCUS_COOLDOWN_MS,
  AGENT_CONNECTIVITY_INTERVAL_MS,
  type AgentConnectivityChange,
} from "../AgentConnectivityService.js";
import { logDebug } from "../../../utils/logger.js";

vi.mock("../../../utils/logger.js", () => ({
  logDebug: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

function buildResponse(status: number): Response {
  return new Response("{}", { status });
}

describe("AgentConnectivityService", () => {
  let service: AgentConnectivityServiceImpl;
  let fetchMock: Mock;
  let listener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    listener = vi.fn();
    service = new AgentConnectivityServiceImpl({
      fetchImpl: fetchMock as unknown as typeof globalThis.fetch,
    });
    service.onStateChange(listener as (change: AgentConnectivityChange) => void);
  });

  afterEach(() => {
    service.dispose();
  });

  describe("refresh()", () => {
    it("marks every provider reachable on a 2xx probe response", async () => {
      fetchMock.mockResolvedValue(buildResponse(200));

      await service.refresh({ force: true });

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.anthropic.com/v1/models",
        expect.objectContaining({ method: "GET", signal: expect.any(AbortSignal) })
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "https://generativelanguage.googleapis.com/v1beta/models",
        expect.any(Object)
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.openai.com/v1/models",
        expect.any(Object)
      );

      expect(service.getProviderState("claude").status).toBe("reachable");
      expect(service.getProviderState("gemini").status).toBe("reachable");
      expect(service.getProviderState("codex").status).toBe("reachable");
    });

    it("treats a 401 response as reachable (auth state is not a network signal)", async () => {
      fetchMock.mockResolvedValue(buildResponse(401));

      await service.refresh({ force: true });

      expect(service.getProviderState("claude").status).toBe("reachable");
    });

    it("treats a 5xx response as reachable (host responded)", async () => {
      fetchMock.mockResolvedValue(buildResponse(503));

      await service.refresh({ force: true });

      expect(service.getProviderState("claude").status).toBe("reachable");
    });

    it("marks providers unreachable on network failures (DNS, timeout, abort)", async () => {
      fetchMock.mockRejectedValue(new Error("ENOTFOUND api.anthropic.com"));

      await service.refresh({ force: true });

      expect(service.getProviderState("claude").status).toBe("unreachable");
      expect(service.getProviderState("gemini").status).toBe("unreachable");
      expect(service.getProviderState("codex").status).toBe("unreachable");
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "claude", status: "unreachable" })
      );
    });

    it("coalesces concurrent probes for the same provider into one in-flight request", async () => {
      const resolvers: Array<(value: Response) => void> = [];
      fetchMock.mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolvers.push(resolve);
          })
      );

      const first = service.refresh({ force: true });
      const second = service.refresh({ force: true });

      // Three providers, but each provider's refresh should coalesce — so
      // exactly three fetches even though refresh was called twice.
      expect(fetchMock).toHaveBeenCalledTimes(3);

      for (const resolve of resolvers) {
        resolve(buildResponse(200));
      }
      await Promise.all([first, second]);

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("respects the per-provider focus cooldown by default", async () => {
      let now = 1_000_000;
      service._setNowForTests(() => now);
      fetchMock.mockResolvedValue(buildResponse(200));

      await service.refresh({ force: true });
      expect(fetchMock).toHaveBeenCalledTimes(3);

      now += AGENT_CONNECTIVITY_FOCUS_COOLDOWN_MS - 1_000;
      await service.refresh();
      expect(fetchMock).toHaveBeenCalledTimes(3);

      now += 2_000;
      await service.refresh();
      expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    it("force refresh bypasses the cooldown", async () => {
      const now = 1_000_000;
      service._setNowForTests(() => now);
      fetchMock.mockResolvedValue(buildResponse(200));

      await service.refresh({ force: true });
      await service.refresh({ force: true });

      expect(fetchMock).toHaveBeenCalledTimes(6);
    });
  });

  describe("transitions", () => {
    it("emits exactly once per real state change", async () => {
      fetchMock.mockResolvedValue(buildResponse(200));

      await service.refresh({ force: true });
      // unknown → reachable for each of the three providers.
      expect(listener).toHaveBeenCalledTimes(3);
      listener.mockClear();

      await service.refresh({ force: true });
      // No transitions on the second probe — already reachable.
      expect(listener).not.toHaveBeenCalled();
    });

    it("emits when a provider transitions from reachable back to unreachable", async () => {
      fetchMock.mockResolvedValue(buildResponse(200));
      await service.refresh({ force: true });
      listener.mockClear();

      fetchMock.mockReset();
      fetchMock.mockRejectedValue(new Error("ETIMEDOUT"));
      await service.refresh({ force: true });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "claude", status: "unreachable" })
      );
    });
  });

  describe("dispose()", () => {
    it("clears listeners and resets state", () => {
      service.dispose();
      expect(service.getProviderState("claude").status).toBe("unknown");
    });

    it("does not let an in-flight probe overwrite reset state after dispose()", async () => {
      const resolvers: Array<(value: Response) => void> = [];
      fetchMock.mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolvers.push(resolve);
          })
      );

      const probe = service.refresh({ force: true });
      service.dispose();
      // Resolve the in-flight fetches AFTER dispose. Without the disposed
      // guard in transitionTo(), these would overwrite the reset state.
      for (const resolve of resolvers) {
        resolve(buildResponse(200));
      }
      await probe;

      expect(service.getProviderState("claude").status).toBe("unknown");
      expect(service.getProviderState("gemini").status).toBe("unknown");
      expect(service.getProviderState("codex").status).toBe("unknown");
      expect(listener).not.toHaveBeenCalled();
    });

    it("re-enables polling after dispose() via start()", () => {
      service.dispose();
      expect(service.getProviderState("claude").status).toBe("unknown");

      // start() resets the disposed flag and resumes polling.
      service.start();

      // Immediate probes are fired asynchronously (3 fetches, one per provider).
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("classifies each provider independently when one resolves and another rejects", async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url.includes("anthropic")) return Promise.resolve(buildResponse(200));
        if (url.includes("googleapis")) return Promise.reject(new Error("ENOTFOUND"));
        return Promise.resolve(buildResponse(200));
      });

      await service.refresh({ force: true });

      expect(service.getProviderState("claude").status).toBe("reachable");
      expect(service.getProviderState("gemini").status).toBe("unreachable");
      expect(service.getProviderState("codex").status).toBe("reachable");
    });
  });

  describe("polling lifecycle", () => {
    it("stops re-scheduling after stop() during an in-flight probe", async () => {
      vi.useFakeTimers();
      const randomStub = vi.spyOn(Math, "random").mockReturnValue(0.5);

      // Hold fetch promises so the probe stays in-flight.
      const resolvers: Array<(value: Response) => void> = [];
      fetchMock.mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolvers.push(resolve);
          })
      );

      // start() schedules the first interval timer and fires immediate probes.
      service.start();
      expect(fetchMock).toHaveBeenCalledTimes(3); // Immediate "start" probes.

      // Advance past the initial jittered interval.
      // jitterFactor = 0.8 + 0.4 * 0.5 = 1.0 → delay = AGENT_CONNECTIVITY_INTERVAL_MS
      vi.advanceTimersByTime(AGENT_CONNECTIVITY_INTERVAL_MS);
      // Timer callback fires, calls refresh({ reason: "interval" }), which
      // coalesces with the still-in-flight probes — no additional fetches.
      expect(fetchMock).toHaveBeenCalledTimes(3);

      // Stop the service. The .finally() chain should detect pollTimer is null
      // and NOT re-schedule.
      service.stop();

      // Resolve the in-flight fetches.
      for (const resolve of resolvers) {
        resolve(buildResponse(200));
      }
      // Flush the microtask queue so .finally() runs.
      await vi.runAllTimersAsync();

      // Advance well past another interval — no new fetches should fire.
      vi.advanceTimersByTime(AGENT_CONNECTIVITY_INTERVAL_MS * 2);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      randomStub.mockRestore();
      vi.useRealTimers();
    });
  });

  describe("probe hygiene", () => {
    it("cancels the response body on successful probes", async () => {
      const cancelFn = vi.fn().mockResolvedValue(undefined);
      const mockBody = { cancel: cancelFn };
      fetchMock.mockResolvedValue({ body: mockBody } as unknown as Response);

      await service.refresh({ force: true });

      expect(cancelFn).toHaveBeenCalledTimes(3);
    });

    it("does not throw when the response body is null", async () => {
      fetchMock.mockResolvedValue({ body: null } as unknown as Response);

      await service.refresh({ force: true });

      expect(service.getProviderState("claude").status).toBe("reachable");
    });

    it("does not throw when body.cancel() rejects", async () => {
      const cancelFn = vi.fn().mockRejectedValue(new Error("stream error"));
      const mockBody = { cancel: cancelFn };
      fetchMock.mockResolvedValue({ body: mockBody } as unknown as Response);

      await service.refresh({ force: true });

      // The rejection is silently swallowed; reachability status is unaffected.
      expect(service.getProviderState("claude").status).toBe("reachable");
    });

    it("logs errorName and errorCode on transport failures", async () => {
      const err = Object.assign(new Error("fetch failed"), {
        name: "TypeError",
        cause: { code: "ENOTFOUND" },
      });
      fetchMock.mockRejectedValue(err);

      await service.refresh({ force: true });

      expect(logDebug).toHaveBeenCalledWith(
        "Agent connectivity: probe failed (network/transport)",
        expect.objectContaining({
          provider: expect.any(String),
          error: "fetch failed",
          errorName: "TypeError",
          errorCode: "ENOTFOUND",
          reason: expect.any(String),
        })
      );
    });

    it("logs errorName without errorCode for timeout errors", async () => {
      const err = Object.assign(new Error("The operation was aborted"), {
        name: "TimeoutError",
      });
      fetchMock.mockRejectedValue(err);

      await service.refresh({ force: true });

      expect(logDebug).toHaveBeenCalledWith(
        "Agent connectivity: probe failed (network/transport)",
        expect.objectContaining({
          errorName: "TimeoutError",
          errorCode: undefined,
        })
      );
    });

    it("extracts errorCode from direct .code when cause is absent", async () => {
      const err = Object.assign(new Error("connection refused"), {
        name: "TypeError",
        code: "ECONNREFUSED",
      });
      fetchMock.mockRejectedValue(err);

      await service.refresh({ force: true });

      expect(logDebug).toHaveBeenCalledWith(
        "Agent connectivity: probe failed (network/transport)",
        expect.objectContaining({
          errorName: "TypeError",
          errorCode: "ECONNREFUSED",
        })
      );
    });
  });
});
