# Theme Token Reference

Complete reference for Canopy's semantic token system. Every built-in and custom theme must provide values for all tokens. The `createCanopyTokens()` helper derives sensible defaults for most tokens from a smaller set of required values.

## Token layers

| Layer    | Prefix                               | Changes per theme? | Purpose                                                   |
| -------- | ------------------------------------ | ------------------ | --------------------------------------------------------- |
| Surface  | `surface-*`                          | Yes                | Depth hierarchy and interactive surfaces                  |
| Text     | `text-*`                             | Yes                | Typography color hierarchy                                |
| Border   | `border-*`                           | Yes                | Edge and divider treatments                               |
| Accent   | `accent-*`                           | Yes                | Primary interaction color                                 |
| Status   | `status-*`                           | Yes                | Semantic outcome colors                                   |
| Activity | `activity-*`                         | Yes                | Real-time agent state indicators                          |
| Overlay  | `overlay-*`                          | Yes                | Interactive state tinting ladder                          |
| Scrim    | `scrim-*`                            | Yes                | Modal backdrop dimming                                    |
| GitHub   | `github-*`                           | Yes                | PR/issue state colors                                     |
| Search   | `search-*`                           | Yes                | Search highlighting (independent of accent)               |
| Terminal | `terminal-*`                         | Yes                | Terminal emulator layer (independent of workbench)        |
| Syntax   | `syntax-*`                           | Yes                | Code editor token colors                                  |
| Category | `category-*`                         | Yes                | 12 organizational label hues                              |
| Diff     | `diff-*`                             | Yes                | Diff viewer insert/delete/gutter colors                   |
| Recipe   | `recipe-*`                           | Yes                | Per-theme parametric opacity, shadow, and geometry values |
| Shared   | `focus-ring`, `shadow-color`, `tint` | Yes                | Cross-cutting single tokens                               |

## Surface tokens

Five-level depth hierarchy plus semantic interactive surfaces.

| Token                    | Purpose                                | Daintree                  | Bondi       |
| ------------------------ | -------------------------------------- | ------------------------- | ----------- |
| `surface-grid`           | Deepest recess — panel grid background | `#0e0e0d`                 | `#CDD3DB`   |
| `surface-sidebar`        | Sidebar, toolbar, dock chrome          | `#131413`                 | `#D8DEE6`   |
| `surface-canvas`         | Main app background (`<body>`)         | `#19191a`                 | `#ECF0F5`   |
| `surface-panel`          | Panel chrome, dropdowns, dialogs       | `#202121`                 | `#F5F8FB`   |
| `surface-panel-elevated` | Focused panel, tooltips                | `#2D302F`                 | `#FCFDFE`   |
| `surface-input`          | Text input backgrounds                 | Derived: `panel-elevated` | `#F5F8FB`   |
| `surface-inset`          | Recessed content within panels         | Derived: `tint` 3%        | `#E6EBF0`   |
| `surface-hover`          | Hover overlay on interactive elements  | Derived: `tint` 5%        | `black 5%`  |
| `surface-active`         | Active/pressed overlay                 | Derived: `tint` 8%        | `black 10%` |

**Design rule:** Adjacent surface pairs must have clear perceptual separation. Grid→sidebar→canvas→panel→elevated should read as a smooth depth ramp.

## Text tokens

| Token              | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| `text-primary`     | Headings, active labels, focused content             |
| `text-secondary`   | Descriptions, subtitles, inactive tabs               |
| `text-muted`       | Disabled text, timestamps (may fall below WCAG AA)   |
| `text-placeholder` | Input placeholder text (derived: `text-primary` 35%) |
| `text-inverse`     | Text on solid accent/color backgrounds               |
| `text-link`        | Hyperlink color (defaults to `accent-primary`)       |

## Border tokens

