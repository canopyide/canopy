import type { GitHubTokenValidation } from "./GitHubAuth.js";
import { GitHubAuth } from "./GitHubAuth.js";
import { setGitHubToken, clearGitHubToken, validateGitHubToken } from "./GitHubToken.js";
import { gitHubTokenHealthService } from "./GitHubTokenHealthService.js";
import { getWorkspaceClient } from "../WorkspaceClient.js";

export async function setTokenAndSync(token: string): Promise<GitHubTokenValidation> {
  const trimmed = token.trim();
  const validation = await validateGitHubToken(trimmed);

  if (validation.valid) {
    setGitHubToken(trimmed);
    const versionAfterSet = GitHubAuth.getTokenVersion();

    if (validation.username) {
      GitHubAuth.setValidatedUserInfo(
        validation.username,
        validation.avatarUrl,
        validation.scopes,
        versionAfterSet
      );
    }

    try {
      const workspaceClient = getWorkspaceClient();
      workspaceClient.updateGitHubToken(trimmed);
    } catch {
      // WorkspaceClient may not be initialized yet
    }

    gitHubTokenHealthService.resetState();
    void gitHubTokenHealthService.refresh({ force: true }).catch(() => {});
  }

  return validation;
}

export async function clearTokenAndSync(): Promise<void> {
  clearGitHubToken();

  try {
    const workspaceClient = getWorkspaceClient();
    workspaceClient.updateGitHubToken(null);
  } catch {
    // WorkspaceClient may not be initialized yet
  }

  gitHubTokenHealthService.resetState();
}
