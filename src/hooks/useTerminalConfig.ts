import { useEffect } from "react";
import { terminalInstanceService } from "@/services/TerminalInstanceService";
import { CANOPY_TERMINAL_THEME } from "@/components/Terminal/XtermAdapter";

/**
 * Sync global terminal configuration (theme, font settings) to all active terminals.
 * Since terminals are now owned by a singleton service outside React, they don't
 * automatically get prop updates when settings change. This hook bridges that gap.
 *
 * NOTE: Replace the placeholders below with real values from your settings store
 * when theme/font configuration becomes user-adjustable.
 */
export function useTerminalConfig() {
  // TODO: Wire these to user settings/theme once available
  const theme = CANOPY_TERMINAL_THEME;
  const fontSize = 13;
  const fontFamily =
    '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, "Courier New", monospace';

  useEffect(() => {
    terminalInstanceService.applyGlobalOptions({
      theme,
      fontSize,
      fontFamily,
    });
  }, [theme, fontSize, fontFamily]);
}
