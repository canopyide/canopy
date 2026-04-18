import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Terminal, type ITerminalOptions } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Eye, EyeOff, Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { terminalClient } from "@/clients/terminalClient";
import { useFleetArmingStore } from "@/store/fleetArmingStore";
import { useFleetDeckStore } from "@/store/fleetDeckStore";
import { usePanelStore } from "@/store/panelStore";
import { actionService } from "@/services/ActionService";

// Mirror terminals cap scrollback aggressively — 20 tiles × 500 lines × 80 cols
// ≈ 8MB (see lesson #4751 for the scaling math) and never participate in the
// WebGL context budget enforced by TerminalWebGLManager.
const MIRROR_TERMINAL_OPTIONS: ITerminalOptions = {
  disableStdin: true,
  cursorBlink: false,
  cursorStyle: "bar",
  scrollOnUserInput: false,
  scrollback: 500,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 11,
  lineHeight: 1.15,
  convertEol: true,
  allowProposedApi: true,
};

interface MirrorTileProps {
  terminalId: string;
  isLive: boolean;
  initialSnapshot?: string | undefined;
  onCaptureSnapshot?: (id: string, snapshot: string) => void;
}

function MirrorTileInternal({
  terminalId,
  isLive,
  initialSnapshot,
  onCaptureSnapshot,
}: MirrorTileProps): ReactElement {
  const panel = usePanelStore((s) => s.panelsById[terminalId]);
  const isArmed = useFleetArmingStore((s) => s.armedIds.has(terminalId));
  const isPinned = useFleetDeckStore((s) => s.pinnedLiveIds.has(terminalId));
  const togglePin = useFleetDeckStore((s) => s.togglePinLive);
  const toggleArm = useFleetArmingStore((s) => s.toggleId);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const serializeRef = useRef<SerializeAddon | null>(null);
  const mountGenRef = useRef(0);
  const dataCleanupRef = useRef<(() => void) | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [liveError, setLiveError] = useState(false);

  const focusAgent = useCallback(() => {
    void actionService.dispatch("panel.focus", { panelId: terminalId }, { source: "user" });
  }, [terminalId]);

  // Attach live mirror only when isLive is true. When the tile is demoted
  // to static we capture a snapshot and dispose the xterm instance; the
  // static branch renders `initialSnapshot` (plain text).
  useEffect(() => {
    if (!isLive) return;

    const container = containerRef.current;
    if (!container) return;

    const gen = ++mountGenRef.current;
    let cancelled = false;
    let mountFailed = false;

    const mountMirror = () => {
      if (cancelled || mountGenRef.current !== gen) return;
      if (!container.isConnected) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      if (termRef.current) return;

      // Keep allocated resources in locals until the full mount succeeds, so
      // that a partial-construction failure disposes what was created and
      // never publishes to the refs. Without this, a throw between
      // `new Terminal()` and the final ref assignment would leak an xterm
      // and the ResizeObserver would retry-loop (creating more orphans)
      // because `termRef.current` stayed null.
      let term: Terminal | null = null;
      let dataCleanup: (() => void) | null = null;
      try {
        term = new Terminal(MIRROR_TERMINAL_OPTIONS);
        const fit = new FitAddon();
        const serialize = new SerializeAddon();
        term.loadAddon(fit);
        term.loadAddon(serialize);
        term.open(container);
        try {
          fit.fit();
        } catch {
          // fit() can throw during layout thrash; a subsequent
          // ResizeObserver tick will re-fit.
        }
        if (initialSnapshot) {
          term.write(initialSnapshot);
        }
        dataCleanup = terminalClient.onData(terminalId, (data) => {
          if (mountGenRef.current !== gen) return;
          try {
            term?.write(data);
          } catch {
            // xterm may throw during dispose races; ignored.
          }
        });
        termRef.current = term;
        fitRef.current = fit;
        serializeRef.current = serialize;
        dataCleanupRef.current = dataCleanup;
        setLiveError(false);
      } catch (error) {
        console.error("Failed to mount fleet mirror terminal:", error);
        // Dispose in reverse allocation order. Swallow any secondary
        // throws so we still set liveError and stop the retry loop.
        try {
          dataCleanup?.();
        } catch {
          /* ignore */
        }
        try {
          term?.dispose();
        } catch {
          /* ignore */
        }
        mountFailed = true;
        setLiveError(true);
      }
    };

    const tearDown = () => {
      if (mountGenRef.current !== gen) return;
      // Capture a final snapshot before disposing so the caller can render a
      // static tile that picks up where the mirror left off.
      const term = termRef.current;
      const serialize = serializeRef.current;
      if (term && serialize && onCaptureSnapshot) {
        try {
          const snap = serialize.serialize({ scrollback: 500 });
          onCaptureSnapshot(terminalId, snap);
        } catch {
          // Serialize may throw if the terminal was disposed by another path.
        }
      }
      dataCleanupRef.current?.();
      dataCleanupRef.current = null;
      try {
        term?.dispose();
      } catch {
        // dispose can throw if the terminal was already torn down.
      }
      termRef.current = null;
      fitRef.current = null;
      serializeRef.current = null;
    };

    // Guard: container may start with zero dimensions (parent animating in,
    // off-screen in grid). Wait for a non-zero size before opening, then
    // re-fit on every resize. See lesson #5092 — the DOM renderer's
    // IntersectionObserver will silently pause if we open() on a zero-size
    // element.
    const ro = new ResizeObserver(() => {
      if (cancelled) return;
      if (!termRef.current) {
        // Don't retry after a previous mount failure — that path leaks
        // if the failure is structural (e.g., xterm throw on open).
        if (mountFailed) return;
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          mountMirror();
        }
        return;
      }
      try {
        fitRef.current?.fit();
        termRef.current.refresh(0, termRef.current.rows - 1);
      } catch {
        // ignore
      }
    });
    ro.observe(container);
    resizeObserverRef.current = ro;

    if (container.clientWidth > 0 && container.clientHeight > 0) {
      mountMirror();
    }

    return () => {
      cancelled = true;
      ro.disconnect();
      resizeObserverRef.current = null;
      tearDown();
    };
    // onCaptureSnapshot and initialSnapshot should not re-trigger mount —
    // they are captured as closures on purpose. terminalId + isLive drive
    // the lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId, isLive]);

  const stateClass = useMemo(() => {
    const state = panel?.agentState;
    if (state === "waiting" || state === "directing") return "border-state-waiting/60";
    if (state === "working" || state === "running") return "border-state-working/60";
    if (state === "completed") return "border-status-success/50";
    if (state === "exited") return "border-status-error/50";
    if (isArmed) return "border-daintree-accent/70";
    return "border-daintree-border";
  }, [panel?.agentState, isArmed]);

  const title = panel?.lastObservedTitle ?? panel?.title ?? "(unknown)";
  const stateLabel = panel?.agentState ?? "idle";

  return (
    <div
      data-testid="fleet-mirror-tile"
      data-terminal-id={terminalId}
      data-live={isLive ? "true" : "false"}
      data-armed={isArmed ? "true" : undefined}
      data-pinned={isPinned ? "true" : undefined}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-md border bg-daintree-bg shadow-sm",
        "min-h-[180px] h-full",
        stateClass
      )}
    >
      <div className="flex items-center gap-2 px-2 py-1 text-[11px] bg-tint/[0.04] border-b border-daintree-border">
        <button
          type="button"
          onClick={focusAgent}
          className="flex-1 min-w-0 text-left truncate text-daintree-text/90 hover:text-daintree-text"
          title={title}
          aria-label={`Focus ${title}`}
        >
          {title}
        </button>
        <span className="shrink-0 rounded-full bg-tint/[0.08] px-1.5 py-0.5 text-[10px] text-daintree-text/70">
          {stateLabel}
        </span>
        <button
          type="button"
          onClick={() => toggleArm(terminalId)}
          className={cn(
            "shrink-0 rounded p-0.5 text-daintree-text/50 hover:text-daintree-text hover:bg-tint/[0.08]",
            isArmed && "text-daintree-accent"
          )}
          aria-label={isArmed ? "Disarm agent" : "Arm agent"}
          aria-pressed={isArmed}
        >
          {isArmed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={() => togglePin(terminalId)}
          className={cn(
            "shrink-0 rounded p-0.5 text-daintree-text/50 hover:text-daintree-text hover:bg-tint/[0.08]",
            isPinned && "text-daintree-accent"
          )}
          aria-label={isPinned ? "Unpin live mirror" : "Pin as live mirror"}
          aria-pressed={isPinned}
        >
          {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
        </button>
      </div>
      <div className="flex-1 min-h-0 relative">
        {isLive ? (
          <div
            ref={containerRef}
            data-testid="fleet-mirror-terminal"
            className="absolute inset-0 pointer-events-none select-none"
            style={{ userSelect: "none" }}
          />
        ) : (
          <pre
            data-testid="fleet-mirror-static"
            className={cn(
              "absolute inset-0 overflow-hidden font-mono text-[11px] leading-tight",
              "whitespace-pre text-daintree-text/80 bg-daintree-bg p-1",
              "[content-visibility:auto]"
            )}
            aria-label={`Snapshot of ${title}`}
          >
            {initialSnapshot ?? ""}
          </pre>
        )}
        {liveError && (
          <div
            role="alert"
            className="absolute inset-0 flex items-center justify-center bg-daintree-bg/80 text-[11px] text-status-error"
          >
            Unable to attach live mirror
          </div>
        )}
      </div>
    </div>
  );
}

export const MirrorTile = memo(MirrorTileInternal);
