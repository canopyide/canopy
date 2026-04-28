# Icons

This folder holds Daintree's icon components. Most of the UI uses Lucide line
icons via `lucide-react` — only icons in this directory are bundled into the
app as bespoke components.

## Layout

- `DaintreeIcon.tsx` — the product logo. Brand mark only; not a UI action icon.
- `AgentStateCircles.tsx` — the multi-dot agent-state indicator (not a single
  icon, but a state-indicator component that lives next to the icon set).
- `custom/` — **Daintree-original icons.** Single-glyph 24×24 line icons drawn
  for product-specific concepts that Lucide doesn't cover (worktrees, agents,
  recipes, broadcast, project pulse, copy tree, watch alert, MCP server). All
  eight non-MCP icons are scheduled for a Lucide-compatible redraw — see
  [docs/design/custom-icon-spec.pdf](../../../docs/design/custom-icon-spec.pdf).
  The MCP icon is the official mark from `modelcontextprotocol.io` and stays
  as-is. Move-to-dock and move-to-grid used to live here too; both are now
  Lucide's `panel-bottom-close` / `panel-top-close`.
- `brands/` — third-party brand marks (language runtimes, package managers,
  AI agents). These follow each brand's official mark and are not redrawn.

## Conventions

- Custom icons are React components named `<Name>Icon`, exported via the
  barrel files (`custom/index.ts`, `brands/index.ts`, `index.ts`).
- 24×24 viewBox, 2px stroke, round caps and joins, `currentColor`.
- No fills — line only — so themes can recolour them via CSS.
- Always set `aria-hidden="true"` unless the icon is the sole label for an
  interactive control, in which case use `aria-label` instead.

## Adding a new custom icon

1. Drop the SVG component in `custom/<Name>Icon.tsx`.
2. Re-export it from `custom/index.ts`.
3. If it represents a panel kind, wire its `iconId` into the `ICON_MAP` in
   `src/components/PanelPalette/PanelKindIcon.tsx`.

## Style reference

Lucide's design system documents the construction rules these icons follow:
<https://lucide.dev/contribute/icon-design-guide>
