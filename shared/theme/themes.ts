import type {
  AppColorScheme,
  AppColorSchemeTokens,
  AppThemeTokenKey,
  AppThemeValidationWarning,
} from "./types.js";
import { getThemeContrastWarnings } from "./contrast.js";
import { BUILT_IN_THEME_SOURCES, type BuiltInThemeSource } from "./builtInThemeSources.js";
import { createCanopyTokens, hexToRgbTriplet } from "./canopyTokens.js";
import { compileThemePaletteToTokens } from "./paletteCompiler.js";

export const DEFAULT_APP_SCHEME_ID = "daintree";

const INTERNAL_LIGHT_FALLBACK_SOURCE: BuiltInThemeSource = {
  id: "canopy-light-base",
  name: "Canopy Light Base",
  type: "light",
  builtin: true,
  palette: {
    type: "light",
    surfaces: {
      grid: "#CDD3DB",
      sidebar: "#D8DEE6",
      canvas: "#ECF0F5",
      panel: "#F5F8FB",
      elevated: "#FCFDFE",
    },
    text: {
      primary: "#1E252E",
      secondary: "#4A5562",
      muted: "#7D8896",
      inverse: "#FCFDFE",
    },
    border: "#C0C8D1",
    accent: "#1A7258",
    status: {
      success: "#31684B",
      warning: "#9E5D1B",
      danger: "#AD4035",
      info: "#1C5478",
    },
    activity: {
      active: "#2D7A4A",
      idle: "#7D8896",
      working: "#2D7A4A",
      waiting: "#9E7A15",
    },
    terminal: {
      selection: "#2A3A4A",
      red: "#f87171",
      green: "#10b981",
      yellow: "#fbbf24",
      blue: "#38bdf8",
      magenta: "#a855f7",
      cyan: "#22d3ee",
      brightRed: "#fca5a5",
      brightGreen: "#34d399",
      brightYellow: "#fcd34d",
      brightBlue: "#7dd3fc",
      brightMagenta: "#c084fc",
      brightCyan: "#67e8f9",
      brightWhite: "#fafafa",
    },
    syntax: {
      comment: "#707b90",
      punctuation: "#c5d0f5",
      number: "#efb36b",
      string: "#95c879",
      operator: "#8acfe1",
      keyword: "#bc9cef",
      function: "#84adf8",
      link: "#72c1ea",
      quote: "#adb5bb",
      chip: "#7fd4cf",
    },
  },
};

function createThemeFromSource(source: BuiltInThemeSource): AppColorScheme {
  const compiledTokens = compileThemePaletteToTokens(source.palette);
  const tokens = source.tokens
    ? normalizeAppThemeTokens(source.tokens, compiledTokens)
    : compiledTokens;

  return {
    id: source.id,
    name: source.name,
    type: source.type,
    builtin: source.builtin,
    tokens,
    palette: source.palette,
    ...(source.extensions ? { extensions: source.extensions } : {}),
    ...(source.location ? { location: source.location } : {}),
    ...(source.heroImage ? { heroImage: source.heroImage } : {}),
    ...(source.heroVideo ? { heroVideo: source.heroVideo } : {}),
  };
}

const INTERNAL_LIGHT_FALLBACK_SCHEME = createThemeFromSource(INTERNAL_LIGHT_FALLBACK_SOURCE);

export const BUILT_IN_APP_SCHEMES: AppColorScheme[] =
  BUILT_IN_THEME_SOURCES.map(createThemeFromSource);

export const APP_THEME_PREVIEW_KEYS = {
  background: "surface-canvas",
  sidebar: "surface-sidebar",
  accent: "accent-primary",
  success: "status-success",
  warning: "status-warning",
  danger: "status-danger",
  text: "text-primary",
  border: "border-default",
  panel: "surface-panel",
} as const satisfies Record<string, AppThemeTokenKey>;

export function getAppThemeById(
  id: string,
  customSchemes: AppColorScheme[] = []
): AppColorScheme | undefined {
  return [...BUILT_IN_APP_SCHEMES, ...customSchemes].find((scheme) => scheme.id === id);
}

export function getBuiltInAppSchemeForType(type: "dark" | "light"): AppColorScheme {
  return (
    BUILT_IN_APP_SCHEMES.find((scheme) => scheme.type === type) ??
    (type === "light" ? INTERNAL_LIGHT_FALLBACK_SCHEME : BUILT_IN_APP_SCHEMES[0])
  );
}

export function resolveAppTheme(id: string, customSchemes: AppColorScheme[] = []): AppColorScheme {
  return getAppThemeById(id, customSchemes) ?? BUILT_IN_APP_SCHEMES[0];
}

export function getAppThemeCssVariables(scheme: AppColorScheme): Record<string, string> {
  const entries = Object.entries(scheme.tokens).map(([token, value]) => [
    `--theme-${token}`,
    value,
  ]);
  const variables = Object.fromEntries(entries);
  variables["--theme-color-mode"] = scheme.type;
  if (scheme.extensions) {
    for (const [extensionName, extensionValue] of Object.entries(scheme.extensions)) {
      if (typeof extensionValue === "string" && extensionValue.trim()) {
        variables[`--${extensionName}`] = extensionValue;
      }
    }
  }
  return variables;
}

