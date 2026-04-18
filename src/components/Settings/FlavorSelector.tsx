import { useMemo, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AgentFlavor } from "@/config/agents";

/**
 * Flavor selector — replaces the native `<select>` + `<optgroup>` that can't
 * render color swatches inline. Uses a Popover listbox following the
 * AgentSelectorDropdown pattern, so we get color dots per flavor name and
 * grouped sections ("CCR Routes" / "Custom") with proper visual separation.
 *
 * No search input — flavor lists are small (typically 2-6 items). If this
 * grows past ~15 the AgentSelectorDropdown filter pattern can be ported.
 */

export interface FlavorSelectorProps {
  selectedFlavorId: string | undefined;
  allFlavors: AgentFlavor[];
  ccrFlavors: AgentFlavor[];
  customFlavors: AgentFlavor[];
  onChange: (flavorId: string | undefined) => void;
  agentColor: string;
}

type Item = { id: string; label: string; color: string; source: "vanilla" | "ccr" | "custom" };

function stripCcrPrefix(name: string): string {
  return name.replace(/^CCR:\s*/, "");
}

export function FlavorSelector({
  selectedFlavorId,
  allFlavors: _allFlavors,
  ccrFlavors,
  customFlavors,
  onChange,
  agentColor,
}: FlavorSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedItem = useMemo((): Item => {
    if (!selectedFlavorId) {
      return { id: "", label: "Vanilla (no overrides)", color: agentColor, source: "vanilla" };
    }
    const ccr = ccrFlavors.find((f) => f.id === selectedFlavorId);
    if (ccr) {
      return {
        id: ccr.id,
        label: stripCcrPrefix(ccr.name),
        color: ccr.color ?? agentColor,
        source: "ccr",
      };
    }
    const custom = customFlavors.find((f) => f.id === selectedFlavorId);
    if (custom) {
      return {
        id: custom.id,
        label: custom.name,
        color: custom.color ?? agentColor,
        source: "custom",
      };
    }
    // Stale selection — fall back to vanilla presentation but don't clear
    // state here (the parent clears stale IDs on launch).
    return { id: "", label: "Vanilla (no overrides)", color: agentColor, source: "vanilla" };
  }, [selectedFlavorId, ccrFlavors, customFlavors, agentColor]);

  const handleSelect = (id: string) => {
    onChange(id || undefined);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            "flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-[var(--radius-md)]",
            "border border-border-strong bg-daintree-bg text-daintree-text",
            "hover:border-daintree-accent/50 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-daintree-accent/50"
          )}
          data-testid="flavor-selector-trigger"
        >
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 border border-daintree-border/60"
            style={{ backgroundColor: selectedItem.color }}
            aria-hidden="true"
          />
          <span className="flex-1 text-left truncate">{selectedItem.label}</span>
          {selectedItem.source === "ccr" && (
            <span
              className="text-[9px] uppercase tracking-wide text-daintree-text/40 bg-daintree-text/5 px-1 py-0.5 rounded shrink-0"
              aria-hidden="true"
            >
              CCR
            </span>
          )}
          <ChevronDown
            size={14}
            className={cn(
              "shrink-0 text-daintree-text/40 transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-1"
        style={{ width: "var(--radix-popover-trigger-width)" }}
        data-testid="flavor-selector-listbox"
      >
        <div role="listbox" aria-label="Flavor" className="overflow-y-auto max-h-80">
          <FlavorOption
            id=""
            label="Vanilla (no overrides)"
            color={agentColor}
            isSelected={!selectedFlavorId}
            onSelect={handleSelect}
            testid="flavor-option-vanilla"
          />
          {ccrFlavors.length > 0 && (
            <>
              <Divider label="CCR Routes" />
              {ccrFlavors.map((f) => (
                <FlavorOption
                  key={f.id}
                  id={f.id}
                  label={stripCcrPrefix(f.name)}
                  color={f.color ?? agentColor}
                  badge="CCR"
                  isSelected={selectedFlavorId === f.id}
                  onSelect={handleSelect}
                  testid={`flavor-option-${f.id}`}
                />
              ))}
            </>
          )}
          {customFlavors.length > 0 && (
            <>
              <Divider label="Custom" />
              {customFlavors.map((f) => (
                <FlavorOption
                  key={f.id}
                  id={f.id}
                  label={f.name}
                  color={f.color ?? agentColor}
                  isSelected={selectedFlavorId === f.id}
                  onSelect={handleSelect}
                  testid={`flavor-option-${f.id}`}
                />
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div
      className="px-2 pt-1.5 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-daintree-text/40"
      data-testid={`flavor-group-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {label}
    </div>
  );
}

function FlavorOption({
  id,
  label,
  color,
  badge,
  isSelected,
  onSelect,
  testid,
}: {
  id: string;
  label: string;
  color: string;
  badge?: string;
  isSelected: boolean;
  onSelect: (id: string) => void;
  testid?: string;
}) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      data-testid={testid}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(id);
        }
      }}
      tabIndex={0}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] cursor-pointer text-sm",
        "hover:bg-daintree-accent/10 focus:bg-daintree-accent/10 focus:outline-none",
        isSelected && "text-daintree-accent"
      )}
    >
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0 border border-daintree-border/60"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span
          className="text-[9px] uppercase tracking-wide text-daintree-text/40 bg-daintree-text/5 px-1 py-0.5 rounded"
          aria-hidden="true"
        >
          {badge}
        </span>
      )}
      {isSelected && <Check size={12} className="shrink-0" aria-hidden="true" />}
    </div>
  );
}
