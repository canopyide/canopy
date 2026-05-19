import path from "path";
import {
  spawn,
  spawnSync,
  execFile,
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
} from "child_process";
import { CHANNELS } from "../../channels.js";
import { getWindowForWebContents } from "../../../window/webContentsRegistry.js";
import {
  broadcastToRenderer,
  sendToRenderer,
  typedHandle,
  typedHandleWithContext,
} from "../../utils.js";
import { createAuthenticatedGit } from "../../../utils/hardenedGit.js";
import { parseGitHubRepoUrl } from "../../../services/github/index.js";
import type {
  CloneRepoOptions,
  CloneRepoResult,
  CloneRepoProgressEvent,
} from "../../../../shared/types/ipc/gitClone.js";
import { formatErrorMessage } from "../../../../shared/utils/errorMessage.js";
import { validateFolderName } from "../../../../shared/utils/folderName.js";
import { classifyGitError } from "../../../../shared/utils/gitOperationErrors.js";
import { AppError, GitOperationError } from "../../../utils/errorTypes.js";

const GH_AUTH_PROBE_TIMEOUT_MS = 3_000;
const GH_CLONE_TIMEOUT_MS = 5 * 60 * 1_000;
const GH_STDERR_TAIL_BYTES = 8 * 1024;

// Belt-and-suspenders: prevent any interactive prompt in headless Electron main.
const GH_NON_INTERACTIVE_ENV = {
  GH_PROMPT_DISABLED: "1",
  GH_TERMINAL_PROMPT: "0",
} as const;

type ProgressEmitter = (stage: string, progress: number, message: string) => void;

function killProcessTree(child: ChildProcess): void {
  if (child.pid === undefined) {
    try {
      child.kill();
    } catch {
      // Already exited.
    }
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/F", "/T", "/PID", child.pid.toString()], {
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // Already exited.
  }
  const sigkillTimer = setTimeout(() => {
    try {
      if (child.pid !== undefined) {
        process.kill(-child.pid, "SIGKILL");
      }
    } catch {
      // Already exited.
    }
  }, 5_000);
  // Don't keep the event loop alive solely for the SIGKILL escalation.
  sigkillTimer.unref();
}

async function probeGhAuth(externalSignal?: AbortSignal): Promise<boolean> {
  if (externalSignal?.aborted) return false;
  return new Promise((resolve) => {
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), GH_AUTH_PROBE_TIMEOUT_MS);

    execFile(
      "gh",
      ["auth", "status"],
      {
        env: { ...process.env, ...GH_NON_INTERACTIVE_ENV },
        signal: controller.signal,
        windowsHide: true,
      },
      (err) => {
        clearTimeout(timer);
        if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
        resolve(!err);
      }
    );
  });
}

const GH_STAGE_PATTERNS: Array<{ re: RegExp; stage: string }> = [
  { re: /Counting objects:\s+(\d+)%/, stage: "counting" },
  { re: /Compressing objects:\s+(\d+)%/, stage: "compressing" },
  { re: /Receiving objects:\s+(\d+)%/, stage: "receiving" },
  { re: /Resolving deltas:\s+(\d+)%/, stage: "resolving" },
];

function parseGhStderrLine(line: string): { stage: string; progress: number } | null {
  for (const { re, stage } of GH_STAGE_PATTERNS) {
    const match = line.match(re);
    if (match) {
      const progress = Number.parseInt(match[1], 10);
      if (Number.isFinite(progress)) {
        return { stage, progress };
      }
    }
  }
  return null;
}