export function normalizeAppThemeTokens(
  maybeTokens: Record<string, unknown>,
  fallback: AppColorSchemeTokens = BUILT_IN_APP_SCHEMES[0].tokens
): AppColorSchemeTokens {
  const normalized = { ...fallback };
  for (const token of Object.keys(fallback) as AppThemeTokenKey[]) {
    const value = maybeTokens[token];
    if (typeof value === "string" && value.trim()) {
      normalized[token] = value;
    }
  }
  return normalized;
}

function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

function inferThemeTypeFromHex(hex: string): "dark" | "light" {
  const clean = hex.replace("#", "");
  const expanded =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : clean;
  const red = parseInt(expanded.slice(0, 2), 16);
  const green = parseInt(expanded.slice(2, 4), 16);
  const blue = parseInt(expanded.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance < 0.5 ? "dark" : "light";
}

export function inferAppThemeTypeFromTokens(
  maybeTokens: Record<string, unknown>
): "dark" | "light" | undefined {
  const surfaceToken = maybeTokens["surface-canvas"];
  if (typeof surfaceToken === "string" && isHexColor(surfaceToken.trim())) {
    return inferThemeTypeFromHex(surfaceToken.trim());
  }
  return undefined;
}

function hexToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const expanded =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : clean;
  const red = hexToLinear(parseInt(expanded.slice(0, 2), 16));
  const green = hexToLinear(parseInt(expanded.slice(2, 4), 16));
  const blue = hexToLinear(parseInt(expanded.slice(4, 6), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function pickReadableForeground(background: string, candidates: string[]): string {
  const validCandidates = candidates.filter(isHexColor);
  if (!isHexColor(background) || validCandidates.length === 0) {
    return "#000000";
  }
  let bestCandidate = validCandidates[0];
  let bestContrast = contrastRatio(bestCandidate, background);
  for (const candidate of validCandidates.slice(1)) {
    const candidateContrast = contrastRatio(candidate, background);
    if (candidateContrast > bestContrast) {
      bestCandidate = candidate;
      bestContrast = candidateContrast;
    }
  }
  return bestCandidate;
}

export function getAppThemeWarnings(scheme: AppColorScheme): AppThemeValidationWarning[] {
  return getThemeContrastWarnings(scheme);
}

export function normalizeAppColorScheme(
  maybeScheme: Partial<Omit<AppColorScheme, "tokens">> & { tokens?: Record<string, unknown> },
  fallback: AppColorScheme = BUILT_IN_APP_SCHEMES[0]
): AppColorScheme {
  const palette = maybeScheme.palette;
  const explicitType =
    maybeScheme.type === "light"
      ? "light"
      : maybeScheme.type === "dark"
        ? "dark"
        : palette?.type === "light"
          ? "light"
          : palette?.type === "dark"
            ? "dark"
            : inferAppThemeTypeFromTokens(
                (maybeScheme.tokens as Record<string, unknown> | undefined) ?? {}
              );
  const resolvedType = explicitType ?? fallback.type;
  const baseScheme =
    fallback.type === resolvedType ? fallback : getBuiltInAppSchemeForType(resolvedType);
  const rawTokens = (palette ? compileThemePaletteToTokens(palette) : maybeScheme.tokens) as
    | Record<string, unknown>
    | undefined;
  const tokenOverrides = (maybeScheme.tokens as Record<string, unknown> | undefined) ?? {};
  const normalizedTokens = normalizeAppThemeTokens(rawTokens ?? {}, baseScheme.tokens);
  Object.assign(normalizedTokens, normalizeAppThemeTokens(tokenOverrides, normalizedTokens));
  if (
    typeof tokenOverrides["accent-foreground"] !== "string" &&
    typeof normalizedTokens["accent-primary"] === "string"
  ) {
    normalizedTokens["accent-foreground"] = pickReadableForeground(
      normalizedTokens["accent-primary"],
      [normalizedTokens["text-inverse"], normalizedTokens["text-primary"], "#ffffff", "#000000"]
    );
  }
  const result: AppColorScheme = {
    id:
      typeof maybeScheme.id === "string" && maybeScheme.id.trim() ? maybeScheme.id : baseScheme.id,
    name:
      typeof maybeScheme.name === "string" && maybeScheme.name.trim()
        ? maybeScheme.name
        : baseScheme.name,
    type: resolvedType,
    builtin: false,
    tokens: normalizedTokens,
    ...(palette ? { palette } : {}),
    ...(maybeScheme.extensions ? { extensions: maybeScheme.extensions } : {}),
  };
  if (typeof maybeScheme.location === "string") result.location = maybeScheme.location;
  if (typeof maybeScheme.heroImage === "string") result.heroImage = maybeScheme.heroImage;
  if (typeof maybeScheme.heroVideo === "string") result.heroVideo = maybeScheme.heroVideo;
  return result;
}

export { createCanopyTokens, hexToRgbTriplet, compileThemePaletteToTokens };
