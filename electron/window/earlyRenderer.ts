/**
 * Decide whether to start the renderer in parallel with PTY host bootstrap.
 *
 * Early-renderer mode is the default: `loadRenderer()` is hoisted ahead of the
 * workspace/PTY init block so first paint stops waiting on the PTY handshake
 * (~70–150ms cold). Set `DAINTREE_EARLY_RENDERER=0` to restore the serial path
 * (await `ptyClient.waitForReady()` before `loadRenderer()`). The smoke test
 * path is always excluded so its deterministic readiness checks keep working
 * unmodified.
 */
export function shouldEnableEarlyRenderer(opts: {
  isSmokeTest: boolean;
  env: NodeJS.ProcessEnv;
}): boolean {
  return !opts.isSmokeTest && opts.env.DAINTREE_EARLY_RENDERER !== "0";
}

export function shouldDeferRendererLoadForE2E(opts: { env: NodeJS.ProcessEnv }): boolean {
  return opts.env.DAINTREE_E2E_DEFER_RENDERER_LOAD === "1";
}
