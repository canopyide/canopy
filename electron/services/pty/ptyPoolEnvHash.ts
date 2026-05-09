import { filterEnvironment } from "./EnvironmentFilter.js";

/**
 * Volatile env keys that change with shell session state but don't change the
 * effective execution environment. Excluded from the pool key so that two
 * spawns whose only differences are these keys still share a pool slot.
 */
export const VOLATILE_ENV_KEYS: ReadonlySet<string> = new Set(["SHLVL", "PWD", "OLDPWD", "_"]);

const EMPTY_HASH = "env-empty";

/**
 * Stable identifier for a pool slot keyed by env. Two calls with the same
 * post-filter env additions (modulo volatile keys) return the same string.
 *
 * The hash runs over the post-`filterEnvironment` view because that's what
 * actually reaches the child process — secrets are stripped before hashing,
 * so two callers that differ only in stripped-away secrets share a slot
 * (correct: stripped secrets never reach the pre-warmed shell).
 */
export function computePoolEnvHash(env: Record<string, string | undefined> | undefined): string {
  if (!env) {
    return EMPTY_HASH;
  }

  const filtered = filterEnvironment(env);
  const entries: string[] = [];
  for (const [key, value] of Object.entries(filtered)) {
    if (VOLATILE_ENV_KEYS.has(key)) continue;
    entries.push(`${key}=${value}`);
  }

  if (entries.length === 0) {
    return EMPTY_HASH;
  }

  entries.sort();

  let hash = 5381;
  for (const entry of entries) {
    for (let i = 0; i < entry.length; i++) {
      hash = ((hash << 5) + hash + entry.charCodeAt(i)) | 0;
    }
    hash = ((hash << 5) + hash + 10) | 0;
  }

  const u32 = hash >>> 0;
  return `env-${u32.toString(36)}`;
}

export const POOL_ENV_EMPTY_HASH = EMPTY_HASH;
