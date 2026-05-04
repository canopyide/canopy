import { memo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ShortcutRevealChip } from "@/components/ui/ShortcutRevealChip";
import { createTooltipContent } from "@/lib/tooltipShortcut";
import { useKeybindingDisplay, useShortcutHintHover } from "@/hooks";
import { cn } from "@/lib/utils";
import { DaintreeIcon } from "@/components/icons/DaintreeIcon";
import { useFocusStore } from "@/store/focusStore";
import { useHelpPanelStore } from "@/store/helpPanelStore";
import { suppressSidebarResizes } from "@/lib/sidebarToggle";
import { useMcpReadiness } from "@/hooks/useMcpReadiness";
import type { McpRuntimeSnapshot } from "@shared/types";

const toolbarIconButtonClass = "toolbar-icon-button text-daintree-text transition-colors relative";

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
  const mcp = useMcpReadiness();
  const shortcut = useKeybindingDisplay("help.togglePanel");
  const hintHover = useShortcutHintHover("help.togglePanel");

  const handleClick = useCallback(() => {
    suppressSidebarResizes();
    useFocusStore.getState().clearAssistantGesture();
    toggle();
  }, [toggle]);

  const pip = describePip(mcp);
  const baseTooltip = isOpen ? "Close Daintree Assistant" : "Open Daintree Assistant";
  const ariaLabel = pip ? `Daintree Assistant — ${pip.tooltip}` : "Daintree Assistant";

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
        >
          <DaintreeIcon />
          {pip && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-daintree-bg",
                pip.className,
                pip.delayed && "animate-pulse-delayed"
              )}
            />
          )}
          <ShortcutRevealChip actionId="help.togglePanel" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {createTooltipContent(pip ? `${baseTooltip} — ${pip.tooltip}` : baseTooltip, shortcut)}
      </TooltipContent>
    </Tooltip>
  );
});
