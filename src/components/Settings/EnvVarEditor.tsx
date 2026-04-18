import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inline env var CRUD editor with validation.
 *
 * Draft rows are the source of truth during editing — we can't represent an
 * in-progress duplicate key as a JS object, so we keep an array of
 * `{rowId, key, value}` and serialize back to a `Record<string, string>`
 * only when all keys are unique and non-empty.
 *
 * Validation surfaces:
 *  - Empty key after trim → red border on the key input + "Key required"
 *    message below. Blur on an empty key does NOT persist.
 *  - Duplicate key → amber border on both matching key inputs + "Duplicate key"
 *    message. The second occurrence is not persisted until the user resolves it.
 */

export interface EnvVarSuggestion {
  key: string;
  hint: string;
}

export interface EnvVarEditorProps {
  /** Current env var map (source of truth from parent). */
  env: Record<string, string>;
  /** Called with the new map when a valid change occurs. Empty map → {}. */
  onChange: (env: Record<string, string>) => void;
  /** Optional datalist of suggested KEY names to speed up common setups. */
  suggestions?: EnvVarSuggestion[];
  /** HTML id used for the shared datalist element (must be unique per page). */
  datalistId?: string;
  /** Optional "keyed" identity (e.g. presetId) — used to reset draft rows when the parent context changes. */
  contextKey?: string;
  /** Placeholder text for the value input. */
  valuePlaceholder?: string;
  /** Optional data-testid for the whole editor surface. */
  "data-testid"?: string;
}

interface DraftRow {
  rowId: string;
  key: string;
  value: string;
}

let rowIdCounter = 0;
function nextRowId(): string {
  rowIdCounter += 1;
  return `row-${rowIdCounter}`;
}

function envToDraft(env: Record<string, string>): DraftRow[] {
  return Object.entries(env).map(([key, value]) => ({
    rowId: nextRowId(),
    key,
    value,
  }));
}

function draftToEnv(rows: DraftRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const k = row.key.trim();
    if (!k) continue;
    if (seen.has(k)) continue; // drop duplicates — the validation surface warns the user
    seen.add(k);
    out[k] = row.value;
  }
  return out;
}

function findDuplicateKeys(rows: DraftRow[]): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const k = row.key.trim();
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const dups = new Set<string>();
  for (const [k, n] of counts) {
    if (n > 1) dups.add(k);
  }
  return dups;
}

