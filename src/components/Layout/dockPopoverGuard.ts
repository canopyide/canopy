type RadixOutsideEvent = Event & {
  preventDefault: () => void;
  detail?: {
    originalEvent?: Event;
  };
};

function getOutsideEventTarget(event: RadixOutsideEvent): Element | null {
  const originalTarget = event.detail?.originalEvent?.target;
  if (originalTarget instanceof Element) return originalTarget;

  return event.target instanceof Element ? event.target : null;
}

/**
 * Prevents Radix Popover from dismissing when the user interacts with elements
 * inside a dock panel rendered via createPortal (which breaks the React context
 * chain that Radix's DismissableLayer relies on for nested floating elements).
 */
export function handleDockInteractOutside(
  event: RadixOutsideEvent,
  portalContainer: HTMLElement | null
) {
  const target = getOutsideEventTarget(event);
  if (!target) return;

  // Guard 1: Click originated inside the dock panel's portal container
  if (portalContainer?.contains(target)) {
    event.preventDefault();
    return;
  }

  // Guard 2: Click is on a Radix floating element (DropdownMenu, Tooltip, Select,
  // ContextMenu) descended from this dock popover. These portal to document.body,
  // so we can't rely on DOM containment — the dock popover's React subtree stamps
  // `data-dock-popover-child` on its own Radix content via DockPopoverChildContext,
  // which scopes the guard to *its* descendants rather than every Radix overlay
  // in the document.
  if (target.closest("[data-dock-popover-child]")) {
    event.preventDefault();
    return;
  }
}

/**
 * Prevents Radix Popover from dismissing on Escape when focus is inside the
 * dock panel's portal container (terminal or hybrid input editor). Allows
 * Escape-to-dismiss when focus is on header buttons or other non-terminal elements.
 */
export function handleDockEscapeKeyDown(
  event: KeyboardEvent & { preventDefault: () => void },
  portalContainer: HTMLElement | null
) {
  if (portalContainer?.contains(document.activeElement)) {
    event.preventDefault();
  }
}

/**
 * Returns `true` when a Radix `onOpenChange(false)` should be ignored because
 * focus currently lives inside the dock panel's portal container (the xterm
 * surface or the hybrid input editor). Typing into those surfaces emits
 * `focusin` events that Radix's DismissableLayer can misclassify as an outside
 * interaction once the `wasJustOpenedRef` timing guard has drained — closing
 * the popover mid-keystroke. Mirrors `handleDockEscapeKeyDown`'s containment
 * check so the timing guard is no longer the only line of defence.
 *
 * Pass `portalContainerElementRef.current` (the synchronous ref node), not the
 * React state copy — the state copy lags one render behind, so it can still be
 * null on the frame the spurious close fires.
 */
export function shouldSuppressDockClose(portalContainer: HTMLElement | null): boolean {
  return portalContainer?.contains(document.activeElement) ?? false;
}
