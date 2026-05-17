import { beforeEach, describe, expect, it } from "vitest";
import { ForgeProviderRegistry } from "../ForgeProviderRegistry.js";
import type {
  ForgeProviderContribution,
  ForgeProviderDescriptor,
  ForgeProviderImpl,
} from "../../../shared/types/forge.js";

/** Minimal stub — only the fields the registry inspects are exercised. */
function makeImpl(tag = "impl"): ForgeProviderImpl {
  return { __tag: tag } as unknown as ForgeProviderImpl;
}

const ghContribution: ForgeProviderContribution = {
  id: "github",
  name: "GitHub",
  matches: ["github.com"],
};

const ghDescriptor: ForgeProviderDescriptor = { id: "github", matches: ["github.com"] };

describe("ForgeProviderRegistry", () => {
  let registry: ForgeProviderRegistry;

  beforeEach(() => {
    registry = new ForgeProviderRegistry();
  });

  describe("register", () => {
    it("registers a runtime provider and routes by hostname", () => {
      const impl = makeImpl();
      registry.register("acme.gh", ghDescriptor, impl);
      expect(registry.getActiveProvider("https://github.com/acme/repo")).toBe(impl);
      expect(registry.listMatchingProviders("https://github.com/acme/repo")).toEqual([impl]);
    });

    it("rejects an empty descriptor id", () => {
      expect(() =>
        registry.register("acme.gh", { id: "" } as ForgeProviderDescriptor, makeImpl())
      ).toThrow(/non-empty string/);
    });

    it("rejects a composed id that violates the id pattern", () => {
      // pluginId starting with an uppercase letter cannot form a valid full id.
      expect(() => registry.register("Acme", ghDescriptor, makeImpl())).toThrow(/is invalid/);
    });

    it("rejects a non-object implementation", () => {
      expect(() =>
        registry.register("acme.gh", ghDescriptor, null as unknown as ForgeProviderImpl)
      ).toThrow(/must be an object/);
    });

    it("returns an idempotent disposer that removes only its registration", () => {
      const impl = makeImpl();
      const dispose = registry.register("acme.gh", ghDescriptor, impl);
      expect(registry.getActiveProvider("https://github.com/x/y")).toBe(impl);
      dispose();
      expect(registry.getActiveProvider("https://github.com/x/y")).toBeNull();
      // Second call is a no-op and must not throw.
      expect(() => dispose()).not.toThrow();
    });

    it("supports multiple providers from one plugin, first registered wins", () => {
      const a = makeImpl("a");
      const b = makeImpl("b");
      registry.register("acme.multi", { id: "a", matches: ["git.example.com"] }, a);
      registry.register("acme.multi", { id: "b", matches: ["git.example.com"] }, b);
      expect(registry.listMatchingProviders("https://git.example.com/o/r")).toEqual([a, b]);
      expect(registry.getActiveProvider("https://git.example.com/o/r")).toBe(a);
    });
  });

  describe("registerDescriptorOnly", () => {
    it("registers a manifest descriptor with no callable impl", () => {
      registry.registerDescriptorOnly("acme.gh", ghContribution);
      expect(registry.listMatchingProviders("https://github.com/a/b")).toEqual([]);
      expect(registry.getActiveProvider("https://github.com/a/b")).toBeNull();
    });

    it("is upgraded in place by a later register() call, preserving manifest matches", () => {
      const impl = makeImpl();
      registry.registerDescriptorOnly("acme.gh", ghContribution);
      // Runtime descriptor omits `matches` (declared statically in manifest).
      registry.register("acme.gh", { id: "github" }, impl);
      expect(registry.getActiveProvider("https://github.com/a/b")).toBe(impl);
    });

    it("does not duplicate when the manifest entry is re-registered", () => {
      registry.registerDescriptorOnly("acme.gh", ghContribution);
      registry.registerDescriptorOnly("acme.gh", ghContribution);
      const impl = makeImpl();
      registry.register("acme.gh", { id: "github" }, impl);
      expect(registry.listMatchingProviders("https://github.com/a/b")).toEqual([impl]);
    });
  });

  describe("unregisterAll", () => {
    it("removes every provider owned by a plugin", () => {
      registry.register("acme.gh", ghDescriptor, makeImpl());
      registry.unregisterAll("acme.gh");
      expect(registry.getActiveProvider("https://github.com/a/b")).toBeNull();
    });

    it("is idempotent and silent for an unknown plugin", () => {
      expect(() => registry.unregisterAll("nobody.here")).not.toThrow();
    });
  });

  describe("listMatchingProviders", () => {
    it("returns [] for an unparseable / SSH scp-style remote", () => {
      registry.register("acme.gh", ghDescriptor, makeImpl());
      expect(registry.listMatchingProviders("git@github.com:acme/repo.git")).toEqual([]);
      expect(registry.listMatchingProviders("not a url")).toEqual([]);
    });

    it("excludes descriptor-only (null-impl) entries", () => {
      registry.registerDescriptorOnly("acme.gh", ghContribution);
      expect(registry.listMatchingProviders("https://github.com/a/b")).toEqual([]);
    });

    it("does not match a different hostname", () => {
      registry.register("acme.gh", ghDescriptor, makeImpl());
      expect(registry.listMatchingProviders("https://gitlab.com/a/b")).toEqual([]);
    });
  });

  it("clear() drops all registrations", () => {
    registry.register("acme.gh", ghDescriptor, makeImpl());
    registry.clear();
    expect(registry.getActiveProvider("https://github.com/a/b")).toBeNull();
  });
});
