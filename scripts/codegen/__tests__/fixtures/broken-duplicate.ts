// Fixture for the duplicate-channel detection test. Two namespaces, same
// channel — the codegen should refuse to emit and throw.
import { defineIpcNamespace, op } from "./define.ts";
import { FIXTURE_CHANNELS } from "./preload.ts";

async function a(): Promise<number> {
  return 1;
}
async function b(): Promise<number> {
  return 2;
}

export const dup1 = defineIpcNamespace({
  name: "dup-1",
  ops: { noArgs: op(FIXTURE_CHANNELS.noArgs, a) },
});

export const dup2 = defineIpcNamespace({
  name: "dup-2",
  ops: { noArgs: op(FIXTURE_CHANNELS.noArgs, b) },
});