| Token                | Purpose                             | Dark default | Light default |
| -------------------- | ----------------------------------- | ------------ | ------------- |
| `border-default`     | Card outlines, input borders        | Required     | Required      |
| `border-subtle`      | Panel-internal dividers             | `white 8%`   | `black 5%`    |
| `border-strong`      | Focused panel borders               | `white 14%`  | `black 14%`   |
| `border-divider`     | Structural separators               | `white 5%`   | `black 4%`    |
| `border-interactive` | Hovered/focused interactive borders | `white 20%`  | `black 10%`   |

**Polarity pattern:** Dark themes use white-alpha; light themes use black-alpha.

## Accent tokens

| Token               | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `accent-primary`    | Solid accent — buttons, toggles, active indicators          |
| `accent-hover`      | Hover state (default: accent mixed 90% with polarity color) |
| `accent-foreground` | Text on solid accent backgrounds                            |
| `accent-soft`       | Low-opacity tint (~15-18%) for subtle accent fills          |
| `accent-muted`      | Medium-opacity tint (~20-30%) for stronger fills            |
| `accent-rgb`        | Raw RGB triplet (e.g. `63, 147, 102`) for `rgba()` usage    |

**Critical rule:** Accent must remain distinct from `status-success`. They serve different semantic roles.

## Secondary accent tokens

An optional second color lane for themes with two distinct interaction colors.

| Token                    | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `accent-secondary`       | Second accent hue (e.g. sage in Bali/Table Mountain, gold in Serengeti) |
| `accent-secondary-soft`  | Low-opacity tint of secondary accent (~15% dark / ~10% light)           |
| `accent-secondary-muted` | Medium-opacity tint of secondary accent (~25% dark / ~18% light)        |

All three default to `status-success` and its derived tints when omitted, so single-accent themes work without any secondary accent definition.

## Status tokens

Fixed hue families across all themes. Each theme tunes brightness/saturation.

| Token            | Hue family                     |
| ---------------- | ------------------------------ |
| `status-success` | Green — completed/ready states |
| `status-warning` | Amber — caution states         |
| `status-danger`  | Red — error/destructive states |
| `status-info`    | Blue — neutral informational   |

## Activity tokens

Drive state chips in panel headers and worktree card indicators.

| Token                | Purpose                                              |
| -------------------- | ---------------------------------------------------- |
| `activity-active`    | Real-time working indicator (vivid)                  |
| `activity-working`   | Animated spinner color                               |
| `activity-waiting`   | Agent waiting for user input (amber)                 |
| `activity-approval`  | Needs explicit approval (orange)                     |
| `activity-idle`      | Inactive/dormant state                               |
| `activity-completed` | Finished successfully (defaults to `status-success`) |
| `activity-failed`    | Finished with error (defaults to `status-danger`)    |

## Overlay tokens

A single-knob color input drives the entire opacity ladder.

| Token              | Purpose                                                    | Dark default | Light default |
| ------------------ | ---------------------------------------------------------- | ------------ | ------------- |
| `overlay-base`     | Tint color for the ladder (default: `#ffffff` / `#000000`) | `#ffffff`    | `#000000`     |
| `overlay-subtle`   | Lightest interactive tint                                  | base 2%      | base 2%       |
| `overlay-soft`     | Hover state on list items                                  | base 3%      | base 3%       |
| `overlay-medium`   | Active/selected item on sidebar, focus fills               | base 4%      | base 5%       |
| `overlay-strong`   | Stronger fills, secondary hover                            | base 6%      | base 8%       |
| `overlay-emphasis` | Maximum-contrast fill before full surface change           | base 10%     | base 12%      |

Set `overlay-base` to a hued color to tint all hover and fill states (e.g. Fiordland: icy blue `#B4DCF0`, Arashiyama: warm cream `#FFECE6`). Borders and surfaces continue using the neutral polarity tone regardless of `overlay-base`.

## GitHub tokens

| Token           | Purpose                   |
| --------------- | ------------------------- |
| `github-open`   | Open issue/PR indicator   |
| `github-merged` | Merged PR indicator       |
| `github-closed` | Closed issue/PR indicator |
| `github-draft`  | Draft PR indicator        |

Dark themes use GitHub's dark-mode palette; light themes use GitHub's light-mode palette.

## Search tokens

