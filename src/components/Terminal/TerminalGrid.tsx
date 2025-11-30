/**
 * TerminalGrid Component
 *
 * Manages multiple terminal panes in a flexible grid layout.
 * Supports 1-N terminals with automatic column calculation,
 * focus management, and maximize/restore functionality.
 *
 * Layout examples:
 * - 1 terminal: Full width
 * - 2 terminals: 2 columns
 * - 3-4 terminals: 2x2 grid
 * - 5-6 terminals: 3x2 grid
 * - 7+ terminals: 3+ columns
 */

import { useMemo, useCallback, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useTerminalStore, type TerminalInstance } from "@/store";
import { useContextInjection } from "@/hooks/useContextInjection";
import { TerminalPane } from "./TerminalPane";
import { FilePickerModal } from "@/components/ContextInjection";
import { Terminal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TerminalGridProps {
  className?: string;
  defaultCwd?: string;
}

function EmptyState({ onAddTerminal }: { onAddTerminal: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-canopy-text/60">
      <Terminal className="h-12 w-12 mb-4 opacity-50" />
      <p className="mb-4 text-sm">No terminals open</p>
      <Button
        onClick={onAddTerminal}
        className="bg-canopy-accent hover:bg-canopy-accent/80 text-white"
      >
        <Plus className="h-4 w-4 mr-2" />
        Open Terminal
      </Button>
    </div>
  );
}

export function TerminalGrid({ className, defaultCwd }: TerminalGridProps) {
  // Use useShallow to prevent infinite loops when destructuring store state
  const { terminals, focusedId, maximizedId } = useTerminalStore(
    useShallow((state) => ({
      terminals: state.terminals,
      focusedId: state.focusedId,
      maximizedId: state.maximizedId,
    }))
  );

  // Get actions separately - these are stable references
  const addTerminal = useTerminalStore((state) => state.addTerminal);
  const removeTerminal = useTerminalStore((state) => state.removeTerminal);
  const updateTitle = useTerminalStore((state) => state.updateTitle);
  const setFocused = useTerminalStore((state) => state.setFocused);
  const toggleMaximize = useTerminalStore((state) => state.toggleMaximize);

  // Use context injection hook for progress tracking
  const { inject, cancel, isInjecting, progress } = useContextInjection();

  // File picker modal state
  const [filePickerState, setFilePickerState] = useState<{
    isOpen: boolean;
    worktreeId: string | null;
    terminalId: string | null;
  }>({
    isOpen: false,
    worktreeId: null,
    terminalId: null,
  });

  // Calculate grid columns based on terminal count
  // Use a dynamic formula that scales with terminal count
  const gridCols = useMemo(() => {
    const count = terminals.length;
    if (count <= 1) return 1;
    if (count <= 4) return 2;
    // For 5+ terminals, use ceiling of square root for balanced grid
    // This gives: 5-6 → 3 cols, 7-9 → 3 cols, 10-12 → 4 cols, etc.
    return Math.min(Math.ceil(Math.sqrt(count)), 4); // Cap at 4 columns max
  }, [terminals.length]);

  // Handle adding a new terminal
  const handleAddTerminal = useCallback(async () => {
    // Pass empty string if no defaultCwd; the Main process will handle the fallback to HOME
    const cwd = defaultCwd || "";
    await addTerminal({ type: "shell", cwd });
  }, [addTerminal, defaultCwd]);

  // Handle context injection - open file picker modal
  const handleInjectContext = useCallback((terminalId: string, worktreeId?: string) => {
    if (!worktreeId) return;
    setFilePickerState({
      isOpen: true,
      worktreeId,
      terminalId,
    });
  }, []);

  // Handle file picker confirmation
  const handleFilePickerConfirm = useCallback(
    async (selectedPaths: string[]) => {
      if (!filePickerState.terminalId || !filePickerState.worktreeId) return;

      // Close modal
      setFilePickerState({ isOpen: false, worktreeId: null, terminalId: null });

      // Inject with selected paths
      await inject(
        filePickerState.worktreeId,
        filePickerState.terminalId,
        selectedPaths.length > 0 ? selectedPaths : undefined
      );
    },
    [filePickerState, inject]
  );

  // Handle file picker cancel
  const handleFilePickerCancel = useCallback(() => {
    setFilePickerState({ isOpen: false, worktreeId: null, terminalId: null });
  }, []);

  // If maximized, only show that terminal
  if (maximizedId) {
    const terminal = terminals.find((t: TerminalInstance) => t.id === maximizedId);
    if (terminal) {
      return (
        <div className={cn("h-full", className)}>
          <TerminalPane
            id={terminal.id}
            title={terminal.title}
            type={terminal.type}
            worktreeId={terminal.worktreeId}
            cwd={terminal.cwd}
            isFocused={true}
            isMaximized={true}
            isInjecting={isInjecting}
            injectionProgress={progress}
            agentState={terminal.agentState}
            stateDebugInfo={
              terminal.stateChangeTrigger
                ? {
                    trigger: terminal.stateChangeTrigger,
                    confidence: terminal.stateChangeConfidence ?? 0,
                  }
                : null
            }
            onFocus={() => setFocused(terminal.id)}
            onClose={() => removeTerminal(terminal.id)}
            onInjectContext={
              terminal.worktreeId
                ? () => handleInjectContext(terminal.id, terminal.worktreeId)
                : undefined
            }
            onCancelInjection={cancel}
            onToggleMaximize={() => toggleMaximize(terminal.id)}
            onTitleChange={(newTitle) => updateTitle(terminal.id, newTitle)}
          />
        </div>
      );
    }
  }

  // Empty state
  if (terminals.length === 0) {
    return (
      <div className={cn("h-full", className)}>
        <EmptyState onAddTerminal={handleAddTerminal} />
      </div>
    );
  }

  return (
    <div
      className={cn("h-full bg-canopy-border", className)} // bg acts as divider lines
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gridAutoRows: "1fr",
        gap: "1px", // 1px gap reveals bg-canopy-border underneath = clean dividers
        padding: "0", // No outer padding
      }}
    >
      {terminals.map((terminal: TerminalInstance) => (
        <TerminalPane
          key={terminal.id}
          id={terminal.id}
          title={terminal.title}
          type={terminal.type}
          worktreeId={terminal.worktreeId}
          cwd={terminal.cwd}
          isFocused={terminal.id === focusedId}
          isMaximized={false}
          isInjecting={isInjecting}
          injectionProgress={progress}
          agentState={terminal.agentState}
          stateDebugInfo={
            terminal.stateChangeTrigger
              ? {
                  trigger: terminal.stateChangeTrigger,
                  confidence: terminal.stateChangeConfidence ?? 0,
                }
              : null
          }
          onFocus={() => setFocused(terminal.id)}
          onClose={() => removeTerminal(terminal.id)}
          onInjectContext={
            terminal.worktreeId
              ? () => handleInjectContext(terminal.id, terminal.worktreeId)
              : undefined
          }
          onCancelInjection={cancel}
          onToggleMaximize={() => toggleMaximize(terminal.id)}
          onTitleChange={(newTitle) => updateTitle(terminal.id, newTitle)}
        />
      ))}

      {/* File Picker Modal */}
      {filePickerState.worktreeId && (
        <FilePickerModal
          isOpen={filePickerState.isOpen}
          worktreeId={filePickerState.worktreeId}
          onConfirm={handleFilePickerConfirm}
          onCancel={handleFilePickerCancel}
        />
      )}
    </div>
  );
}

export default TerminalGrid;
