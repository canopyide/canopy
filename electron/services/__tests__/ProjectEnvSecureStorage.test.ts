import { beforeEach, describe, expect, it, vi } from "vitest";

const storeState = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
}));

const storeMock = vi.hoisted(() => ({
  get: vi.fn((key: string) => storeState.data[key]),
  set: vi.fn((key: string, value: unknown) => {
    storeState.data[key] = value;
  }),
}));

const safeStorageMock = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  decryptString: vi.fn((buffer: Buffer) => {
    const text = buffer.toString("utf8");
    if (!text.startsWith("enc:")) throw new Error("Invalid payload");
    return text.slice(4);
  }),
}));

vi.mock("electron", () => ({
  safeStorage: safeStorageMock,
}));

vi.mock("../../store.js", () => ({
  store: storeMock,
}));

describe("ProjectEnvSecureStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    storeState.data = { projectEnv: {} };
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true);
    safeStorageMock.decryptString.mockImplementation((buffer: Buffer) => {
      const text = buffer.toString("utf8");
      if (!text.startsWith("enc:")) throw new Error("Invalid payload");
      return text.slice(4);
    });
  });

  async function getService() {
    const mod = await import("../ProjectEnvSecureStorage.js");
    return mod.projectEnvSecureStorage;
  }

  it("stores and retrieves plain-text env values", async () => {
    const service = await getService();
    service.set("project-1", "API_KEY", "secret");

    expect(service.get("project-1", "API_KEY")).toBe("secret");
  });

  it("migrates legacy encrypted values to plain text on read", async () => {
    const encrypted = Buffer.from("enc:my-api-key", "utf8").toString("hex");
    (storeState.data.projectEnv as Record<string, string>)["project-1:API_KEY"] = encrypted;
    const service = await getService();

    expect(service.get("project-1", "API_KEY")).toBe("my-api-key");
  });

  it("clears corrupted encrypted values that fail decryption", async () => {
    const badHex = Buffer.from("not-encrypted", "utf8").toString("hex");
    (storeState.data.projectEnv as Record<string, string>)["project-1:API_KEY"] = badHex;
    const service = await getService();

    expect(service.get("project-1", "API_KEY")).toBeUndefined();
  });

  it("stores values even when safeStorage is unavailable (no encryption needed)", async () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const service = await getService();

    expect(() => service.set("project-1", "API_KEY", "secret")).not.toThrow();
    expect(service.get("project-1", "API_KEY")).toBe("secret");
  });

  it("set handles malformed projectEnv store value by normalizing", async () => {
    storeState.data.projectEnv = "corrupted";
    const service = await getService();

    expect(() => service.set("project-1", "API_KEY", "secret")).not.toThrow();
    expect(service.get("project-1", "API_KEY")).toBe("secret");
  });

  it("listKeys returns only keys for the requested project", async () => {
    const service = await getService();
    service.set("project-1", "A", "1");
    service.set("project-1", "B", "2");
    service.set("project-2", "C", "3");

    expect(service.listKeys("project-1").sort()).toEqual(["A", "B"]);
  });

  it("deleteAllForProject removes only matching project keys", async () => {
    const service = await getService();
    service.set("project-1", "A", "1");
    service.set("project-2", "B", "2");

    service.deleteAllForProject("project-1");

    expect(service.get("project-1", "A")).toBeUndefined();
    expect(service.get("project-2", "B")).toBe("2");
  });
});