async function cloneWithGh(
  owner: string,
  repo: string,
  parentPath: string,
  targetFolder: string,
  shallowClone: boolean,
  signal: AbortSignal,
  emitProgress: ProgressEmitter
): Promise<void> {
  if (signal.aborted) {
    throw new AppError({ code: "CANCELLED", message: "Clone cancelled" });
  }

  const args = [
    "repo",
    "clone",
    `${owner}/${repo}`,
    targetFolder,
    ...(shallowClone ? ["--", "--depth", "1"] : []),
  ];

  const isWin = process.platform === "win32";
  const child: ChildProcessWithoutNullStreams = spawn("gh", args, {
    cwd: parentPath,
    env: { ...process.env, ...GH_NON_INTERACTIVE_ENV },
    detached: !isWin,
    windowsHide: true,
  });

  let stderrTail = "";
  let lastStage: string | null = null;
  let lastProgress = -1;
  let finalized = false;
  let timedOut = false;

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-GH_STDERR_TAIL_BYTES);
    for (const line of chunk.split(/[\r\n]+/)) {
      if (!line) continue;
      const parsed = parseGhStderrLine(line);
      if (!parsed) continue;
      if (parsed.stage === lastStage && parsed.progress === lastProgress) continue;
      lastStage = parsed.stage;
      lastProgress = parsed.progress;
      emitProgress(parsed.stage, parsed.progress, `${parsed.stage}: ${parsed.progress}%`);
    }
  });

  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    killProcessTree(child);
  }, GH_CLONE_TIMEOUT_MS);

  const onAbort = () => {
    killProcessTree(child);
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    await new Promise<void>((resolve, reject) => {
      child.once("error", (err) => {
        if (finalized) return;
        finalized = true;
        reject(err);
      });
      child.once("close", (code) => {
        if (finalized) return;
        finalized = true;
        if (signal.aborted) {
          reject(new AppError({ code: "CANCELLED", message: "Clone cancelled" }));
          return;
        }
        if (timedOut) {
          reject(new Error(`gh repo clone timed out after ${GH_CLONE_TIMEOUT_MS / 1000}s`));
          return;
        }
        if (code === 0) {
          resolve();
          return;
        }
        const tail = stderrTail.trim();
        const detail = tail ? `: ${tail.split(/\r?\n/).slice(-3).join(" ")}` : "";
        reject(new Error(`gh repo clone exited with code ${code}${detail}`));
      });
    });
  } finally {
    clearTimeout(timeoutHandle);
    signal.removeEventListener("abort", onAbort);
  }
}

