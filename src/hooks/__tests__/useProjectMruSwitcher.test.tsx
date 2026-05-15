// @vitest-environment jsdom
import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { switchProjectMock, reopenProjectMock, notifyMock, projectState, useProjectStoreMock } =
  vi.hoisted(() => {
    const switchProjectMock = vi.fn().mockResolvedValue(undefined);
    const reopenProjectMock = vi.fn().mockResolvedValue(undefined);
    const notifyMock = vi.fn().mockReturnValue("");

    const projectState = {
      projects: [
        { id: "p-current", path: "/p-current", name: "Current", emoji: "🌲", lastOpened: 500 },
        { id: "p-recent", path: "/p-recent", name: "Recent", emoji: "🍎", lastOpened: 400 },
        { id: "p-older", path: "/p-older", name: "Older", emoji: "🥕", lastOpened: 300 },
        { id: "p-oldest", path: "/p-oldest", name: "Oldest", emoji: "🌵", lastOpened: 200 },
      ] as Array<{
        id: string;
        path: string;
        name: string;
        emoji: string;
        lastOpened: number;
        status?: "active" | "background" | "closed" | "missing";
      }>,
      currentProject: { id: "p-current" } as { id: string } | null,
      switchProject: switchProjectMock,
      reopenProject: reopenProjectMock,
    };

    const useProjectStoreMock = Object.assign(
      vi.fn((selector: (state: typeof projectState) => unknown) => selector(projectState)),
      { getState: () => projectState }
    );

    return {
      switchProjectMock,
      reopenProjectMock,
      notifyMock,
      projectState,
      useProjectStoreMock,
    };
  });

const { actionDispatchMock, keybindingServiceMock } = vi.hoisted(() => {
  const actionDispatchMock = vi.fn(async () => ({ ok: true, result: undefined }));
  const keybindingServiceMock = {
    resolveKeybinding: vi.fn(() => ({
      match: { actionId: "project.mruCycleOlder" },
      chordPrefix: false,
      shouldConsume: true,
    })),
    getPendingChord: vi.fn<() => string | null>(() => null),
    clearPendingChord: vi.fn(),
    popPendingChord: vi.fn(),
    getEffectiveCombo: vi.fn<() => string | undefined>(() => undefined),
    matchesEvent: vi.fn(() => false),
    subscribe: vi.fn(() => () => {}),
  };
  return { actionDispatchMock, keybindingServiceMock };
});

vi.mock("@/store/projectStore", () => ({
  useProjectStore: useProjectStoreMock,
}));

vi.mock("@/lib/notify", () => ({
  notify: notifyMock,
}));

vi.mock("@/services/ActionService", () => ({
  actionService: { dispatch: actionDispatchMock },
}));

vi.mock("@/services/KeybindingService", () => ({
  keybindingService: keybindingServiceMock,
  normalizeKeyForBinding: (event: KeyboardEvent) => {
    if (event.code === "Equal" || event.code === "NumpadAdd") return "=";
    if (event.code === "Minus" || event.code === "NumpadSubtract") return "-";
    return event.key;
  },
}));

vi.mock("../../store", () => ({
  usePanelStore: { getState: () => ({ focusedId: null }) },
}));

vi.mock("@/utils/logger", () => ({
  logError: vi.fn(),
}));

import { _resetForTests as resetEscapeStack, dispatchEscape } from "@/lib/escapeStack";
import {
  armProjectMruModifierGate,
  clearProjectMruModifierGate,
  isProjectMruModifierGateActive,
} from "@/lib/projectMruSwitchGestureGate";
import { useProjectMruSwitcher } from "../useProjectMruSwitcher";
import { useGlobalKeybindings } from "../useGlobalKeybindings";