function isValid(rows: DraftRow[]): boolean {
  const seen = new Set<string>();
  for (const row of rows) {
    const k = row.key.trim();
    if (!k) return false;
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}

export function EnvVarEditor({
  env,
  onChange,
  suggestions,
  datalistId,
  contextKey,
  valuePlaceholder = "value or ${ENV_VAR}",
  "data-testid": dataTestId,
}: EnvVarEditorProps) {
  const [rows, setRows] = useState<DraftRow[]>(() => envToDraft(env));
  // Track which keys have been "touched" (blurred or modified after creation) —
  // we suppress the empty-key error for newly added rows until first blur.
  const [touchedKeys, setTouchedKeys] = useState<Record<string, boolean>>({});
  const lastEnvRef = useRef<Record<string, string>>(env);
  const lastContextKeyRef = useRef<string | undefined>(contextKey);

  // When the parent's env changes externally (different preset selected,
  // programmatic reset), reseed the draft rows. We use a shallow compare on
  // keys+values so typing a value doesn't trigger a reseed.
  useEffect(() => {
    const curKeys = Object.keys(env).sort().join("\x00");
    const curVals = Object.keys(env)
      .sort()
      .map((k) => env[k])
      .join("\x00");
    const prevKeys = Object.keys(lastEnvRef.current).sort().join("\x00");
    const prevVals = Object.keys(lastEnvRef.current)
      .sort()
      .map((k) => lastEnvRef.current[k])
      .join("\x00");
    const contextChanged = lastContextKeyRef.current !== contextKey;
    if (contextChanged || curKeys !== prevKeys || curVals !== prevVals) {
      lastEnvRef.current = env;
      lastContextKeyRef.current = contextKey;
      if (contextChanged) {
        setTouchedKeys({});
      }
      // Only reseed if the incoming env is actually different from what our
      // draft would produce. Otherwise typing triggers a parent update that
      // would otherwise stomp the user's in-progress edit.
      const draftAsEnv = draftToEnv(rows);
      const draftKeys = Object.keys(draftAsEnv).sort().join("\x00");
      const draftVals = Object.keys(draftAsEnv)
        .sort()
        .map((k) => draftAsEnv[k])
        .join("\x00");
      if (contextChanged || draftKeys !== curKeys || draftVals !== curVals) {
        setRows(envToDraft(env));
      }
    }
  }, [env, contextKey, rows]);

  const commitIfValid = useCallback(
    (nextRows: DraftRow[]) => {
      if (isValid(nextRows)) {
        const nextEnv = draftToEnv(nextRows);
        const prev = lastEnvRef.current;
        const prevKeys = Object.keys(prev).sort().join("\x00");
        const nextKeys = Object.keys(nextEnv).sort().join("\x00");
        const prevVals = Object.keys(prev)
          .sort()
          .map((k) => prev[k])
          .join("\x00");
        const nextVals = Object.keys(nextEnv)
          .sort()
          .map((k) => nextEnv[k])
          .join("\x00");
        if (prevKeys !== nextKeys || prevVals !== nextVals) {
          lastEnvRef.current = nextEnv;
          onChange(nextEnv);
        }
      }
    },
    [onChange]
  );

  const handleAdd = useCallback(() => {
    setRows((prev) => {
      // Pick a KEY name that isn't already present.
      let candidate = "NEW_VAR";
      let i = 1;
      const present = new Set(prev.map((r) => r.key.trim()));
      while (present.has(candidate)) candidate = `NEW_VAR_${i++}`;
      return [...prev, { rowId: nextRowId(), key: candidate, value: "" }];
    });
  }, []);

  const handleRemove = useCallback(
    (rowId: string) => {
      setRows((prev) => {
        const next = prev.filter((r) => r.rowId !== rowId);
        commitIfValid(next);
        return next;
      });
    },
    [commitIfValid]
  );

  const handleKeyChange = useCallback((rowId: string, newKey: string) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, key: newKey } : r)));
  }, []);

  const handleValueChange = useCallback((rowId: string, newValue: string) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, value: newValue } : r)));
  }, []);

  const handleKeyBlur = useCallback(
    (rowId: string) => {
      // Mark this row as touched so we surface any empty-key error.
      setTouchedKeys((prev) => ({ ...prev, [rowId]: true }));
      // Attempt a commit. If invalid (empty or duplicate), we hold the draft.
      setRows((prev) => {
        commitIfValid(prev);
        return prev;
      });
    },
    [commitIfValid]
  );

  const handleValueBlur = useCallback(() => {
    setRows((prev) => {
      commitIfValid(prev);
      return prev;
    });
  }, [commitIfValid]);

  const duplicateKeys = findDuplicateKeys(rows);

  return (
    <div className="space-y-1.5" data-testid={dataTestId}>
      <div className="flex items-center justify-end">
        <button
          type="button"
          className="text-[11px] text-daintree-accent hover:text-daintree-accent/80 transition-colors"
          onClick={handleAdd}
          data-testid="env-editor-add"
        >
          + Add
        </button>
      </div>
      {rows.length === 0 && (
        <p className="text-[11px] text-daintree-text/40 select-text italic">No env overrides.</p>
      )}
      {datalistId && suggestions && suggestions.length > 0 && (
        <datalist id={datalistId}>
          {suggestions.map(({ key }) => (
            <option key={key} value={key} />
          ))}
        </datalist>
      )}
      {rows.map((row) => {
        const trimmedKey = row.key.trim();
        const touched = !!touchedKeys[row.rowId];
        const isEmptyKey = touched && trimmedKey === "";
        const isDuplicate = trimmedKey !== "" && duplicateKeys.has(trimmedKey);
        return (
          <div key={row.rowId} className="space-y-0.5">
            <div className="flex items-center gap-1 font-mono text-[11px]">
              <input
                className={cn(
                  "w-2/5 bg-daintree-bg border rounded px-1.5 py-0.5 text-daintree-text/70 focus:outline-none transition-colors",
                  isEmptyKey
                    ? "border-status-error focus:border-status-error"
                    : isDuplicate
                      ? "border-amber-500/60 focus:border-amber-500"
                      : "border-border-strong focus:border-daintree-accent"
                )}
                value={row.key}
                placeholder="KEY"
                list={datalistId}
                onChange={(e) => handleKeyChange(row.rowId, e.target.value)}
                onBlur={() => handleKeyBlur(row.rowId)}
                data-testid="env-editor-key"
              />
              <span className="text-daintree-text/30">=</span>
              <input
                className="flex-1 bg-daintree-bg border border-border-strong rounded px-1.5 py-0.5 text-daintree-accent/80 focus:outline-none focus:border-daintree-accent transition-colors"
                value={row.value}
                placeholder={valuePlaceholder}
                onChange={(e) => handleValueChange(row.rowId, e.target.value)}
                onBlur={handleValueBlur}
                data-testid="env-editor-value"
              />
              <button
                type="button"
                className="text-daintree-text/30 hover:text-status-error transition-colors shrink-0"
                aria-label={`Remove ${trimmedKey || "empty"} env var`}
                onClick={() => handleRemove(row.rowId)}
                data-testid="env-editor-remove"
              >
                <X size={11} />
              </button>
            </div>
            {(isEmptyKey || isDuplicate) && (
              <p
                className={cn(
                  "text-[10px] pl-0.5",
                  isEmptyKey ? "text-status-error" : "text-amber-500"
                )}
                data-testid={isEmptyKey ? "env-editor-error-empty" : "env-editor-error-duplicate"}
              >
                {isEmptyKey ? "Key required" : "Duplicate key"}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
