import { safeStorage } from "electron";
import type { Migration } from "../StoreMigrations.js";

interface LegacyMcpServerConfig {
  enabled?: boolean;
  port?: number | null;
  apiKey?: string;
  apiKeyEncrypted?: string;
  fullToolSurface?: boolean;
}

export const migration021: Migration = {
  version: 21,
  description: "Migrate MCP server API key from plaintext to safeStorage-encrypted",
  up: (store) => {
    const config = (store.get("mcpServer") ?? {}) as LegacyMcpServerConfig;
    const { apiKey: plaintext, ...rest } = config;

    // Already migrated, no plaintext to drop, or no key to migrate.
    if (!plaintext) {
      if ("apiKey" in config) {
        store.set("mcpServer", rest);
      }
      return;
    }

    if (!safeStorage.isEncryptionAvailable()) {
      // Encryption not available — never leave plaintext on disk. The auto-keygen
      // path in McpServerService.start() regenerates a key on next launch.
      console.warn(
        "[Migrations v21] safeStorage unavailable; dropping plaintext MCP API key without encrypting (auto-regenerates on next start)"
      );
      store.set("mcpServer", rest);
      return;
    }

    try {
      const encrypted = safeStorage.encryptString(plaintext).toString("base64");
      store.set("mcpServer", { ...rest, apiKeyEncrypted: encrypted });
    } catch (err) {
      console.warn(
        "[Migrations v21] Failed to encrypt MCP API key; dropping plaintext (auto-regenerates on next start):",
        err
      );
      store.set("mcpServer", rest);
    }
  },
};
