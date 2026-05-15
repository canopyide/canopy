const NO_MATCH_QUERY_MAX = 40;

/**
 * Codepoint-safe truncation for search queries echoed back in "No matches for
 * …" empty-state titles. Prevents long pastes from overflowing popover/palette
 * layouts. Mirrors the convention used in SidebarContent and AppPaletteDialog.
 */
export function truncateSearchQuery(trimmedQuery: string): string {
  const codepoints = Array.from(trimmedQuery);
  return codepoints.length > NO_MATCH_QUERY_MAX
    ? `${codepoints.slice(0, NO_MATCH_QUERY_MAX).join("")}…`
    : trimmedQuery;
}
