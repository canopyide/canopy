import { useCallback } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useHelpPanelStore } from "@/store/helpPanelStore";

export function HelpAgentDockButton() {
  const isOpen = useHelpPanelStore((s) => s.isOpen);
  const toggle = useHelpPanelStore((s) => s.toggle);

  const handleClick = useCallback(() => {
    toggle();
  }, [toggle]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "opacity-50 hover:opacity-100 transition-opacity",
              isOpen && "opacity-100 bg-canopy-accent/10 text-canopy-accent"
            )}
            onClick={handleClick}
            aria-label="Help"
            aria-expanded={isOpen}
          >
            <CircleHelp />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {isOpen ? "Close help panel" : "Open help panel"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
