import * as electron from "electron";
import { store, type StoreSchema } from "../store.js";

export type SecureKey = "userConfig.githubToken";

type UserConfigKey = keyof StoreSchema["userConfig"];
type DotNotatedUserConfigKey = `userConfig.${UserConfigKey}`;

/**
 * Simple key-value storage backed by electron-store.
 * Values are stored as plain text — the same security model as ~/.gitconfig or .env files.
 * On first access, any previously safeStorage-encrypted values are migrated to plain text.
 */
class SecureStorage {
  private migrated = false;

  private migrateIfNeeded(key: SecureKey): void {
    if (this.migrated) return;
    this.migrated = true;

    const rawValue = store.get(key as DotNotatedUserConfigKey) as unknown;
    if (typeof rawValue !== "string" || rawValue === "") return;

    // Detect hex-encoded safeStorage values from previous versions
    if (/^[0-9a-f]+$/i.test(rawValue) && rawValue.length % 2 === 0) {
      try {
        if (electron.safeStorage?.isEncryptionAvailable()) {
          const buffer = Buffer.from(rawValue, "hex");
          const decrypted = electron.safeStorage.decryptString(buffer);
          store.set(key as DotNotatedUserConfigKey, decrypted);
          console.info(`[SecureStorage] Migrated ${key} from encrypted to plain text.`);
        }
      } catch {
        // Can't decrypt — value is either corrupted or was never encrypted.
        // If it looks like a valid token, keep it; otherwise clear it.
        console.warn(`[SecureStorage] Could not migrate ${key}, clearing corrupted entry.`);
        store.delete(key as DotNotatedUserConfigKey);
      }
    }
  }

  public set(key: SecureKey, value: string | undefined): void {
    if (!value) {
      store.delete(key as DotNotatedUserConfigKey);
      return;
    }
    store.set(key as DotNotatedUserConfigKey, value);
  }

  public get(key: SecureKey): string | undefined {
    this.migrateIfNeeded(key);

    const rawValue = store.get(key as DotNotatedUserConfigKey) as unknown;
    if (rawValue === undefined || rawValue === null || rawValue === "") return undefined;
    if (typeof rawValue !== "string") {
      console.warn(`[SecureStorage] Found invalid non-string ${key}, clearing corrupted entry.`);
      store.delete(key as DotNotatedUserConfigKey);
      return undefined;
    }
    return rawValue;
  }

  public delete(key: SecureKey): void {
    store.delete(key as DotNotatedUserConfigKey);
  }
}

export const secureStorage = new SecureStorage();
