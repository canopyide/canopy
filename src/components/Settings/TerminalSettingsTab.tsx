import { LayoutGrid, Columns, Rows } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayoutConfigStore } from "@/store";
import { appClient } from "@/clients";
import type { TerminalLayoutStrategy, TerminalGridConfig } from "@/types";

const STRATEGIES: Array<{
  id: TerminalLayoutStrategy;
  label: string;
  description: string;
  icon: typeof LayoutGrid;
}> = [
  {
    id: "automatic",
    label: "Automatic",
    description: "Smart Grid",
    icon: LayoutGrid,
  },
  {
    id: "fixed-columns",
    label: "Fixed Columns",
    description: "Vertical Scroll",
    icon: Columns,
  },
  {
    id: "fixed-rows",
    label: "Fixed Rows",
    description: "Horizontal Expand",
    icon: Rows,
  },
];

export function TerminalSettingsTab() {
  const layoutConfig = useLayoutConfigStore((state) => state.layoutConfig);
  const setLayoutConfig = useLayoutConfigStore((state) => state.setLayoutConfig);

  const handleStrategyChange = (strategy: TerminalLayoutStrategy) => {
    const newConfig: TerminalGridConfig = { ...layoutConfig, strategy };
    setLayoutConfig(newConfig);
    appClient.setState({ terminalGridConfig: newConfig });
  };

  const handleValueChange = (val: string) => {
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 1 && num <= 10) {
      const newConfig: TerminalGridConfig = { ...layoutConfig, value: num };
      setLayoutConfig(newConfig);
      appClient.setState({ terminalGridConfig: newConfig });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-medium text-canopy-text mb-2">Grid Layout Strategy</h4>
        <p className="text-xs text-canopy-text/50 mb-4">
          Control how terminals arrange in the grid as you add more.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {STRATEGIES.map(({ id, label, description, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleStrategyChange(id)}
            className={cn(
              "flex flex-col items-center justify-center p-4 rounded-md border transition-all",
              layoutConfig.strategy === id
                ? "bg-canopy-accent/10 border-canopy-accent text-canopy-accent"
                : "border-canopy-border hover:bg-white/5 text-canopy-text/70"
            )}
          >
            <Icon className="w-6 h-6 mb-2" />
            <span className="text-xs font-medium">{label}</span>
            <span className="text-[10px] text-center mt-1 opacity-60">{description}</span>
          </button>
        ))}
      </div>

      {layoutConfig.strategy !== "automatic" && (
        <div className="space-y-2">
          <label className="text-sm text-canopy-text/70">
            {layoutConfig.strategy === "fixed-columns" ? "Number of Columns" : "Number of Rows"}
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={layoutConfig.value}
            onChange={(e) => handleValueChange(e.target.value)}
            className="bg-canopy-bg border border-canopy-border rounded px-3 py-2 text-canopy-text w-full focus:border-canopy-accent focus:outline-none transition-colors"
          />
          <p className="text-xs text-canopy-text/40">
            {layoutConfig.strategy === "fixed-columns"
              ? "Terminals will stack vertically when this many columns are filled."
              : "Terminals will expand horizontally when this many rows are filled."}
          </p>
        </div>
      )}

      <div className="pt-4 border-t border-canopy-border">
        <h5 className="text-xs font-medium text-canopy-text mb-2">Current Strategy</h5>
        <p className="text-xs text-canopy-text/50 leading-relaxed">
          {layoutConfig.strategy === "automatic" &&
            "Uses a balanced square grid that adapts to the number of terminals (1-4 terminals use 2 columns, 5+ use up to 4 columns)."}
          {layoutConfig.strategy === "fixed-columns" &&
            `Maintains exactly ${layoutConfig.value} column${layoutConfig.value > 1 ? "s" : ""}, adding new rows as you open more terminals.`}
          {layoutConfig.strategy === "fixed-rows" &&
            `Maintains exactly ${layoutConfig.value} row${layoutConfig.value > 1 ? "s" : ""}, adding new columns as you open more terminals.`}
        </p>
      </div>
    </div>
  );
}
