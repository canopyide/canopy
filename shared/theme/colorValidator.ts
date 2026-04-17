import { APP_THEME_TOKEN_KEYS, type AppThemeTokenKey } from "./types.js";

const APP_THEME_TOKEN_KEY_SET: ReadonlySet<string> = new Set<string>(APP_THEME_TOKEN_KEYS);

/**
 * Token keys whose values are NOT CSS colors. These are either numeric/dimension
 * values (opacity, blur, length, scale), multi-value shadow strings, or special
 * formats (the `accent-rgb` triplet, the `chrome-noise-texture` gradient/keyword).
 *
 * Tokens not in this set are validated as CSS colors by `isValidCssColor`.
 * `accent-rgb` uses its own dedicated validator (`isValidAccentRgbTriplet`).
 */
export const NON_COLOR_TOKEN_KEYS: ReadonlySet<AppThemeTokenKey> = new Set<AppThemeTokenKey>([
  "material-blur",
  "material-saturation",
  "material-opacity",
  "radius-scale",
  "scrollbar-width",
  "panel-state-edge-width",
  "panel-state-edge-inset-block",
  "panel-state-edge-radius",
  "focus-ring-offset",
  "chrome-noise-texture",
  "shadow-ambient",
  "shadow-floating",
  "shadow-dialog",
  "accent-rgb",
  "state-chip-bg-opacity",
  "state-chip-border-opacity",
  "label-pill-bg-opacity",
  "label-pill-border-opacity",
]);

/** CSS Color Level 4 named colors (147) plus `transparent` and `currentcolor`. */
const CSS_NAMED_COLORS: ReadonlySet<string> = new Set<string>([
  "aliceblue",
  "antiquewhite",
  "aqua",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "black",
  "blanchedalmond",
  "blue",
  "blueviolet",
  "brown",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "cyan",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkgrey",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkslategrey",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dimgrey",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "fuchsia",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "gray",
  "green",
  "greenyellow",
  "grey",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgray",
  "lightgreen",
  "lightgrey",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightslategrey",
  "lightsteelblue",
  "lightyellow",
  "lime",
  "limegreen",
  "linen",
  "magenta",
  "maroon",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "navy",
  "oldlace",
  "olive",
  "olivedrab",
  "orange",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "pink",
  "plum",
  "powderblue",
  "purple",
  "rebeccapurple",
  "red",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "silver",
  "skyblue",
  "slateblue",
  "slategray",
  "slategrey",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "teal",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "white",
  "whitesmoke",
  "yellow",
  "yellowgreen",
  "transparent",
  "currentcolor",
]);

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// Matches an rgb()/rgba() call in either legacy (comma) or modern (space +
// optional slash alpha) form. Inner numbers can be integers, decimals, or
// percentages. Mixing comma and space separators is rejected.
const RGB_RE =
  /^rgba?\(\s*(?:-?\d*\.?\d+%?\s*,\s*-?\d*\.?\d+%?\s*,\s*-?\d*\.?\d+%?(?:\s*,\s*-?\d*\.?\d+%?)?|-?\d*\.?\d+%?\s+-?\d*\.?\d+%?\s+-?\d*\.?\d+%?(?:\s*\/\s*-?\d*\.?\d+%?)?)\s*\)$/i;

// Matches an hsl()/hsla() call. Hue may carry a unit (deg/rad/turn/grad).
const HSL_RE =
  /^hsla?\(\s*(?:-?\d*\.?\d+(?:deg|rad|turn|grad)?\s*,\s*-?\d*\.?\d+%\s*,\s*-?\d*\.?\d+%(?:\s*,\s*-?\d*\.?\d+%?)?|-?\d*\.?\d+(?:deg|rad|turn|grad)?\s+-?\d*\.?\d+%\s+-?\d*\.?\d+%(?:\s*\/\s*-?\d*\.?\d+%?)?)\s*\)$/i;

// Matches oklch()/oklab() — modern slash-alpha or legacy comma form.
const OKLCH_OKLAB_RE =
  /^okl(?:ch|ab)\(\s*(?:-?\d*\.?\d+%?\s+-?\d*\.?\d+%?\s+-?\d*\.?\d+(?:deg|rad|turn|grad)?%?(?:\s*\/\s*-?\d*\.?\d+%?)?|-?\d*\.?\d+%?\s*,\s*-?\d*\.?\d+%?\s*,\s*-?\d*\.?\d+(?:deg|rad|turn|grad)?%?(?:\s*,\s*-?\d*\.?\d+%?)?)\s*\)$/i;

