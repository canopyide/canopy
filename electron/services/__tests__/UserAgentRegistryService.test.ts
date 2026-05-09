import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { UserAgentConfig } from "../../../shared/types/userAgentRegistry.js";

const storeMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

const setUserRegistryMock = vi.hoisted(() => vi.fn());
const isBuiltInAgentMock = vi.hoisted(() => vi.fn((id: string) => id === "claude"));

vi.mock("../../store.js", () => ({
  store: storeMock,
}));

vi.mock("../../../shared/config/agentRegistry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/config/agentRegistry.js")>();
  return {
    ...actual,
    setUserRegistry: setUserRegistryMock,
    isBuiltInAgent: isBuiltInAgentMock,
  };
});

import { UserAgentRegistryService } from "../UserAgentRegistryService.js";

function createConfig(id: string, overrides: Partial<UserAgentConfig> = {}): UserAgentConfig {
  return {
    id,
    name: `Agent ${id}`,
    command: "custom-agent",
    color: "#112233",
    iconId: "terminal",
    supportsContextInjection: true,
    ...overrides,
  };
}

describe("UserAgentRegistryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (storeMock.get as Mock).mockReturnValue({});
    (storeMock.set as Mock).mockImplementation(() => {});
  });

  it("drops reserved and mismatched registry keys during load", () => {
    const storedRegistry: Record<string, UserAgentConfig> = {
      valid: createConfig("valid"),
      mismatch: createConfig("different-id"),
      claude: createConfig("claude"),
      __proto__: createConfig("proto-agent"),
    };

    (storeMock.get as Mock).mockReturnValue(storedRegistry);

    const service = new UserAgentRegistryService();

    expect(service.getRegistry()).toEqual({
      valid: expect.objectContaining({ id: "valid" }),
    });
    expect(setUserRegistryMock).toHaveBeenCalledWith({
      valid: expect.objectContaining({ id: "valid" }),
    });
  });

  it("returns cloned agent configs so external mutation cannot alter internal state", () => {
    (storeMock.get as Mock).mockReturnValue({
      alpha: createConfig("alpha"),
    });

    const service = new UserAgentRegistryService();

    const firstRead = service.getAgent("alpha");
    expect(firstRead).toBeDefined();

    firstRead!.name = "Mutated";

    const secondRead = service.getAgent("alpha");
    expect(secondRead?.name).toBe("Agent alpha");
  });

  it("returns cloned registry entries so callers cannot mutate internal state", () => {
    (storeMock.get as Mock).mockReturnValue({
      alpha: createConfig("alpha"),
    });

    const service = new UserAgentRegistryService();

    const registry = service.getRegistry();
    registry.alpha.name = "Mutated via registry";

    expect(service.getAgent("alpha")?.name).toBe("Agent alpha");
  });

  it("does not treat prototype properties as real agents during removal", () => {
    const service = new UserAgentRegistryService();

    const result = service.removeAgent("toString");

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
    expect(storeMock.set).not.toHaveBeenCalled();
  });

  it("rejects agent IDs with unsafe characters", () => {
    const service = new UserAgentRegistryService();

    const result = service.addAgent(
      createConfig("bad id", {
        id: "bad id",
      })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Agent ID");
    expect(storeMock.set).not.toHaveBeenCalled();
  });

  it("drops stored agents with invalid IDs during load", () => {
    (storeMock.get as Mock).mockReturnValue({
      "valid-id": createConfig("valid-id"),
      "invalid id": createConfig("invalid id"),
    });

    const service = new UserAgentRegistryService();

    expect(service.getRegistry()).toEqual({
      "valid-id": expect.objectContaining({ id: "valid-id" }),
    });
  });

  it("reload() re-reads from store and updates shared registry", () => {
    (storeMock.get as Mock).mockReturnValue({
      alpha: createConfig("alpha"),
    });

    const service = new UserAgentRegistryService();
    expect(service.getRegistry()).toEqual({
      alpha: expect.objectContaining({ id: "alpha" }),
    });

    // Simulate external config change
    (storeMock.get as Mock).mockReturnValue({
      alpha: createConfig("alpha"),
      beta: createConfig("beta"),
    });

    service.reload();

    const registry = service.getRegistry();
    expect(registry).toEqual({
      alpha: expect.objectContaining({ id: "alpha" }),
      beta: expect.objectContaining({ id: "beta" }),
    });
    // syncToSharedRegistry is called during reload
    expect(setUserRegistryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        alpha: expect.objectContaining({ id: "alpha" }),
        beta: expect.objectContaining({ id: "beta" }),
      })
    );
  });
});

describe("persist-before-mutate ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (storeMock.get as Mock).mockReturnValue({});
    (storeMock.set as Mock).mockImplementation(() => {});
  });

  it("addAgent does not mutate in-memory registry when store.set throws", () => {
    (storeMock.set as Mock).mockImplementation(() => {
      throw new Error("ENOSPC: disk full");
    });

    const service = new UserAgentRegistryService();

    const result = service.addAgent(createConfig("custom"));

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to save");
    expect(service.getRegistry()).toEqual({});
  });

  it("updateAgent does not mutate in-memory registry when store.set throws", () => {
    (storeMock.get as Mock).mockReturnValue({
      alpha: createConfig("alpha"),
    });

    const service = new UserAgentRegistryService();

    (storeMock.set as Mock).mockImplementation(() => {
      throw new Error("ENOSPC: disk full");
    });

    const updatedConfig = createConfig("alpha", { name: "Alpha Updated" });
    const result = service.updateAgent("alpha", updatedConfig);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to save");
    expect(service.getAgent("alpha")?.name).toBe("Agent alpha");
  });

  it("removeAgent does not mutate in-memory registry when store.set throws", () => {
    (storeMock.get as Mock).mockReturnValue({
      alpha: createConfig("alpha"),
    });

    const service = new UserAgentRegistryService();

    (storeMock.set as Mock).mockImplementation(() => {
      throw new Error("ENOSPC: disk full");
    });

    const result = service.removeAgent("alpha");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to save");
    expect(service.getAgent("alpha")).toBeDefined();
  });
});

describe("removeAgent error ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (storeMock.get as Mock).mockReturnValue({});
    (storeMock.set as Mock).mockImplementation(() => {});
  });

  it("returns 'not found' for built-in agent ID when it is not in the user registry", () => {
    const service = new UserAgentRegistryService();

    const result = service.removeAgent("claude");

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
    expect(result.error).not.toContain("built-in");
  });

  it("preserves valid entries when a single entry fails per-entry validation", () => {
    (storeMock.get as Mock).mockReturnValue({
      good: createConfig("good"),
      bad: {
        id: "bad",
        command: "/usr/local/bin/broken",
        name: "Bad",
        color: "#112233",
        iconId: "terminal",
        supportsContextInjection: true,
      },
    });

    const service = new UserAgentRegistryService();
    const registry = service.getRegistry();

    expect(registry).toEqual({
      good: expect.objectContaining({ id: "good" }),
    });
    expect(registry.bad).toBeUndefined();
  });
});