Search highlighting is independent of accent. Bondi uses blue (`#2B6CA8`) search while its accent is green (`#1A7258`).

| Token                           | Purpose                               |
| ------------------------------- | ------------------------------------- |
| `search-highlight-background`   | `<mark>` background for matched text  |
| `search-highlight-text`         | Text color inside highlighted matches |
| `search-selected-result-border` | Border on selected search result row  |
| `search-selected-result-icon`   | Icon color in selected result         |
| `search-match-badge-background` | Match count badge background          |
| `search-match-badge-text`       | Match count badge text                |

Defaults derive from accent. Override when accent hue doesn't work as a text highlight.

## Terminal tokens

Terminal is a first-class layer, independent of workbench. Bondi uses a dark terminal (`#1E252E`) inside a light workbench.

| Token                                                   | Purpose                                                |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `terminal-background`                                   | Terminal emulator background                           |
| `terminal-foreground`                                   | Default terminal text                                  |
| `terminal-muted`                                        | Dimmed terminal text                                   |
| `terminal-cursor`                                       | Cursor block color (defaults to `accent-primary`)      |
| `terminal-cursor-accent`                                | Text behind cursor (defaults to `terminal-background`) |
| `terminal-selection`                                    | Selection highlight background                         |
| `terminal-black` through `terminal-white`               | Standard 8 ANSI colors                                 |
| `terminal-bright-black` through `terminal-bright-white` | Bright 8 ANSI colors                                   |

## Syntax tokens

Code editor highlighting. Each theme provides a palette coherent with its atmosphere.

| Token                | Purpose              |
| -------------------- | -------------------- |
| `syntax-comment`     | Lowest visual weight |
| `syntax-punctuation` | Brackets, semicolons |
| `syntax-number`      | Numeric literals     |
| `syntax-string`      | String literals      |
| `syntax-operator`    | Operators            |
| `syntax-keyword`     | Language keywords    |
| `syntax-function`    | Function names       |
| `syntax-link`        | URLs in code         |
| `syntax-quote`       | Block quotes         |
| `syntax-chip`        | Inline code chips    |

**Hierarchy rule:** `comment` is always lowest contrast; `keyword`, `function`, `string` are always highest.

## Category tokens

12 perceptually uniform hues using `oklch()`. Dark themes use higher lightness (~0.70), light themes use lower (~0.55).

`category-blue`, `category-purple`, `category-cyan`, `category-green`, `category-amber`, `category-orange`, `category-teal`, `category-indigo`, `category-rose`, `category-pink`, `category-violet`, `category-slate`

CSS automatically generates `-subtle`, `-text`, and `-border` composite variants via `color-mix` in `src/index.css`.

## Recipe tokens

Per-theme parametric values consumed by components alongside semantic color tokens. All recipe tokens are derived — theme authors only override when the defaults don't suit their atmosphere.

### State chrome recipes

| Token                              | Purpose                      | Daintree                               | Bondi                                  |
| ---------------------------------- | ---------------------------- | -------------------------------------- | -------------------------------------- |
| `recipe-state-chip-bg-opacity`     | State chip background fill   | `0.15`                                 | `0.12`                                 |
| `recipe-state-chip-border-opacity` | State chip border            | `0.40`                                 | `0.35`                                 |
| `recipe-label-pill-bg-opacity`     | GitHub label pill background | `0.10`                                 | `0.08`                                 |
| `recipe-label-pill-border-opacity` | GitHub label pill border     | `0.20`                                 | `0.15`                                 |
| `recipe-button-inset-shadow`       | Button top-edge highlight    | `inset 0 1px 0 rgba(255,255,255,0.06)` | `inset 0 1px 0 rgba(255,255,255,0.15)` |

### Scrollbar recipe

| Token                          | Purpose               | Dark default  | Light default |
| ------------------------------ | --------------------- | ------------- | ------------- |
| `recipe-scrollbar-width`       | Scrollbar track width | `6px`         | `6px`         |
| `recipe-scrollbar-thumb`       | Thumb color at rest   | `white 20%`   | `black 18%`   |
| `recipe-scrollbar-thumb-hover` | Thumb color on hover  | `white 35%`   | `black 28%`   |
| `recipe-scrollbar-track`       | Track background      | `transparent` | `transparent` |

