/**
 * WebContents → BrowserWindow registry.
 *
 * BrowserWindow.fromWebContents() returns null for WebContentsView's webContents.
 * This registry provides a consistent lookup that works for both BrowserWindow-owned
 * webContents and WebContentsView webContents.
 *
 * Phase 1 of the WebContentsView migration: all IPC handlers use this instead of
 * BrowserWindow.fromWebContents() directly, so Phase 2 can move the app into a
 * WebContentsView without breaking 30+ IPC handlers.
 */

import { BrowserWindow, type WebContents } from "electron";

const webContentsToWindow = new Map<number, BrowserWindow>();

/**
 * Register a webContents → BrowserWindow mapping.
 * Call this when creating a WebContentsView and attaching it to a BrowserWindow.
 * Also call for the BrowserWindow's own webContents (identity mapping).
 */
export function registerWebContents(webContents: WebContents, win: BrowserWindow): void {
  webContentsToWindow.set(webContents.id, win);

  webContents.once("destroyed", () => {
    webContentsToWindow.delete(webContents.id);
  });
}

/**
 * Unregister a webContents mapping.
 * Call when destroying a WebContentsView before its webContents fires 'destroyed'.
 */
export function unregisterWebContents(webContents: WebContents): void {
  webContentsToWindow.delete(webContents.id);
}

/**
 * Get the BrowserWindow that owns a webContents.
 * First tries BrowserWindow.fromWebContents() (works for BrowserWindow-owned webContents),
 * then falls back to the registry (works for WebContentsView webContents).
 */
export function getWindowForWebContents(webContents: WebContents): BrowserWindow | null {
  // Fast path: native lookup works for BrowserWindow-owned webContents
  const native = BrowserWindow.fromWebContents(webContents);
  if (native) return native;

  // Fallback: registry lookup for WebContentsView webContents
  const registered = webContentsToWindow.get(webContents.id);
  if (registered && !registered.isDestroyed()) return registered;

  return null;
}
