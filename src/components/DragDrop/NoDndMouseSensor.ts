import { MouseSensor } from "@dnd-kit/core";
import type { MouseEvent as ReactMouseEvent } from "react";

const RIGHT_MOUSE_BUTTON = 2;

export function isNoDndTarget(event: MouseEvent): boolean {
  if (event.button === RIGHT_MOUSE_BUTTON) return true;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  return target.closest("[data-no-dnd]") !== null;
}

export class NoDndMouseSensor extends MouseSensor {
  static activators = [
    {
      eventName: "onMouseDown" as const,
      handler: ({ nativeEvent: event }: ReactMouseEvent) => {
        return !isNoDndTarget(event);
      },
    },
  ];
}
