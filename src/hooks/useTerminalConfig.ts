import { useEffect } from "react";
import { terminalInstanceService } from "@/services/TerminalInstanceService";
import { CANOPY_TERMINAL_THEME } from "@/components/Terminal/XtermAdapter";

/**
 * Syncs global terminal config to singleton service.
 * Terminals live outside React, so they don't receive prop updates automatically.
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
