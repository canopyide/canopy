import { Suspense, useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Settings2, ChevronRight, Plus, X } from "lucide-react";
import * as semver from "semver";
import { cn } from "@/lib/utils";
import { DaintreeIcon } from "@/components/icons/DaintreeIcon";
import { XtermAdapter } from "@/components/Terminal/XtermAdapter";
import { MissingCliGate } from "@/components/Terminal/MissingCliGate";
import { HelpIntroBanner } from "./HelpIntroBanner";
import {
  useHelpPanelStore,
  HELP_PANEL_MIN_WIDTH,
  HELP_PANEL_MAX_WIDTH,
} from "@/store/helpPanelStore";
import {
  usePanelStore,
  getTerminalRefreshTier,
  useCliAvailabilityStore,
  useProjectStore,
} from "@/store";
import { useMacroFocusStore } from "@/store/macroFocusStore";
import { getAgentConfig, getAssistantSupportedAgentIds } from "@/config/agents";
import { isAgentInstalled } from "../../../shared/utils/agentAvailability";
import { actionService } from "@/services/ActionService";
import { useEscapeStack } from "@/hooks/useEscapeStack";
import { suppressSidebarResizes } from "@/lib/sidebarToggle";
import { TerminalRefreshTier } from "@/types";
import { logError } from "@/utils/logger";
import { formatErrorMessage } from "@shared/utils/errorMessage";
import { notify } from "@/lib/notify";
import { safeFireAndForget } from "@/utils/safeFireAndForget";
import { ACTIVE_AGENT_STATES, CLOSE_CONFIRM_AGENT_STATES } from "@shared/types/agent";
import { buildResumeCommand } from "@shared/types/agentSettings";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TABBABLE_SELECTOR } from "@/lib/accessibility";

const RESIZE_STEP = 10;
const RESIZE_PAGE_STEP = 50;

const DAINTREE_HOME_URL = "https://daintree.org";

const SEED_PROMPTS = [
  "Explain this codebase to me",
  "Review my recent changes",
  "Help me debug an issue",
] as const;

const HIBERNATE_VALID_MINUTES: readonly number[] = [0, 15, 30, 60, 120];
const DEFAULT_HIBERNATE_MINUTES = 30;

function notifyLaunchFailed(agentId: string, reason: string): void {
  const cfg = getAgentConfig(agentId);
  const name = cfg?.name ?? agentId;
  notify({
    type: "error",
    title: "Assistant launch failed",
    message: `Couldn't start ${name}. ${reason}`,
  });
}

// Re-checks every 2 minutes while the agent is busy ("working" / "waiting" /
// "directing"), so hibernation defers cleanly until the conversation is idle
// without restarting the full hibernate countdown each time.
const HIBERNATE_BUSY_RECHECK_MS = 2 * 60 * 1000;

// Tier-1 ambient banner auto-dismiss for "Session resumed". The user will
// usually see it for the moment they return to the panel; long-lived banners
// distract from the conversation.
const RESUME_BANNER_AUTO_DISMISS_MS = 10_000;

function notifyMcpNotReady(reason: string): void {
  notify({
    type: "error",
    title: "Start MCP failed",
    message: `Daintree Assistant needs MCP, but the server didn't start. ${reason}`,
    action: {
      label: "Open settings",
      actionId: "app.settings.openTab",
      actionArgs: { tab: "assistant" },
      onClick: () => {
        void actionService.dispatch("app.settings.openTab", { tab: "assistant" });
      },
    },
  });
}

interface HelpSessionRef {
  sessionId: string;
  sessionPath: string;
  token: string;
  mcpUrl: string | null;
  windowId: number;
}

type ProvisionOutcome =
  | { ok: true; session: HelpSessionRef }
  | { ok: false; code: "MCP_NOT_READY"; message: string }
  | { ok: false; code: "UNKNOWN"; message: string };

interface HelpProjectRef {
  id: string;
  path: string;
}

async function provisionHelpSession(
  project: HelpProjectRef,
  agentId: string
): Promise<ProvisionOutcome> {
  try {
    const result = await window.electron.help.provisionSession({
      projectId: project.id,
      projectPath: project.path,
      agentId,
    });
    if (!result) {
      return {
        ok: false,
        code: "UNKNOWN",
        message: "Couldn't provision help session.",
      };
    }
    return { ok: true, session: result };
  } catch (err) {
    logError("Failed to provision help session", err);
    // The main process throws `HelpSessionError` with `.code = "MCP_NOT_READY"`
    // when daintreeControl is on but the in-process MCP server can't be
    // wired. Bubble that up so the launcher renders a specific toast
    // instead of the generic "agent didn't start" message.
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as Record<string, unknown>).code
        : undefined;
    const message = formatErrorMessage(err, "Couldn't provision help session");
    if (code === "MCP_NOT_READY") {
      return { ok: false, code: "MCP_NOT_READY", message };
    }
    return { ok: false, code: "UNKNOWN", message };
  }
}

interface VersionTooOld {
  agentId: string;
  agentName: string;
  installedVersion: string;
  requiredVersion: string;
}

// Probes the installed CLI version and compares it against the agent's
// `assistantMinVersion` floor. Returns a block descriptor when the installed
// version is definitively below the floor; returns null otherwise (no minimum
// configured, probe failed, version unparseable, or installed >= required).
// A null pass-through preserves the existing missing-CLI surface and avoids
// blocking on transient probe failures.
async function checkAssistantVersion(
  agentId: string,
  agentName: string
): Promise<VersionTooOld | null> {
  const config = getAgentConfig(agentId);
  const required = config?.assistantMinVersion;
  if (!required) return null;

  let info;
  try {
    info = await window.electron.system.getAgentVersion(agentId);
  } catch (err) {
    logError("Failed to probe assistant CLI version", err);
    return null;
  }

  const installed = info?.installedVersion;
  if (!installed) return null;

  try {
    if (semver.lt(installed, required)) {
      return { agentId, agentName, installedVersion: installed, requiredVersion: required };
    }
  } catch (err) {
    logError("Failed to compare assistant CLI version", err);
    return null;
  }
  return null;
}

// Fetches the user-configured custom CLI args from helpAssistant settings and
// splits them into a flag array. Settings are loaded at launch time (not at
// render) so changes in the Daintree Assistant settings tab take effect on the
// next launch without remounting the panel. Errors are logged and treated as
// "no custom flags" so a settings IPC failure can't block the assistant.
async function loadCustomLaunchFlags(): Promise<string[]> {
  try {
    const settings = await window.electron.helpAssistant.getSettings();
    const raw = settings.customArgs?.trim();
    if (!raw) return [];
    return raw.split(/\s+/).filter(Boolean);
  } catch (err) {
    logError("Failed to load helpAssistant customArgs", err);
    return [];
  }
}

function buildHelpEnv(
  session: HelpSessionRef | null,
  projectId: string | null
): Record<string, string> | undefined {
  if (!session) return undefined;
  const env: Record<string, string> = {
    DAINTREE_MCP_TOKEN: session.token,
    DAINTREE_WINDOW_ID: String(session.windowId),
  };
  if (session.mcpUrl) env.DAINTREE_MCP_URL = session.mcpUrl;
  if (projectId) env.DAINTREE_PROJECT_ID = projectId;
  return env;
}

