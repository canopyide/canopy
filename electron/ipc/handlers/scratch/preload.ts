import type { IpcInvokeMap } from "../../../types/index.js";

export const SCRATCH_METHOD_CHANNELS = {
  getAll: "scratch:get-all",
  getCurrent: "scratch:get-current",
  create: "scratch:create",
  update: "scratch:update",
  remove: "scratch:remove",
  switch: "scratch:switch",
  saveAsProject: "scratch:save-as-project",
} as const satisfies Record<string, keyof IpcInvokeMap>;

type Methods = typeof SCRATCH_METHOD_CHANNELS;

export type ScratchPreloadBindings = {
  [M in keyof Methods]: (
    ...args: IpcInvokeMap[Methods[M]]["args"]
  ) => Promise<IpcInvokeMap[Methods[M]]["result"]>;
};

type Invoker = (channel: string, ...args: unknown[]) => Promise<unknown>;

export function buildScratchPreloadBindings(invoke: Invoker): ScratchPreloadBindings {
  const out: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  for (const method of Object.keys(SCRATCH_METHOD_CHANNELS) as Array<keyof Methods>) {
    const channel = SCRATCH_METHOD_CHANNELS[method];
    out[method as string] = (...args) => invoke(channel, ...args);
  }
  return out as unknown as ScratchPreloadBindings;
}
