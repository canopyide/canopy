import { memo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ShortcutRevealChip } from "@/components/ui/ShortcutRevealChip";
import { createTooltipContent } from "@/lib/tooltipShortcut";
import { useAriaKeyshortcuts, useKeybindingDisplay, useShortcutHintHover } from "@/hooks";
import { cn } from "@/lib/utils";
import { DaintreeIcon } from "@/components/icons/DaintreeIcon";
import { useFocusStore } from "@/store/focusStore";
import { useHelpPanelStore } from "@/store/helpPanelStore";
import { usePanelStore } from "@/store";
import { suppressSidebarResizes } from "@/lib/sidebarToggle";
import { useMcpReadiness } from "@/hooks/useMcpReadiness";
import type { McpRuntimeSnapshot } from "@shared/types";

const toolbarIconButtonClass = "toolbar-icon-button text-daintree-text relative";

interface PipDescriptor {
  className: string;
  delayed: boolean;
  tooltip: string;
}

function describePip(snapshot: McpRuntimeSnapshot): PipDescriptor | null {
  switch (snapshot.state) {
    case "starting":
      return {
        className: "bg-status-warning",
        delayed: true,
        tooltip: "MCP starting…",
      };
    case "failed":
      return {
        className: "bg-status-danger",
        delayed: false,
        tooltip: snapshot.lastError ?? "MCP failed to start",
      };
    case "ready":
    case "disabled":
    default:
      return null;
  }
}

export const ToolbarAssistantButton = memo(function ToolbarAssistantButton({
  "data-toolbar-item": dataToolbarItem,
}: {
  "data-toolbar-item"?: string;
}) {
  const isOpen = useHelpPanelStore((s) => s.isOpen);
  const toggle = useHelpPanelStore((s) => s.toggle);
  // Two-step primitive selectors so the button only re-renders when the
  // assistant terminal id changes, then when its agentState transitions in or
  // out of "working". Returning a primitive avoids needing useShallow.
  const assistantTerminalId = useHelpPanelStore((s) => s.terminalId);
  const isWorking = usePanelStore((s) =>
    assistantTerminalId ? s.panelsById[assistantTerminalId]?.agentState === "working" : false
  );
  const mcp = useMcpReadiness();
  const shortcut = useKeybindingDisplay("help.togglePanel");
  const ariaShortcut = useAriaKeyshortcuts("help.togglePanel");
  const hintHover = useShortcutHintHover("help.togglePanel");

  const handleClick = useCallback(() => {
    suppressSidebarResizes();
    useFocusStore.getState().clearAssistantGesture();
    toggle();
  }, [toggle]);

  const pip = describePip(mcp);
  // The MCP-health pip takes precedence — when it's showing, the working pip
  // would compete for the same corner. The neutral working dot is intentionally
  // non-pulsing and non-accent (per CLAUDE.md accent-color restraint) so it
  // reads as ambient state rather than a call to action.
  const showWorkingPip = !pip && isWorking && !isOpen;
  const baseTooltip = isOpen ? "Close Daintree Assistant" : "Open Daintree Assistant";
  const workingTooltip = "Assistant is working";
  const ariaLabel = pip
    ? `Daintree Assistant — ${pip.tooltip}`
    : showWorkingPip
      ? `Daintree Assistant — ${workingTooltip}`
      : "Daintree Assistant";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          {...hintHover}
          type="button"
          variant="ghost"
          size="icon"
          data-toolbar-item={dataToolbarItem}
          onClick={handleClick}
          className={toolbarIconButtonClass}
          aria-label={ariaLabel}
          aria-pressed={isOpen}
          aria-keyshortcuts={ariaShortcut}
        >
          <DaintreeIcon />
          {pip ? (
            <span
              aria-hidden="true"
              className={cn(
                "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-daintree-bg",
                pip.className,
                pip.delayed && "animate-pulse-delayed"
              )}
            />
          ) : (
            showWorkingPip && (
              <span
                aria-hidden="true"
                data-testid="assistant-working-pip"
                className={cn(
                  "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-daintree-bg",
                  "bg-daintree-text/30"
                )}
              />
            )
          )}
          <ShortcutRevealChip actionId="help.togglePanel" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {createTooltipContent(
          pip
            ? `${baseTooltip} — ${pip.tooltip}`
            : showWorkingPip
              ? `${baseTooltip} — ${workingTooltip}`
              : baseTooltip,
          shortcut
        )}
      </TooltipContent>
    </Tooltip>
  );
});
