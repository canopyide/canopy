// Fixture for the opValidated-arity test. The codegen recognizes the
// `opValidated` identifier syntactically, so we shadow it in this file with a
// permissive wrapper whose return type's `handler` accepts the multi-arg
// shape. ts-morph still resolves the handler call signature from the variable
// type, so the codegen's "only the validated payload is supported" guard
// fires when it counts > 1 parameter.
import { z } from "zod";
import { defineIpcNamespace } from "./define.ts";
import { FIXTURE_CHANNELS } from "./preload.ts";
import type { CommandPayload, CommandResult } from "./maps.ts";

// Permissive shim — same name as the real export so the codegen identifier
// match succeeds, but the handler param is preserved as a 2-arg function.
function opValidated<TChannel extends string, TSchema, THandler extends (...a: never[]) => unknown>(
  channel: TChannel,
  schema: TSchema,
  handler: THandler
): { channel: TChannel; schema: TSchema; handler: THandler } {
  return { channel, schema, handler };
}

const Schema = z.object({ commandId: z.string() });

async function tooMany(payload: CommandPayload, extra: string): Promise<CommandResult> {
  void payload;
  void extra;
  return { ok: true };
}

export const ns = defineIpcNamespace({
  name: "validated-bad",
  ops: {
    validated: opValidated(FIXTURE_CHANNELS.validated, Schema, tooMany),
  },
});