Derived from `tint` using the polarity pattern (white-alpha for dark, black-alpha for light).

### Panel state edge recipe

A left-edge state rail on panel headers. Light themes show it by default; dark themes disable it via `width: 0`.

| Token                                 | Purpose                         | Dark default | Light default |
| ------------------------------------- | ------------------------------- | ------------ | ------------- |
| `recipe-panel-state-edge-width`       | Rail width (0px = disabled)     | `0px`        | `2px`         |
| `recipe-panel-state-edge-inset-block` | Vertical inset from panel edges | `4px`        | `4px`         |
| `recipe-panel-state-edge-radius`      | Rail end-cap radius             | `2px`        | `2px`         |

The rail color reuses existing `activity-*` and `status-*` tokens — no new color is introduced.

### Control chrome recipe

Elevation shadows for panels, palettes, and floating surfaces.

| Token                                  | Purpose                                     | Dark default                                            | Light default                                             |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `recipe-control-chrome-raised-shadow`  | Box shadow for elevated panels and palettes | `0 4px 12px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)` | `0 4px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)` |
| `recipe-control-chrome-pressed-shadow` | Inset shadow for pressed interactive states | `inset 0 1px 2px rgba(0,0,0,0.3)`                       | `inset 0 1px 2px rgba(0,0,0,0.08)`                        |

### Surface elevation sheen recipe

Inset top-edge highlight applied to elevated surfaces: dialogs, palettes, tooltips, active sidebar cards.

| Token                                  | Purpose                             | Dark default                             | Light default                          |
| -------------------------------------- | ----------------------------------- | ---------------------------------------- | -------------------------------------- |
| `recipe-surface-elevated-inset-shadow` | Top-edge sheen on elevated surfaces | `inset 0 1px 0 0 rgba(255,255,255,0.03)` | `inset 0 1px 0 rgba(255,255,255,0.60)` |

