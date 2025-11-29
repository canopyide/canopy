/**
 * Hooks Index
 *
 * Re-exports all hooks for convenient importing.
 */

export { useWorktrees, useWorktree } from "./useWorktrees";
export type { UseWorktreesReturn } from "./useWorktrees";

export { useDevServer, useDevServerStates } from "./useDevServer";

export { useElectron, isElectronAvailable } from "./useElectron";

export { useAgentLauncher } from "./useAgentLauncher";
export type { AgentType, AgentAvailability, UseAgentLauncherReturn } from "./useAgentLauncher";

export { useContextInjection } from "./useContextInjection";
export type { UseContextInjectionReturn } from "./useContextInjection";

export { useErrors } from "./useErrors";

export { useTerminalPalette } from "./useTerminalPalette";
export type { SearchableTerminal, UseTerminalPaletteReturn } from "./useTerminalPalette";

export { useWorktreeTerminals } from "./useWorktreeTerminals";
export type { WorktreeTerminalCounts, UseWorktreeTerminalsResult } from "./useWorktreeTerminals";

export { useKeybinding, useKeybindingScope, useKeybindingDisplay } from "./useKeybinding";
export type { UseKeybindingOptions } from "./useKeybinding";
export { keybindingService } from "../services/KeybindingService";
export type { KeyScope, KeybindingConfig } from "../services/KeybindingService";
