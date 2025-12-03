import { safeStorage } from "electron";
import { store, type StoreSchema } from "../store.js";

export type SecureKey = "userConfig.openaiApiKey" | "userConfig.githubToken";

type UserConfigKey = keyof StoreSchema["userConfig"];
type DotNotatedUserConfigKey = `userConfig.${UserConfigKey}`;

class SecureStorage {
  private isAvailable: boolean;

  constructor() {
    this.isAvailable = safeStorage.isEncryptionAvailable();
    if (!this.isAvailable) {
      console.warn("[SecureStorage] OS encryption not available. Falling back to plain text.");
    }
  }

  private isHexEncoded(value: string): boolean {
    return /^[0-9a-f]+$/i.test(value) && value.length % 2 === 0;
  }

  public set(key: SecureKey, value: string | undefined): void {
    if (!value) {
      store.delete(key as DotNotatedUserConfigKey);
      return;
    }

    if (this.isAvailable) {
      try {
        const encrypted = safeStorage.encryptString(value);
        store.set(key as DotNotatedUserConfigKey, encrypted.toString("hex"));
      } catch (error) {
        console.error(
          `[SecureStorage] Failed to encrypt ${key}, falling back to plain text:`,
          error
        );
        store.set(key as DotNotatedUserConfigKey, value);
      }
    } else {
      store.set(key as DotNotatedUserConfigKey, value);
    }
  }

  public get(key: SecureKey): string | undefined {
    const storedValue = store.get(key as DotNotatedUserConfigKey) as string | undefined;
    if (!storedValue) return undefined;

    if (this.isAvailable) {
      if (!this.isHexEncoded(storedValue)) {
        console.warn(
          `[SecureStorage] Found plain-text ${key}, migrating to encrypted storage on next save.`
        );
        return storedValue;
      }

      try {
        const buffer = Buffer.from(storedValue, "hex");
        return safeStorage.decryptString(buffer);
      } catch (error) {
        console.warn(
          `[SecureStorage] Failed to decrypt ${key}, clearing corrupted entry. User will need to re-enter.`
        );
        store.delete(key as DotNotatedUserConfigKey);
        return undefined;
      }
    }

    if (this.isHexEncoded(storedValue)) {
      console.warn(
        `[SecureStorage] Found encrypted ${key} but encryption unavailable. Clearing entry, user will need to re-enter.`
      );
      store.delete(key as DotNotatedUserConfigKey);
      return undefined;
    }

    return storedValue;
  }

  public delete(key: SecureKey): void {
    store.delete(key as DotNotatedUserConfigKey);
  }
}

export const secureStorage = new SecureStorage();