function keyDown(
  code: "Minus" | "Equal" | "NumpadAdd" | "NumpadSubtract",
  opts: {
    repeat?: boolean;
    isComposing?: boolean;
    target?: Element | null;
    shiftKey?: boolean;
  } = {}
) {
  const key = code === "Minus" || code === "NumpadSubtract" ? "–" : opts.shiftKey ? "+" : "≠";
  const event = new KeyboardEvent("keydown", {
    key,
    code,
    metaKey: true,
    altKey: true,
    shiftKey: opts.shiftKey ?? false,
    repeat: opts.repeat ?? false,
    isComposing: opts.isComposing ?? false,
    bubbles: true,
    cancelable: true,
  });
  if (opts.target) {
    Object.defineProperty(event, "target", { value: opts.target, writable: false });
  }
  window.dispatchEvent(event);
  return event;
}

function keyUp(key: "Meta" | "Alt") {
  const event = new KeyboardEvent("keyup", {
    key,
    bubbles: true,
    cancelable: true,
  });
  document.body.dispatchEvent(event);
  return event;
}

function modifierKeyDown(key: "Meta" | "Alt", opts: { metaKey?: boolean; altKey?: boolean } = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    metaKey: opts.metaKey ?? key === "Meta",
    altKey: opts.altKey ?? key === "Alt",
    bubbles: true,
    cancelable: true,
  });
  document.body.dispatchEvent(event);
  return event;
}

function AppLikeKeybindingHost() {
  useProjectMruSwitcher();
  useGlobalKeybindings(true);
  return null;
}

