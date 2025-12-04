import { LayoutGrid, Columns, Rows, AlertTriangle, Zap, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayoutConfigStore, usePerformanceModeStore, useTerminalStore } from "@/store";
import {
  AUTO_ENABLE_THRESHOLD_MIN,
  AUTO_ENABLE_THRESHOLD_MAX,
} from "@/store/performanceModeStore";
import { appClient, terminalConfigClient } from "@/clients";
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
  const performanceMode = usePerformanceModeStore((state) => state.performanceMode);
  const autoEnabled = usePerformanceModeStore((state) => state.autoEnabled);
  const autoEnableThreshold = usePerformanceModeStore((state) => state.autoEnableThreshold);
  const enablePerformanceMode = usePerformanceModeStore((state) => state.enablePerformanceMode);
  const disablePerformanceMode = usePerformanceModeStore((state) => state.disablePerformanceMode);
  const setAutoEnableThreshold = usePerformanceModeStore((state) => state.setAutoEnableThreshold);
  const terminalCount = useTerminalStore((state) => state.terminals.length);

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

  const handlePerformanceModeToggle = async () => {
    const newValue = !performanceMode;
    try {
      await terminalConfigClient.setPerformanceMode(newValue);
      if (newValue) {
        enablePerformanceMode(false);
        document.body.setAttribute("data-performance-mode", "true");
      } else {
        disablePerformanceMode();
        document.body.removeAttribute("data-performance-mode");
      }
    } catch (error) {
      console.error("Failed to persist performance mode setting:", error);
    }
  };

  const handleThresholdChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setAutoEnableThreshold(value);
      try {
        await appClient.setState({ performanceModeAutoEnableThreshold: value });
      } catch (error) {
        console.error("Failed to persist auto-enable threshold:", error);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-canopy-text mb-2 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Performance Mode
          </h4>
          <p className="text-xs text-canopy-text/50 mb-4">
            Optimize for high-density workflows. Reduces visual overhead for smoother performance
            with many active agents. Auto-enables at {autoEnableThreshold}+ terminals.
          </p>
        </div>

        <div className="flex items-center gap-2 p-3 rounded-lg bg-canopy-bg/50 border border-canopy-border">
          <Monitor className="w-4 h-4 text-canopy-text/50" />
          <span className="text-sm text-canopy-text/70">Active terminals:</span>
          <span
            className={cn(
              "text-sm font-medium",
              terminalCount >= autoEnableThreshold ? "text-amber-500" : "text-canopy-text"
            )}
          >
            {terminalCount}
          </span>
          <span className="text-sm text-canopy-text/50">/ {autoEnableThreshold} threshold</span>
        </div>

        <button
          onClick={handlePerformanceModeToggle}
          role="switch"
          aria-checked={performanceMode}
          aria-label="Performance Mode Toggle"
          className={cn(
            "w-full flex items-center justify-between p-4 rounded-lg border transition-all",
            performanceMode
              ? "bg-amber-500/10 border-amber-500 text-amber-500"
              : "border-canopy-border hover:bg-white/5 text-canopy-text/70"
          )}
        >
          <div className="flex items-center gap-3">
            <Zap
              className={cn("w-5 h-5", performanceMode ? "text-amber-500" : "text-canopy-text/50")}
            />
            <div className="text-left">
              <div className="text-sm font-medium">
                {performanceMode
                  ? autoEnabled
                    ? "Performance Mode (Auto-Enabled)"
                    : "Performance Mode Enabled"
                  : "Enable Performance Mode"}
              </div>
              <div className="text-xs opacity-70">
                {performanceMode
                  ? "100 line scrollback (viewport only), animations disabled"
                  : "1,000 line scrollback, animations enabled"}
              </div>
            </div>
          </div>
          <div
            className={cn(
              "w-11 h-6 rounded-full relative transition-colors",
              performanceMode ? "bg-amber-500" : "bg-canopy-border"
            )}
            aria-hidden="true"
          >
            <div
              className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                performanceMode ? "translate-x-6" : "translate-x-1"
              )}
            />
          </div>
        </button>

        {performanceMode && (
          <p className="text-xs text-amber-500/80 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" />
            {autoEnabled
              ? `Auto-enabled at ${autoEnableThreshold} terminals. Toggle off to override, or adjust the threshold below.`
              : "New terminals will use reduced scrollback. Existing terminals are unchanged until respawned."}
          </p>
        )}

        <div className="space-y-2">
          <label htmlFor="threshold-input" className="text-sm text-canopy-text/70">
            Auto-Enable Threshold
          </label>
          <input
            id="threshold-input"
            type="number"
            min={AUTO_ENABLE_THRESHOLD_MIN}
            max={AUTO_ENABLE_THRESHOLD_MAX}
            value={autoEnableThreshold}
            onChange={handleThresholdChange}
            aria-describedby="threshold-help"
            className="bg-canopy-bg border border-canopy-border rounded px-3 py-2 text-canopy-text w-full focus:border-canopy-accent focus:outline-none transition-colors"
          />
          <p id="threshold-help" className="text-xs text-canopy-text/40">
            Performance mode auto-enables when terminal count reaches this threshold (
            {AUTO_ENABLE_THRESHOLD_MIN}-{AUTO_ENABLE_THRESHOLD_MAX}).
          </p>
        </div>
      </div>

      <div className="pt-4 border-t border-canopy-border">
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
