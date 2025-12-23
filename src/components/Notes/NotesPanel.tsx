import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import MDEditor from "@uiw/react-md-editor";
import { useNotesStateStore } from "@/store/notesStateStore";
import { useTerminalStore } from "@/store/terminalStore";
import { useWorktrees } from "@/hooks/useWorktrees";
import { debounce } from "@/utils/debounce";
import type { PanelComponentProps } from "@/registry/panelComponentRegistry";

interface NotesPanelProps extends PanelComponentProps {
  worktreeId?: string;
}

export function NotesPanel({ id, worktreeId }: NotesPanelProps) {
  const { getState: getNoteState, updateContent, clearState } = useNotesStateStore();
  const getTerminal = useTerminalStore((state) => state.getTerminal);
  const { worktrees } = useWorktrees();

  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const previousWorktreePathRef = useRef<string | undefined>();

  const terminal = getTerminal(id);
  const effectiveWorktreeId = worktreeId || terminal?.worktreeId;
  const worktree = worktrees.find((wt) => wt.id === effectiveWorktreeId);
  const worktreePath = worktree?.path;

  const noteState = getNoteState(id);
  const content = noteState?.content ?? "";

  useEffect(() => {
    if (worktreePath && worktreePath !== previousWorktreePathRef.current) {
      setHasLoaded(false);
      setLoadError(null);
      clearState(id);
      previousWorktreePathRef.current = worktreePath;
    }
  }, [worktreePath, id, clearState]);

  const debouncedSave = useMemo(() => {
    if (!worktreePath) return null;

    return debounce(async (newContent: string) => {
      if (!mountedRef.current) return;

      try {
        await window.electron.notes.write({
          worktreePath,
          content: newContent,
        });
      } catch (error) {
        console.error("Failed to save notes:", error);
      }
    }, 800);
  }, [worktreePath]);

  useEffect(() => {
    if (!worktreePath || hasLoaded) return;

    const loadNotes = async () => {
      try {
        const savedContent = await window.electron.notes.read({ worktreePath });
        if (!mountedRef.current) return;

        if (savedContent && !noteState?.content) {
          updateContent(id, savedContent);
        }
        setHasLoaded(true);
        setLoadError(null);
      } catch (error) {
        console.error("Failed to load notes:", error);
        if (!mountedRef.current) return;
        setLoadError(error instanceof Error ? error.message : "Failed to load notes");
        setHasLoaded(false);
      }
    };

    loadNotes();
  }, [worktreePath, hasLoaded, id, noteState?.content, updateContent]);

  useEffect(() => {
    if (!debouncedSave || !hasLoaded || loadError) return;

    debouncedSave(content);
  }, [content, debouncedSave, hasLoaded, loadError]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      debouncedSave?.flush();
    };
  }, [debouncedSave]);

  const handleChange = useCallback(
    (value?: string) => {
      updateContent(id, value ?? "");
    },
    [id, updateContent]
  );

  if (!worktreePath) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        No worktree associated with this panel
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center text-red-500">
        <div className="text-center">
          <p className="mb-2">Failed to load notes</p>
          <p className="text-sm text-gray-500">{loadError}</p>
          <button
            onClick={() => {
              setLoadError(null);
              setHasLoaded(false);
            }}
            className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden" data-color-mode="dark">
      <MDEditor
        value={content}
        onChange={handleChange}
        preview="edit"
        height="100%"
        visibleDragbar={false}
      />
    </div>
  );
}