describe("useProjectMruSwitcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetEscapeStack();
    clearProjectMruModifierGate();
    projectState.currentProject = { id: "p-current" };
    projectState.projects = [
      { id: "p-current", path: "/p-current", name: "Current", emoji: "🌲", lastOpened: 500 },
      { id: "p-recent", path: "/p-recent", name: "Recent", emoji: "🍎", lastOpened: 400 },
      { id: "p-older", path: "/p-older", name: "Older", emoji: "🥕", lastOpened: 300 },
      { id: "p-oldest", path: "/p-oldest", name: "Oldest", emoji: "🌵", lastOpened: 200 },
    ];
  });

  afterEach(() => {
    clearProjectMruModifierGate();
    vi.useRealTimers();
  });

  it("tap Cmd+Alt+- switches backward through MRU without showing overlay", () => {
    const { result } = renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Minus");
    });
    act(() => {
      keyUp("Meta");
    });

    expect(switchProjectMock).toHaveBeenCalledWith("p-oldest");
    expect(reopenProjectMock).not.toHaveBeenCalled();
    expect(result.current.isVisible).toBe(false);
  });

  it("tap Cmd+Alt+= switches forward through MRU", () => {
    renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Equal");
    });
    act(() => {
      keyUp("Alt");
    });

    expect(switchProjectMock).toHaveBeenCalledWith("p-recent");
  });

  it("tap Cmd+Alt+Plus (Shift+Equal) switches forward through MRU", () => {
    renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Equal", { shiftKey: true });
    });
    act(() => {
      keyUp("Alt");
    });

    expect(switchProjectMock).toHaveBeenCalledWith("p-recent");
  });

  it("tap Cmd+Alt+NumpadAdd switches forward through MRU", () => {
    renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("NumpadAdd");
    });
    act(() => {
      keyUp("Alt");
    });

    expect(switchProjectMock).toHaveBeenCalledWith("p-recent");
  });

  it("tap Cmd+Alt+NumpadSubtract switches backward through MRU", () => {
    renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("NumpadSubtract");
    });
    act(() => {
      keyUp("Alt");
    });

    expect(switchProjectMock).toHaveBeenCalledWith("p-oldest");
  });

  it("single-project state is a no-op", () => {
    projectState.projects = [
      { id: "p-current", path: "/p-current", name: "Current", emoji: "🌲", lastOpened: 500 },
    ];
    renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Minus");
    });
    act(() => {
      keyUp("Meta");
    });

    expect(switchProjectMock).not.toHaveBeenCalled();
    expect(reopenProjectMock).not.toHaveBeenCalled();
  });

  it("IME composition keydown is ignored", () => {
    renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Minus", { isComposing: true });
    });
    act(() => {
      keyUp("Meta");
    });

    expect(switchProjectMock).not.toHaveBeenCalled();
  });

  it("Sticky Keys: modifier release without any trigger keydown does not commit", () => {
    renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyUp("Meta");
    });

    expect(switchProjectMock).not.toHaveBeenCalled();
  });

  it("holding past threshold shows overlay with selectedIndex 1", () => {
    const { result } = renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Equal");
    });
    act(() => {
      vi.advanceTimersByTime(70);
    });

    expect(result.current.isVisible).toBe(true);
    expect(result.current.selectedIndex).toBe(1);
    expect(result.current.projects.map((p) => p.id)).toEqual([
      "p-current",
      "p-recent",
      "p-older",
      "p-oldest",
    ]);
  });

  it("holding Cmd+Alt+- starts at the backward wrapped project", () => {
    const { result } = renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Minus");
    });
    act(() => {
      vi.advanceTimersByTime(70);
    });

    expect(result.current.isVisible).toBe(true);
    expect(result.current.selectedIndex).toBe(3);
    expect(result.current.projects[result.current.selectedIndex]?.id).toBe("p-oldest");
  });

  it("hold + Equal advances down through MRU", () => {
    const { result } = renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Equal");
      vi.advanceTimersByTime(70);
    });
    act(() => {
      keyDown("Equal", { repeat: true });
    });

    expect(result.current.selectedIndex).toBe(2);
  });

  it("hold + Minus from index 1 wraps to current project (index 0)", () => {
    const { result } = renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Equal");
      vi.advanceTimersByTime(70);
    });
    act(() => {
      keyDown("Minus", { repeat: true });
    });

    expect(result.current.selectedIndex).toBe(0);
  });

  it("hold + Equal at last wraps to current project (index 0), then to 1", () => {
    const { result } = renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Equal");
      vi.advanceTimersByTime(70);
    });
    // Sequence on a 4-project list (indices 0..3), starting at selectedIndex 1:
    //   1 → 2 → 3 → 0 (wraps through current) → 1
    act(() => {
      keyDown("Equal", { repeat: true });
      keyDown("Equal", { repeat: true });
      keyDown("Equal", { repeat: true });
    });
    expect(result.current.selectedIndex).toBe(0);

    act(() => {
      keyDown("Equal", { repeat: true });
    });
    expect(result.current.selectedIndex).toBe(1);
  });

  it("hold + scrub back to current project (index 0) then release does not commit", () => {
    const { result } = renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Equal");
      vi.advanceTimersByTime(70);
    });
    // Advance 1 → 2, then scrub back 2 → 1 → 0 (current project)
    act(() => {
      keyDown("Equal", { repeat: true });
    });
    act(() => {
      keyDown("Minus", { repeat: true });
      keyDown("Minus", { repeat: true });
    });
    expect(result.current.selectedIndex).toBe(0);

    act(() => {
      keyUp("Meta");
    });

    expect(switchProjectMock).not.toHaveBeenCalled();
    expect(reopenProjectMock).not.toHaveBeenCalled();
    expect(result.current.isVisible).toBe(false);
  });

  it("releasing modifier during hold commits highlighted project", () => {
    renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Equal");
      vi.advanceTimersByTime(70);
    });
    act(() => {
      keyDown("Equal", { repeat: true });
    });
    act(() => {
      keyUp("Meta");
    });

    expect(switchProjectMock).toHaveBeenCalledWith("p-older");
  });

  it("Escape during hold cancels without committing", () => {
    const { result } = renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Minus");
      vi.advanceTimersByTime(70);
    });
    expect(result.current.isVisible).toBe(true);

    act(() => {
      dispatchEscape();
    });

    expect(result.current.isVisible).toBe(false);
    act(() => {
      keyUp("Meta");
    });
    expect(switchProjectMock).not.toHaveBeenCalled();
  });

  it("window blur during hold cancels without committing", () => {
    const { result } = renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Minus");
      vi.advanceTimersByTime(70);
    });

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    expect(result.current.isVisible).toBe(false);
    act(() => {
      keyUp("Meta");
    });
    expect(switchProjectMock).not.toHaveBeenCalled();
  });

  it("document hidden during hold cancels", () => {
    const { result } = renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Minus");
      vi.advanceTimersByTime(70);
    });

    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.isVisible).toBe(false);
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  it("e.repeat advances without restarting the hold timer", () => {
    const { result } = renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Equal");
    });
    // Before threshold, repeat events advance the index but do NOT restart timer
    act(() => {
      vi.advanceTimersByTime(40);
      keyDown("Equal", { repeat: true });
      vi.advanceTimersByTime(30);
    });

    // 40 + 30 = 70 > 60 threshold, so overlay should be visible
    expect(result.current.isVisible).toBe(true);
    expect(result.current.selectedIndex).toBe(2);
  });

  it("commits background project via reopenProject", () => {
    projectState.projects = [
      { id: "p-current", path: "/p-current", name: "Current", emoji: "🌲", lastOpened: 500 },
      {
        id: "p-bg",
        path: "/p-bg",
        name: "BG",
        emoji: "🍃",
        lastOpened: 400,
        status: "background",
      },
    ];
    renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Minus");
    });
    act(() => {
      keyUp("Meta");
    });

    expect(reopenProjectMock).toHaveBeenCalledWith("p-bg");
    expect(switchProjectMock).not.toHaveBeenCalled();
  });

  it("no-op when target is an editable input", () => {
    renderHook(() => useProjectMruSwitcher());

    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => {
      keyDown("Minus", { target: input });
    });
    act(() => {
      keyUp("Meta");
    });

    expect(switchProjectMock).not.toHaveBeenCalled();
    input.remove();
  });

  it("still fires inside an .xterm container (terminal panel must work)", () => {
    renderHook(() => useProjectMruSwitcher());

    const term = document.createElement("div");
    term.className = "xterm";
    document.body.appendChild(term);
    act(() => {
      keyDown("Equal", { target: term });
    });
    act(() => {
      keyUp("Meta");
    });

    expect(switchProjectMock).toHaveBeenCalledWith("p-recent");
    term.remove();
  });

  it("switchProject rejection surfaces via notify", async () => {
    const err = new Error("boom");
    switchProjectMock.mockRejectedValueOnce(err);

    renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Minus");
    });
    act(() => {
      keyUp("Meta");
    });

    await vi.waitFor(() => {
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error", message: "boom" })
      );
    });
  });

  it("unmount mid-hold clears timer and does not commit", () => {
    const { result, unmount } = renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Minus");
    });
    unmount();

    act(() => {
      vi.advanceTimersByTime(200);
      keyUp("Meta");
    });

    expect(switchProjectMock).not.toHaveBeenCalled();
    expect(result.current.isVisible).toBe(false);
  });

  it("calls preventDefault and stopPropagation on handled keydowns", () => {
    renderHook(() => useProjectMruSwitcher());

    const event = new KeyboardEvent("keydown", {
      key: "–",
      code: "Minus",
      metaKey: true,
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    const pd = vi.spyOn(event, "preventDefault");
    const sp = vi.spyOn(event, "stopPropagation");

    act(() => {
      window.dispatchEvent(event);
    });

    expect(pd).toHaveBeenCalled();
    expect(sp).toHaveBeenCalled();
  });

  it("fires inside xterm helper textarea (common terminal focus state)", () => {
    renderHook(() => useProjectMruSwitcher());

    const term = document.createElement("div");
    term.className = "xterm";
    const helper = document.createElement("textarea");
    helper.className = "xterm-helper-textarea";
    term.appendChild(helper);
    document.body.appendChild(term);

    act(() => {
      keyDown("Equal", { target: helper });
    });
    act(() => {
      keyUp("Meta");
    });

    expect(switchProjectMock).toHaveBeenCalledWith("p-recent");
    term.remove();
  });

  it("calls stopImmediatePropagation to block sibling capture listeners", () => {
    renderHook(() => useProjectMruSwitcher());

    const event = new KeyboardEvent("keydown", {
      key: "–",
      code: "Minus",
      metaKey: true,
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    const sip = vi.spyOn(event, "stopImmediatePropagation");

    act(() => {
      window.dispatchEvent(event);
    });

    expect(sip).toHaveBeenCalled();
  });

  it("blocks the generic keybinding fallback in the app-like hook order", () => {
    render(<AppLikeKeybindingHost />);

    act(() => {
      keyDown("Equal");
    });
    act(() => {
      keyUp("Meta");
    });

    expect(switchProjectMock).toHaveBeenCalledWith("p-recent");
    expect(keybindingServiceMock.resolveKeybinding).not.toHaveBeenCalled();
    expect(actionDispatchMock).not.toHaveBeenCalled();
  });

  it("blocks a cross-view trigger until a fresh modifier keydown is observed", () => {
    render(<AppLikeKeybindingHost />);
    armProjectMruModifierGate();

    let blockedEvent: KeyboardEvent | undefined;
    act(() => {
      blockedEvent = keyDown("Equal");
    });

    expect(blockedEvent?.defaultPrevented).toBe(true);
    expect(switchProjectMock).not.toHaveBeenCalled();
    expect(keybindingServiceMock.resolveKeybinding).not.toHaveBeenCalled();
    expect(actionDispatchMock).not.toHaveBeenCalled();
    expect(isProjectMruModifierGateActive()).toBe(true);

    act(() => {
      modifierKeyDown("Meta");
    });
    expect(isProjectMruModifierGateActive()).toBe(false);

    act(() => {
      keyDown("Equal");
    });
    act(() => {
      keyUp("Meta");
    });

    expect(switchProjectMock).toHaveBeenCalledWith("p-recent");
  });

  it("keeps the cross-view gate when a modifier keydown still reports both modifiers held", () => {
    render(<AppLikeKeybindingHost />);
    armProjectMruModifierGate();

    act(() => {
      modifierKeyDown("Meta", { metaKey: true, altKey: true });
    });

    expect(isProjectMruModifierGateActive()).toBe(true);

    act(() => {
      keyDown("Equal");
    });

    expect(switchProjectMock).not.toHaveBeenCalled();
    expect(actionDispatchMock).not.toHaveBeenCalled();
  });

  it("revalidates target against live store at commit time", () => {
    renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Equal");
      vi.advanceTimersByTime(70);
    });
    // Mutate the store: remove the selected target (p-recent at index 1)
    projectState.projects = projectState.projects.filter((p) => p.id !== "p-recent");

    act(() => {
      keyUp("Meta");
    });

    expect(switchProjectMock).not.toHaveBeenCalled();
    expect(reopenProjectMock).not.toHaveBeenCalled();
  });

  it("forces current project to index 0 even when not the newest by lastOpened", () => {
    projectState.currentProject = { id: "p-stale" };
    projectState.projects = [
      { id: "p-stale", path: "/p-stale", name: "Stale", emoji: "🌲", lastOpened: 100 },
      { id: "p-fresh", path: "/p-fresh", name: "Fresh", emoji: "🍎", lastOpened: 500 },
    ];
    const { result } = renderHook(() => useProjectMruSwitcher());

    act(() => {
      keyDown("Minus");
      vi.advanceTimersByTime(70);
    });

    expect(result.current.projects.map((p) => p.id)).toEqual(["p-stale", "p-fresh"]);

    act(() => {
      keyUp("Meta");
    });

    expect(switchProjectMock).toHaveBeenCalledWith("p-fresh");
  });

  it("ignores keydowns when modifiers are absent", () => {
    renderHook(() => useProjectMruSwitcher());

    const event = new KeyboardEvent("keydown", {
      key: "-",
      code: "Minus",
      metaKey: false,
      altKey: false,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(event);
    });
    act(() => {
      keyUp("Meta");
    });

    expect(switchProjectMock).not.toHaveBeenCalled();
  });
});
