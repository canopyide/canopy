/**
 * Type definitions for Canopy Command Center (Main Process)
 *
 * Re-exports shared types and adds main-process-specific runtime exports.
 */

// Re-export all shared types
export * from "@shared/types/index.js";

// Re-export runtime values from local files
export { DEFAULT_CONFIG } from "./config.js";
