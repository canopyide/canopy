import { getAppThemeCssVariables, resolveAppTheme, type AppColorScheme } from "@shared/theme";
import type { ColorVisionMode } from "@shared/types";

export function applyAppThemeToRoot(root: HTMLElement, scheme: AppColorScheme): void {
  const variables = getAppThemeCssVariables(scheme);

  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }

  root.dataset.theme = scheme.id;
  root.dataset.colorMode = scheme.type;
  root.classList.toggle("dark", scheme.type === "dark");
  root.classList.toggle("light", scheme.type === "light");
}

export function applyColorVisionMode(root: HTMLElement, mode: ColorVisionMode): void {
  if (mode === "default") {
    delete root.dataset.colorblind;
  } else {
    root.dataset.colorblind = mode;
  }
}

export function applyDefaultAppTheme(root: HTMLElement): AppColorScheme {
  const scheme = resolveAppTheme("canopy");
  applyAppThemeToRoot(root, scheme);
  return scheme;
}
