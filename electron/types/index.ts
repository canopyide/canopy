/**
 * Type definitions for Canopy Command Center (Main Process)
 *
 * Re-exports shared types and adds main-process-specific runtime exports.
 */

// Re-export all shared types
export * from "@shared/types/index.js";

// Re-export runtime values from local files (DEFAULT_CONFIG, keymaps, etc.)
// Note: Types are re-exported via @shared, these are just the runtime constants/functions
export { DEFAULT_CONFIG } from "./config.js";
export { STANDARD_KEYMAP, VIM_KEYMAP, getPresetKeymap, resolveKeymap } from "./keymap.js";
