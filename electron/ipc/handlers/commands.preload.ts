import type { IpcInvokeMap } from "../../types/index.js";

export const COMMANDS_METHOD_CHANNELS = {
  list: "commands:list",
  get: "commands:get",
  execute: "commands:execute",
  getBuilder: "commands:get-builder",
} as const satisfies Record<string, keyof IpcInvokeMap>;

type Methods = typeof COMMANDS_METHOD_CHANNELS;

export type CommandsPreloadBindings = {
  [M in keyof Methods]: (
    ...args: IpcInvokeMap[Methods[M]]["args"]
  ) => Promise<IpcInvokeMap[Methods[M]]["result"]>;
};

type Invoker = (channel: string, ...args: unknown[]) => Promise<unknown>;

export function buildCommandsPreloadBindings(invoke: Invoker): CommandsPreloadBindings {
  const out: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  for (const method of Object.keys(COMMANDS_METHOD_CHANNELS) as Array<keyof Methods>) {
    const channel = COMMANDS_METHOD_CHANNELS[method];
    out[method as string] = (...args) => invoke(channel, ...args);
  }
  return out as unknown as CommandsPreloadBindings;
}
