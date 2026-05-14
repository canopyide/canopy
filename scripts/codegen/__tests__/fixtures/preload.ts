import type { IpcInvokeMap } from "./maps.ts";

export const FIXTURE_CHANNELS = {
  noArgs: "fixture:no-args",
  stringArg: "fixture:string-arg",
  multiArg: "fixture:multi-arg",
  objectResult: "fixture:object-result",
  validated: "fixture:validated",
  withContext: "fixture:with-context",
  insideFn: "fixture:inside-fn",
} as const satisfies Record<string, keyof IpcInvokeMap>;
