import { useMemo, type ComponentType } from "react";
import { Puzzle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getBrandColorHex } from "@/lib/colorUtils";
import { getAgentConfig, type AgentIconProps } from "@/config/agents";
import { actionService } from "@/services/ActionService";
import { useAgentSettingsStore } from "@/store/agentSettingsStore";
import { BUILT_IN_AGENT_IDS, type BuiltInAgentId } from "@shared/config/agentIds";
import type { AgentSettings, CliAvailability } from "@shared/types";
import { isAgentInstalled, isAgentMissing } from "../../../shared/utils/agentAvailability";

interface AgentTrayButtonProps {
  agentAvailability?: CliAvailability;
  agentSettings?: AgentSettings | null;
  "data-toolbar-item"?: string;
}

type AgentRow = {
  id: BuiltInAgentId;
  name: string;
  Icon: ComponentType<AgentIconProps>;
};

function buildAgentRow(id: BuiltInAgentId): AgentRow | null {
  const config = getAgentConfig(id);
  if (!config) return null;
  return { id, name: config.name, Icon: config.icon };
}

export function AgentTrayButton({
  agentAvailability,
  agentSettings,
  "data-toolbar-item": dataToolbarItem,
}: AgentTrayButtonProps) {
  const setAgentSelected = useAgentSettingsStore((s) => s.setAgentSelected);

  const { installedUnpinned, installedAll, notInstalled } = useMemo(() => {
    const installedUnpinned: AgentRow[] = [];
    const installedAll: AgentRow[] = [];
    const notInstalled: AgentRow[] = [];

    for (const id of BUILT_IN_AGENT_IDS) {
      const row = buildAgentRow(id);
      if (!row) continue;

      const availabilityState = agentAvailability?.[id];
      const installed = isAgentInstalled(availabilityState);
      const missing = availabilityState !== undefined && isAgentMissing(availabilityState);
      const pinned = agentSettings?.agents?.[id]?.selected !== false;

      if (installed) {
        installedAll.push(row);
        if (!pinned) installedUnpinned.push(row);
      } else if (missing) {
        notInstalled.push(row);
      }
    }

    return { installedUnpinned, installedAll, notInstalled };
  }, [agentAvailability, agentSettings]);

  const handleLaunch = (agentId: BuiltInAgentId) => {
    void actionService.dispatch("agent.launch", { agentId }, { source: "user" });
  };

  const handleTogglePin = (agentId: BuiltInAgentId, checked: boolean) => {
    void setAgentSelected(agentId, checked);
  };

  const handleSetup = (agentId: BuiltInAgentId) => {
    void actionService.dispatch(
      "app.settings.openTab",
      { tab: "agents", subtab: agentId },
      { source: "user" }
    );
  };

  const hasAnyContent =
    installedUnpinned.length > 0 || installedAll.length > 0 || notInstalled.length > 0;

  return (
    <DropdownMenu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-toolbar-item={dataToolbarItem}
                className="toolbar-agent-button text-canopy-text hover:text-[var(--toolbar-control-hover-fg,var(--theme-accent-primary))] focus-visible:text-[var(--toolbar-control-hover-fg,var(--theme-accent-primary))] transition-colors"
                aria-label="Agent tray"
              >
                <Puzzle />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Agent Tray</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="start" sideOffset={4} className="min-w-[14rem]">
        {!hasAnyContent && (
          <div className="px-2.5 py-2 text-xs text-canopy-text/60">No agents available</div>
        )}

        {installedUnpinned.length > 0 && (
          <>
            <DropdownMenuLabel>Launch</DropdownMenuLabel>
            {installedUnpinned.map((row) => (
              <DropdownMenuItem key={`launch-${row.id}`} onSelect={() => handleLaunch(row.id)}>
                <span className="mr-2 inline-flex h-4 w-4 items-center justify-center">
                  <row.Icon brandColor={getBrandColorHex(row.id)} />
                </span>
                {row.name}
              </DropdownMenuItem>
            ))}
          </>
        )}

        {installedAll.length > 0 && (
          <>
            {installedUnpinned.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>Pin to Toolbar</DropdownMenuLabel>
            {installedAll.map((row) => {
              const pinned = agentSettings?.agents?.[row.id]?.selected !== false;
              return (
                <DropdownMenuCheckboxItem
                  key={`pin-${row.id}`}
                  checked={pinned}
                  onCheckedChange={(checked) => handleTogglePin(row.id, checked === true)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {row.name}
                </DropdownMenuCheckboxItem>
              );
            })}
          </>
        )}

        {notInstalled.length > 0 && (
          <>
            {(installedUnpinned.length > 0 || installedAll.length > 0) && <DropdownMenuSeparator />}
            <DropdownMenuLabel>Not Installed</DropdownMenuLabel>
            {notInstalled.map((row) => (
              <DropdownMenuItem key={`setup-${row.id}`} onSelect={() => handleSetup(row.id)}>
                <span className="mr-2 inline-flex h-4 w-4 items-center justify-center opacity-60">
                  <row.Icon brandColor={getBrandColorHex(row.id)} />
                </span>
                <span className="flex-1">{row.name}</span>
                <span className="ml-2 text-[11px] text-canopy-text/60">Set up</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
