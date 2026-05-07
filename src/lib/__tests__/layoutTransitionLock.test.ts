// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  __resetSidebarLayoutTransitionLockForTests,
  isSidebarLayoutTransitionLocked,
  lockSidebarLayoutTransition,
  subscribeSidebarLayoutTransitionUnlock,
} from "../layoutTransitionLock";

describe("layoutTransitionLock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetSidebarLayoutTransitionLockForTests();
  });

  afterEach(() => {
    __resetSidebarLayoutTransitionLockForTests();
    vi.useRealTimers();
  });

  it("starts unlocked", () => {
    expect(isSidebarLayoutTransitionLocked()).toBe(false);
  });

  it("becomes locked synchronously and unlocks after the duration", () => {
    lockSidebarLayoutTransition(250);
    expect(isSidebarLayoutTransitionLocked()).toBe(true);

    vi.advanceTimersByTime(249);
    expect(isSidebarLayoutTransitionLocked()).toBe(true);

    vi.advanceTimersByTime(1);
    expect(isSidebarLayoutTransitionLocked()).toBe(false);
  });

  it("resets the timer when locked again before expiry", () => {
    lockSidebarLayoutTransition(250);
    vi.advanceTimersByTime(200);
    expect(isSidebarLayoutTransitionLocked()).toBe(true);

    lockSidebarLayoutTransition(250);
    vi.advanceTimersByTime(200);
    expect(isSidebarLayoutTransitionLocked()).toBe(true);

    vi.advanceTimersByTime(50);
    expect(isSidebarLayoutTransitionLocked()).toBe(false);
  });

  it("notifies subscribers when the lock expires", () => {
    const listener = vi.fn();
    subscribeSidebarLayoutTransitionUnlock(listener);

    lockSidebarLayoutTransition(100);
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(isSidebarLayoutTransitionLocked()).toBe(false);
  });

  it("does not invoke listeners on the lock call itself, only on unlock", () => {
    const listener = vi.fn();
    subscribeSidebarLayoutTransitionUnlock(listener);

    lockSidebarLayoutTransition(100);
    lockSidebarLayoutTransition(100);
    lockSidebarLayoutTransition(100);
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("notifies multiple subscribers", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeSidebarLayoutTransitionUnlock(a);
    subscribeSidebarLayoutTransitionUnlock(b);

    lockSidebarLayoutTransition(50);
    vi.advanceTimersByTime(50);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe prevents the callback from firing", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSidebarLayoutTransitionUnlock(listener);
    unsubscribe();

    lockSidebarLayoutTransition(50);
    vi.advanceTimersByTime(50);

    expect(listener).not.toHaveBeenCalled();
  });

  it("survives a listener that throws and still notifies the others", () => {
    const ok = vi.fn();
    subscribeSidebarLayoutTransitionUnlock(() => {
      throw new Error("boom");
    });
    subscribeSidebarLayoutTransitionUnlock(ok);

    lockSidebarLayoutTransition(50);
    vi.advanceTimersByTime(50);

    expect(ok).toHaveBeenCalledTimes(1);
    expect(isSidebarLayoutTransitionLocked()).toBe(false);
  });

  it("tolerates a subscriber that unsubscribes from inside its own callback", () => {
    const a = vi.fn();
    const unsubscribeA = vi.fn(() => unsubscribeAFn());
    let unsubscribeAFn: () => void = () => {};

    unsubscribeAFn = subscribeSidebarLayoutTransitionUnlock(() => {
      a();
      unsubscribeA();
    });

    const b = vi.fn();
    subscribeSidebarLayoutTransitionUnlock(b);

    lockSidebarLayoutTransition(50);
    vi.advanceTimersByTime(50);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("__resetSidebarLayoutTransitionLockForTests clears the lock and listeners", () => {
    const listener = vi.fn();
    subscribeSidebarLayoutTransitionUnlock(listener);
    lockSidebarLayoutTransition(250);
    expect(isSidebarLayoutTransitionLocked()).toBe(true);

    __resetSidebarLayoutTransitionLockForTests();
    expect(isSidebarLayoutTransitionLocked()).toBe(false);

    vi.advanceTimersByTime(250);
    expect(listener).not.toHaveBeenCalled();
  });
});
