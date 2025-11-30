/**
 * IPC Client Abstraction Modules
 *
 * This module provides typed client wrappers for all window.electron.* IPC calls.
 * Using these clients instead of direct window.electron access provides:
 *
 * - **Testability**: Mock clients at the module level, not globally
 * - **Maintainability**: Single place to add caching, retry logic, or error handling
 * - **Type Safety**: Consistent types across all call sites
 *
 * @example
 * ```typescript
 * // In your component or hook:
 * import { worktreeClient, terminalClient } from "@/clients";
 *
 * // Instead of window.electron.worktree.getAll()
 * const worktrees = await worktreeClient.getAll();
 *
 * // Instead of window.electron.terminal.spawn(options)
 * const id = await terminalClient.spawn(options);
 * ```
 *
 * @example
 * ```typescript
 * // In your test:
 * import { vi } from "vitest";
 * import { worktreeClient } from "@/clients";
 *
 * vi.mock("@/clients", () => ({
 *   worktreeClient: {
 *     getAll: vi.fn().mockResolvedValue([]),
 *     onUpdate: vi.fn(() => vi.fn()),
 *   },
 * }));
 * ```
 */

export { aiClient } from "./aiClient";
export { appClient } from "./appClient";
export { artifactClient } from "./artifactClient";
export { copyTreeClient } from "./copyTreeClient";
export { devServerClient } from "./devServerClient";
export { directoryClient } from "./directoryClient";
export { errorsClient } from "./errorsClient";
export { eventInspectorClient } from "./eventInspectorClient";
export { historyClient } from "./historyClient";
export { logsClient } from "./logsClient";
export { projectClient } from "./projectClient";
export { runClient } from "./runClient";
export { systemClient } from "./systemClient";
export { terminalClient } from "./terminalClient";
export { worktreeClient } from "./worktreeClient";