export function registerGitCloneHandlers(): () => void {
  const handlers: Array<() => void> = [];

  // Track every in-flight clone so cancel aborts each one independently.
  // Electron's ipcMain.handle permits concurrent invocations from multiple
  // senders; sharing a single controller would let a later clone overwrite an
  // earlier one's cancel target.
  const activeControllers = new Set<AbortController>();

  const handleProjectCloneRepo = async (
    ctx: import("../../types.js").IpcContext,
    options: CloneRepoOptions
  ): Promise<CloneRepoResult> => {
    if (!options || typeof options !== "object") {
      throw new Error("Invalid options object");
    }

    const senderWindow = getWindowForWebContents(ctx.event.sender);

    const { url, parentPath, folderName, shallowClone } = options;

    if (typeof url !== "string" || !url.trim()) {
      throw new Error("Repository URL is required");
    }
    if (!/^https?:\/\//i.test(url) && !/^git@/i.test(url)) {
      throw new Error("Only HTTP(S) and SSH (git@) URLs are supported");
    }
    if (typeof parentPath !== "string" || !parentPath.trim()) {
      throw new Error("Parent path is required");
    }
    if (!path.isAbsolute(parentPath)) {
      throw new Error("Parent path must be absolute");
    }
    if (typeof folderName !== "string") {
      throw new Error("Folder name is required");
    }

    const folderNameError = validateFolderName(folderName);
    if (folderNameError) {
      throw new Error(folderNameError);
    }
    const trimmedFolder = folderName.trim();

    const targetPath = path.join(parentPath, trimmedFolder);
    const normalizedParent = path.resolve(parentPath);
    const normalizedTarget = path.resolve(targetPath);
    if (!normalizedTarget.startsWith(normalizedParent + path.sep)) {
      throw new Error("Folder name resolves outside of the parent directory");
    }

    const fs = await import("fs");

    try {
      const parentStat = await fs.promises.stat(parentPath);
      if (!parentStat.isDirectory()) {
        throw new Error("Parent path is not a directory");
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new Error("Parent directory does not exist", { cause: err });
      }
      throw err;
    }

    const targetExists = await fs.promises
      .access(targetPath)
      .then(() => true)
      .catch(() => false);
    if (targetExists) {
      throw new Error(`Folder "${trimmedFolder}" already exists in this location`);
    }

    const emitProgress = (stage: string, progress: number, message: string) => {
      const progressEvent: CloneRepoProgressEvent = {
        stage,
        progress,
        message,
        timestamp: Date.now(),
      };
      if (senderWindow && !senderWindow.isDestroyed()) {
        sendToRenderer(senderWindow, CHANNELS.PROJECT_CLONE_PROGRESS, progressEvent);
      } else {
        broadcastToRenderer(CHANNELS.PROJECT_CLONE_PROGRESS, progressEvent);
      }
    };

    const localController = new AbortController();
    activeControllers.add(localController);

    // Detect github.com URL and probe `gh` auth — non-null + authed picks the gh path.
    const ghTarget = parseGitHubRepoUrl(url);
    const useGhPath = ghTarget !== null && (await probeGhAuth(localController.signal));

    try {
      if (localController.signal.aborted) {
        throw new AppError({ code: "CANCELLED", message: "Clone cancelled" });
      }

      emitProgress("starting", 0, "Starting clone...");

      if (useGhPath && ghTarget) {
        await cloneWithGh(
          ghTarget.owner,
          ghTarget.repo,
          parentPath,
          trimmedFolder,
          Boolean(shallowClone),
          localController.signal,
          emitProgress
        );
      } else {
        const git = createAuthenticatedGit(parentPath, {
          signal: localController.signal,
          progress({ stage, progress }) {
            emitProgress(stage, progress, `${stage}: ${progress}%`);
          },
          extraConfig: ["transfer.bundleURI=false"],
        });

        await git.clone(url, trimmedFolder, shallowClone ? ["--depth", "1"] : []);
      }

      emitProgress("complete", 100, "Clone complete");
      return { clonedPath: targetPath };
    } catch (error) {
      const wasCancelled =
        localController.signal.aborted ||
        (error instanceof Error &&
          (error.name === "AbortError" ||
            (error instanceof AppError && error.code === "CANCELLED") ||
            /abort/i.test(error.message)));

      // Clean up partial clone. On Windows the spawned process must be terminated
      // before fs.rm — `killProcessTree` runs synchronously in the gh-path abort
      // listener, so by the time we get here the tree is gone and the directory
      // is unlocked.
      const partialExists = await fs.promises
        .access(targetPath)
        .then(() => true)
        .catch(() => false);
      if (partialExists) {
        await fs.promises.rm(targetPath, { recursive: true, force: true }).catch((rmErr) => {
          // Don't escalate — the original clone error is what the user sees.
          // But surface this in logs so partial-cleanup failures (e.g. Windows
          // antivirus locks) are diagnosable instead of silently swallowed.
          console.warn("[gitClone] Failed to clean up partial clone at", targetPath, rmErr);
        });
      }

      if (wasCancelled) {
        emitProgress("cancelled", 0, "Clone cancelled");
        throw new AppError({
          code: "CANCELLED",
          message: "Clone cancelled",
          context: { targetPath },
        });
      }

      const errorMessage = formatErrorMessage(error, "Failed to clone repository");
      emitProgress("error", 0, `Clone failed: ${errorMessage}`);
      const reason = classifyGitError(error);
      // `url` deliberately omitted from context — it can carry embedded
      // credentials (e.g. https://x-access-token:TOKEN@github.com/...) and
      // the renderer already has the input URL in local state.
      throw new GitOperationError(reason, errorMessage, {
        op: "clone",
        cause: error instanceof Error ? error : undefined,
        context: { targetPath },
      });
    } finally {
      activeControllers.delete(localController);
    }
  };
  handlers.push(typedHandleWithContext(CHANNELS.PROJECT_CLONE_REPO, handleProjectCloneRepo));

  const handleProjectCloneCancel = async (): Promise<void> => {
    // Cancel every in-flight clone. The renderer's clone dialog is the only
    // surface that fires this channel, and a per-clone identifier isn't
    // plumbed through, so all-or-nothing matches the historical UX.
    for (const controller of activeControllers) {
      controller.abort();
    }
  };
  handlers.push(typedHandle(CHANNELS.PROJECT_CLONE_CANCEL, handleProjectCloneCancel));

  return () => handlers.forEach((cleanup) => cleanup());
}
