import { LayoutGrid, Columns, Rows, AlertTriangle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useLayoutConfigStore,
  useScrollbackStore,
  useTerminalStore,
  usePerformanceModeStore,
} from "@/store";
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

const SCROLLBACK_PRESETS = [
  { value: 1000, label: "1k" },
  { value: 5000, label: "5k" },
  { value: 10000, label: "10k" },
  { value: -1, label: "Unlimited" },
] as const;

function calculateMemoryEstimate(lines: number, terminalCount: number): string {
  if (lines === -1) return "∞ (unlimited)";
  const bytesPerLine = 100;
  const bytesPerTerminal = lines * bytesPerLine;
  const totalMB = (bytesPerTerminal * terminalCount) / 1024 / 1024;
  return `~${totalMB.toFixed(1)}MB`;
}

export function TerminalSettingsTab() {
  const layoutConfig = useLayoutConfigStore((state) => state.layoutConfig);
  const setLayoutConfig = useLayoutConfigStore((state) => state.setLayoutConfig);
  const scrollbackLines = useScrollbackStore((state) => state.scrollbackLines);
  const setScrollbackLines = useScrollbackStore((state) => state.setScrollbackLines);
  const terminalCount = useTerminalStore((state) => state.terminals.length);
  const performanceMode = usePerformanceModeStore((state) => state.performanceMode);
  const setPerformanceMode = usePerformanceModeStore((state) => state.setPerformanceMode);

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

  const handleScrollbackPreset = async (value: number) => {
    setScrollbackLines(value);
    try {
      await terminalConfigClient.setScrollback(value);
    } catch (error) {
      console.error("Failed to persist scrollback setting:", error);
    }
  };

  const handleScrollbackInput = async (val: string) => {
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 100 && num <= 100000) {
      setScrollbackLines(num);
      try {
        await terminalConfigClient.setScrollback(num);
      } catch (error) {
        console.error("Failed to persist scrollback setting:", error);
      }
    }
  };

  const handlePerformanceModeToggle = async () => {
    const newValue = !performanceMode;
    try {
      await terminalConfigClient.setPerformanceMode(newValue);
      setPerformanceMode(newValue);
      // Update DOM attribute for CSS
      if (newValue) {
        document.body.setAttribute("data-performance-mode", "true");
      } else {
        document.body.removeAttribute("data-performance-mode");
      }
    } catch (error) {
      console.error("Failed to persist performance mode setting:", error);
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
            Optimize for running many terminals simultaneously. Reduces scrollback to 2,000 lines
            and disables animations.
          </p>
        </div>

        <button
          onClick={handlePerformanceModeToggle}
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
                {performanceMode ? "Performance Mode Enabled" : "Enable Performance Mode"}
              </div>
              <div className="text-xs opacity-70">
                {performanceMode
                  ? "Using 2k scrollback, animations disabled"
                  : "Recommended for 10+ concurrent terminals"}
              </div>
            </div>
          </div>
          <div
            className={cn(
              "w-11 h-6 rounded-full relative transition-colors",
              performanceMode ? "bg-amber-500" : "bg-canopy-border"
            )}
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
            New terminals will use reduced scrollback. Existing terminals are unchanged until
            respawned.
          </p>
        )}
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

      <div className="pt-4 border-t border-canopy-border space-y-4">
        <div>
          <h4 className="text-sm font-medium text-canopy-text mb-2">Scrollback Buffer</h4>
          <p className="text-xs text-canopy-text/50 mb-4">
            Number of lines each terminal keeps in its scrollback buffer. Lower values save memory
            when running many terminals.
          </p>
        </div>

        <div className="flex gap-2">
          {SCROLLBACK_PRESETS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handleScrollbackPreset(value)}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                scrollbackLines === value
                  ? value === -1
                    ? "bg-amber-500/10 border border-amber-500 text-amber-500"
                    : "bg-canopy-accent/10 border border-canopy-accent text-canopy-accent"
                  : value === -1
                    ? "border border-amber-500/50 hover:bg-amber-500/5 text-amber-500/80"
                    : "border border-canopy-border hover:bg-white/5 text-canopy-text/70"
              )}
            >
              {value === -1 && <AlertTriangle className="w-3 h-3" />}
              {label}
            </button>
          ))}
        </div>

        {scrollbackLines !== -1 && (
          <div className="space-y-2">
            <label className="text-sm text-canopy-text/70">Custom Value (100-100,000)</label>
            <input
              type="number"
              min="100"
              max="100000"
              value={scrollbackLines}
              onBlur={(e) => handleScrollbackInput(e.target.value)}
              onChange={(e) => {
                const num = parseInt(e.target.value, 10);
                if (!isNaN(num)) {
                  setScrollbackLines(num);
                }
              }}
              className="bg-canopy-bg border border-canopy-border rounded px-3 py-2 text-canopy-text w-full focus:border-canopy-accent focus:outline-none transition-colors"
            />
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-canopy-text/50">
          <span>
            Estimated memory (~100 bytes/line):{" "}
            {terminalCount > 0
              ? `${calculateMemoryEstimate(scrollbackLines, terminalCount)} for ${terminalCount} terminal${terminalCount > 1 ? "s" : ""}`
              : `${calculateMemoryEstimate(scrollbackLines, 1)} (assuming 1 terminal)`}
          </span>
        </div>

        {scrollbackLines === -1 && (
          <p className="text-xs text-amber-500/80 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" />
            Unlimited scrollback may cause high memory usage with active terminals.
          </p>
        )}

        <p className="text-xs text-canopy-text/40">
          Changes apply to new terminals only. Valid range: 100–100,000 lines.
        </p>
      </div>
    </div>
  );
}
