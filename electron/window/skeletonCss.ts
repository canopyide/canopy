/**
 * Injects CSS custom properties into a WebContents so the HTML skeleton
 * in index.html renders with the correct theme and layout dimensions
 * before React mounts.
 *
 * Called from both createWindow (initial load) and ProjectViewManager
 * (project switch cold starts).
 */
import type { WebContents } from "electron";
import { store } from "../store.js";
import { resolveAppTheme, getAppThemeCssVariables } from "../../shared/theme/index.js";
import type { AppColorScheme } from "../../shared/theme/index.js";

export function injectSkeletonCss(wc: WebContents): void {
  const appState = store.get("appState");
  const sidebarWidth = appState?.sidebarWidth ?? 350;
  const focusMode = appState?.focusMode ?? false;

  // Resolve theme
  const themeConfig = store.get("appTheme") ?? {};
  const colorSchemeId =
    typeof themeConfig.colorSchemeId === "string" ? themeConfig.colorSchemeId : "daintree";
  const customSchemes: AppColorScheme[] = Array.isArray(themeConfig.customSchemes)
    ? themeConfig.customSchemes
    : [];
  const scheme = resolveAppTheme(colorSchemeId, customSchemes);
  const themeVars = getAppThemeCssVariables(scheme);

  // Build CSS string
  const lines: string[] = [":root {"];

  // Theme tokens (--theme-surface-canvas, --theme-border-default, etc.)
  for (const [prop, value] of Object.entries(themeVars)) {
    lines.push(`  ${prop}: ${value};`);
  }

  // Layout state
  lines.push(`  --skeleton-sidebar-width: ${sidebarWidth}px;`);
  lines.push(`  --skeleton-focus-mode: ${focusMode ? "1" : "0"};`);

  lines.push("}");

  // If focus mode is active, hide the skeleton sidebar
  if (focusMode) {
    lines.push("#startup-skeleton .skeleton-sidebar { display: none; }");
  }

  void wc.insertCSS(lines.join("\n"), { cssOrigin: "user" });
}
