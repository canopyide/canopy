export const TABBABLE_SELECTOR =
  'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex^="-"])';

function isHiddenFromFocus(element: HTMLElement): boolean {
  if (element.closest("[hidden], [inert], [aria-hidden='true']")) return true;

  const view = element.ownerDocument.defaultView;
  const style = view?.getComputedStyle(element);
  return style?.display === "none" || style?.visibility === "hidden";
}

export function isVisibleTabbableElement(element: HTMLElement): boolean {
  if (isHiddenFromFocus(element)) return false;

  const checkVisibility = element.checkVisibility;
  if (typeof checkVisibility === "function") {
    try {
      return checkVisibility.call(element, {
        checkOpacity: false,
        checkVisibilityCSS: true,
      });
    } catch {
      return checkVisibility.call(element);
    }
  }

  return true;
}

export function getVisibleTabbableElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(
    isVisibleTabbableElement
  );
}
