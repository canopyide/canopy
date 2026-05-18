import { shell } from "electron";
import { CHANNELS } from "../channels.js";
import { typedHandle } from "../utils.js";
import { store } from "../../store.js";
import {
  getForgeProviderImpl,
  getRegisteredForgeProviders,
} from "../../services/forgeProviderRegistry.js";
import { resolveForgeProvider } from "../../services/forgeProviderResolver.js";
import { gitServiceCache } from "../../services/GitServiceCache.js";
import type { RepoRef } from "../../../shared/types/forge.js";

interface ResolvedContext {
  namespaceId: string;
  repoRef: RepoRef;
}

async function resolveForCwd(cwd: string): Promise<ResolvedContext> {
  if (typeof cwd !== "string" || !cwd) {
    throw new Error("Invalid working directory");
  }

  const gitService = gitServiceCache.getGitService(cwd);
  if (!gitService) {
    throw new Error("Not a git repository");
  }

  const remoteUrl = await gitService.getRemoteUrl(cwd).catch(() => null);
  if (!remoteUrl) {
    throw new Error("No remote URL found for this repository");
  }

  const globalDefault = store.get("forgeDefaultProviderId");
  const globalDefaultProviderId = typeof globalDefault === "string" ? globalDefault : null;

  const resolved = resolveForgeProvider({
    remoteUrl,
    forgeProviderOverride: null,
    globalDefaultProviderId,
  });

  if (!resolved.entry) {
    throw new Error("No forge provider registered for this repository");
  }

  const impl = getForgeProviderImpl(resolved.entry.pluginId);
  if (!impl) {
    throw new Error(
      `Forge provider "${resolved.entry.contribution.id}" not activated. Activate it in Settings.`
    );
  }

  const repoRef = impl.parseRemote(remoteUrl);
  if (!repoRef) {
    throw new Error("Could not parse repository identity from remote URL");
  }

  return { namespaceId: resolved.entry.pluginId, repoRef };
}

function getImplForNamespace(namespaceId: string) {
  const impl = getForgeProviderImpl(namespaceId);
  if (!impl) {
    throw new Error(`Forge provider "${namespaceId}" not activated. Activate it in Settings.`);
  }
  return impl;
}

export function registerForgeHandlers(): () => void {
  const cleanups: Array<() => void> = [];

  cleanups.push(
    typedHandle(CHANNELS.FORGE_OPEN_ISSUES, async (cwd: string, query?: string, state?: string) => {
      const { namespaceId, repoRef } = await resolveForCwd(cwd);
      const impl = getImplForNamespace(namespaceId);
      const url = impl.buildIssuesUrl(repoRef, { query, state });
      await shell.openExternal(url);
    })
  );

  cleanups.push(
    typedHandle(CHANNELS.FORGE_OPEN_PRS, async (cwd: string, query?: string, state?: string) => {
      const { namespaceId, repoRef } = await resolveForCwd(cwd);
      const impl = getImplForNamespace(namespaceId);
      const url = impl.buildPRsUrl(repoRef, { query, state });
      await shell.openExternal(url);
    })
  );

  cleanups.push(
    typedHandle(CHANNELS.FORGE_OPEN_COMMITS, async (cwd: string, branch?: string) => {
      if (branch !== undefined && (typeof branch !== "string" || !branch.trim())) {
        throw new Error("Invalid branch name");
      }
      const { namespaceId, repoRef } = await resolveForCwd(cwd);
      const impl = getImplForNamespace(namespaceId);
      const url = impl.buildCommitsUrl(repoRef, branch);
      await shell.openExternal(url);
    })
  );

  cleanups.push(
    typedHandle(
      CHANNELS.FORGE_OPEN_ISSUE,
      async (payload: { cwd: string; issueNumber: number }) => {
        if (!payload || typeof payload !== "object") {
          throw new Error("Invalid payload");
        }
        if (typeof payload.cwd !== "string" || !payload.cwd) {
          throw new Error("Invalid working directory");
        }
        if (
          typeof payload.issueNumber !== "number" ||
          !Number.isInteger(payload.issueNumber) ||
          payload.issueNumber <= 0
        ) {
          throw new Error("Invalid issue number");
        }
        const { namespaceId, repoRef } = await resolveForCwd(payload.cwd);
        const impl = getImplForNamespace(namespaceId);
        const url = impl.buildIssueUrl(repoRef, payload.issueNumber);
        await shell.openExternal(url);
      }
    )
  );

  cleanups.push(
    typedHandle(
      CHANNELS.FORGE_ASSIGN_ISSUE,
      async (payload: { cwd: string; issueNumber: number; username: string }) => {
        if (!payload || typeof payload !== "object") {
          throw new Error("Invalid payload");
        }
        if (typeof payload.cwd !== "string" || !payload.cwd.trim()) {
          throw new Error("Invalid working directory");
        }
        if (
          typeof payload.issueNumber !== "number" ||
          !Number.isInteger(payload.issueNumber) ||
          payload.issueNumber <= 0
        ) {
          throw new Error("Invalid issue number");
        }
        const trimmedUsername = payload.username?.trim();
        if (typeof payload.username !== "string" || !trimmedUsername) {
          throw new Error("Invalid username");
        }
        const { namespaceId, repoRef } = await resolveForCwd(payload.cwd);
        const impl = getImplForNamespace(namespaceId);
        await impl.assignIssue(repoRef, payload.issueNumber, trimmedUsername);
      }
    )
  );

  cleanups.push(
    typedHandle(CHANNELS.FORGE_VALIDATE_TOKEN, async (token: string) => {
      if (typeof token !== "string" || !token.trim()) {
        return { valid: false as const, error: "Token is required" };
      }
      const globalDefault = store.get("forgeDefaultProviderId");
      const providerId = typeof globalDefault === "string" ? globalDefault.trim() : "";
      if (!providerId) {
        const providers = getRegisteredForgeProviders();
        if (providers.length === 0) {
          return { valid: false as const, error: "No forge provider configured" };
        }
        // Use the first registered provider when no default is set
        const impl = getForgeProviderImpl(providers[0].pluginId);
        if (!impl) {
          return {
            valid: false as const,
            error: `Forge provider "${providers[0].contribution.id}" not activated`,
          };
        }
        return impl.validateToken(token.trim());
      }
      const impl = getForgeProviderImpl(providerId);
      if (!impl) {
        return {
          valid: false as const,
          error: `Forge provider "${providerId}" not found`,
        };
      }
      return impl.validateToken(token.trim());
    })
  );

  return () => cleanups.forEach((c) => c());
}
