import type { IpcInvokeMap } from "../../types/index.js";

export const EVENT_INSPECTOR_METHOD_CHANNELS = {
  getEvents: "event-inspector:get-events",
  getFiltered: "event-inspector:get-filtered",
  clear: "event-inspector:clear",
} as const satisfies Record<string, keyof IpcInvokeMap>;

type Methods = typeof EVENT_INSPECTOR_METHOD_CHANNELS;

export type EventInspectorPreloadBindings = {
  [M in keyof Methods]: (
    ...args: IpcInvokeMap[Methods[M]]["args"]
  ) => Promise<IpcInvokeMap[Methods[M]]["result"]>;
};

type Invoker = (channel: string, ...args: unknown[]) => Promise<unknown>;

export function buildEventInspectorPreloadBindings(invoke: Invoker): EventInspectorPreloadBindings {
  const out: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  for (const method of Object.keys(EVENT_INSPECTOR_METHOD_CHANNELS) as Array<keyof Methods>) {
    const channel = EVENT_INSPECTOR_METHOD_CHANNELS[method];
    out[method as string] = (...args) => invoke(channel, ...args);
  }
  return out as unknown as EventInspectorPreloadBindings;
}