function revokeHelpSession(sessionId: string | null): void {
  if (!sessionId) return;
  window.electron.help.revokeSession(sessionId).catch((err) => {
    logError("Failed to revoke help session", err);
  });
}

interface HelpPanelProps {
  /**
   * Configured panel width in pixels (the stable stored size, never 0).
   * Visibility is controlled by the `isVisible` prop; the panel always
   * renders at this width inside AppLayout's reserved right sidebar slot.
   */
  width: number;
  /**
   * Whether the panel is visible. When false, AppLayout collapses the clipped
   * right-sidebar slot so the panel grid slides over it. Defaults to width > 0
   * for backward compatibility.
   */
  isVisible?: boolean;
  /**
   * Startup gate supplied by AppLayout. The help panel can mount while global
   * state is still hydrating, but it must not launch the assistant terminal
   * until project state is available because provisioning is what proves MCP
   * readiness and writes the session-scoped .mcp.json.
   */
  isReadyToLaunch?: boolean;
}

export function HelpPanel({
  width: effectiveWidth,
  isVisible: isVisibleProp,
  isReadyToLaunch = true,
}: HelpPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Element that owned focus when the panel last opened. We restore focus to
  // it on close so keyboard users return to where they were rather than
  // body. Mirrors the pattern in AppDialog/AppPaletteDialog.
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const isMacroFocused = useMacroFocusStore((s) => s.focusedRegion === "assistant");
  const isVisible = isVisibleProp ?? effectiveWidth > 0;
  const [showNewSessionConfirm, setShowNewSessionConfirm] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [assistantVersionTooOld, setAssistantVersionTooOld] = useState<VersionTooOld | null>(null);

  const {
    isOpen,
    width,
    terminalId,
    agentId,
    preferredAgentId,
    introDismissed,
    conversationTouched,
    markConversationStarted,
    setWidth,
    setOpen,
    clearTerminal,
    dismissIntro,
  } = useHelpPanelStore();

  const terminal = usePanelStore((s) => (terminalId ? s.panelsById[terminalId] : undefined));
  const removePanel = usePanelStore((s) => s.removePanel);
  // Mirrors useGettingStartedChecklist.ts:45-55 — must stay in sync. Gates the
  // intro banner so it never reappears once the user has launched any assistant
  // (`everDetectedAgent` is persisted via panelStore so this survives restarts).
  const hasEverLaunchedAgent = usePanelStore((s) =>
    s.panelIds.some((id) => {
      const p = s.panelsById[id];
      return (
        Boolean(p?.launchAgentId) || Boolean(p?.detectedAgentId) || p?.everDetectedAgent === true
      );
    })
  );
  const cliDetail = useCliAvailabilityStore((s) => (agentId ? s.details[agentId] : undefined));
  const cliAvailability = useCliAvailabilityStore((s) => s.availability);
  const cliHasRealData = useCliAvailabilityStore((s) => s.hasRealData);
  const currentProject = useProjectStore((s) => s.currentProject);

  const agentConfig = agentId ? getAgentConfig(agentId) : undefined;

  // Intersection of "wired for the assistant overlay" and "CLI is installed".
  // Drives the single-supported-agent auto-skip effect below. Recomputes only
  // when availability or load state changes — `getAssistantSupportedAgentIds()`
  // reads from a static registry.
  const supportedInstalledAgentIds = useMemo(() => {
    if (!cliHasRealData) return [];
    return getAssistantSupportedAgentIds().filter((id) => isAgentInstalled(cliAvailability[id]));
  }, [cliHasRealData, cliAvailability]);
  const supportedInstalledAgentIdsKey = supportedInstalledAgentIds.join(",");

  // Tracks a session minted before `setTerminal` commits its sessionId to the
  // store. If the user closes/navigates while `agent.launch` is in flight,
  // cleanup paths revoke this ref so the token isn't leaked until 7-day GC.
  const pendingSessionIdRef = useRef<string | null>(null);

  // Set true while the OS is suspended so the visibilitychange teardown below
  // distinguishes "system slept" from "project switched / window unloaded".
  // macOS flips document.hidden=true on display-off, which is indistinguishable
  // from a project switch without this flag (issue #6758).
  const isSystemSuspendedRef = useRef(false);

  // Tracks an id reserved by doNewSession / handleRunAnyway that has been
  // pre-recorded in helpPanelStore *before* addPanel commits the new panel
  // to panelsById. Without this, the cleanup effect below would observe
  // `terminalId && !terminal` during the provision/spawn await and wipe the
  // reservation — re-opening the dock-filter gap that #6951 is closing.
  const pendingNewTerminalIdRef = useRef<string | null>(null);

  // Last-loaded idle-hibernate setting in minutes (0 = disabled). Re-fetched
  // each time the timer arms (panel hides) so a settings-tab change takes
  // effect without remounting the panel.
  const hibernateMinutesRef = useRef<number>(DEFAULT_HIBERNATE_MINUTES);
  const hibernateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visibilityEpoch, setVisibilityEpoch] = useState(0);

  const revokePendingSession = useCallback(() => {
    const pending = pendingSessionIdRef.current;
    if (pending) {
      pendingSessionIdRef.current = null;
      revokeHelpSession(pending);
    }
  }, []);

  // Revoke the bound help session if the underlying PTY panel disappears from
  // the panel store. addPanel puts the placeholder in panelsById before
  // setTerminal records the id here, so a missing entry usually means the
  // process exited and removePanel was called from elsewhere — except during
  // the brief window where the +New session / Run-anyway flows have reserved
  // the id but addPanel has not yet committed it (guarded by the ref).
  useEffect(() => {
    if (terminalId && !terminal && terminalId !== pendingNewTerminalIdRef.current) {
      const { sessionId } = useHelpPanelStore.getState();
      revokeHelpSession(sessionId);
      hasAutoLaunched.current = false;
      clearTerminal();
    }
  }, [terminalId, terminal, clearTerminal]);

  // Clean up help terminal when the view becomes hidden (project switch, window close).
  // In Electron 41, beforeunload does not fire on WebContentsView detach, but
  // visibilitychange does — this covers both project switches and window unload.
  // Skip teardown when the OS is suspended (display-off / sleep) — otherwise
  // the assistant restarts and loses its conversation on every wake (#6758).
  useEffect(() => {
    let cancelled = false;

    const tearDown = () => {
      const state = useHelpPanelStore.getState();
      if (state.terminalId) {
        usePanelStore.getState().removePanel(state.terminalId);
        revokeHelpSession(state.sessionId);
        hasAutoLaunched.current = false;
        useHelpPanelStore.getState().clearTerminal();
      }
      revokePendingSession();
    };

    const handler = () => {
      if (document.hidden) {
        if (isSystemSuspendedRef.current) return;
        // Race: visibilitychange may fire before the suspend IPC reaches the
        // renderer. Confirm with the main process before tearing down.
        void window.electron.systemSleep
          .getMetrics()
          .then((metrics) => {
            if (cancelled) return;
            if (metrics.isCurrentlySleeping) return;
            // Re-check after the IPC round-trip: the user may have reopened the
            // lid (hidden → visible) or onSuspend may have arrived while we
            // were waiting. Either way, skip teardown.
            if (!document.hidden) return;
            if (isSystemSuspendedRef.current) return;
            tearDown();
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            logError("HelpPanel: failed to read systemSleep metrics", err);
            if (!document.hidden) return;
            if (isSystemSuspendedRef.current) return;
            tearDown();
          });
      } else {
        setVisibilityEpoch((e) => e + 1);
      }
    };

    const offSuspend = window.electron.systemSleep.onSuspend(() => {
      isSystemSuspendedRef.current = true;
    });
    const offWake = window.electron.systemSleep.onWake(() => {
      isSystemSuspendedRef.current = false;
    });
    document.addEventListener("visibilitychange", handler);
    return () => {
      cancelled = true;
      offSuspend();
      offWake();
      document.removeEventListener("visibilitychange", handler);
    };
  }, [revokePendingSession]);

  // Latch conversationTouched when the terminal's agent state first leaves idle,
  // so the close-confirm guard protects accumulated chat history indefinitely.
  useEffect(() => {
    if (terminalId && terminal?.agentState !== undefined && terminal.agentState !== "idle") {
      const store = useHelpPanelStore.getState();
      if (store.terminalId === terminalId) {
        markConversationStarted();
      }
    }
  }, [terminalId, terminal?.agentState, markConversationStarted]);

  // Idle-hibernate timer. When the panel is hidden with a live terminal,
  // schedule a graceful kill that captures the agent's resume session ID.
  // Reads store state via getState() in the callback to avoid stale closures
  // (#5087 lesson). Defers if the agent is mid-turn so the user's work isn't
  // interrupted. The hibernate-minutes setting is fetched at arm-time so a
  // change in the settings tab takes effect on the next hide without a remount.
  useEffect(() => {
    const clearTimer = () => {
      if (hibernateTimerRef.current) {
        clearTimeout(hibernateTimerRef.current);
        hibernateTimerRef.current = null;
      }
    };

    if (isOpen || !terminalId) {
      clearTimer();
      return clearTimer;
    }

    const initialAgentId = agentId;
    const initialTerminalId = terminalId;
    let cancelled = false;

    const fire = () => {
      hibernateTimerRef.current = null;
      if (cancelled) return;

      // Re-validate: the terminal we armed for must still match the live one,
      // and the OS must not be suspended (display-off must not fire teardown).
      const helpState = useHelpPanelStore.getState();
      if (helpState.terminalId !== initialTerminalId) return;
      if (helpState.isOpen) return;
      if (isSystemSuspendedRef.current) return;

      const panelState = usePanelStore.getState();
      const livePanel = panelState.panelsById[initialTerminalId];
      if (!livePanel) return;
      const agentState = livePanel.agentState;
      if (agentState && ACTIVE_AGENT_STATES.has(agentState)) {
        // Agent is mid-turn. Re-check shortly without restarting the full
        // hibernate countdown — the user is presumably about to come back.
        hibernateTimerRef.current = setTimeout(fire, HIBERNATE_BUSY_RECHECK_MS);
        return;
      }

      const projectId = useProjectStore.getState().currentProject?.id ?? null;
      const cwd = livePanel.cwd ?? "";
      const sessionToRevoke = helpState.sessionId;
      const liveAgentId = helpState.agentId ?? initialAgentId;

      safeFireAndForget(
        window.electron.terminal
          .gracefulKill(initialTerminalId)
          .then((capturedSessionId) => {
            // State may have changed during the IPC round-trip. Don't act on
            // stale captures.
            const after = useHelpPanelStore.getState();
            if (after.terminalId !== initialTerminalId) return;
            // Critical race: user reopened the panel while gracefulKill was
            // in flight. The terminal is still live and visible — don't tear
            // it down out from under them. The captured session ID is also
            // discarded; the next hibernation cycle will capture a fresh one.
            if (after.isOpen) return;
            if (capturedSessionId && projectId && liveAgentId && cwd) {
              after.setHibernateSession(projectId, {
                sessionId: capturedSessionId,
                cwd,
                agentId: liveAgentId,
              });
            } else if (projectId) {
              // No session captured — make sure we don't try to resume from a
              // stale entry on next open.
              after.clearHibernateSession(projectId);
            }
            usePanelStore.getState().removePanel(initialTerminalId);
            revokeHelpSession(sessionToRevoke);
            useHelpPanelStore.getState().clearTerminal();
          })
          .catch((err) => {
            // Mirror the .then race-guard: bail if the user has reopened the
            // panel or the terminal id has been replaced during the IPC.
            const after = useHelpPanelStore.getState();
            if (after.terminalId !== initialTerminalId || after.isOpen) return;
            logError("HelpPanel: gracefulKill during hibernate failed", err);
            if (projectId) {
              // Drop any prior hibernate entry so we don't auto-resume from a
              // potentially stale one after a kill failure.
              useHelpPanelStore.getState().clearHibernateSession(projectId);
            }
            // Fall back to direct removal so we don't leak a hidden PTY.
            usePanelStore.getState().removePanel(initialTerminalId);
            revokeHelpSession(sessionToRevoke);
            useHelpPanelStore.getState().clearTerminal();
          }),
        { context: "HelpPanel:hibernate gracefulKill" }
      );
    };

    safeFireAndForget(
      window.electron.helpAssistant
        .getSettings()
        .then((settings) => {
          if (cancelled) return;
          const minutes = settings.idleHibernateMinutes;
          if (!HIBERNATE_VALID_MINUTES.includes(minutes)) {
            // Stored value out of range — fall back to the default rather than
            // hibernating immediately.
            hibernateMinutesRef.current = DEFAULT_HIBERNATE_MINUTES;
          } else {
            hibernateMinutesRef.current = minutes;
          }
          if (hibernateMinutesRef.current <= 0) return;
          clearTimer();
          hibernateTimerRef.current = setTimeout(fire, hibernateMinutesRef.current * 60 * 1000);
        })
        .catch((err) => {
          if (cancelled) return;
          logError("HelpPanel: failed to load idleHibernateMinutes", err);
          // Fall back to the default so a settings IPC blip doesn't leave the
          // assistant resident forever.
          hibernateMinutesRef.current = DEFAULT_HIBERNATE_MINUTES;
          clearTimer();
          hibernateTimerRef.current = setTimeout(fire, DEFAULT_HIBERNATE_MINUTES * 60 * 1000);
        }),
      { context: "HelpPanel:hibernate getSettings" }
    );

    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [isOpen, terminalId, agentId]);

  // Auto-dismiss the resume banner after a short window. Conversation-touched
  // can't be the dismiss trigger here: a resumed Claude session immediately
  // re-reads history and enters a non-idle state, which flips
  // conversationTouched=true and would otherwise dismiss the banner before
  // the user has a chance to see it. The user can also dismiss manually via
  // the X button.
  useEffect(() => {
    if (!showResumeBanner) return;
    const id = setTimeout(() => setShowResumeBanner(false), RESUME_BANNER_AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [showResumeBanner]);

  // Spawn a resumed PTY directly via addPanel with a pre-built
  // `--resume <id>` command, bypassing `agent.launch` (which has no
  // command-override arg). Caller is responsible for provisioning the help
  // session (so a single MCP failure doesn't notify twice) and for clearing
  // the persisted hibernate entry on success/give-up. The user's custom CLI
  // flags are loaded here and threaded into both `buildResumeCommand` (so
  // they're prepended before `--resume`) and `agentLaunchFlags` (so the
  // panel records them for future restarts). Returns the spawned terminalId,
  // or null if either there's no resume config for the agent or the spawn
  // returned no id (caller falls back to a fresh launch).
  const spawnResumed = useCallback(
    async (
      launchAgentId: string,
      hibernated: { sessionId: string; cwd: string },
      session: HelpSessionRef | null,
      folderPath: string
    ): Promise<string | null> => {
      const customLaunchFlags = await loadCustomLaunchFlags();
      const command = buildResumeCommand(
        launchAgentId,
        hibernated.sessionId,
        customLaunchFlags.length > 0 ? customLaunchFlags : undefined
      );
      if (!command) return null;

      // Resumed sessions launch from the same sessionPath the previous run
      // used, so Claude finds its `~/.claude/projects/<encoded-cwd>/` JSONL.
      const cwd = session?.sessionPath ?? hibernated.cwd ?? folderPath;
      const projectId = useProjectStore.getState().currentProject?.id ?? null;
      const env = buildHelpEnv(session, projectId);

      const newId = await usePanelStore.getState().addPanel({
        kind: "terminal",
        launchAgentId,
        command,
        cwd,
        location: "dock",
        ephemeral: true,
        ...(env && { env }),
        ...(customLaunchFlags.length > 0 && { agentLaunchFlags: customLaunchFlags }),
      });
      return newId ?? null;
    },
    []
  );

  // Auto-launch preferred agent when panel opens without an active terminal.
  // If a hibernated session exists for the current project + agent, resumes
  // that conversation; otherwise starts fresh.
  const hasAutoLaunched = useRef(false);
  useEffect(() => {
    if (
      document.hidden ||
      !isOpen ||
      !isReadyToLaunch ||
      !currentProject ||
      terminalId ||
      !preferredAgentId ||
      hasAutoLaunched.current
    ) {
      return;
    }
    const launchAgentId = preferredAgentId;
    const launchProject = currentProject;
    hasAutoLaunched.current = true;

    safeFireAndForget(
      (async () => {
        const folderPath = await window.electron.help.getFolderPath();
        if (!folderPath) {
          hasAutoLaunched.current = false;
          notifyLaunchFailed(launchAgentId, "Help folder is not available.");
          return;
        }

        // Version gate runs BEFORE provisionHelpSession to avoid minting a
        // session token (with .mcp.json side effects) we'd immediately
        // discard. Pass-through on null preserves missing-CLI behavior.
        const launchAgentName = getAgentConfig(launchAgentId)?.name ?? launchAgentId;
        const versionBlock = await checkAssistantVersion(launchAgentId, launchAgentName);
        if (versionBlock) {
          hasAutoLaunched.current = false;
          setAssistantVersionTooOld(versionBlock);
          return;
        }
        setAssistantVersionTooOld(null);

        const outcome = await provisionHelpSession(launchProject, launchAgentId);
        if (!outcome.ok) {
          hasAutoLaunched.current = false;
          if (outcome.code === "MCP_NOT_READY") {
            notifyMcpNotReady(outcome.message);
          } else {
            notifyLaunchFailed(launchAgentId, outcome.message);
          }
          return;
        }
        const session = outcome.session;
        pendingSessionIdRef.current = session.sessionId;
        const cwd = session.sessionPath;
        const env = buildHelpEnv(session, launchProject.id);

        // Resume path: only if the persisted hibernate session was for this
        // exact agent and project. A different agent (e.g. user changed
        // preference) starts fresh.
        const hibernated = useHelpPanelStore.getState().hibernateSessions[launchProject.id];
        if (hibernated && hibernated.agentId === launchAgentId) {
          const resumedId = await spawnResumed(launchAgentId, hibernated, session, folderPath);
          if (resumedId) {
            // Stale-launch guard: handleClose may have revoked the pending
            // session while addPanel was in flight.
            const expectedSessionId = session.sessionId;
            if (pendingSessionIdRef.current !== expectedSessionId) {
              usePanelStore.getState().removePanel(resumedId);
              hasAutoLaunched.current = false;
              return;
            }
            useHelpPanelStore.getState().clearHibernateSession(launchProject.id);
            useHelpPanelStore.getState().setTerminal(resumedId, launchAgentId, session.sessionId);
            pendingSessionIdRef.current = null;
            window.electron.help.markTerminal(resumedId).catch((err) => {
              logError("Failed to mark help terminal", err);
            });
            setShowResumeBanner(true);
            return;
          }
          // Resume failed (no resume config or addPanel returned null). Drop
          // the stale entry so we don't loop, then fall through to fresh
          // launch using the already-provisioned session.
          useHelpPanelStore.getState().clearHibernateSession(launchProject.id);
        }

        const customLaunchFlags = await loadCustomLaunchFlags();

        const result = await actionService.dispatch<{ terminalId: string | null }>(
          "agent.launch",
          {
            agentId: launchAgentId,
            location: "dock",
            cwd,
            ephemeral: true,
            ...(env && { env }),
            ...(customLaunchFlags.length > 0 && { agentLaunchFlags: customLaunchFlags }),
          },
          { source: "user" }
        );

        // Stale-launch guard: if the user changed the preferred agent
        // (via the settings tab) while the IPC was in flight, discard this
        // result and clean up the spawned panel rather than reviving a
        // stale terminal. Reset hasAutoLaunched so the new preferred
        // agent can auto-launch on the next effect tick.
        const currentPreferred = useHelpPanelStore.getState().preferredAgentId;
        if (currentPreferred !== launchAgentId) {
          if (result.ok && result.result?.terminalId) {
            usePanelStore.getState().removePanel(result.result.terminalId);
          }
          revokeHelpSession(session?.sessionId ?? null);
          pendingSessionIdRef.current = null;
          hasAutoLaunched.current = false;
          return;
        }

        if (!result.ok || !result.result?.terminalId) {
          hasAutoLaunched.current = false;
          revokeHelpSession(session?.sessionId ?? null);
          pendingSessionIdRef.current = null;
          logError("Help auto-launch failed", { agentId: launchAgentId, result });
          notifyLaunchFailed(launchAgentId, "The agent didn't start. Try again.");
          return;
        }

        // Stale-launch guard: handleClose revoked the pending session via
        // revokePendingSession (clearing the ref). Drop the orphan terminal
        // rather than binding a panel to a revoked token.
        const expectedSessionId = session?.sessionId ?? null;
        if (expectedSessionId && pendingSessionIdRef.current !== expectedSessionId) {
          usePanelStore.getState().removePanel(result.result.terminalId);
          hasAutoLaunched.current = false;
          return;
        }

        useHelpPanelStore
          .getState()
          .setTerminal(result.result.terminalId, launchAgentId, session?.sessionId ?? null);
        pendingSessionIdRef.current = null;
        window.electron.help.markTerminal(result.result.terminalId).catch((err) => {
          logError("Failed to mark help terminal", err);
        });
      })(),
      { context: "Auto-launching preferred help agent" }
    );
  }, [
    isOpen,
    isReadyToLaunch,
    currentProject,
    terminalId,
    preferredAgentId,
    spawnResumed,
    visibilityEpoch,
  ]);

  // Reset auto-launch guard when panel closes
  useEffect(() => {
    if (!isOpen) {
      hasAutoLaunched.current = false;
    }
  }, [isOpen]);

  // Register the panel root with the macro-focus store so the assistant
  // participates in cross-region cycling.
  useEffect(() => {
    useMacroFocusStore.getState().setRegionRef("assistant", panelRef.current);
    return () => useMacroFocusStore.getState().setRegionRef("assistant", null);
  }, []);

  // Move keyboard focus into the panel on open and restore it on close.
  // Gated on (isOpen && isVisible) — the panel is always mounted, and
  // `inert` is driven by isVisible, so focusing children before isVisible
  // flips would land focus inside an inert subtree. Restore on close skips
  // anything that lives inside the panel itself, since the panel becomes
  // inert and would just re-trap focus.
  useEffect(() => {
    if (isOpen && isVisible) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && !panelRef.current?.contains(active)) {
        previousFocusRef.current = active;
      }
      const raf = requestAnimationFrame(() => {
        // Don't yank focus away from our own xterm — the assistant terminal
        // owns its caret. We only check the panel-local xterm; an external
        // grid-terminal still loses focus to the panel by design.
        const current = document.activeElement;
        if (current?.closest?.(".xterm-helper-textarea") && panelRef.current?.contains(current)) {
          return;
        }
        // Skip the resize separator — it's the first tabbable in DOM order
        // but lands keyboard users on a chrome control rather than usable
        // content.
        const candidates = panelRef.current?.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR);
        let first: HTMLElement | undefined;
        for (const el of candidates ?? []) {
          if (el.getAttribute("role") === "separator") continue;
          first = el;
          break;
        }
        if (first) {
          first.focus();
        } else {
          panelRef.current?.focus();
        }
      });
      return () => cancelAnimationFrame(raf);
    }
    // Panel went non-interactive (closed OR gesture-hidden). Restore focus
    // to the opener so the user isn't stranded in an inert subtree.
    const el = previousFocusRef.current;
    previousFocusRef.current = null;
    if (el && document.contains(el) && !panelRef.current?.contains(el)) {
      el.focus();
    }
    return undefined;
  }, [isOpen, isVisible]);

  // Resize via mouse drag
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startX = e.clientX;
      const startWidth = width;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = startX - moveEvent.clientX;
        const newWidth = Math.min(
          Math.max(startWidth + delta, HELP_PANEL_MIN_WIDTH),
          HELP_PANEL_MAX_WIDTH
        );
        setWidth(newWidth);
      };

      const onMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width, setWidth]
  );

  // Resize via keyboard. ArrowLeft/PageUp grow the panel (it expands leftward
  // from the right edge); ArrowRight/PageDown shrink it. Home/End jump to the
  // min/max clamp values.
  const handleResizeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setWidth(Math.min(width + RESIZE_STEP, HELP_PANEL_MAX_WIDTH));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setWidth(Math.max(width - RESIZE_STEP, HELP_PANEL_MIN_WIDTH));
      } else if (e.key === "PageUp") {
        e.preventDefault();
        setWidth(Math.min(width + RESIZE_PAGE_STEP, HELP_PANEL_MAX_WIDTH));
      } else if (e.key === "PageDown") {
        e.preventDefault();
        setWidth(Math.max(width - RESIZE_PAGE_STEP, HELP_PANEL_MIN_WIDTH));
      } else if (e.key === "Home") {
        e.preventDefault();
        setWidth(HELP_PANEL_MIN_WIDTH);
      } else if (e.key === "End") {
        e.preventDefault();
        setWidth(HELP_PANEL_MAX_WIDTH);
      }
    },
    [width, setWidth]
  );

  const isLaunchingRef = useRef(false);
  const handleSelectAgent = useCallback(
    async (selectedAgentId: string, seedPrompt?: string) => {
      if (isLaunchingRef.current) return;
      if (!isReadyToLaunch || !currentProject) {
        notifyLaunchFailed(selectedAgentId, "Project state is still loading. Try again.");
        return;
      }
      const launchProject = currentProject;
      isLaunchingRef.current = true;

      try {
        // Remove existing terminal if switching agents
        const existing = useHelpPanelStore.getState();
        if (existing.terminalId) {
          removePanel(existing.terminalId);
          revokeHelpSession(existing.sessionId);
          clearTerminal();
        }

        const folderPath = await window.electron.help.getFolderPath();
        if (!folderPath) {
          notifyLaunchFailed(selectedAgentId, "Help folder is not available.");
          return;
        }

        // Version gate runs BEFORE provisionHelpSession so we don't mint a
        // session token we'd immediately discard. Pass-through on null
        // (probe failure / unparseable installed version) lets the existing
        // missing-CLI surface handle those edge cases.
        const selectedAgentName = getAgentConfig(selectedAgentId)?.name ?? selectedAgentId;
        const versionBlock = await checkAssistantVersion(selectedAgentId, selectedAgentName);
        if (versionBlock) {
          hasAutoLaunched.current = false;
          setAssistantVersionTooOld(versionBlock);
          return;
        }
        setAssistantVersionTooOld(null);

        const outcome = await provisionHelpSession(launchProject, selectedAgentId);
        if (!outcome.ok) {
          // Reset the auto-launch gate so a recovered MCP can re-launch on
          // the next render — the single-supported-agent useEffect uses
          // this same ref to one-shot itself, so without the reset the
          // panel is stuck on the empty state until close/reopen.
          hasAutoLaunched.current = false;
          if (outcome.code === "MCP_NOT_READY") {
            notifyMcpNotReady(outcome.message);
          } else {
            notifyLaunchFailed(selectedAgentId, outcome.message);
          }
          return;
        }
        const session = outcome.session;
        pendingSessionIdRef.current = session.sessionId;
        const cwd = session.sessionPath;
        const env = buildHelpEnv(session, launchProject.id);

        // Resume path: matches the auto-launch effect — if the persisted
        // hibernate entry is for this exact project + agent, resume that
        // conversation instead of starting fresh. Skipped when a seedPrompt is
        // provided (chip click): the user explicitly asked to start a fresh
        // conversation with that prompt, so silently resuming the prior chat
        // would drop the prompt and confuse them.
        const hibernated = seedPrompt
          ? null
          : useHelpPanelStore.getState().hibernateSessions[launchProject.id];
        if (hibernated && hibernated.agentId === selectedAgentId) {
          const resumedId = await spawnResumed(selectedAgentId, hibernated, session, folderPath);
          if (resumedId) {
            const expectedSessionId = session.sessionId;
            if (pendingSessionIdRef.current !== expectedSessionId) {
              usePanelStore.getState().removePanel(resumedId);
              return;
            }
            useHelpPanelStore.getState().clearHibernateSession(launchProject.id);
            useHelpPanelStore.getState().setTerminal(resumedId, selectedAgentId, session.sessionId);
            pendingSessionIdRef.current = null;
            window.electron.help.markTerminal(resumedId).catch((err) => {
              logError("Failed to mark help terminal", err);
            });
            setShowResumeBanner(true);
            return;
          }
          useHelpPanelStore.getState().clearHibernateSession(launchProject.id);
        }

        const customLaunchFlags = await loadCustomLaunchFlags();

        const result = await actionService.dispatch<{ terminalId: string | null }>(
          "agent.launch",
          {
            agentId: selectedAgentId,
            location: "dock",
            cwd,
            ephemeral: true,
            ...(env && { env }),
            ...(customLaunchFlags.length > 0 && { agentLaunchFlags: customLaunchFlags }),
            ...(seedPrompt && { prompt: seedPrompt }),
          },
          { source: "user" }
        );

        if (!result.ok || !result.result?.terminalId) {
          hasAutoLaunched.current = false;
          revokeHelpSession(session?.sessionId ?? null);
          pendingSessionIdRef.current = null;
          logError("Help launch failed", { agentId: selectedAgentId, result });
          notifyLaunchFailed(selectedAgentId, "The agent didn't start. Try again.");
          return;
        }

        // Stale-launch guard: if handleClose revoked the pending session while
        // dispatch was in-flight, the session is dead. Drop the orphan terminal
        // rather than binding a panel to a revoked token.
        const expectedSessionId = session?.sessionId ?? null;
        if (expectedSessionId && pendingSessionIdRef.current !== expectedSessionId) {
          usePanelStore.getState().removePanel(result.result.terminalId);
          return;
        }

        useHelpPanelStore
          .getState()
          .setTerminal(result.result.terminalId, selectedAgentId, session?.sessionId ?? null);
        pendingSessionIdRef.current = null;
        window.electron.help.markTerminal(result.result.terminalId).catch((err) => {
          logError("Failed to mark help terminal", err);
        });
      } finally {
        isLaunchingRef.current = false;
      }
    },
    [isReadyToLaunch, currentProject, removePanel, clearTerminal, spawnResumed]
  );

  // Single-supported-agent auto-launch: when only one assistant-supported
  // agent is installed and there's no persisted preference, launch it
  // directly instead of showing the empty "open settings" state. Mutually
  // exclusive with the preferred-agent auto-launch (which only runs when
  // `preferredAgentId` is set), so they share the same `hasAutoLaunched`
  // ref to prevent any double-fire.
  useEffect(() => {
    if (
      document.hidden ||
      !isOpen ||
      !isReadyToLaunch ||
      !currentProject ||
      terminalId ||
      preferredAgentId ||
      hasAutoLaunched.current
    ) {
      return;
    }
    if (supportedInstalledAgentIds.length !== 1) return;
    const onlyAgentId = supportedInstalledAgentIds[0];
    if (!onlyAgentId) return;
    hasAutoLaunched.current = true;
    safeFireAndForget(handleSelectAgent(onlyAgentId), {
      context: "Auto-launching single supported help agent",
    });
    // The agent-id key is included in deps so a change in installed agents
    // (e.g. user installs a second supported CLI) re-evaluates the gate.
  }, [
    isOpen,
    isReadyToLaunch,
    currentProject,
    terminalId,
    preferredAgentId,
    supportedInstalledAgentIdsKey,
    supportedInstalledAgentIds,
    handleSelectAgent,
    visibilityEpoch,
  ]);

  // Hide the panel without tearing down the agent or conversation. The PTY,
  // chat history, and help session all stay resident so reopening lands the
  // user exactly where they left off — closing is collapse, not destroy.
  // The destructive equivalent (end this session, start a new one) lives on
  // a separate "+ New session" affordance.
  const handleClose = useCallback(() => {
    suppressSidebarResizes();
    setOpen(false);
  }, [setOpen]);

  // Destructive reset: stop the current agent, drop the conversation, revoke
  // the bound + pending help sessions, then provision a fresh session and
  // relaunch the same agent. Mirrors the run-anyway path; the only difference
  // is the diagnostic context label and that we always have a live terminal
  // (run-anyway is for the missing-CLI placeholder case).
  const doNewSession = useCallback(() => {
    if (!terminalId || !agentId) return;
    if (!isReadyToLaunch || !currentProject) {
      notifyLaunchFailed(agentId, "Project state is still loading. Try again.");
      return;
    }
    if (isLaunchingRef.current) return;
    const panel = usePanelStore.getState().panelsById[terminalId];
    if (!panel) return;
    const presetEnv = panel.extensionState?.presetEnv as Record<string, string> | undefined;
    const launchAgentId = agentId;
    const launchProject = currentProject;
    const previousSessionId = useHelpPanelStore.getState().sessionId;
    // The user explicitly chose to discard the conversation — drop any
    // hibernated entry for this project so the next reopen starts fresh
    // instead of resuming the just-discarded chat.
    const projectIdForReset = useProjectStore.getState().currentProject?.id ?? null;
    if (projectIdForReset) {
      useHelpPanelStore.getState().clearHibernateSession(projectIdForReset);
    }
    setShowResumeBanner(false);

    // Reserve the new terminal id synchronously so the dock filter
    // (`helpTerminalId` exclusion in ContentDock) is active the moment
    // `addPanel` commits the new panel — not one microtask later. Without
    // this, the gap between `addPanel` resolving and `setTerminal` running
    // leaves a stray help terminal visible in the dock for one render.
    // The ref tells the line-221 cleanup effect to leave the reservation
    // alone while addPanel is still in flight (panelsById[newId] absent).
    const newId = `terminal-${crypto.randomUUID()}`;
    pendingNewTerminalIdRef.current = newId;

    isLaunchingRef.current = true;
    removePanel(terminalId);
    revokeHelpSession(previousSessionId);
    revokePendingSession();
    clearTerminal();
    useHelpPanelStore.getState().setTerminal(newId, launchAgentId, null);

    safeFireAndForget(
      (async () => {
        let session: HelpSessionRef | null = null;
        try {
          const outcome = await provisionHelpSession(launchProject, launchAgentId);
          if (!outcome.ok) {
            pendingNewTerminalIdRef.current = null;
            useHelpPanelStore.getState().clearTerminal();
            if (outcome.code === "MCP_NOT_READY") {
              notifyMcpNotReady(outcome.message);
            } else {
              notifyLaunchFailed(launchAgentId, outcome.message);
            }
            return;
          }
          session = outcome.session;
          const cwd = session.sessionPath;
          const helpEnv = buildHelpEnv(session, launchProject.id);
          const env: Record<string, string> | undefined =
            helpEnv || presetEnv ? { ...(presetEnv ?? {}), ...(helpEnv ?? {}) } : undefined;

          const returnedId = await usePanelStore.getState().addPanel({
            kind: "terminal",
            launchAgentId,
            command: panel.command,
            title: panel.title,
            cwd,
            worktreeId: panel.worktreeId,
            location: panel.location as "grid" | "dock" | undefined,
            agentLaunchFlags: panel.agentLaunchFlags,
            agentModelId: panel.agentModelId,
            agentPresetId: panel.agentPresetId,
            env,
            requestedId: newId,
            activateDockOnCreate: true,
          });

          if (!returnedId) {
            pendingNewTerminalIdRef.current = null;
            useHelpPanelStore.getState().clearTerminal();
            revokeHelpSession(session?.sessionId ?? null);
            logError("Help new-session returned no terminal id", { agentId: launchAgentId });
            notifyLaunchFailed(launchAgentId, "The agent didn't start. Try again.");
            return;
          }

          pendingNewTerminalIdRef.current = null;
          useHelpPanelStore
            .getState()
            .setTerminal(newId, launchAgentId, session?.sessionId ?? null);
          window.electron.help.markTerminal(newId).catch((err) => {
            logError("Failed to mark help terminal", err);
          });
        } catch (error) {
          pendingNewTerminalIdRef.current = null;
          useHelpPanelStore.getState().clearTerminal();
          revokeHelpSession(session?.sessionId ?? null);
          logError("Help new-session failed", error);
          notifyLaunchFailed(launchAgentId, "The agent didn't start. Try again.");
        } finally {
          isLaunchingRef.current = false;
        }
      })(),
      { context: "Help: + New session relaunch" }
    );
  }, [
    terminalId,
    agentId,
    isReadyToLaunch,
    currentProject,
    removePanel,
    clearTerminal,
    revokePendingSession,
  ]);

  // Confirm only when there's something to lose — a working agent or a
  // conversation the user has actually engaged with. An untouched idle agent
  // resets silently; the user wouldn't notice the difference anyway.
  const shouldConfirmNewSession =
    (terminal?.agentState !== undefined && CLOSE_CONFIRM_AGENT_STATES.has(terminal.agentState)) ||
    conversationTouched;

  const handleNewSession = useCallback(() => {
    if (!terminalId || !agentId) return;
    if (shouldConfirmNewSession) {
      setShowNewSessionConfirm(true);
      return;
    }
    doNewSession();
  }, [terminalId, agentId, shouldConfirmNewSession, doNewSession]);

  const handleConfirmNewSession = useCallback(() => {
    setShowNewSessionConfirm(false);
    doNewSession();
  }, [doNewSession]);

  const handleCancelNewSession = useCallback(() => {
    setShowNewSessionConfirm(false);
  }, []);

  const handleOpenSettings = useCallback(() => {
    void actionService.dispatch("app.settings.openTab", { tab: "assistant" }, { source: "user" });
  }, []);

  // Picks the agent to launch when a seed-prompt chip is clicked. Falls back to
  // the single installed assistant-supported agent when the user hasn't picked
  // a preference yet — matches the auto-launch effect's resolution rule. Returns
  // null only when zero supported agents are installed; in that state the chips
  // are inert and the user is steered to the bottom settings link.
  const seedAgentToLaunch = preferredAgentId
    ? preferredAgentId
    : supportedInstalledAgentIds.length === 1
      ? (supportedInstalledAgentIds[0] ?? null)
      : null;

  const handleSeedPromptClick = useCallback(
    (prompt: string) => {
      if (!seedAgentToLaunch) return;
      safeFireAndForget(handleSelectAgent(seedAgentToLaunch, prompt), {
        context: "HelpPanel: seed-prompt chip launch",
      });
    },
    [seedAgentToLaunch, handleSelectAgent]
  );

  // Esc-to-close. The xterm-helper-textarea check lets Escape reach the
  // running PTY (Codex/Claude/etc.) when the assistant terminal has focus
  // instead of closing the panel out from under the user.
  const handleEscape = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest(".xterm-helper-textarea")) return;
    handleClose();
  }, [handleClose]);
  useEscapeStack(isOpen, handleEscape);

  const handleRunAnyway = useCallback(() => {
    if (!terminalId || !agentId) return;
    if (!isReadyToLaunch || !currentProject) {
      notifyLaunchFailed(agentId, "Project state is still loading. Try again.");
      return;
    }
    if (isLaunchingRef.current) return;
    const panel = usePanelStore.getState().panelsById[terminalId];
    if (!panel) return;
    const presetEnv = panel.extensionState?.presetEnv as Record<string, string> | undefined;
    const launchAgentId = agentId;
    const launchProject = currentProject;
    const previousSessionId = useHelpPanelStore.getState().sessionId;

    // Reserve the new terminal id synchronously so the dock filter is
    // active the instant `addPanel` commits — see doNewSession for the full
    // rationale; this path has the identical race. The ref guards the
    // line-221 cleanup effect during the in-flight window.
    const newId = `terminal-${crypto.randomUUID()}`;
    pendingNewTerminalIdRef.current = newId;

    isLaunchingRef.current = true;
    removePanel(terminalId);
    revokeHelpSession(previousSessionId);
    revokePendingSession();
    clearTerminal();
    useHelpPanelStore.getState().setTerminal(newId, launchAgentId, null);

    safeFireAndForget(
      (async () => {
        let session: HelpSessionRef | null = null;
        try {
          const outcome = await provisionHelpSession(launchProject, launchAgentId);
          if (!outcome.ok) {
            pendingNewTerminalIdRef.current = null;
            useHelpPanelStore.getState().clearTerminal();
            if (outcome.code === "MCP_NOT_READY") {
              notifyMcpNotReady(outcome.message);
            } else {
              notifyLaunchFailed(launchAgentId, outcome.message);
            }
            return;
          }
          session = outcome.session;
          const cwd = session.sessionPath;
          const helpEnv = buildHelpEnv(session, launchProject.id);
          const env: Record<string, string> | undefined =
            helpEnv || presetEnv ? { ...(presetEnv ?? {}), ...(helpEnv ?? {}) } : undefined;

          const returnedId = await usePanelStore.getState().addPanel({
            kind: "terminal",
            launchAgentId,
            command: panel.command,
            title: panel.title,
            cwd,
            worktreeId: panel.worktreeId,
            location: panel.location as "grid" | "dock" | undefined,
            agentLaunchFlags: panel.agentLaunchFlags,
            agentModelId: panel.agentModelId,
            agentPresetId: panel.agentPresetId,
            env,
            requestedId: newId,
            activateDockOnCreate: true,
          });

          if (!returnedId) {
            pendingNewTerminalIdRef.current = null;
            useHelpPanelStore.getState().clearTerminal();
            revokeHelpSession(session?.sessionId ?? null);
            logError("Help run-anyway returned no terminal id", { agentId: launchAgentId });
            notifyLaunchFailed(launchAgentId, "The agent didn't start. Try again.");
            return;
          }

          pendingNewTerminalIdRef.current = null;
          useHelpPanelStore
            .getState()
            .setTerminal(newId, launchAgentId, session?.sessionId ?? null);
          window.electron.help.markTerminal(newId).catch((err) => {
            logError("Failed to mark help terminal", err);
          });
        } catch (error) {
          pendingNewTerminalIdRef.current = null;
          useHelpPanelStore.getState().clearTerminal();
          revokeHelpSession(session?.sessionId ?? null);
          logError("Help run-anyway failed", error);
          notifyLaunchFailed(launchAgentId, "The agent didn't start. Try again.");
        } finally {
          isLaunchingRef.current = false;
        }
      })(),
      { context: "Help: run-anyway re-launch" }
    );
  }, [
    terminalId,
    agentId,
    isReadyToLaunch,
    currentProject,
    removePanel,
    clearTerminal,
    revokePendingSession,
  ]);

  const getRefreshTier = useMemo(() => {
    return () => {
      if (!isOpen) return TerminalRefreshTier.BACKGROUND;
      return getTerminalRefreshTier(terminal, true);
    };
  }, [isOpen, terminal]);

  const showTerminal = terminalId && terminal;
  const isMissingCli = showTerminal && terminal?.spawnStatus === "missing-cli";

  return (
    <aside
      ref={panelRef}
      id="daintree-assistant-panel"
      tabIndex={-1}
      aria-label="Daintree Assistant"
      // `inert` removes descendants from focus / a11y tree while the aside is
      // collapsed. Chromium 146 supports it natively, so we don't need a
      // matching `aria-hidden` (which would also be redundant on an `inert`
      // element per ARIA 1.2 and trips axe's `aria-hidden-focus` rule on the
      // legacy combination).
      inert={!isVisible || undefined}
      data-macro-focus={isMacroFocused ? "true" : undefined}
      className={cn(
        "relative shrink-0 flex flex-col h-full overflow-hidden outline-hidden",
        "bg-daintree-bg border-l border-daintree-border",
        "data-[macro-focus=true]:ring-2 data-[macro-focus=true]:ring-daintree-accent/60 data-[macro-focus=true]:ring-inset",
        !isVisible && "pointer-events-none"
      )}
      style={{ width: effectiveWidth }}
    >
      {/* Resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Daintree Assistant panel"
        aria-controls="daintree-assistant-panel"
        aria-valuenow={width}
        aria-valuemin={HELP_PANEL_MIN_WIDTH}
        aria-valuemax={HELP_PANEL_MAX_WIDTH}
        tabIndex={isVisible ? 0 : -1}
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10",
          "hover:bg-overlay-soft active:bg-overlay-medium transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:-outline-offset-2",
          isResizing && "bg-overlay-medium"
        )}
        onMouseDown={handleResizeStart}
        onKeyDown={handleResizeKeyDown}
      />

      {/* Header */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-daintree-border shrink-0">
        <div className="flex items-center min-w-0 flex-1">
          <DaintreeIcon className="w-4 h-4 text-daintree-text/50 shrink-0" />
          <span className="ml-1.5 text-xs font-medium text-daintree-text/70 truncate">
            Daintree Assistant
          </span>
        </div>
        {terminalId && agentId && (
          <button
            type="button"
            onClick={handleNewSession}
            className="p-1 rounded-[var(--radius-sm)] text-daintree-text/50 hover:text-daintree-text hover:bg-tint/8 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:outline-offset-2"
            aria-label="Start new session"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={handleClose}
          className="p-1 rounded-[var(--radius-sm)] text-daintree-text/50 hover:text-daintree-text hover:bg-tint/8 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:outline-offset-2"
          aria-label="Hide Daintree Assistant"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 flex flex-col min-h-0 relative">
        {showTerminal ? (
          isMissingCli && agentId ? (
            <MissingCliGate
              agentId={agentId}
              detail={cliDetail ?? { state: "missing", resolvedPath: null, via: null }}
              onRunAnyway={handleRunAnyway}
            />
          ) : (
            <>
              {!introDismissed && !hasEverLaunchedAgent && (
                <HelpIntroBanner onDismiss={dismissIntro} />
              )}
              {showResumeBanner && (
                <div
                  role="status"
                  aria-live="polite"
                  className={cn(
                    "flex items-start gap-2 px-3 py-2 mx-3 mt-3 mb-1",
                    "rounded-[var(--radius-md)] bg-overlay-subtle border border-daintree-border",
                    "text-xs text-daintree-text/80"
                  )}
                  data-testid="help-resume-banner"
                >
                  <span className="flex-1 select-text">Resumed your previous session.</span>
                  <button
                    type="button"
                    onClick={() => setShowResumeBanner(false)}
                    aria-label="Dismiss resume notice"
                    className="text-daintree-text/50 hover:text-daintree-text transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:outline-offset-2"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <div className="flex-1 relative min-h-0">
                <Suspense fallback={null}>
                  <XtermAdapter
                    terminalId={terminalId}
                    launchAgentId={agentId ?? undefined}
                    getRefreshTier={getRefreshTier}
                    cwd={terminal.cwd}
                  />
                </Suspense>
              </div>
            </>
          )
        ) : assistantVersionTooOld ? (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center"
            data-testid="help-version-too-old"
          >
            <p className="text-sm text-daintree-text/70">
              Update {assistantVersionTooOld.agentName} to use Daintree Assistant
            </p>
            <p className="text-xs text-daintree-text/50 max-w-[32ch]">
              Daintree Assistant needs {assistantVersionTooOld.agentName}{" "}
              {assistantVersionTooOld.requiredVersion} or later. You're on{" "}
              {assistantVersionTooOld.installedVersion}.
            </p>
            <button
              type="button"
              onClick={handleOpenSettings}
              className={cn(
                "mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)]",
                "text-xs font-medium border border-daintree-border text-daintree-text/80",
                "hover:bg-overlay-soft hover:text-daintree-text transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:outline-offset-2"
              )}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Update {assistantVersionTooOld.agentName}</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
            <p className="text-sm text-daintree-text/70 max-w-[30ch]">
              Ask the assistant to explain code, review changes, or debug issues.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-[28ch]">
              {SEED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSeedPromptClick(prompt)}
                  disabled={!seedAgentToLaunch}
                  className={cn(
                    "w-full px-3 py-1.5 rounded-[var(--radius-md)] text-xs text-left",
                    "border border-daintree-border text-daintree-text/80",
                    "hover:bg-overlay-soft hover:text-daintree-text transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:outline-offset-2",
                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-daintree-text/80"
                  )}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom info bar */}
      {showTerminal && agentConfig && !isMissingCli && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-daintree-border shrink-0 text-[11px] text-daintree-text/40">
          <span className="flex items-center gap-1">
            Using
            <agentConfig.icon className="w-3.5 h-3.5" />
            {agentConfig.name}
          </span>
          <button
            type="button"
            onClick={() =>
              void actionService.dispatch(
                "system.openExternal",
                { url: DAINTREE_HOME_URL },
                { source: "user" }
              )
            }
            className="flex items-center gap-1 hover:text-daintree-text/60 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:outline-offset-2"
          >
            <DaintreeIcon className="w-3.5 h-3.5" />
            Daintree.org
          </button>
        </div>
      )}
      {!showTerminal && (
        <div className="flex items-center justify-end px-3 py-1.5 border-t border-daintree-border shrink-0 text-[11px] text-daintree-text/40">
          <button
            type="button"
            onClick={handleOpenSettings}
            className="flex items-center gap-1 hover:text-daintree-text/60 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:outline-offset-2"
          >
            <Settings2 className="w-3.5 h-3.5" />
            Assistant settings
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={showNewSessionConfirm}
        title="Start a new session?"
        description="The current agent will stop and the conversation will be discarded."
        confirmLabel="Start new session"
        onConfirm={handleConfirmNewSession}
        onClose={handleCancelNewSession}
        variant="destructive"
      />
    </aside>
  );
}
