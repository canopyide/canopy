import { beforeEach, describe, expect, it, vi } from "vitest";

const storeState = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
}));

const storeMock = vi.hoisted(() => ({
  get: vi.fn((key: string) => storeState.data[key]),
  set: vi.fn((key: string, value: unknown) => {
    storeState.data[key] = value;
  }),
  delete: vi.fn((key: string) => {
    delete storeState.data[key];
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

describe("SecureStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    storeState.data = {};
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true);
    safeStorageMock.decryptString.mockImplementation((buffer: Buffer) => {
      const text = buffer.toString("utf8");
      if (!text.startsWith("enc:")) throw new Error("Invalid payload");
      return text.slice(4);
    });
  });

  async function getService() {
    const mod = await import("../SecureStorage.js");
    return mod.secureStorage;
  }

  it("stores and retrieves plain-text values", async () => {
    const service = await getService();
    service.set("userConfig.githubToken", "ghp_token123");

    expect(service.get("userConfig.githubToken")).toBe("ghp_token123");
  });

  it("migrates legacy encrypted values to plain text on read", async () => {
    // Simulate a previously safeStorage-encrypted value
    const encrypted = Buffer.from("enc:ghp_secret", "utf8").toString("hex");
    storeState.data["userConfig.githubToken"] = encrypted;
    const service = await getService();

    expect(service.get("userConfig.githubToken")).toBe("ghp_secret");
    // Value should now be stored as plain text
    expect(storeMock.set).toHaveBeenCalledWith("userConfig.githubToken", "ghp_secret");
  });

  it("clears corrupted encrypted values that fail decryption", async () => {
    storeState.data["userConfig.githubToken"] = Buffer.from("bad-payload", "utf8").toString("hex");
    const service = await getService();

    expect(service.get("userConfig.githubToken")).toBeUndefined();
    expect(storeMock.delete).toHaveBeenCalledWith("userConfig.githubToken");
  });

  it("keeps plain-text values as-is (no migration needed)", async () => {
    storeState.data["userConfig.githubToken"] = "ghp_plaintoken";
    const service = await getService();

    expect(service.get("userConfig.githubToken")).toBe("ghp_plaintoken");
  });

  it("clears corrupted non-string values and returns undefined", async () => {
    storeState.data["userConfig.githubToken"] = { token: "bad-shape" };
    const service = await getService();

    expect(service.get("userConfig.githubToken")).toBeUndefined();
    expect(storeMock.delete).toHaveBeenCalledWith("userConfig.githubToken");
  });

  it("deletes value when set to undefined", async () => {
    const service = await getService();
    service.set("userConfig.githubToken", "abc");
    service.set("userConfig.githubToken", undefined);

    expect(storeMock.delete).toHaveBeenCalledWith("userConfig.githubToken");
  });
});
