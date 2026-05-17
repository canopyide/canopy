// @vitest-environment jsdom
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const onboardingMock = {
  get: vi.fn(),
  recordAvailabilityFirstSeen: vi.fn(() => Promise.resolve({})),
};

(window as unknown as { electron: unknown }).electron = { onboarding: onboardingMock };

import {
  useAgentDiscoveryOnboarding,
  recordAgentAvailabilityFirstSeen,
  resetAgentDiscoveryStoreForTests,
  AGENT_DISCOVERY_TTL_MS,
} from "../useAgentDiscoveryOnboarding";

const baseState = {
  schemaVersion: 2,
  completed: false,
  currentStep: null,
  agentSetupIds: [],
  firstRunToastSeen: false,
  newsletterPromptSeen: false,
  waitingNudgeSeen: false,
  seenAgentIds: [],
  availabilityFirstSeen: {},
  welcomeCardDismissed: false,
  setupBannerDismissed: false,
  checklist: {
    dismissed: false,
    celebrationShown: false,
    items: {
      openedProject: false,
      launchedAgent: false,
      createdWorktree: false,
      ranSecondParallelAgent: false,
    },
  },
};

describe("useAgentDiscoveryOnboarding — availability first-seen", () => {
  beforeEach(() => {
    resetAgentDiscoveryStoreForTests();
    onboardingMock.get.mockReset();
    onboardingMock.recordAvailabilityFirstSeen.mockReset();
    onboardingMock.recordAvailabilityFirstSeen.mockResolvedValue({});
    onboardingMock.get.mockResolvedValue(baseState);
  });

  it("hydrates availabilityFirstSeen from the onboarding store", async () => {
    onboardingMock.get.mockResolvedValue({
      ...baseState,
      availabilityFirstSeen: { claude: 1234 },
    });

    const { result } = renderHook(() => useAgentDiscoveryOnboarding());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.availabilityFirstSeen).toEqual({ claude: 1234 });
  });

  it("records first-seen for new ids and persists via IPC", async () => {
    renderHook(() => useAgentDiscoveryOnboarding());
    await waitFor(() => undefined);

    await act(async () => {
      await recordAgentAvailabilityFirstSeen(["claude", "gemini"]);
    });

    expect(onboardingMock.recordAvailabilityFirstSeen).toHaveBeenCalledTimes(1);
    expect(onboardingMock.recordAvailabilityFirstSeen).toHaveBeenCalledWith(["claude", "gemini"]);
  });

  it("is idempotent — never overwrites an existing timestamp or re-calls IPC", async () => {
    const { result } = renderHook(() => useAgentDiscoveryOnboarding());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await recordAgentAvailabilityFirstSeen(["claude"]);
    });
    const firstTimestamp = result.current.availabilityFirstSeen.claude;
    expect(typeof firstTimestamp).toBe("number");
    onboardingMock.recordAvailabilityFirstSeen.mockClear();

    await act(async () => {
      await recordAgentAvailabilityFirstSeen(["claude"]);
    });

    // Same id again: timestamp unchanged, no second IPC round-trip.
    expect(result.current.availabilityFirstSeen.claude).toBe(firstTimestamp);
    expect(onboardingMock.recordAvailabilityFirstSeen).not.toHaveBeenCalled();
  });

  it("only sends the not-yet-recorded ids to IPC on a mixed call", async () => {
    const { result } = renderHook(() => useAgentDiscoveryOnboarding());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await recordAgentAvailabilityFirstSeen(["claude"]);
    });
    onboardingMock.recordAvailabilityFirstSeen.mockClear();

    await act(async () => {
      await recordAgentAvailabilityFirstSeen(["claude", "gemini"]);
    });

    expect(onboardingMock.recordAvailabilityFirstSeen).toHaveBeenCalledWith(["gemini"]);
  });

  it("does not re-record ids already populated by hydration", async () => {
    onboardingMock.get.mockResolvedValue({
      ...baseState,
      availabilityFirstSeen: { claude: 12345 },
    });
    const { result } = renderHook(() => useAgentDiscoveryOnboarding());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await recordAgentAvailabilityFirstSeen(["claude"]);
    });

    expect(onboardingMock.recordAvailabilityFirstSeen).not.toHaveBeenCalled();
    expect(result.current.availabilityFirstSeen.claude).toBe(12345);
  });

  it("drops non-finite persisted timestamps on hydration", async () => {
    onboardingMock.get.mockResolvedValue({
      ...baseState,
      availabilityFirstSeen: {
        claude: "yesterday" as unknown as number,
        gemini: Number.NaN,
        codex: 1700000000000,
      },
    });
    const { result } = renderHook(() => useAgentDiscoveryOnboarding());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.availabilityFirstSeen).toEqual({ codex: 1700000000000 });
  });

  it("exposes a 14-day TTL window", () => {
    expect(AGENT_DISCOVERY_TTL_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });
});
