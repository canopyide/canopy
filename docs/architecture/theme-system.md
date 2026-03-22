# Theme System

Canopy's theming system is a three-layer pipeline shared between the renderer and main process:

1. `ThemePalette`
   Theme authors define the visual foundation in `shared/theme/palette.ts`: surfaces, text, accent, status, activity, terminal colors, syntax colors, and a small `strategy` object.
2. Semantic tokens
   `createSemanticTokens()` in `shared/theme/semantic.ts` compiles a palette into the stable app token contract in `shared/theme/types.ts`.
3. Component public vars
   Individual UI areas expose their own override surface through CSS variables such as `--toolbar-bg`, `--toolbar-project-bg`, `--settings-dialog-bg`, `--pulse-card-bg`, and `--terminal-grid-bg`.

## Core Model

- `AppColorScheme` is the canonical theme object: `id`, `name`, `type`, `builtin`, `palette`, `tokens`, and optional `extensions`.
- Built-in themes are authored in `shared/theme/builtInThemeSources.ts`.
- `shared/theme/themes.ts` compiles those sources into `BUILT_IN_APP_SCHEMES`.
- The public semantic token contract lives in `APP_THEME_TOKEN_KEYS` in `shared/theme/types.ts`.

## Built-In Themes

- Built-in themes use one source of truth: `palette` plus optional semantic token overrides and optional component `extensions`.
- There is no separate recipe-token layer for built-in themes.
- The internal light fallback used during normalization is defined in `shared/theme/themes.ts` from the same palette-based model.

## Semantic Tokens

Semantic tokens are app-wide values exposed as `--theme-*` CSS variables. They include:

- Surfaces: `surface-canvas`, `surface-sidebar`, `surface-toolbar`, `surface-panel`, `surface-panel-elevated`, `surface-grid`, `surface-input`, `surface-inset`, `surface-hover`, `surface-active`
- Text, border, accent, status, activity, overlay, wash, scrim, shadow, terminal, syntax, diff, and category lanes
- Small global utility tokens such as `scrollbar-*`, `state-chip-*`, `label-pill-*`, `focus-ring-offset`, `panel-state-edge-*`, and `chrome-noise-texture`

Component-specific styling does not belong in this layer.

## Component Overrides

Component CSS owns the public override surface. Themes can target specific UI regions through `extensions` without expanding the global semantic contract.

Examples:

- Toolbar: [toolbar.css](/Users/gpriday/Projects/canopy-app/src/styles/components/toolbar.css)
- Settings: [settings.css](/Users/gpriday/Projects/canopy-app/src/styles/components/settings.css)
- Pulse: [pulse.css](/Users/gpriday/Projects/canopy-app/src/styles/components/pulse.css)
- Sidebar and worktree cards: [sidebar.css](/Users/gpriday/Projects/canopy-app/src/styles/components/sidebar.css)
- Shared shell surfaces: [panels.css](/Users/gpriday/Projects/canopy-app/src/styles/components/panels.css)

Pattern:

```css
.toolbar-project-pill {
  --_bg: var(--toolbar-project-bg, var(--theme-wash-medium));
  --_border: var(--toolbar-project-border, var(--theme-border-subtle));
  --_shadow: var(--toolbar-project-shadow, var(--theme-shadow-ambient));
}
```

The app owns layout, spacing, and animation timing. Themes own color, shadow, material, and component chrome.

## Runtime Application

- `getAppThemeCssVariables()` in `shared/theme/themes.ts` converts a scheme into CSS variables.
- `applyAppThemeToRoot()` in `src/theme/applyAppTheme.ts` applies those variables to the root element and clears stale extension vars between switches.
- Tailwind-facing aliases live in `src/index.css`.

## Import Flow

- App theme import is handled by `electron/utils/appThemeImporter.ts`.
- Imported theme files may provide:
  - a `palette`
  - optional semantic `tokens`
  - optional component `extensions`
- Unknown nested tokens are ignored with warnings.
- Missing `type` is inferred from `surface-canvas` when possible.

## Guidance

- Add a semantic token only when the value is genuinely app-wide.
- Add a component public var when a visual decision belongs to one shell or component family.
- Do not add recipe-style theme tokens or alias compatibility layers.
- Keep terminal colors first-class and independent from workbench surfaces.
- Keep search highlighting independent from accent when a theme needs it.
