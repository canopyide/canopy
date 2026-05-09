// Shared shutdown-timing constants. Kept in a side-effect-free module so the
// signal-handler in appLifecycle.ts (and tests) can import it without pulling
// in the full shutdown.ts service graph (ProjectStore, TelemetryService, etc).
export const CLEANUP_TIMEOUT_MS = 10_000;
