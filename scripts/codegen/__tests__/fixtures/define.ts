// Stub mirror of electron/ipc/define.ts used only by ipc-map.test.ts fixtures.
// The codegen reads handler AST shape (defineIpcNamespace + op/opValidated
// call expressions) and the handler function types — it does not require the
// real runtime, just type signatures.

import type { z } from "zod";
import type { IpcInvokeMap } from "./maps.ts";

type Channel = keyof IpcInvokeMap;

type PlainHandler<K extends Channel> = (
  ...args: IpcInvokeMap[K]["args"]
) => Promise<IpcInvokeMap[K]["result"]> | IpcInvokeMap[K]["result"];

type ValidatedPayloadHandler<K extends Channel, S extends z.ZodTypeAny> = (
  payload: z.output<S>
) => Promise<IpcInvokeMap[K]["result"]> | IpcInvokeMap[K]["result"];

export function op<K extends Channel>(
  channel: K,
  handler: PlainHandler<K>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  options?: { withContext: true }
): { channel: K; handler: PlainHandler<K> } {
  return { channel, handler };
}

export function opValidated<K extends Channel, S extends z.ZodTypeAny>(
  channel: K,
  schema: S,
  handler: ValidatedPayloadHandler<K, S>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  options?: { withContext: true }
): { channel: K; schema: S; handler: ValidatedPayloadHandler<K, S> } {
  return { channel, schema, handler };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpSpec = { channel: string; handler: any; schema?: unknown };

export function defineIpcNamespace<const Ops extends Record<string, OpSpec>>(input: {
  name: string;
  ops: Ops;
}) {
  return input;
}
