import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserRegistry } from "../../../shared/config/agentRegistry";

const { getMock, addMock, updateMock, removeMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  addMock: vi.fn(),
  updateMock: vi.fn(),
  removeMock: vi.fn(),
}));

vi.mock("@/clients/userAgentRegistryClient", () => ({
  userAgentRegistryClient: {
    get: getMock,
    add: addMock,
    update: updateMock,
    remove: removeMock,
  },
}));

import {
  cleanupUserAgentRegistryStore,
  useUserAgentRegistryStore,
} from "../userAgentRegistryStore";

describe("userAgentRegistryStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanupUserAgentRegistryStore();
  });

  afterEach(() => {
    cleanupUserAgentRegistryStore();
  });

  it("allows initialize retry after a failed initialization", async () => {
    getMock
      .mockRejectedValueOnce(new Error("first failure"))
      .mockResolvedValueOnce({ myAgent: { id: "myAgent", name: "My Agent" } });

    await useUserAgentRegistryStore.getState().initialize();
    const afterFailure = useUserAgentRegistryStore.getState();
    expect(afterFailure.isInitialized).toBe(false);
    expect(afterFailure.error).toContain("first failure");

    await useUserAgentRegistryStore.getState().initialize();

    const afterRetry = useUserAgentRegistryStore.getState();
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(afterRetry.isInitialized).toBe(true);
    expect(afterRetry.error).toBeNull();
    expect(afterRetry.registry).toEqual({ myAgent: { id: "myAgent", name: "My Agent" } });
  });

  it("syncs the userRegistry singleton on initialize", async () => {
    getMock.mockResolvedValue({ myAgent: { id: "myAgent", name: "My Agent" } });

    await useUserAgentRegistryStore.getState().initialize();

    const singleton = getUserRegistry();
    expect(singleton).toEqual({ myAgent: { id: "myAgent", name: "My Agent" } });
  });

  it("syncs the userRegistry singleton on addAgent", async () => {
    getMock
      .mockResolvedValueOnce({ myAgent: { id: "myAgent", name: "My Agent" } })
      .mockResolvedValueOnce({
        myAgent: { id: "myAgent", name: "My Agent" },
        newAgent: { id: "newAgent", name: "New" },
      });
    addMock.mockResolvedValue({ success: true });

    await useUserAgentRegistryStore.getState().initialize();
    await useUserAgentRegistryStore.getState().addAgent({ id: "newAgent", name: "New" } as never);

    const singleton = getUserRegistry();
    expect(singleton).toHaveProperty("myAgent");
    expect(singleton).toHaveProperty("newAgent");
  });

  it("clears the userRegistry singleton on cleanup", () => {
    useUserAgentRegistryStore.setState({
      registry: { test: { id: "test", name: "Test Agent" } as never },
      isLoading: false,
      error: null,
      isInitialized: true,
    });

    cleanupUserAgentRegistryStore();

    expect(getUserRegistry()).toEqual({});
  });

  it("cleanup resets the store to pre-initialized state", () => {
    useUserAgentRegistryStore.setState({
      registry: { test: { id: "test", name: "Test Agent" } as never },
      isLoading: false,
      error: "boom",
      isInitialized: true,
    });

    cleanupUserAgentRegistryStore();

    expect(useUserAgentRegistryStore.getState()).toMatchObject({
      registry: null,
      isLoading: true,
      error: null,
      isInitialized: false,
    });
  });
});
