/**
 * EventFilters Component
 *
 * Filter controls for the event inspector including type filters and search.
 */

import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Search, X, Filter } from "lucide-react";
import type { EventRecord, EventFilterOptions } from "@/store/eventStore";

type FilterSubset = Pick<EventFilterOptions, "types" | "search" | "traceId">;

interface EventFiltersProps {
  events: EventRecord[];
  filters: FilterSubset;
  onFiltersChange: (filters: FilterSubset) => void;
  className?: string;
}

export function EventFilters({ events, filters, onFiltersChange, className }: EventFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search || "");
  const [traceIdInput, setTraceIdInput] = useState(filters.traceId || "");
  const [showTypeFilters, setShowTypeFilters] = useState(false);

  // Sync search input with filter changes from external sources
  useEffect(() => {
    setSearchInput(filters.search || "");
  }, [filters.search]);

  // Sync traceId input with filter changes from external sources
  useEffect(() => {
    setTraceIdInput(filters.traceId || "");
  }, [filters.traceId]);

  // Get unique event types from all events and compute counts
  const { availableTypes, typeCounts } = useMemo(() => {
    const types = new Set<string>();
    const counts = new Map<string, number>();

    events.forEach((event) => {
      types.add(event.type);
      counts.set(event.type, (counts.get(event.type) || 0) + 1);
    });

    return {
      availableTypes: Array.from(types).sort(),
      typeCounts: counts,
    };
  }, [events]);

  // Group types by category
  const groupedTypes = useMemo(() => {
    const groups: Record<string, string[]> = {
      system: [],
      agent: [],
      task: [],
      run: [],
      devserver: [],
      watcher: [],
      file: [],
      ui: [],
      other: [],
    };

    availableTypes.forEach((type) => {
      if (type.startsWith("sys:")) groups.system.push(type);
      else if (type.startsWith("agent:")) groups.agent.push(type);
      else if (type.startsWith("task:")) groups.task.push(type);
      else if (type.startsWith("run:")) groups.run.push(type);
      else if (type.startsWith("server:")) groups.devserver.push(type);
      else if (type.startsWith("watcher:")) groups.watcher.push(type);
      else if (type.startsWith("file:")) groups.file.push(type);
      else if (type.startsWith("ui:")) groups.ui.push(type);
      else groups.other.push(type);
    });

    // Remove empty groups
    Object.keys(groups).forEach((key) => {
      if (groups[key].length === 0) delete groups[key];
    });

    return groups;
  }, [availableTypes]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    onFiltersChange({ ...filters, search: value || undefined });
  };

  const clearSearch = () => {
    setSearchInput("");
    onFiltersChange({ ...filters, search: undefined });
  };

  const handleTraceIdChange = (value: string) => {
    setTraceIdInput(value);
    // Normalize: trim whitespace and lowercase for more forgiving matching
    const normalized = value.trim().toLowerCase();
    onFiltersChange({ ...filters, traceId: normalized || undefined });
  };

  const clearTraceId = () => {
    setTraceIdInput("");
    onFiltersChange({ ...filters, traceId: undefined });
  };

  const toggleTypeFilter = (type: string) => {
    const currentTypes = filters.types || [];
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter((t) => t !== type)
      : [...currentTypes, type];
    onFiltersChange({ ...filters, types: newTypes.length > 0 ? newTypes : undefined });
  };

  const clearTypeFilters = () => {
    onFiltersChange({ ...filters, types: undefined });
  };

  const activeFilterCount =
    (filters.types?.length || 0) + (filters.search ? 1 : 0) + (filters.traceId ? 1 : 0);

  return (
    <div className={cn("flex-shrink-0 border-b bg-background", className)}>
      {/* Search bar */}
      <div className="p-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search events..."
            className={cn(
              "w-full pl-9 pr-9 py-2 text-sm rounded-md",
              "bg-muted/50 border border-transparent",
              "focus:bg-background focus:border-primary focus:outline-none",
              "placeholder:text-muted-foreground"
            )}
          />
          {searchInput && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Trace ID filter */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground px-1">
            Trace ID (correlates related events)
          </label>
          <div className="relative">
            <input
              type="text"
              value={traceIdInput}
              onChange={(e) => handleTraceIdChange(e.target.value)}
              placeholder="Filter by trace ID..."
              className={cn(
                "w-full pl-3 pr-9 py-2 text-sm rounded-md font-mono",
                "bg-muted/50 border border-transparent",
                "focus:bg-background focus:border-primary focus:outline-none",
                "placeholder:text-muted-foreground placeholder:font-sans"
              )}
            />
            {traceIdInput && (
              <button
                onClick={clearTraceId}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filter toggle */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowTypeFilters(!showTypeFilters)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors",
              "hover:bg-muted/50",
              showTypeFilters && "bg-muted"
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Event Types</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded">
                {activeFilterCount}
              </span>
            )}
          </button>
          {filters.types && filters.types.length > 0 && (
            <button
              onClick={clearTypeFilters}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Type filters */}
      {showTypeFilters && (
        <div className="px-3 pb-3 space-y-3 max-h-64 overflow-y-auto">
          {Object.entries(groupedTypes).map(([category, types]) => (
            <div key={category} className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {category}
              </div>
              <div className="space-y-0.5">
                {types.map((type) => {
                  const isChecked = filters.types?.includes(type) || false;
                  return (
                    <label
                      key={type}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleTypeFilter(type)}
                        className="w-3.5 h-3.5 rounded border-muted-foreground/50"
                      />
                      <span className="text-sm font-mono truncate flex-1">{type}</span>
                      <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100">
                        {typeCounts.get(type) || 0}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
