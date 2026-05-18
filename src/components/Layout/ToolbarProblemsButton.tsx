import { Button } from "@/components/ui/button";
import { AlertCircle, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ShortcutRevealChip } from "@/components/ui/ShortcutRevealChip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { createTooltipContent } from "@/lib/tooltipShortcut";
import { useAriaKeyshortcuts, useKeybindingDisplay, useShortcutHintHover } from "@/hooks";
import { useDiagnosticsStore } from "@/store/diagnosticsStore";
import { useToolbarPreferencesStore } from "@/store/toolbarPreferencesStore";
import { DIAGNOSTICS_DOCK_REGION_ID } from "@/components/Diagnostics/DiagnosticsDock";

const toolbarIconButtonClass = "toolbar-icon-button text-daintree-text";

interface ToolbarProblemsButtonProps {
  errorCount: number;
  onToggleProblems?: () => void;
  "data-toolbar-item"?: string;
}

export function ToolbarProblemsButton({
  errorCount,
  onToggleProblems,
  "data-toolbar-item": dataToolbarItem,
}: ToolbarProblemsButtonProps) {
  const diagnosticsShortcut = useKeybindingDisplay("panel.toggleDiagnostics");
  const diagnosticsAriaShortcut = useAriaKeyshortcuts("panel.toggleDiagnostics");
  const diagnosticsHover = useShortcutHintHover("panel.toggleDiagnostics");
  const isDockOpen = useDiagnosticsStore((state) => state.isOpen);
  const toggleButtonVisibility = useToolbarPreferencesStore((s) => s.toggleButtonVisibility);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              {...diagnosticsHover}
              variant="ghost"
              size="icon"
              data-toolbar-item={dataToolbarItem}
              onClick={onToggleProblems}
              className={cn(toolbarIconButtonClass, "relative")}
              aria-label={`Problems: ${errorCount} error${errorCount !== 1 ? "s" : ""}`}
              aria-keyshortcuts={diagnosticsAriaShortcut}
              aria-expanded={isDockOpen}
              aria-controls={DIAGNOSTICS_DOCK_REGION_ID}
            >
              <AlertCircle />
              <span
                data-visible={errorCount > 0}
                className="toolbar-problems-badge toolbar-badge absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
              />
              <ShortcutRevealChip actionId="panel.toggleDiagnostics" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {createTooltipContent("Show Problems Panel", diagnosticsShortcut)}
          </TooltipContent>
        </Tooltip>
      </ContextMenuTrigger>
      <ContextMenuContent className="max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto">
        <ContextMenuItem onSelect={() => toggleButtonVisibility("problems", "right")}>
          <Unplug className="mr-2 h-3.5 w-3.5" />
          Unpin from Toolbar
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
