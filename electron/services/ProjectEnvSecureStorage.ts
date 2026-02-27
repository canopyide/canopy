import * as electron from "electron";
import { store } from "../store.js";

/**
 * Per-project environment variable storage backed by electron-store.
 * Values are stored as plain text — the same security model as .env files.
 * On first access, any previously safeStorage-encrypted values are migrated to plain text.
 */
class ProjectEnvSecureStorage {
  private migratedKeys = new Set<string>();

  private makeKey(projectId: string, envKey: string): string {
    return `${projectId}:${envKey}`;
  }

  private getProjectEnvMap(): Record<string, string> {
    const raw = store.get("projectEnv");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string") {
        normalized[key] = value;
      }
    }
    return normalized;
  }

  private isHexEncoded(value: string): boolean {
    return /^[0-9a-f]+$/i.test(value) && value.length % 2 === 0;
  }

  private migrateIfNeeded(compositeKey: string, storedValue: string): string | undefined {
    if (this.migratedKeys.has(compositeKey)) return storedValue;
    this.migratedKeys.add(compositeKey);

    if (!this.isHexEncoded(storedValue)) return storedValue;

    // Try to decrypt legacy safeStorage-encrypted values
    try {
      if (electron.safeStorage?.isEncryptionAvailable()) {
        const buffer = Buffer.from(storedValue, "hex");
        const decrypted = electron.safeStorage.decryptString(buffer);
        // Persist the migrated plain-text value
        const projectEnv = this.getProjectEnvMap();
        projectEnv[compositeKey] = decrypted;
        store.set("projectEnv", projectEnv);
        console.info(
          `[ProjectEnvSecureStorage] Migrated ${compositeKey} from encrypted to plain text.`
        );
        return decrypted;
      }
    } catch {
      // Can't decrypt — corrupted or not actually encrypted
    }

    // Hex-encoded but can't decrypt — likely corrupted
    console.warn(`[ProjectEnvSecureStorage] Could not migrate ${compositeKey}, clearing entry.`);
    const projectEnv = this.getProjectEnvMap();
    delete projectEnv[compositeKey];
    store.set("projectEnv", projectEnv);
    return undefined;
  }

  public set(projectId: string, envKey: string, value: string | undefined): void {
    const key = this.makeKey(projectId, envKey);
    const projectEnv = this.getProjectEnvMap();

    if (value === undefined) {
      delete projectEnv[key];
      store.set("projectEnv", projectEnv);
      return;
    }

    projectEnv[key] = value;
    store.set("projectEnv", projectEnv);
  }

  public get(projectId: string, envKey: string): string | undefined {
    const key = this.makeKey(projectId, envKey);
    const projectEnv = this.getProjectEnvMap();
    const storedValue = projectEnv[key];

    if (!storedValue) return undefined;

    return this.migrateIfNeeded(key, storedValue);
  }

  public delete(projectId: string, envKey: string): void {
    const key = this.makeKey(projectId, envKey);
    const projectEnv = this.getProjectEnvMap();
    delete projectEnv[key];
    store.set("projectEnv", projectEnv);
  }

  public listKeys(projectId: string): string[] {
    const projectEnv = this.getProjectEnvMap();
    const prefix = `${projectId}:`;
    return Object.keys(projectEnv)
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.substring(prefix.length));
  }

  public deleteAllForProject(projectId: string): void {
    const projectEnv = this.getProjectEnvMap();
    const prefix = `${projectId}:`;
    const newProjectEnv: Record<string, string> = {};

    for (const [key, value] of Object.entries(projectEnv)) {
      if (!key.startsWith(prefix)) {
        newProjectEnv[key] = value;
      }
    }

    store.set("projectEnv", newProjectEnv);
  }

  public checkAvailability(): boolean {
    return true;
  }
}

export const projectEnvSecureStorage = new ProjectEnvSecureStorage();
