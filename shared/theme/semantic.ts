import type { ThemePalette } from "./palette.js";
import { compileThemePaletteToTokens } from "./paletteCompiler.js";
import type { AppColorSchemeTokens } from "./types.js";

export function createSemanticTokens(palette: ThemePalette): AppColorSchemeTokens {
  return compileThemePaletteToTokens(palette);
}
