import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface FileAutocompleteMenuProps {
  isOpen: boolean;
  files: string[];
  selectedIndex: number;
  isLoading: boolean;
  onSelect: (file: string) => void;
  style?: React.CSSProperties;
}

export const FileAutocompleteMenu = forwardRef<HTMLDivElement, FileAutocompleteMenuProps>(
  ({ isOpen, files, selectedIndex, isLoading, onSelect, style }, ref) => {
    if (!isOpen) return null;
    if (!isLoading && files.length === 0) return null;

    return (
      <div
        ref={ref}
        className={cn(
          "absolute bottom-full mb-0 w-[420px] max-w-[calc(100vw-16px)] overflow-hidden rounded-md border border-white/10 bg-[var(--color-surface)] shadow-2xl",
          "z-50"
        )}
        style={style}
        role="listbox"
        aria-label="File autocomplete"
      >
        <div className="max-h-64 overflow-y-auto p-1">
          {isLoading && files.length === 0 && (
            <div className="px-2 py-2 text-xs font-mono text-canopy-text/40">Searching…</div>
          )}

          {files.map((file, idx) => (
            <button
              key={file}
              type="button"
              role="option"
              aria-selected={idx === selectedIndex}
              className={cn(
                "flex w-full items-center rounded-sm px-2 py-1.5 text-left font-mono text-xs leading-4 transition-colors",
                idx === selectedIndex
                  ? "bg-canopy-accent/20 text-canopy-text"
                  : "text-canopy-text/70 hover:bg-white/[0.05] hover:text-canopy-text"
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(file)}
              title={file}
            >
              <span className="truncate">{file}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
);

FileAutocompleteMenu.displayName = "FileAutocompleteMenu";