const COLOR_MIX_PREFIX_RE =
  /^color-mix\(\s*in\s+[a-z-]+(?:\s+(?:longer|shorter|increasing|decreasing)\s+hue)?\s*,/i;
const VAR_PREFIX_RE = /^var\(\s*--/;

const NAMED_COLOR_RE = /^[a-z]+$/i;

function hasBalancedParens(value: string): boolean {
  let depth = 0;
  for (const ch of value) {
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/**
 * Returns true if `value` is structurally a valid CSS color string. Accepts
 * hex (3/4/6/8 digits), `rgb()`/`rgba()`, `hsl()`/`hsla()`, `oklch()`/`oklab()`,
 * `color-mix(in <space>, ...)`, `var(--...)`, and the CSS named colors
 * (including `transparent` and `currentcolor`).
 *
 * This is structural validation, not full CSS parsing — e.g. `color-mix()` is
 * checked for a valid prefix and balanced parens but nested color values are
 * not recursively validated. That tradeoff avoids false negatives on legal CSS
 * while still blocking obvious garbage like `"not-a-color"`.
 */
export function isValidCssColor(value: string): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (HEX_RE.test(trimmed)) return true;

  if (trimmed.startsWith("#")) return false;

  if (/^rgba?\(/i.test(trimmed)) return RGB_RE.test(trimmed);
  if (/^hsla?\(/i.test(trimmed)) return HSL_RE.test(trimmed);
  if (/^okl(?:ch|ab)\(/i.test(trimmed)) return OKLCH_OKLAB_RE.test(trimmed);

  if (/^color-mix\(/i.test(trimmed)) {
    if (!trimmed.endsWith(")")) return false;
    if (!hasBalancedParens(trimmed)) return false;
    return COLOR_MIX_PREFIX_RE.test(trimmed);
  }

  if (/^var\(/i.test(trimmed)) {
    if (!trimmed.endsWith(")")) return false;
    if (!hasBalancedParens(trimmed)) return false;
    return VAR_PREFIX_RE.test(trimmed);
  }

  // Bare identifier → named color table lookup.
  if (NAMED_COLOR_RE.test(trimmed)) {
    return CSS_NAMED_COLORS.has(trimmed.toLowerCase());
  }

  return false;
}

/**
 * Validates the `accent-rgb` token, which carries a comma-space RGB triplet
 * like `"62, 144, 102"` (the format produced by `hexToRgbTriplet`). Each
 * component must be an integer in 0–255.
 */
export function isValidAccentRgbTriplet(value: string): boolean {
  if (typeof value !== "string") return false;
  const match = /^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/.exec(value);
  if (!match) return false;
  for (let i = 1; i <= 3; i++) {
    const component = Number(match[i]);
    if (!Number.isFinite(component) || component < 0 || component > 255) return false;
  }
  return true;
}

/**
 * Validates `heroImage` values on theme import. Accepts relative paths (with
 * or without a leading `/`) and `data:` URLs. Rejects remote protocols
 * (`http:`, `https:`, `file:`), protocol-relative `//`, Windows absolute
 * (`C:\...`), and UNC (`\\server\share`).
 */
export function isValidThemeHeroImage(value: string): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.toLowerCase().startsWith("data:")) return true;
  return !/^(?:https?|file):|^\/\/|^[a-zA-Z]:[\\/]|^\\\\/i.test(trimmed);
}

export interface ImportedThemeDataForValidation {
  tokens: Record<string, unknown>;
  heroImage?: unknown;
}

export type ValidateImportedThemeDataResult = { valid: true } | { valid: false; errors: string[] };

/**
 * Validates user-supplied theme data at the import boundary. Iterates the
 * `tokens` map and checks each recognized key against the appropriate
 * validator (color / `accent-rgb` triplet / non-color pass-through), then
 * validates `heroImage` if present. Unknown token keys are ignored here — the
 * importer emits a separate "Ignored unknown tokens" warning for those.
 *
 * Returns all failures together so users see every problem in one pass.
 */
export function validateImportedThemeData(
  data: ImportedThemeDataForValidation
): ValidateImportedThemeDataResult {
  const errors: string[] = [];
  const invalidColorTokens: string[] = [];

  for (const [key, value] of Object.entries(data.tokens)) {
    if (!APP_THEME_TOKEN_KEY_SET.has(key)) continue;
    if (typeof value !== "string") {
      invalidColorTokens.push(key);
      continue;
    }

    const tokenKey = key as AppThemeTokenKey;
    if (tokenKey === "accent-rgb") {
      if (!isValidAccentRgbTriplet(value)) invalidColorTokens.push(key);
      continue;
    }
    if (NON_COLOR_TOKEN_KEYS.has(tokenKey)) {
      if (!value.trim()) invalidColorTokens.push(key);
      continue;
    }
    if (!isValidCssColor(value)) invalidColorTokens.push(key);
  }

  if (invalidColorTokens.length > 0) {
    invalidColorTokens.sort();
    errors.push(
      `Invalid color values for token(s): ${invalidColorTokens.join(", ")}. ` +
        `Values must be valid CSS colors (hex, rgb/rgba, hsl/hsla, oklch/oklab, color-mix, var, or named color).`
    );
  }

  if (data.heroImage !== undefined && data.heroImage !== null) {
    if (typeof data.heroImage !== "string" || !isValidThemeHeroImage(data.heroImage)) {
      errors.push(
        `Invalid heroImage value. heroImage must be a relative path or a data: URL — remote URLs and absolute OS paths are not allowed.`
      );
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
