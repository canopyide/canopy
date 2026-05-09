/**
 * HelpSessionJobService - Windows-only crash-safe reaping for help-session
 * PTY trees (#7526).
 *
 * Holds a single global Windows Job Object (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE)
 * for Daintree's lifetime via the `win-job-object` native addon. Help-session
 * PTY PIDs are added on `terminal-pid` events filtered through
 * {@link HelpSessionService.isHelpTerminal}. When the main Electron process
 * dies for any reason — graceful quit, force-quit, OOM, hard crash — the OS
 * kernel closes the Job HANDLE and reaps every assigned process and its
 * descendants. This is the one cleanup tier that survives a hard crash;
 * cooperative paths (`taskkill /T`, `displacePriorSessions`, renderer
 * teardown) only run when the main process is still executing.
 *
 * Linux / macOS: no-op. The native addon's binding.gyp emits zero targets
 * on non-Windows, so the .node binary doesn't exist and the wrapper returns
 * `false`. Equivalents (`PR_SET_PDEATHSIG`, `kqueue EVFILT_PROC`) are a
 * separate design call left for follow-up.
 */

const ATTACH_LOG_TAG = "[HelpSessionJobService]";

interface NativeAddon {
  assignProcessToHelpJob(pid: number): boolean;
  isAvailable(): boolean;
  getLoadError(): unknown;
}

function loadNativeAddon(): NativeAddon | null {
  if (process.platform !== "win32") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("win-job-object") as NativeAddon;
    if (typeof mod.assignProcessToHelpJob !== "function") return null;
    return mod;
  } catch (err) {
    console.warn(
      `${ATTACH_LOG_TAG} Failed to load win-job-object addon — crash-safe reaping disabled:`,
      err
    );
    return null;
  }
}

export class HelpSessionJobService {
  private readonly attachedPids = new Set<number>();
  private readonly native: NativeAddon | null;
  private warnedUnavailable = false;
  private warnedAttachFailed = false;

  constructor(nativeOverride?: NativeAddon | null) {
    this.native = nativeOverride === undefined ? loadNativeAddon() : nativeOverride;
  }

  /**
   * Attach a help-session PTY PID to the global Job Object. No-op on
   * non-Windows, on a duplicate PID, on an invalid PID, or on a native-side
   * failure (process exited before attach, parent already in a non-nesting
   * job, addon not loaded). Failures are logged once each — subsequent
   * failures are silent so a stuck CI/MDM environment doesn't flood logs.
   */
  attachHelpSessionPid(pid: number): void {
    if (process.platform !== "win32") return;

    if (typeof pid !== "number" || !Number.isFinite(pid) || !Number.isInteger(pid) || pid <= 0) {
      return;
    }

    if (this.attachedPids.has(pid)) return;
    // Insert eagerly so a transient native failure doesn't cause us to retry
    // every subsequent terminal-pid event for the same PID. Windows will at
    // most accept the PID once anyway — AssignProcessToJobObject on a
    // process already in this same job is undefined behavior to repeat.
    this.attachedPids.add(pid);

    if (!this.native) {
      if (!this.warnedUnavailable) {
        this.warnedUnavailable = true;
        console.warn(
          `${ATTACH_LOG_TAG} Native addon unavailable — help-session PTYs will not be reaped on hard crash`
        );
      }
      return;
    }

    let ok: boolean;
    try {
      ok = this.native.assignProcessToHelpJob(pid);
    } catch (err) {
      ok = false;
      console.warn(`${ATTACH_LOG_TAG} Native attach threw for pid ${pid}:`, err);
    }
    if (!ok && !this.warnedAttachFailed) {
      this.warnedAttachFailed = true;
      console.warn(
        `${ATTACH_LOG_TAG} Failed to attach pid ${pid} to help-session Job Object — process may have exited or parent is in a non-nesting job`
      );
    }
  }

  /** Test-only: drop the attached-PID memo so a fresh test starts clean. */
  resetForTest(): void {
    this.attachedPids.clear();
    this.warnedUnavailable = false;
    this.warnedAttachFailed = false;
  }

  /** Test-only: inspect the attached-PID set. */
  getAttachedPidsForTest(): ReadonlySet<number> {
    return this.attachedPids;
  }
}

export const helpSessionJobService = new HelpSessionJobService();