Set to `"none"` on themes that should not show the sheen (e.g. Svalbard's stark flat aesthetic). Applied via `style` prop rather than a Tailwind class so the full `box-shadow` value is theme-controlled.

### Shadow profile recipes

Complete `box-shadow` values including geometry and blur — themes set these to express their shadow personality.

| Token                    | Purpose                                     | Dark default                                            | Light default                                             |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `recipe-shadow-ambient`  | Subtle ambient elevation (cards, badges)    | `0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)`  | `0 2px 8px rgba(0,0,0,0.06)`                              |
| `recipe-shadow-floating` | Prominent floating surfaces (menus, modals) | `0 4px 12px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)` | `0 4px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)` |

Themes can express distinct shadow characters: crisp and close (Bondi `0 1px 2px`), fog-diffused (Bali `0 14px 48px`), barely-there (Svalbard `0 18px 44px rgba(...,0.05)`).

### Focus ring recipe

| Token                      | Purpose                         | Default |
| -------------------------- | ------------------------------- | ------- |
| `recipe-focus-ring-offset` | Offset between element and ring | `"2px"` |

Some themes prefer `"3px"` for extra breathing room (e.g. Bali).

### Chrome noise texture recipe

| Token                         | Purpose                                                | Default  |
| ----------------------------- | ------------------------------------------------------ | -------- |
| `recipe-chrome-noise-texture` | CSS `background-image` grain layer for sidebar/toolbar | `"none"` |

Set to a `data-URI` SVG noise filter to add subtle grain texture to chrome surfaces. Requires component-level support (`background-image: var(--theme-recipe-chrome-noise-texture)`). Most themes leave this as `"none"`; Highlands uses SVG grain for a tactile texture.

## Diff tokens

Theme-controlled colors for the diff viewer. Derived from `status-success` and `status-danger` at authoring time, but fully overridable for precise per-theme tuning.

| Token                         | Purpose                                     | Dark default                    | Light default                   |
| ----------------------------- | ------------------------------------------- | ------------------------------- | ------------------------------- |
| `diff-insert-background`      | Line background for inserted lines          | `status-success` at 18% opacity | `status-success` at 10% opacity |
| `diff-insert-edit-background` | Inline edit highlight within inserted lines | `status-success` at 28% opacity | `status-success` at 20% opacity |
| `diff-delete-background`      | Line background for deleted lines           | `status-danger` at 18% opacity  | `status-danger` at 10% opacity  |
| `diff-delete-edit-background` | Inline edit highlight within deleted lines  | `status-danger` at 28% opacity  | `status-danger` at 20% opacity  |
| `diff-gutter-insert`          | Gutter indicator for inserted lines         | `status-success`                | `status-success`                |
| `diff-gutter-delete`          | Gutter indicator for deleted lines          | `status-danger`                 | `status-danger`                 |
| `diff-selected-background`    | Selected/focused diff line overlay          | `tint` at 6%                    | `tint` at 6%                    |
| `diff-omit-gutter-line`       | Gutter color for collapsed/omitted sections | `activity-idle`                 | `activity-idle`                 |

## Shared tokens

| Token          | Purpose                                             |
| -------------- | --------------------------------------------------- |
| `focus-ring`   | Keyboard focus indicator color                      |
| `shadow-color` | Base color for elevation shadows                    |
| `tint`         | Overlay base: `#ffffff` (dark) or `#000000` (light) |

---

## Authoring vs. resolved tokens

The token system has two contracts:

**Authoring inputs** — what a theme author provides to `createCanopyTokens()`. A small required set (~56 tokens) plus any optional overrides.

**Resolved output** — the complete `AppColorSchemeTokens` object produced by the factory. Every token in `APP_THEME_TOKEN_KEYS` is guaranteed to be present. This is the only contract components and the CSS variable pipeline should consume.

Token classification:

| Class                 | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| **Required**          | Must be supplied to `createCanopyTokens()`                    |
| **Optional override** | Can be supplied; falls back to a derived value if omitted     |
| **Derived**           | Always computed from required inputs; never authored directly |
| **Shared/global**     | Fixed per polarity (`tint`); computed from required inputs    |

## Creating a new theme

### 1. Define required tokens

Call `createCanopyTokens(type, tokens)` with at minimum:

- All 5 surface levels + `text-primary/secondary/muted/inverse` + `border-default`
- `accent-primary` + all 4 status colors + 4 activity states (active, working, waiting, idle)
- `terminal-selection` + 12 ANSI colors (6 standard + 6 bright) + `terminal-bright-white`
- All 10 syntax tokens

Everything else derives from these automatically — including `activity-completed` / `activity-failed`, terminal cursor, all recipe groups, and diff colors.

### 2. Override derived tokens as needed

Common overrides for a polished theme:

- `overlay-base` — set to a hued color to tint hover/fill states (icy blue, warm cream, etc.)
- `terminal-background/foreground/muted/cursor` — if terminal should differ from workbench
- `search-*` — if accent hue doesn't work as search highlighting
- `activity-idle` — unique idle indicator per theme atmosphere
- Category `oklch` values — adjust lightness for your surface contrast
- Recipe opacities — tune for your polarity
- `recipe-scrollbar-thumb` — if you want a colored scrollbar rather than neutral
- `recipe-panel-state-edge-width` — set to `"2px"` on light themes, `"0px"` on dark themes that don't use the rail
- `recipe-control-chrome-raised-shadow` — tune depth for your workbench atmosphere
- `recipe-surface-elevated-inset-shadow` — tune or set to `"none"` for flat aesthetics
- `recipe-shadow-ambient` / `recipe-shadow-floating` — express shadow personality (crisp, diffused, barely-there)
- `recipe-focus-ring-offset` — set to `"3px"` for extra breathing room
- `recipe-chrome-noise-texture` — add SVG grain to chrome surfaces (requires component support)
- `accent-secondary` — define a second color lane for dual-accent themes
- `diff-*` — override if status-success/danger don't read well as diff backgrounds

### 3. Add to BUILT_IN_APP_SCHEMES

```ts
{
  id: "my-theme",
  name: "My Theme",
  type: "dark",
  builtin: true,
  tokens: createCanopyTokens("dark", { /* ... */ }),
},
```

### 4. Map terminal scheme

In `src/config/terminalColorSchemes.ts`, add an entry to `APP_THEME_TERMINAL_SCHEME_MAP`:

```ts
"my-theme": "my-theme",  // or reuse an existing terminal scheme
```

If the theme needs a bespoke terminal palette, add a `TerminalColorScheme` to `BUILT_IN_SCHEMES`.

### 5. Validate

- `text-primary` on all surfaces ≥ 4.5:1 (WCAG AA)
- `accent-foreground` on `accent-primary` ≥ 4.5:1
- Terminal ANSI colors ≥ 3:1 on `terminal-background`
- Agent brand colors (`#CC785C`, `#4285F4`, `#10a37f`) distinguishable on all surfaces

---

## Tailwind consumption

Components use semantic Tailwind classes generated from CSS variables:

```
bg-surface-panel        text-text-primary       border-border-default
bg-accent-primary       text-accent-foreground   ring-focus-ring
bg-search-highlight-background                   text-status-warning
bg-terminal-background  text-terminal-foreground
bg-activity-working     text-category-blue
```

No component should reference hex values or know which theme is active.

---

## File map

| File                                 | Purpose                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `shared/theme/types.ts`              | `APP_THEME_TOKEN_KEYS` const array, `AppThemeTokenKey` union, `AppColorScheme` interface |
| `shared/theme/themes.ts`             | `createCanopyTokens()`, `BUILT_IN_APP_SCHEMES`, utility functions                        |
| `shared/theme/terminal.ts`           | Maps resolved app tokens → xterm `ITheme` (including cursor/cursorAccent)                |
| `shared/theme/entityColors.ts`       | Panel brand colors, branch type Tailwind classes                                         |
| `src/theme/applyAppTheme.ts`         | DOM injection of all resolved tokens as `--theme-*` CSS vars, CVD overrides              |
| `src/index.css`                      | Tailwind v4 `@theme inline` mappings for all token groups                                |
| `src/store/appThemeStore.ts`         | Renderer theme state (Zustand)                                                           |
| `src/config/terminalColorSchemes.ts` | Terminal-specific color scheme library                                                   |
| `electron/utils/appThemeImporter.ts` | JSON import with normalization, alias resolution, and validation                         |

## Token count summary

| Group     | Count   | Notes                                                                                                                                                   |
| --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surface   | 9       | 5 depth levels + input, inset, hover, active                                                                                                            |
| Text      | 6       | primary, secondary, muted, placeholder, inverse, link                                                                                                   |
| Border    | 5       |                                                                                                                                                         |
| Accent    | 9       | 6 primary lane + 3 secondary lane                                                                                                                       |
| Focus     | 1       |                                                                                                                                                         |
| Status    | 4       |                                                                                                                                                         |
| Activity  | 7       |                                                                                                                                                         |
| Overlay   | 6       | base + subtle, soft, medium, strong, emphasis                                                                                                           |
| Scrim     | 3       |                                                                                                                                                         |
| Shadow    | 1       |                                                                                                                                                         |
| Tint      | 1       |                                                                                                                                                         |
| GitHub    | 4       |                                                                                                                                                         |
| Search    | 6       |                                                                                                                                                         |
| Terminal  | 22      | 6 base (bg/fg/muted/cursor/cursor-accent/selection) + 16 ANSI                                                                                           |
| Syntax    | 10      |                                                                                                                                                         |
| Category  | 12      |                                                                                                                                                         |
| Recipe    | 19      | state chrome (5) + scrollbar (4) + panel edge (3) + control chrome (2) + surface sheen (1) + shadow profiles (2) + focus offset (1) + noise texture (1) |
| Diff      | 8       |                                                                                                                                                         |
| **Total** | **133** |                                                                                                                                                         |
